"""
Gene Set Source Manager for BioViz Enrichment Framework

Manages download and caching of gene set databases:
- Reactome
- WikiPathways
- GO Biological Process
- KEGG (user-provided only due to licensing)
- Custom GMT files
"""

import logging
import hashlib
import json
from typing import Dict, List, Optional, Tuple
from pathlib import Path
from datetime import datetime, timedelta
import urllib.request
import urllib.error


class GeneSetSourceManager:
    """
    Manages gene set database downloads and caching.
    
    Uses simple file-based cache with version tracking.
    """
    
    # Source configurations
    SOURCES = {
        'reactome': {
            'display_name': 'Reactome Pathways',
            'url': 'https://reactome.org/download/current/ReactomePathways.gmt.zip',
            'format': 'gmt',
            'cache_days': 30,
            'auto_download': True,
        },
        'wikipathways': {
            'display_name': 'WikiPathways',
            'url': 'http://data.wikipathways.org/20231010/gmt/wikipathways-20231010-gmt-{species}.gmt',
            'format': 'gmt',
            'cache_days': 30,
            'auto_download': True,
        },
        'go_bp': {
            'display_name': 'GO Biological Process',
            'url': 'http://current.geneontology.org/ontology/subsets/goslim_generic.obo',
            'format': 'obo',
            'cache_days': 30,
            'auto_download': True,  # Now supported via gseapy
        },
        'kegg': {
            'display_name': 'KEGG Pathways',
            'url': None,  # User must provide
            'format': 'gmt',
            'cache_days': 365,
            'auto_download': False,
            'license_warning': 'KEGG data requires licensing for commercial use. Please provide your own GMT file.',
        }
    }
    
    def __init__(self, cache_dir: Optional[Path] = None):
        """
        Initialize source manager.
        
        Args:
            cache_dir: Directory for caching gene sets
        """
        self.cache_dir = cache_dir or Path.home() / '.bioviz' / 'cache' / 'genesets'
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        self.metadata_file = self.cache_dir / 'metadata.json'
        self.metadata = self._load_metadata()
    
    def _load_metadata(self) -> Dict:
        """Load cache metadata"""
        if self.metadata_file.exists():
            try:
                with open(self.metadata_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logging.warning(f"Failed to load metadata: {e}")
        return {}
    
    def _save_metadata(self):
        """Save cache metadata"""
        try:
            with open(self.metadata_file, 'w') as f:
                json.dump(self.metadata, f, indent=2)
        except Exception as e:
            logging.error(f"Failed to save metadata: {e}")
    
    def _calculate_hash(self, file_path: Path) -> str:
        """Calculate SHA256 hash of a file"""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()[:16]  # Short hash
    
    def _is_cache_valid(self, source_key: str) -> bool:
        """Check if cached gene set is still valid"""
        if source_key not in self.metadata:
            return False
        
        meta = self.metadata[source_key]
        cache_file = Path(meta.get('cache_file', ''))
        
        if not cache_file.exists():
            return False
        
        # Check age
        cached_date = datetime.fromisoformat(meta.get('download_date', '2000-01-01'))
        cache_days = self.SOURCES[source_key]['cache_days']
        
        if datetime.now() - cached_date > timedelta(days=cache_days):
            logging.info(f"Cache expired for {source_key}")
            return False
        
        return True
    
    def register_custom_gmt(self, gmt_path: str, gene_sets: Dict[str, List[str]]) -> None:
        """
        Register a custom GMT file for use in enrichment analysis.
        
        Args:
            gmt_path: Path to the GMT file
            gene_sets: Pre-loaded gene sets dictionary
        """
        from gene_set_utils import get_gene_set_stats
        
        stats = get_gene_set_stats(gene_sets)
        file_hash = self._calculate_hash(Path(gmt_path))
        
        # Store in metadata with 'custom' prefix
        custom_key = f"custom_{file_hash}"
        self.metadata[custom_key] = {
            'cache_file': gmt_path,
            'download_date': datetime.now().isoformat(),
            'hash': file_hash,
            'version': Path(gmt_path).name,
            'stats': stats
        }
        self._save_metadata()
        
        # Also store in memory for immediate use
        self._custom_gene_sets = getattr(self, '_custom_gene_sets', {})
        self._custom_gene_sets[custom_key] = gene_sets
        
        logging.info(f"Registered custom GMT: {Path(gmt_path).name} ({stats['num_sets']} sets)")
    
    def get_custom_gene_sets(self, custom_key: str) -> Tuple[Dict[str, List[str]], Dict]:
        """Get a previously registered custom gene set."""
        if hasattr(self, '_custom_gene_sets') and custom_key in self._custom_gene_sets:
            return self._custom_gene_sets[custom_key], self.metadata.get(custom_key, {})
        return {}, {}
    
    def get_available_sources(self, species: str = 'human') -> List[Dict]:
        """
        Get list of available gene set sources.
        
        Args:
            species: Target species
            
        Returns:
            List of source information dictionaries
        """
        available = []
        for source_key, config in self.SOURCES.items():
            available.append({
                'id': source_key,
                'name': config['display_name'],
                'auto_download': config.get('auto_download', False),
                'cached': self._is_cache_valid(source_key),
                'species_support': self._get_species_support(source_key, species)
            })
        return available
    
    def _get_species_support(self, source_key: str, species: str) -> str:
        """Check species support level"""
        if source_key == 'reactome':
            return 'native' if species == 'human' else 'orthology'
        elif source_key in ['wikipathways', 'go_bp']:
            return 'native' if species in ['human', 'mouse'] else 'limited'
        else:
            return 'user_provided'
    
    def load_gene_sets(
        self,
        source_key: str,
        species: str = 'human',
        custom_path: Optional[Path] = None
    ) -> Tuple[Dict[str, List[str]], Dict]:
        """
        Load gene sets from a source.
        
        Args:
            source_key: Source identifier
            species: Target species
            custom_path: Path to custom GMT file (for KEGG or custom sources)
            
        Returns:
            Tuple of (gene_sets_dict, metadata_dict)
        """
        # Handle custom GMT
        if custom_path:
            return self._load_custom_gmt(custom_path, source_key)
        
        # Check cache
        if self._is_cache_valid(source_key):
            logging.info(f"Loading {source_key} from cache")
            return self._load_from_cache(source_key)
        
        # Download if auto-download enabled
        if self.SOURCES[source_key].get('auto_download'):
            logging.info(f"Downloading {source_key}")
            return self._download_and_cache(source_key, species)
        
        # Otherwise require user to provide file
        raise ValueError(
            f"Source '{source_key}' requires manual download. "
            f"Please provide GMT file via custom_path parameter. "
            f"{self.SOURCES[source_key].get('license_warning', '')}"
        )
    
    def _load_custom_gmt(self, gmt_path: Path, source_key: str) -> Tuple[Dict[str, List[str]], Dict]:
        """Load gene sets from custom GMT file"""
        from gene_set_utils import load_gmt, get_gene_set_stats
        
        gene_sets = load_gmt(str(gmt_path))
        stats = get_gene_set_stats(gene_sets)
        
        metadata = {
            'source': source_key,
            'version': 'custom',
            'download_date': datetime.now().isoformat(),
            'file_hash': self._calculate_hash(gmt_path),
            'stats': stats
        }
        
        # Cache custom file
        cache_file = self.cache_dir / f"{source_key}_custom.gmt"
        import shutil
        shutil.copy(gmt_path, cache_file)
        
        self.metadata[source_key] = {
            'cache_file': str(cache_file),
            'download_date': metadata['download_date'],
            'hash': metadata['file_hash'],
            'version': 'custom'
        }
        self._save_metadata()
        
        return gene_sets, metadata
    
    def _load_from_cache(self, source_key: str) -> Tuple[Dict[str, List[str]], Dict]:
        """Load gene sets from cache"""
        from gene_set_utils import load_gmt, get_gene_set_stats
        
        cache_file = Path(self.metadata[source_key]['cache_file'])
        gene_sets = load_gmt(str(cache_file))
        stats = get_gene_set_stats(gene_sets)
        
        metadata = {
            'source': source_key,
            'version': self.metadata[source_key].get('version', 'unknown'),
            'download_date': self.metadata[source_key].get('download_date'),
            'file_hash': self.metadata[source_key].get('hash'),
            'stats': stats
        }
        
        return gene_sets, metadata
    
    def _download_and_cache(self, source_key: str, species: str) -> Tuple[Dict[str, List[str]], Dict]:
        """
        Download gene set and cache it using gseapy.
        """
        try:
            import gseapy as gp
            
            # Map our source keys to gseapy library names
            gseapy_mapping = {
                'reactome': f'Reactome_2022',  # Use stable Reactome version
                'wikipathways': f'WikiPathway_2023_Human' if species == 'human' else f'WikiPathway_2021_Mouse',
                'go_bp': 'GO_Biological_Process_2023'
            }
            
            if source_key not in gseapy_mapping:
                raise ValueError(f"No gseapy mapping for {source_key}")
            
            library_name = gseapy_mapping[source_key]
            logging.info(f"Downloading {library_name} via gseapy")
            
            # Use gseapy to download gene sets
            gene_sets_df = gp.get_library(name=library_name, organism='human')
            
            # Convert DataFrame to our format
            gene_sets = {}
            for pathway, genes_data in gene_sets_df.items():
                # genes_data can be either a list or a tab-separated string
                if isinstance(genes_data, list):
                    genes = [g.strip() for g in genes_data if g.strip()]
                else:
                    genes = [g.strip() for g in str(genes_data).split('\t') if g.strip()]
                
                if genes:
                    gene_sets[pathway] = genes
            
            # Cache to file
            cache_file = self.cache_dir / f"{source_key}_{species}.gmt"
            from gene_set_utils import save_gmt, get_gene_set_stats
            save_gmt(gene_sets, str(cache_file))
            
            stats = get_gene_set_stats(gene_sets)
            
            # Update metadata
            metadata = {
                'source': source_key,
                'version': library_name,
                'download_date': datetime.now().isoformat(),
                'file_hash': self._calculate_hash(cache_file),
                'stats': stats
            }
            
            self.metadata[source_key] = {
                'cache_file': str(cache_file),
                'download_date': metadata['download_date'],
                'hash': metadata['file_hash'],
                'version': metadata['version']
            }
            self._save_metadata()
            
            logging.info(f"Successfully downloaded {len(gene_sets)} gene sets from {library_name}")
            return gene_sets, metadata
            
        except ImportError:
            logging.error("gseapy not installed. Cannot auto-download gene sets.")
            raise RuntimeError(f"gseapy is required for auto-download. Install with: pip install gseapy")
        except Exception as e:
            logging.error(f"Download failed for {source_key}: {e}")
            raise RuntimeError(f"Failed to download {source_key}: {e}")
    
    def clear_cache(self, source_key: Optional[str] = None):
        """
        Clear cached gene sets.
        
        Args:
            source_key: Specific source to clear, or None for all
        """
        if source_key:
            if source_key in self.metadata:
                cache_file = Path(self.metadata[source_key]['cache_file'])
                cache_file.unlink(missing_ok=True)
                del self.metadata[source_key]
                self._save_metadata()
                logging.info(f"Cleared cache for {source_key}")
        else:
            # Clear all
            for file in self.cache_dir.glob("*.gmt"):
                file.unlink()
            self.metadata = {}
            self._save_metadata()
            logging.info("Cleared all gene set cache")


# Convenience function
def get_gene_sets(
    source: str,
    species: str = 'human',
    custom_path: Optional[str] = None
) -> Dict[str, List[str]]:
    """
    Quick gene set loading.
    
    Args:
        source: Source identifier
        species: Target species
        custom_path: Path to custom GMT file
        
    Returns:
        Dictionary of gene sets
    """
    manager = GeneSetSourceManager()
    gene_sets, _ = manager.load_gene_sets(source, species, Path(custom_path) if custom_path else None)
    return gene_sets
