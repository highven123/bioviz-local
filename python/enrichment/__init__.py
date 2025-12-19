"""
Enrichment Analysis Framework for BioViz v2.0

This package provides modular enrichment analysis capabilities with:
- Gene ID Mapping (Ensembl/Symbol/Entrez/Uniprot)
- Species Support (Human/Mouse/Rat)
- Reproducibility Metadata
- ORA and GSEA implementations
"""

from .id_mapper import GeneIdMapper, MappingReport
from .species import SpeciesDetector, SUPPORTED_SPECIES
from .repro import ReproducibilityLogger, PipelineMetadata
from .ora import run_ora, ORAResult
from .gsea import run_gsea_prerank, GSEAResult
from .sources import GeneSetSourceManager
from .cache import CacheManager
from .pipeline import EnrichmentPipeline

__version__ = "2.0.0"
__all__ = [
    "GeneIdMapper",
    "MappingReport",
    "SpeciesDetector",
    "SUPPORTED_SPECIES",
    "ReproducibilityLogger",
    "PipelineMetadata",
    "run_ora",
    "ORAResult",
    "run_gsea_prerank",
    "GSEAResult",
    "GeneSetSourceManager",
    "CacheManager",
    "EnrichmentPipeline",
]
