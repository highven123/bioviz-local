"""
Gene ID Mapping Layer for BioViz Enrichment Framework

Provides automatic ID detection and conversion using mygene.info API with local caching.
Supports: Ensembl, Gene Symbol, Entrez, UniProt IDs
"""

import re
import logging
import json
from typing import List, Dict, Tuple, Optional, Set
from dataclasses import dataclass, asdict
from pathlib import Path
import time

# Optional mygene dependency
try:
    import mygene
    MYGENE_AVAILABLE = True
except ImportError:
    MYGENE_AVAILABLE = False
    logging.warning("mygene not installed. ID conversion will be limited.")


@dataclass
class MappingReport:
    """Report on gene ID mapping results"""
    input_count: int
    mapped_count: int
    unmapped_count: int
    duplicated_count: int
    unmapped_ids: List[str]
    duplicated_ids: List[str]
    source_type: str
    target_type: str
    species: str
    
    def to_dict(self) -> Dict:
        return asdict(self)


class GeneIdMapper:
    """
    Gene ID Mapper with automatic type detection and conversion.
    
    Supports:
    - ENSG* (Human Ensembl)
    - ENSMUSG* (Mouse Ensembl)
    - ENSRNOG* (Rat Ensembl)
    - Gene Symbols (HGNC)
    - Entrez IDs (numeric)
    - UniProt IDs (P*/Q*/O*)
    """
    
    # ID type detection patterns
    PATTERNS = {
        'ensembl_human': re.compile(r'^ENSG\d{11}$'),
        'ensembl_mouse': re.compile(r'^ENSMUSG\d{11}$'),
        'ensembl_rat': re.compile(r'^ENSRNOG\d{11}$'),
        'entrez': re.compile(r'^\d+$'),
        'uniprot': re.compile(r'^[OPQ][0-9][A-Z0-9]{3}[0-9]$|^[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}$'),
        'symbol': re.compile(r'^[A-Z][A-Z0-9\-]+$'),  # Heuristic for gene symbols
    }
    
    def __init__(self, cache_dir: Optional[Path] = None):
        """
        Initialize mapper with optional cache directory.
        
        Args:
            cache_dir: Directory for caching mygene results (simple JSON cache)
        """
        self.cache_dir = cache_dir or Path.home() / '.bioviz' / 'cache' / 'geneid'
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        self.mg = mygene.MyGeneInfo() if MYGENE_AVAILABLE else None
        self.report: Optional[MappingReport] = None
        
    def detect_id_type(self, gene_ids: List[str]) -> Tuple[str, str]:
        """
        Detect the most likely ID type from a list of gene IDs.
        
        Args:
            gene_ids: List of gene identifiers
            
        Returns:
            Tuple of (id_type, species) e.g., ('ensembl_human', 'human')
        """
        # Count matches for each pattern
        counts = {id_type: 0 for id_type in self.PATTERNS}
        
        for gene_id in gene_ids[:100]:  # Sample first 100 for performance
            gene_id = str(gene_id).strip()
            for id_type, pattern in self.PATTERNS.items():
                if pattern.match(gene_id):
                    counts[id_type] += 1
                    break
        
        # Determine most common type
        detected_type = max(counts, key=counts.get)
        
        # Map to species
        species_map = {
            'ensembl_human': 'human',
            'ensembl_mouse': 'mouse',
            'ensembl_rat': 'rat',
            'entrez': 'human',  # Default assumption
            'uniprot': 'human',
            'symbol': 'human',
        }
        
        species = species_map.get(detected_type, 'human')
        
        logging.info(f"Detected ID type: {detected_type}, Species: {species}")
        return detected_type, species
    
    def _load_from_cache(self, cache_key: str) -> Optional[Dict]:
        """Load mapping result from local JSON cache"""
        cache_file = self.cache_dir / f"{cache_key}.json"
        if cache_file.exists():
            try:
                with open(cache_file, 'r') as f:
                    cached = json.load(f)
                # Check if cache is less than 30 days old
                if time.time() - cached.get('timestamp', 0) < 30 * 24 * 3600:
                    logging.info(f"Cache hit: {cache_key}")
                    return cached.get('data')
            except Exception as e:
                logging.warning(f"Cache read error: {e}")
        return None
    
    def _save_to_cache(self, cache_key: str, data: Dict):
        """Save mapping result to local JSON cache"""
        cache_file = self.cache_dir / f"{cache_key}.json"
        try:
            with open(cache_file, 'w') as f:
                json.dump({
                    'timestamp': time.time(),
                    'data': data
                }, f)
        except Exception as e:
            logging.warning(f"Cache write error: {e}")
    
    def convert_to_symbol(
        self,
        gene_ids: List[str],
        source_type: Optional[str] = None,
        species: str = 'human'
    ) -> Dict[str, str]:
        """
        Convert gene IDs to symbols using mygene.info.
        
        Args:
            gene_ids: List of gene identifiers
            source_type: Source ID type (auto-detected if None)
            species: Target species ('human', 'mouse', 'rat')
            
        Returns:
            Dictionary mapping input ID -> gene symbol
        """
        if not MYGENE_AVAILABLE:
            logging.warning("mygene not available. Returning identity mapping.")
            return {gid: gid for gid in gene_ids}
        
        # Auto-detect if not specified
        if source_type is None:
            source_type, detected_species = self.detect_id_type(gene_ids)
            species = detected_species
        
        # Prepare cache key
        cache_key = f"{source_type}_{species}_{'_'.join(sorted(gene_ids[:5]))}"
        cached = self._load_from_cache(cache_key)
        if cached:
            return cached
        
        # Map source type to mygene scopes
        scope_map = {
            'ensembl_human': 'ensembl.gene',
            'ensembl_mouse': 'ensembl.gene',
            'ensembl_rat': 'ensembl.gene',
            'entrez': 'entrezgene',
            'uniprot': 'uniprot',
            'symbol': 'symbol',
        }
        
        scopes = scope_map.get(source_type, 'symbol')
        species_tax = {'human': 9606, 'mouse': 10090, 'rat': 10116}.get(species, 9606)
        
        try:
            # Query mygene
            results = self.mg.querymany(
                gene_ids,
                scopes=scopes,
                fields='symbol,entrezgene',
                species=species_tax,
                returnall=True
            )
            
            # Build mapping
            mapping = {}
            for gene_id, result in zip(gene_ids, results['out']):
                if 'symbol' in result:
                    mapping[gene_id] = result['symbol']
                elif 'entrezgene' in result:
                    mapping[gene_id] = str(result['entrezgene'])
                else:
                    mapping[gene_id] = gene_id  # Keep original if no match
            
            # Cache the result
            self._save_to_cache(cache_key, mapping)
            
            return mapping
            
        except Exception as e:
            logging.error(f"mygene query failed: {e}")
            # Fallback to identity mapping
            return {gid: gid for gid in gene_ids}
    
    def map_genes(
        self,
        gene_ids: List[str],
        target_type: str = 'symbol',
        species: str = 'human'
    ) -> Tuple[Dict[str, str], MappingReport]:
        """
        Map gene IDs with detailed reporting.
        
        Args:
            gene_ids: Input gene identifiers
            target_type: Target ID type (default: 'symbol')
            species: Target species
            
        Returns:
            Tuple of (mapping_dict, mapping_report)
        """
        # Clean input
        gene_ids = [str(gid).strip() for gid in gene_ids if gid]
        unique_ids = list(dict.fromkeys(gene_ids))  # Preserve order, remove duplicates
        
        # Detect source type
        source_type, detected_species = self.detect_id_type(unique_ids)
        if species == 'auto':
            species = detected_species
        
        # Perform conversion
        mapping = self.convert_to_symbol(unique_ids, source_type, species)
        
        # Calculate statistics
        unmapped = [gid for gid, symbol in mapping.items() if symbol == gid and not self._is_valid_symbol(symbol)]
        duplicates = [gid for gid in gene_ids if gene_ids.count(gid) > 1]
        
        self.report = MappingReport(
            input_count=len(gene_ids),
            mapped_count=len([s for s in mapping.values() if s]) - len(unmapped),
            unmapped_count=len(unmapped),
            duplicated_count=len(set(duplicates)),
            unmapped_ids=unmapped[:10],  # Show first 10
            duplicated_ids=list(set(duplicates))[:10],
            source_type=source_type,
            target_type=target_type,
            species=species
        )
        
        return mapping, self.report
    
    def _is_valid_symbol(self, symbol: str) -> bool:
        """Heuristic check if a string looks like a valid gene symbol"""
        return bool(self.PATTERNS['symbol'].match(symbol))
    
    def get_mapping_report(self) -> Optional[MappingReport]:
        """Get the last mapping report"""
        return self.report


# Convenience function
def map_gene_ids(gene_ids: List[str], species: str = 'human') -> Tuple[Dict[str, str], MappingReport]:
    """
    Quick mapping function.
    
    Args:
        gene_ids: List of gene identifiers
        species: Target species
        
    Returns:
        Tuple of (mapping_dict, mapping_report)
    """
    mapper = GeneIdMapper()
    return mapper.map_genes(gene_ids, species=species)
