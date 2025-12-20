"""
GO (Gene Ontology) Adapter for BioViz v4.0
Generates pathway diagrams using auto-layout for GO term enrichment results.
"""

import logging
from typing import Dict, List, Optional
from pathlib import Path

from pathway.models import UniversalPathway
from pathway.adapters.base import PathwayAdapter, PathwaySummary
from pathway.auto_layout import PathwayAutoLayoutEngine


class GOAdapter(PathwayAdapter):
    """Adapter for Gene Ontology (GO) terms using auto-layout."""
    
    def __init__(self, gmt_path: Optional[Path] = None):
        """
        Initialize GO adapter.
        
        Args:
            gmt_path: Optional path to GO GMT file (e.g., GO_Biological_Process.gmt)
        """
        self.gmt_path = gmt_path
        self._gene_sets: Dict[str, List[str]] = {}
        self._term_names: Dict[str, str] = {}
        self._term_descriptions: Dict[str, str] = {}
        self.layout_engine = PathwayAutoLayoutEngine(layout_algorithm='force')
        
        if gmt_path and gmt_path.exists():
            self._load_gmt()
    
    @property
    def source_name(self) -> str:
        return 'go'
    
    def _load_gmt(self):
        """Load GO GMT file."""
        if not self.gmt_path or not self.gmt_path.exists():
            return
        
        try:
            with open(self.gmt_path, 'r', encoding='utf-8') as f:
                for line in f:
                    parts = line.strip().split('\t')
                    if len(parts) < 3:
                        continue
                    
                    # GO GMT format: GO_ID\tTerm Name\tGene1\tGene2\t...
                    go_id = parts[0]  # e.g., "GO:0006915"
                    term_name = parts[1]  # e.g., "apoptotic process"
                    genes = parts[2:]
                    
                    self._gene_sets[go_id] = genes
                    self._term_names[go_id] = term_name
                    
            logging.info(f"Loaded {len(self._gene_sets)} GO terms from GMT")
        except Exception as e:
            logging.error(f"Failed to load GO GMT: {e}")
    
    def load(self, go_id: str) -> Optional[UniversalPathway]:
        """
        Generate pathway diagram for a GO term using auto-layout.
        
        Args:
            go_id: GO ID (e.g., 'GO:0006915' or just '0006915')
        
        Returns:
            UniversalPathway with auto-generated layout
        """
        # Normalize GO ID
        if not go_id.startswith('GO:'):
            go_id = f'GO:{go_id}'
        
        # Get genes for this GO term
        genes = self._get_term_genes(go_id)
        if not genes:
            logging.warning(f"No genes found for GO term {go_id}")
            return None
        
        # Get term name
        term_name = self._term_names.get(go_id, self._extract_name_from_id(go_id))
        
        # Generate diagram using auto-layout
        try:
            diagram = self.layout_engine.generate_diagram(
                genes=genes,
                pathway_name=term_name,
                pathway_id=go_id,
                source='go',
                species='Human'
            )
            
            # Update source URL (safely handles dict)
            if isinstance(diagram, dict):
                url = f"http://amigo.geneontology.org/amigo/term/{go_id}"
                diagram['source_url'] = url
                if 'metadata' in diagram:
                    diagram['metadata']['source_url'] = url
            
            return diagram
            
        except Exception as e:
            logging.error(f"Failed to generate GO diagram: {e}")
            return None
    
    def _get_term_genes(self, go_id: str) -> List[str]:
        """
        Get genes for a GO term.
        
        Args:
            go_id: GO ID
        
        Returns:
            List of gene symbols
        """
        # From GMT
        if go_id in self._gene_sets:
            return self._gene_sets[go_id]
        
        # Fallback - will be provided by enrichment results
        logging.warning(f"No gene list available for {go_id}, will use enrichment results")
        return []
    
    def _extract_name_from_id(self, go_id: str) -> str:
        """Extract readable name from GO ID."""
        # GO:0006915 -> "GO Term 0006915"
        return f"GO Term {go_id.replace('GO:', '')}"
    
    def search(self, query: str, species: str = 'human', limit: int = 20) -> List[PathwaySummary]:
        """Search GO terms by name."""
        results = []
        query_lower = query.lower()
        
        for go_id, term_name in self._term_names.items():
            if query_lower in term_name.lower() or query_lower in go_id.lower():
                gene_count = len(self._gene_sets.get(go_id, []))
                results.append(PathwaySummary(
                    id=go_id,
                    name=term_name,
                    source='go',
                    species=species,
                    gene_count=gene_count,
                    description=f"GO term with {gene_count} associated genes"
                ))
                
            if len(results) >= limit:
                break
        
        return results
    
    def list_available(self, species: str = 'human') -> List[PathwaySummary]:
        """List all available GO terms."""
        results = []
        
        for go_id, term_name in self._term_names.items():
            gene_count = len(self._gene_sets.get(go_id, []))
            results.append(PathwaySummary(
                id=go_id,
                name=term_name,
                source='go',
                species=species,
                gene_count=gene_count,
                description=f"GO term with {gene_count} associated genes"
            ))
        
        return results
    
    def set_gene_list(self, go_id: str, genes: List[str], term_name: str = None):
        """
        Manually set gene list for a GO term.
        
        This is used when genes come from enrichment results rather than GMT.
        
        Args:
            go_id: GO ID
            genes: List of gene symbols
            term_name: Optional term name
        """
        if not go_id.startswith('GO:'):
            go_id = f'GO:{go_id}'
            
        self._gene_sets[go_id] = genes
        if term_name:
            self._term_names[go_id] = term_name
