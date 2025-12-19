"""
KEGG Pathway Adapter for BioViz v4.0
Converts KEGG JSON templates to UniversalPathway format.
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any

from pathway.models import UniversalPathway, UniversalNode, UniversalEdge, NodeType, EdgeType
from pathway.adapters.base import PathwayAdapter, PathwaySummary


class KEGGAdapter(PathwayAdapter):
    """Adapter for KEGG pathway templates."""
    
    def __init__(self, template_dir: Optional[Path] = None):
        # Default to assets/templates directory
        self.template_dir = template_dir or Path(__file__).parent.parent.parent.parent / 'assets' / 'templates'
        self._template_cache: Dict[str, Dict] = {}
    
    @property
    def source_name(self) -> str:
        return 'kegg'
    
    def _load_template(self, pathway_id: str) -> Optional[Dict]:
        """Load raw KEGG JSON template."""
        if pathway_id in self._template_cache:
            return self._template_cache[pathway_id]
        
        # Try to find template file
        template_file = self.template_dir / f"{pathway_id}.json"
        if not template_file.exists():
            # Try with 'hsa' prefix
            template_file = self.template_dir / f"hsa{pathway_id}.json"
        
        if not template_file.exists():
            logging.warning(f"KEGG template not found: {pathway_id}")
            return None
        
        try:
            with open(template_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self._template_cache[pathway_id] = data
            return data
        except Exception as e:
            logging.error(f"Failed to load KEGG template: {e}")
            return None
    
    def load(self, pathway_id: str) -> Optional[UniversalPathway]:
        """Load and convert KEGG pathway to universal format."""
        data = self._load_template(pathway_id)
        if not data:
            return None
        
        # Convert nodes
        nodes = []
        for node_data in data.get('nodes', []):
            node_type = self._map_node_type(node_data.get('type', 'gene'))
            
            node = UniversalNode(
                id=str(node_data.get('id', '')),
                name=node_data.get('name', node_data.get('label', '')),
                type=node_type,
                x=float(node_data.get('x', 0)),
                y=float(node_data.get('y', 0)),
                width=float(node_data.get('width', 50)),
                height=float(node_data.get('height', 30)),
                gene_symbol=node_data.get('name'),
                entrez_id=node_data.get('entrez'),
                source='kegg',
                source_id=node_data.get('kegg_id'),
                metadata={'original': node_data}
            )
            nodes.append(node)
        
        # Convert edges
        edges = []
        for i, edge_data in enumerate(data.get('edges', [])):
            edge_type = self._map_edge_type(edge_data.get('type', 'arrow'))
            
            edge = UniversalEdge(
                id=str(edge_data.get('id', f'edge_{i}')),
                source=str(edge_data.get('from', edge_data.get('source', ''))),
                target=str(edge_data.get('to', edge_data.get('target', ''))),
                type=edge_type,
                label=edge_data.get('label'),
                style='solid' if edge_type != EdgeType.INDIRECT else 'dashed',
                source_db='kegg',
                source_id=edge_data.get('kegg_id'),
                metadata={'original': edge_data}
            )
            edges.append(edge)
        
        # Build pathway
        pathway = UniversalPathway(
            id=pathway_id,
            name=data.get('name', data.get('title', pathway_id)),
            source='kegg',
            nodes=nodes,
            edges=edges,
            description=data.get('description', ''),
            species=data.get('species', 'human'),
            width=float(data.get('width', 1000)),
            height=float(data.get('height', 800)),
            genes=[n.gene_symbol for n in nodes if n.gene_symbol],
            source_id=pathway_id,
            source_url=f"https://www.kegg.jp/pathway/{pathway_id}",
            metadata={'kegg_data': data}
        )
        
        return pathway
    
    def _map_node_type(self, kegg_type: str) -> NodeType:
        """Map KEGG node type to universal type."""
        mapping = {
            'gene': NodeType.GENE,
            'protein': NodeType.PROTEIN,
            'compound': NodeType.COMPOUND,
            'group': NodeType.COMPLEX,
            'map': NodeType.PROCESS,
            'ortholog': NodeType.GENE,
        }
        return mapping.get(kegg_type.lower(), NodeType.OTHER)
    
    def _map_edge_type(self, kegg_type: str) -> EdgeType:
        """Map KEGG edge type to universal type."""
        mapping = {
            'activation': EdgeType.ACTIVATION,
            'inhibition': EdgeType.INHIBITION,
            'arrow': EdgeType.ACTIVATION,
            'repression': EdgeType.INHIBITION,
            'binding': EdgeType.BINDING,
            'phosphorylation': EdgeType.PHOSPHORYLATION,
            'indirect': EdgeType.INDIRECT,
            'expression': EdgeType.EXPRESSION,
        }
        return mapping.get(kegg_type.lower(), EdgeType.OTHER)
    
    def search(self, query: str, species: str = 'human', limit: int = 20) -> List[PathwaySummary]:
        """Search available KEGG templates by name."""
        results = []
        query_lower = query.lower()
        
        for template_file in self.template_dir.glob('*.json'):
            try:
                with open(template_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                name = data.get('name', data.get('title', ''))
                if query_lower in name.lower():
                    results.append(PathwaySummary(
                        id=template_file.stem,
                        name=name,
                        source='kegg',
                        species=data.get('species', 'human'),
                        gene_count=len(data.get('nodes', [])),
                        description=data.get('description', '')[:100]
                    ))
                    
                if len(results) >= limit:
                    break
                    
            except Exception:
                continue
        
        return results
    
    def list_available(self, species: str = 'human') -> List[PathwaySummary]:
        """List all available KEGG templates."""
        results = []
        
        for template_file in self.template_dir.glob('*.json'):
            try:
                with open(template_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                results.append(PathwaySummary(
                    id=template_file.stem,
                    name=data.get('name', data.get('title', template_file.stem)),
                    source='kegg',
                    species=data.get('species', 'human'),
                    gene_count=len(data.get('nodes', [])),
                    description=data.get('description', '')[:100]
                ))
            except Exception:
                continue
        
        return results
