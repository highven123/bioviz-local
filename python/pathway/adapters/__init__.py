"""
Pathway adapters for BioViz v4.0
"""

from pathway.adapters.base import PathwayAdapter, PathwaySummary, AdapterRegistry
from pathway.adapters.kegg_adapter import KEGGAdapter
from pathway.adapters.reactome_adapter import ReactomeAdapter

# Register default adapters
AdapterRegistry.register(KEGGAdapter())
AdapterRegistry.register(ReactomeAdapter())

__all__ = [
    'PathwayAdapter',
    'PathwaySummary', 
    'AdapterRegistry',
    'KEGGAdapter',
    'ReactomeAdapter'
]
