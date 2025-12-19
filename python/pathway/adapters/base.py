"""
Pathway adapter base class and registry for BioViz v4.0
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from dataclasses import dataclass

from pathway.models import UniversalPathway


@dataclass
class PathwaySummary:
    """Brief pathway info for search results."""
    id: str
    name: str
    source: str
    species: str
    gene_count: int = 0
    description: str = ""


class PathwayAdapter(ABC):
    """
    Abstract base class for pathway source adapters.
    Each data source (KEGG, Reactome, WikiPathways) implements this interface.
    """
    
    @property
    @abstractmethod
    def source_name(self) -> str:
        """Return the source identifier (e.g., 'kegg', 'reactome')."""
        pass
    
    @abstractmethod
    def load(self, pathway_id: str) -> Optional[UniversalPathway]:
        """
        Load a pathway by ID and convert to universal format.
        
        Args:
            pathway_id: Source-specific pathway ID
            
        Returns:
            UniversalPathway or None if not found
        """
        pass
    
    @abstractmethod
    def search(self, query: str, species: str = 'human', limit: int = 20) -> List[PathwaySummary]:
        """
        Search for pathways.
        
        Args:
            query: Search term
            species: Target species
            limit: Max results
            
        Returns:
            List of PathwaySummary objects
        """
        pass
    
    @abstractmethod
    def list_available(self, species: str = 'human') -> List[PathwaySummary]:
        """
        List all available pathways for a species.
        
        Args:
            species: Target species
            
        Returns:
            List of PathwaySummary objects
        """
        pass


class AdapterRegistry:
    """Registry for pathway source adapters."""
    
    _adapters: Dict[str, PathwayAdapter] = {}
    
    @classmethod
    def register(cls, adapter: PathwayAdapter) -> None:
        """Register an adapter."""
        cls._adapters[adapter.source_name] = adapter
    
    @classmethod
    def get(cls, source: str) -> Optional[PathwayAdapter]:
        """Get an adapter by source name."""
        return cls._adapters.get(source)
    
    @classmethod
    def list_sources(cls) -> List[str]:
        """List all registered sources."""
        return list(cls._adapters.keys())
    
    @classmethod
    def load_pathway(cls, source: str, pathway_id: str) -> Optional[UniversalPathway]:
        """Load a pathway from any registered source."""
        adapter = cls.get(source)
        if adapter:
            return adapter.load(pathway_id)
        return None
    
    @classmethod
    def search_all(cls, query: str, species: str = 'human', limit: int = 10) -> Dict[str, List[PathwaySummary]]:
        """Search across all registered sources."""
        results = {}
        for source, adapter in cls._adapters.items():
            try:
                results[source] = adapter.search(query, species, limit)
            except Exception:
                results[source] = []
        return results
