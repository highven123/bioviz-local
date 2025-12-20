"""
WikiPathways Adapter for BioViz v4.0
Generates pathway diagrams using auto-layout for WikiPathways enrichment results.
"""

import logging
from typing import Dict, List, Optional
from pathlib import Path

from pathway.models import UniversalPathway
from pathway.adapters.base import PathwayAdapter, PathwaySummary
from pathway.auto_layout import PathwayAutoLayoutEngine


class WikiPathwaysAdapter(PathwayAdapter):
    """Adapter for WikiPathways using auto-layout."""
    
    def __init__(self, gmt_path: Optional[Path] = None):
        """
        Initialize WikiPathways adapter.
        
        Args:
            gmt_path: Optional path to WikiPathways GMT file
        """
        self.gmt_path = gmt_path
        self._gene_sets: Dict[str, List[str]] = {}
        self._pathway_names: Dict[str, str] = {}
        self.layout_engine = PathwayAutoLayoutEngine(layout_algorithm='force')
        
        if gmt_path and gmt_path.exists():
            self._load_gmt()
    
    @property
    def source_name(self) -> str:
        return 'wikipathways'
    
    def _load_gmt(self):
        """Load WikiPathways GMT file."""
        if not self.gmt_path or not self.gmt_path.exists():
            return
        
        try:
            with open(self.gmt_path, 'r', encoding='utf-8') as f:
                for line in f:
                    parts = line.strip().split('\t')
                    if len(parts) < 3:
                        continue
                    
                    pathway_id = parts[0]
                    pathway_name = parts[1] if parts[1] else pathway_id
                    genes = parts[2:]
                    
                    self._gene_sets[pathway_id] = genes
                    self._pathway_names[pathway_id] = pathway_name
                    
            logging.info(f"Loaded {len(self._gene_sets)} WikiPathways from GMT")
        except Exception as e:
            logging.error(f"Failed to load WikiPathways GMT: {e}")
    
    def load(self, pathway_id: str) -> Optional[UniversalPathway]:
        """
        Generate pathway diagram using auto-layout.
        
        Args:
            pathway_id: WikiPathways ID (e.g., 'WP4545')
        
        Returns:
            UniversalPathway with auto-generated layout
        """
        # Get genes for this pathway
        genes = self._get_pathway_genes(pathway_id)
        if not genes:
            logging.warning(f"No genes found for WikiPathways {pathway_id}")
            return None
        
        # Get pathway name
        pathway_name = self._pathway_names.get(
            pathway_id,
            self._extract_name_from_id(pathway_id)
        )
        
        # Generate diagram using auto-layout
        try:
            diagram = self.layout_engine.generate_diagram(
                genes=genes,
                pathway_name=pathway_name,
                pathway_id=pathway_id,
                source='wikipathways',
                species='Human'
            )
            
            return diagram
            
        except Exception as e:
            logging.error(f"Failed to generate WikiPathways diagram: {e}")
            return None
    
    def _get_pathway_genes(self, pathway_id: str) -> List[str]:
        """
        Get genes for a WikiPathways pathway.
        
        Tries multiple methods:
        1. From loaded GMT file
        2. From enrichment results (passed via context)
        3. Fallback to empty list
        """
        # Method 1: From GMT
        if pathway_id in self._gene_sets:
            return self._gene_sets[pathway_id]
        
        # Method 2: Could query WikiPathways API here
        # For now, return empty list - genes will be provided by enrichment
        logging.warning(f"No gene list available for {pathway_id}, will use enrichment results")
        return []
    
    def _extract_name_from_id(self, pathway_id: str) -> str:
        """Extract readable name from WikiPathways ID."""
        # WikiPathways IDs like 'WP4545' don't contain name
        # This is a fallback
        return f"WikiPathways {pathway_id}"
    
    def search(self, query: str, species: str = 'human', limit: int = 20) -> List[PathwaySummary]:
        """Search WikiPathways by name."""
        results = []
        query_lower = query.lower()
        
        for pathway_id, pathway_name in self._pathway_names.items():
            if query_lower in pathway_name.lower():
                gene_count = len(self._gene_sets.get(pathway_id, []))
                results.append(PathwaySummary(
                    id=pathway_id,
                    name=pathway_name,
                    source='wikipathways',
                    species=species,
                    gene_count=gene_count,
                    description=f"WikiPathways pathway with {gene_count} genes"
                ))
                
            if len(results) >= limit:
                break
        
        return results
    
    def list_available(self, species: str = 'human') -> List[PathwaySummary]:
        """List all available WikiPathways."""
        results = []
        
        for pathway_id, pathway_name in self._pathway_names.items():
            gene_count = len(self._gene_sets.get(pathway_id, []))
            results.append(PathwaySummary(
                id=pathway_id,
                name=pathway_name,
                source='wikipathways',
                species=species,
                gene_count=gene_count,
                description=f"WikiPathways pathway with {gene_count} genes"
            ))
        
        return results
    
    def set_gene_list(self, pathway_id: str, genes: List[str], pathway_name: str = None):
        """
        Manually set gene list for a pathway.
        
        This is used when genes come from enrichment results rather than GMT.
        
        Args:
            pathway_id: Pathway ID
            genes: List of gene symbols
            pathway_name: Optional pathway name
        """
        self._gene_sets[pathway_id] = genes
        if pathway_name:
            self._pathway_names[pathway_id] = pathway_name
