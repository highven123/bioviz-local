"""
Pathway Auto-Layout Engine

Automatically generates pathway diagrams from gene lists using
graph layout algorithms.

Supports multiple layout strategies:
- Circular: Simple circular arrangement
- Force-directed: Physics-based layout (requires networkx)
- Grid: Regular grid layout
"""

import logging
import math
import json
from typing import List, Dict, Tuple, Optional
from datetime import datetime


class PathwayAutoLayoutEngine:
    """
    Automatic pathway diagram generation from gene lists.
    """
    
    def __init__(self, layout_algorithm: str = 'circular'):
        """
        Initialize auto-layout engine.
        
        Args:
            layout_algorithm: 'circular', 'force', or 'grid'
        """
        self.layout_algorithm = layout_algorithm
        self.canvas_width = 1000
        self.canvas_height = 800
        self.node_radius = 1.0  # Dot diameter will be 2.0 (2x line width)
        
        # Initialize STRING client for edges
        from pathway.string_client import STRINGClient
        self.string_client = STRINGClient()
        
    def generate_diagram(self, 
                        genes: List[str], 
                        pathway_name: str,
                        pathway_id: str = None,
                        source: str = 'auto_layout',
                        species: str = 'Human') -> Dict:
        """
        Generate pathway diagram from gene list.
        """
        if not genes:
            logging.warning("No genes provided for auto-layout")
            return None
        
        # Limit to reasonable number for visualization
        if len(genes) > 100:
            logging.warning(f"Too many genes ({len(genes)}), limiting to 100")
            genes = genes[:100]
        
        logging.info(f"Generating auto-layout for {len(genes)} genes using '{self.layout_algorithm}' algorithm")
        
        # Fetch edges (PPI data)
        edges_data = []
        try:
            edges_data = self.string_client.get_interactions(genes, species=species)
            logging.info(f"Retrieved {len(edges_data)} interactions from STRING")
        except Exception as e:
            logging.warning(f"Failed to fetch interactions: {e}")
            
        # Generate node positions
        if self.layout_algorithm == 'circular':
            positions = self._layout_circular(genes)
        elif self.layout_algorithm == 'grid':
            positions = self._layout_grid(genes)
        elif self.layout_algorithm == 'force':
            positions = self._layout_force_directed(genes, edges_data)
        else:
            logging.warning(f"Unknown layout algorithm: {self.layout_algorithm}, using circular")
            positions = self._layout_circular(genes)
        
        # Determine official source URL
        source_url = self._get_source_url(pathway_id, source)
        
        # Create template
        template = self._create_template(
            genes=genes,
            positions=positions,
            edges_data=edges_data,
            pathway_name=pathway_name,
            pathway_id=pathway_id or f"auto_{pathway_name.replace(' ', '_')}",
            source=source,
            species=species,
            source_url=source_url
        )
        
        return template

    def _get_source_url(self, pathway_id: str, source: str) -> Optional[str]:
        """Generate URL for the pathway on its official website."""
        if not pathway_id:
            return None
            
        source = source.lower()
        if source == 'reactome':
            # Handle R-HSA-123456 format
            rid = pathway_id
            if not rid.startswith('R-'):
                # Try to find it in the ID
                import re
                match = re.search(r'R-[A-Z]{3}-\d+', pathway_id)
                if match:
                    rid = match.group(0)
            return f"https://reactome.org/PathwayBrowser/#/{rid}"
        elif source == 'kegg':
            # Handle hsa00010 format
            kid = pathway_id
            if ':' in kid: kid = kid.split(':')[-1]
            return f"https://www.genome.jp/dbget-bin/www_bget?pathway:{kid}"
        elif source == 'wikipathways':
            # Handle WP123 format
            wid = pathway_id
            if '_' in wid: wid = wid.split('_')[0]
            return f"https://www.wikipathways.org/instance/{wid}"
        return None
    
    def _layout_circular(self, genes: List[str]) -> Dict[str, Tuple[float, float]]:
        """
        Arrange genes in a circle.
        """
        positions = {}
        n = len(genes)
        
        # Calculate radius to fit genes with spacing
        radius = min(self.canvas_width, self.canvas_height) / 2 - 80
        center_x = self.canvas_width / 2
        center_y = self.canvas_height / 2
        
        for i, gene in enumerate(genes):
            angle = 2 * math.pi * i / n
            x = center_x + radius * math.cos(angle)
            y = center_y + radius * math.sin(angle)
            positions[gene] = (x, y)
        
        return positions
    
    def _layout_grid(self, genes: List[str]) -> Dict[str, Tuple[float, float]]:
        """
        Arrange genes in a grid.
        """
        positions = {}
        n = len(genes)
        
        # Calculate grid dimensions
        cols = math.ceil(math.sqrt(n))
        rows = math.ceil(n / cols)
        
        # Calculate spacing
        x_spacing = (self.canvas_width - 150) / (max(1, cols - 1) if cols > 1 else 1)
        y_spacing = (self.canvas_height - 150) / (max(1, rows - 1) if rows > 1 else 1)
        
        # If spacing is too large, cap it
        x_spacing = min(x_spacing, 180)
        y_spacing = min(y_spacing, 120)
        
        # Center the grid
        start_x = (self.canvas_width - (cols - 1) * x_spacing) / 2
        start_y = (self.canvas_height - (rows - 1) * y_spacing) / 2
        
        for i, gene in enumerate(genes):
            row = i // cols
            col = i % cols
            x = start_x + col * x_spacing
            y = start_y + row * y_spacing
            positions[gene] = (x, y)
        
        return positions
    
    def _layout_force_directed(self, genes: List[str], edges_data: List[Dict] = None) -> Dict[str, Tuple[float, float]]:
        """
        Force-directed layout (requires networkx).
        Uses biological edges if available.
        """
        try:
            import networkx as nx
            
            G = nx.Graph()
            G.add_nodes_from(genes)
            
            if edges_data:
                for edge in edges_data:
                    if edge['source'] in genes and edge['target'] in genes:
                        G.add_edge(edge['source'], edge['target'], weight=edge.get('score', 0.4))
            
            # Apply spring layout with increased k for more space
            pos = nx.spring_layout(
                G,
                k=2.5/math.sqrt(len(genes)) if len(genes) > 0 else 0.5,
                iterations=100,
                scale=min(self.canvas_width, self.canvas_height) / 2 - 50
            )
            
            # Convert to gene positions
            positions = {}
            center_x = self.canvas_width / 2
            center_y = self.canvas_height / 2
            
            for gene in genes:
                if gene in pos:
                    nx_x, nx_y = pos[gene]
                    positions[gene] = (
                        center_x + nx_x,
                        center_y + nx_y
                    )
                else:
                    positions[gene] = (center_x, center_y)
            
            return positions
        
        except ImportError:
            logging.warning("NetworkX not available, falling back to circular layout")
            return self._layout_circular(genes)
    
    def _create_template(self,
                        genes: List[str],
                        positions: Dict[str, Tuple[float, float]],
                        edges_data: List[Dict],
                        pathway_name: str,
                        pathway_id: str,
                        source: str,
                        species: str,
                        source_url: str = None) -> Dict:
        """
        Create UniversalPathway template from positions and edges.
        """
        # Create nodes with smaller size
        nodes = []
        for gene in genes:
            x, y = positions.get(gene, (self.canvas_width/2, self.canvas_height/2))
            nodes.append({
                'id': gene,
                'name': gene,
                'x': float(round(x, 1)),
                'y': float(round(y, 1)),
                'width': self.node_radius * 2,
                'height': self.node_radius * 2,
                'type': 'gene',
                'category': 'Gene',
                'color': '#ecf0f1', # Brighter, less heavy gray
                'value': 1,
                'expression': None,
                'hit_name': None
            })
        
        # Create edges
        edges = []
        for i, edge in enumerate(edges_data):
            if edge['source'] in genes and edge['target'] in genes:
                edges.append({
                    'id': f"e{i}",
                    'source': edge['source'],
                    'target': edge['target'],
                    'type': 'ppi',
                    'relation': 'interaction',
                    'score': edge.get('score')
                })
        
        template = {
            'id': pathway_id,
            'name': pathway_name,
            'title': pathway_name,
            'source': source,
            'species': species,
            'nodes': nodes,
            'edges': edges,
            'width': self.canvas_width,
            'height': self.canvas_height,
            'genes': genes,
            'metadata': {
                'layout_algorithm': self.layout_algorithm,
                'auto_generated': True,
                'generated_at': datetime.now().isoformat(),
                'node_count': len(nodes),
                'edge_count': len(edges),
                'source_url': source_url,
                'note': "Diagram automatically generated from gene list using STRING PPI interactions."
            }
        }
        
        return template


def test_auto_layout():
    """Test auto-layout engine."""
    engine = PathwayAutoLayoutEngine(layout_algorithm='force')
    
    test_genes = ['TP53', 'MDM2', 'ATM', 'BRCA1', 'CHEK2']
    
    diagram = engine.generate_diagram(
        genes=test_genes,
        pathway_name='Test PPI Pathway',
        species='Human'
    )
    
    # Save to a temp file for viewing if needed
    with open('auto_layout_test_output.json', 'w') as f:
        json.dump(diagram, f, indent=2)
        
    print(f"Generated diagram with {len(diagram['nodes'])} nodes and {len(diagram['edges'])} edges.")
    return diagram


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    test_auto_layout()
