"""
Species Detection and Support for BioViz Enrichment Framework

Provides automatic species detection based on gene IDs and supports:
- Human (Homo sapiens)
- Mouse (Mus musculus)  
- Rat (Rattus norvegicus)
"""

import re
import logging
from typing import List, Optional, Dict
from dataclasses import dataclass


# Supported species configuration
SUPPORTED_SPECIES = {
    'human': {
        'scientific_name': 'Homo sapiens',
        'taxon_id': 9606,
        'ensembl_prefix': 'ENSG',
        'common_aliases': ['human', 'hsa', 'homo sapiens', 'h.sapiens'],
    },
    'mouse': {
        'scientific_name': 'Mus musculus',
        'taxon_id': 10090,
        'ensembl_prefix': 'ENSMUSG',
        'common_aliases': ['mouse', 'mmu', 'mus musculus', 'm.musculus'],
    },
    'rat': {
        'scientific_name': 'Rattus norvegicus',
        'taxon_id': 10116,
        'ensembl_prefix': 'ENSRNOG',
        'common_aliases': ['rat', 'rno', 'rattus norvegicus', 'r.norvegicus'],
    }
}


@dataclass
class SpeciesInfo:
    """Information about a detected species"""
    species_key: str  # 'human', 'mouse', 'rat'
    scientific_name: str
    taxon_id: int
    confidence: float  # 0-1, how confident we are in detection
    detection_method: str  # 'ensembl_prefix', 'gene_set_source', 'user_specified'


class SpeciesDetector:
    """
    Detects species from gene IDs or gene set sources.
    
    Detection strategies:
    1. Ensembl ID prefix (ENSG*, ENSMUSG*, ENSRNOG*)
    2. Gene set source metadata
    3. User specification (highest priority)
    """
    
    def __init__(self):
        self.detected_species: Optional[SpeciesInfo] = None
    
    def detect_from_gene_ids(self, gene_ids: List[str]) -> SpeciesInfo:
        """
        Detect species from a list of gene IDs.
        
        Args:
            gene_ids: List of gene identifiers
            
        Returns:
            SpeciesInfo with detection results
        """
        # Count Ensembl prefix matches
        prefix_counts = {species: 0 for species in SUPPORTED_SPECIES}
        
        for gene_id in gene_ids[:100]:  # Sample first 100
            gene_id = str(gene_id).strip().upper()
            for species_key, config in SUPPORTED_SPECIES.items():
                if gene_id.startswith(config['ensembl_prefix']):
                    prefix_counts[species_key] += 1
                    break
        
        # Determine most common
        detected_key = max(prefix_counts, key=prefix_counts.get)
        total_detected = sum(prefix_counts.values())
        
        # Calculate confidence
        if total_detected == 0:
            # No Ensembl IDs detected, default to human with low confidence
            confidence = 0.3
            detected_key = 'human'
            method = 'default'
        else:
            confidence = prefix_counts[detected_key] / total_detected
            method = 'ensembl_prefix'
        
        config = SUPPORTED_SPECIES[detected_key]
        self.detected_species = SpeciesInfo(
            species_key=detected_key,
            scientific_name=config['scientific_name'],
            taxon_id=config['taxon_id'],
            confidence=confidence,
            detection_method=method
        )
        
        logging.info(
            f"Detected species: {self.detected_species.species_key} "
            f"(confidence: {confidence:.2f}, method: {method})"
        )
        
        return self.detected_species
    
    def detect_from_source(self, source_name: str) -> SpeciesInfo:
        """
        Detect species from gene set source name.
        
        Args:
            source_name: Gene set source identifier (e.g., 'KEGG_2021_Human')
            
        Returns:
            SpeciesInfo with detection results
        """
        source_lower = source_name.lower()
        
        for species_key, config in SUPPORTED_SPECIES.items():
            # Check if any alias appears in source name
            for alias in config['common_aliases']:
                if alias in source_lower:
                    self.detected_species = SpeciesInfo(
                        species_key=species_key,
                        scientific_name=config['scientific_name'],
                        taxon_id=config['taxon_id'],
                        confidence=0.9,
                        detection_method='gene_set_source'
                    )
                    logging.info(f"Species from source '{source_name}': {species_key}")
                    return self.detected_species
        
        # Default to human if not detected
        return self._default_human()
    
    def validate_species(self, species_input: str) -> SpeciesInfo:
        """
        Validate and normalize user-specified species.
        
        Args:
            species_input: User input (e.g., 'human', 'hsa', 'Homo sapiens')
            
        Returns:
            SpeciesInfo with normalized species
            
        Raises:
            ValueError: If species is not supported
        """
        species_lower = species_input.lower().strip()
        
        for species_key, config in SUPPORTED_SPECIES.items():
            if species_lower in config['common_aliases']:
                self.detected_species = SpeciesInfo(
                    species_key=species_key,
                    scientific_name=config['scientific_name'],
                    taxon_id=config['taxon_id'],
                    confidence=1.0,
                    detection_method='user_specified'
                )
                return self.detected_species
        
        raise ValueError(
            f"Unsupported species: '{species_input}'. "
            f"Supported: {list(SUPPORTED_SPECIES.keys())}"
        )
    
    def _default_human(self) -> SpeciesInfo:
        """Return default human species with low confidence"""
        config = SUPPORTED_SPECIES['human']
        return SpeciesInfo(
            species_key='human',
            scientific_name=config['scientific_name'],
            taxon_id=config['taxon_id'],
            confidence=0.3,
            detection_method='default'
        )
    
    def get_taxon_id(self, species_key: str) -> int:
        """Get NCBI Taxonomy ID for a species"""
        if species_key in SUPPORTED_SPECIES:
            return SUPPORTED_SPECIES[species_key]['taxon_id']
        return 9606  # Default to human
    
    def supports_orthology(self, source_species: str, target_species: str) -> bool:
        """
        Check if orthology mapping is supported between two species.
        
        Currently Reactome provides orthology projection.
        """
        # For now, simple check: both species must be supported
        return (source_species in SUPPORTED_SPECIES and 
                target_species in SUPPORTED_SPECIES and
                source_species != target_species)


# Convenience functions
def detect_species(gene_ids: List[str]) -> SpeciesInfo:
    """
    Quick species detection from gene IDs.
    
    Args:
        gene_ids: List of gene identifiers
        
    Returns:
        SpeciesInfo object
    """
    detector = SpeciesDetector()
    return detector.detect_from_gene_ids(gene_ids)


def get_species_config(species_key: str) -> Dict:
    """
    Get configuration for a species.
    
    Args:
        species_key: Species identifier ('human', 'mouse', 'rat')
        
    Returns:
        Species configuration dictionary
    """
    if species_key not in SUPPORTED_SPECIES:
        raise ValueError(f"Unknown species: {species_key}")
    return SUPPORTED_SPECIES[species_key]
