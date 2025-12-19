"""
Universal Pathway Data Models for BioViz v4.0
Unified data structures for multi-source pathway visualization.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Literal
from enum import Enum


class NodeType(str, Enum):
    """Types of nodes in pathway diagrams."""
    GENE = "gene"
    PROTEIN = "protein"
    COMPOUND = "compound"
    COMPLEX = "complex"
    REACTION = "reaction"
    PROCESS = "process"
    OTHER = "other"


class EdgeType(str, Enum):
    """Types of edges/relationships in pathway diagrams."""
    ACTIVATION = "activation"
    INHIBITION = "inhibition"
    BINDING = "binding"
    CONVERSION = "conversion"
    CATALYSIS = "catalysis"
    EXPRESSION = "expression"
    PHOSPHORYLATION = "phosphorylation"
    INDIRECT = "indirect"
    OTHER = "other"


@dataclass
class UniversalNode:
    """
    Universal representation of a pathway node.
    Compatible with KEGG, Reactome, and WikiPathways.
    """
    id: str
    name: str
    type: NodeType
    x: float = 0.0
    y: float = 0.0
    width: float = 50.0
    height: float = 30.0
    
    # Gene-specific
    gene_symbol: Optional[str] = None
    entrez_id: Optional[str] = None
    uniprot_id: Optional[str] = None
    
    # Expression overlay
    expression_value: Optional[float] = None
    color: Optional[str] = None
    
    # Source-specific metadata
    source: Optional[str] = None
    source_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type.value if isinstance(self.type, NodeType) else self.type,
            'x': self.x,
            'y': self.y,
            'width': self.width,
            'height': self.height,
            'gene_symbol': self.gene_symbol,
            'entrez_id': self.entrez_id,
            'expression_value': self.expression_value,
            'color': self.color,
            'source': self.source,
            'source_id': self.source_id,
            'metadata': self.metadata
        }


@dataclass
class UniversalEdge:
    """
    Universal representation of a pathway edge/relationship.
    """
    id: str
    source: str  # Node ID
    target: str  # Node ID
    type: EdgeType
    
    # Visual properties
    label: Optional[str] = None
    style: Optional[str] = None  # solid, dashed, etc.
    
    # Source-specific metadata
    source_db: Optional[str] = None
    source_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'source': self.source,
            'target': self.target,
            'type': self.type.value if isinstance(self.type, EdgeType) else self.type,
            'label': self.label,
            'style': self.style or 'solid',
            'source_db': self.source_db,
            'source_id': self.source_id,
            'metadata': self.metadata
        }


@dataclass
class UniversalPathway:
    """
    Universal pathway representation supporting multiple data sources.
    """
    id: str
    name: str
    source: Literal['kegg', 'reactome', 'wikipathways', 'custom']
    
    nodes: List[UniversalNode] = field(default_factory=list)
    edges: List[UniversalEdge] = field(default_factory=list)
    
    # Pathway metadata
    description: Optional[str] = None
    species: str = 'human'
    version: Optional[str] = None
    
    # Display properties
    width: float = 1000.0
    height: float = 800.0
    
    # Gene lists for expression overlay
    genes: List[str] = field(default_factory=list)
    
    # Source-specific data
    source_url: Optional[str] = None
    source_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization and frontend consumption."""
        return {
            'id': self.id,
            'name': self.name,
            'source': self.source,
            'description': self.description,
            'species': self.species,
            'version': self.version,
            'width': self.width,
            'height': self.height,
            'genes': self.genes,
            'source_url': self.source_url,
            'source_id': self.source_id,
            'metadata': self.metadata,
            'nodes': [n.to_dict() for n in self.nodes],
            'edges': [e.to_dict() for e in self.edges]
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'UniversalPathway':
        """Create from dictionary."""
        nodes = [
            UniversalNode(
                id=n['id'],
                name=n['name'],
                type=NodeType(n['type']) if isinstance(n['type'], str) else n['type'],
                x=n.get('x', 0),
                y=n.get('y', 0),
                width=n.get('width', 50),
                height=n.get('height', 30),
                gene_symbol=n.get('gene_symbol'),
                entrez_id=n.get('entrez_id'),
                expression_value=n.get('expression_value'),
                color=n.get('color'),
                source=n.get('source'),
                source_id=n.get('source_id'),
                metadata=n.get('metadata', {})
            )
            for n in data.get('nodes', [])
        ]
        
        edges = [
            UniversalEdge(
                id=e['id'],
                source=e['source'],
                target=e['target'],
                type=EdgeType(e['type']) if isinstance(e['type'], str) else e['type'],
                label=e.get('label'),
                style=e.get('style'),
                source_db=e.get('source_db'),
                source_id=e.get('source_id'),
                metadata=e.get('metadata', {})
            )
            for e in data.get('edges', [])
        ]
        
        return cls(
            id=data['id'],
            name=data['name'],
            source=data['source'],
            nodes=nodes,
            edges=edges,
            description=data.get('description'),
            species=data.get('species', 'human'),
            version=data.get('version'),
            width=data.get('width', 1000),
            height=data.get('height', 800),
            genes=data.get('genes', []),
            source_url=data.get('source_url'),
            source_id=data.get('source_id'),
            metadata=data.get('metadata', {})
        )
    
    def get_gene_nodes(self) -> List[UniversalNode]:
        """Get all gene/protein nodes."""
        return [n for n in self.nodes if n.type in (NodeType.GENE, NodeType.PROTEIN)]
    
    def apply_expression(self, expression_data: Dict[str, float]) -> None:
        """
        Apply expression values to nodes.
        
        Args:
            expression_data: Dict mapping gene symbols to expression values (e.g., log2FC)
        """
        for node in self.nodes:
            if node.gene_symbol and node.gene_symbol in expression_data:
                node.expression_value = expression_data[node.gene_symbol]
            elif node.name in expression_data:
                node.expression_value = expression_data[node.name]
