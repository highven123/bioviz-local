"""
Reactome Pathway Adapter for BioViz v4.0
Converts Reactome API data to UniversalPathway format.
"""

import logging
from typing import List, Optional

from pathway.models import UniversalPathway, UniversalNode, UniversalEdge, NodeType, EdgeType
from pathway.adapters.base import PathwayAdapter, PathwaySummary
from reactome.client import ReactomeClient


class ReactomeAdapter(PathwayAdapter):
    """Adapter for Reactome pathways via API."""
    
    def __init__(self):
        self.client = ReactomeClient()
    
    @property
    def source_name(self) -> str:
        return 'reactome'
    
    def load(self, pathway_id: str) -> Optional[UniversalPathway]:
        """Load Reactome pathway and convert to universal format."""
        try:
            # Get pathway info
            pathway_info = self.client.get_pathway_info(pathway_id)
            if not pathway_info:
                return None
            
            # Get diagram data
            diagram_data, entity_map = self.client.get_pathway_diagram(pathway_id)
            
            # Get gene list
            gene_list = self.client.get_pathway_participants(pathway_id)
            
            # Convert nodes
            nodes = []
            for node_data in diagram_data.get('nodes', []):
                node_type = self._map_node_type(node_data.get('schemaClass', ''))
                
                position = node_data.get('position', {})
                node = UniversalNode(
                    id=str(node_data.get('id', '')),
                    name=node_data.get('displayName', node_data.get('name', '')),
                    type=node_type,
                    x=float(position.get('x', 0)),
                    y=float(position.get('y', 0)),
                    width=float(node_data.get('width', 50)),
                    height=float(node_data.get('height', 30)),
                    gene_symbol=node_data.get('displayName'),
                    source='reactome',
                    source_id=node_data.get('stId'),
                    metadata={'reactome_data': node_data}
                )
                nodes.append(node)
            
            # Convert edges
            edges = []
            for i, edge_data in enumerate(diagram_data.get('edges', [])):
                edge_type = self._map_edge_type(edge_data.get('reactionType', ''))
                
                edge = UniversalEdge(
                    id=str(edge_data.get('id', f'edge_{i}')),
                    source=str(edge_data.get('from', '')),
                    target=str(edge_data.get('to', '')),
                    type=edge_type,
                    source_db='reactome',
                    source_id=edge_data.get('stId'),
                    metadata={'reactome_data': edge_data}
                )
                edges.append(edge)
            
            # Build pathway
            pathway = UniversalPathway(
                id=pathway_id,
                name=pathway_info.get('displayName', pathway_info.get('name', '')),
                source='reactome',
                nodes=nodes,
                edges=edges,
                description=pathway_info.get('summation', [{}])[0].get('text', '')[:500] if pathway_info.get('summation') else '',
                species=pathway_info.get('species', {}).get('displayName', 'Human'),
                width=float(diagram_data.get('width', 1000)),
                height=float(diagram_data.get('height', 800)),
                genes=gene_list,
                source_id=pathway_id,
                source_url=f"https://reactome.org/PathwayBrowser/#/{pathway_id}",
                metadata={'reactome_info': pathway_info}
            )
            
            return pathway
            
        except Exception as e:
            logging.error(f"Failed to load Reactome pathway {pathway_id}: {e}")
            return None
    
    def _map_node_type(self, schema_class: str) -> NodeType:
        """Map Reactome schema class to universal node type."""
        schema_lower = schema_class.lower()
        
        if 'protein' in schema_lower or 'entitywithaccessionedsequence' in schema_lower:
            return NodeType.PROTEIN
        elif 'simpleentity' in schema_lower or 'chemical' in schema_lower:
            return NodeType.COMPOUND
        elif 'complex' in schema_lower:
            return NodeType.COMPLEX
        elif 'reaction' in schema_lower:
            return NodeType.REACTION
        elif 'pathway' in schema_lower:
            return NodeType.PROCESS
        else:
            return NodeType.OTHER
    
    def _map_edge_type(self, reaction_type: str) -> EdgeType:
        """Map Reactome reaction type to universal edge type."""
        reaction_upper = reaction_type.upper()
        
        if 'NEGATIVE' in reaction_upper or 'INHIBIT' in reaction_upper:
            return EdgeType.INHIBITION
        elif 'POSITIVE' in reaction_upper or 'ACTIVAT' in reaction_upper:
            return EdgeType.ACTIVATION
        elif 'CATALYSIS' in reaction_upper:
            return EdgeType.CATALYSIS
        elif 'BINDING' in reaction_upper:
            return EdgeType.BINDING
        else:
            return EdgeType.OTHER
    
    def search(self, query: str, species: str = 'human', limit: int = 20) -> List[PathwaySummary]:
        """Search Reactome pathways."""
        species_name = 'Homo sapiens' if species == 'human' else species.title()
        results = self.client.search_pathways(query, species_name, limit)
        
        return [
            PathwaySummary(
                id=r.get('stId', ''),
                name=r.get('name', ''),
                source='reactome',
                species=r.get('species', 'Human'),
                description=r.get('summation', '')[:100]
            )
            for r in results
        ]
    
    def list_available(self, species: str = 'human') -> List[PathwaySummary]:
        """List available Reactome pathways (returns popular pathways)."""
        # Reactome has thousands of pathways, so we return a curated list
        popular_pathways = [
            'R-HSA-168256',  # Immune System
            'R-HSA-1280215', # Cytokine Signaling
            'R-HSA-1474244', # Extracellular matrix organization
            'R-HSA-162582',  # Signal Transduction
            'R-HSA-1430728', # Metabolism
        ]
        
        results = []
        for pathway_id in popular_pathways:
            try:
                info = self.client.get_pathway_info(pathway_id)
                if info:
                    results.append(PathwaySummary(
                        id=pathway_id,
                        name=info.get('displayName', ''),
                        source='reactome',
                        species=info.get('species', {}).get('displayName', 'Human')
                    ))
            except Exception:
                continue
        
        return results
