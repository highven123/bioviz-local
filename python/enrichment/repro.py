"""
Reproducibility Logger for BioViz Enrichment Framework

Tracks and logs all metadata required for scientific reproducibility:
- Software versions
- Gene set database versions and hashes
- Analysis parameters
- Input/output summaries
"""

import hashlib
import json
import logging
import uuid
from datetime import datetime
from typing import Dict, Any, Optional
from dataclasses import dataclass, asdict, field
from pathlib import Path


# Package version (should match __init__.py)
__version__ = "2.0.0"


@dataclass
class PipelineMetadata:
    """Complete metadata for a single enrichment analysis run"""
    
    # Unique identifiers
    run_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat() + 'Z')
    
    # Software versions
    software_version: str = __version__
    python_version: str = ""
    dependencies: Dict[str, str] = field(default_factory=dict)
    
    # Gene set information
    gene_set_source: str = ""
    gene_set_version: str = ""
    gene_set_hash: str = ""
    gene_set_download_date: Optional[str] = None
    
    # Analysis parameters
    method: str = ""  # 'ORA' or 'GSEA'
    parameters: Dict[str, Any] = field(default_factory

=dict)
    
    # Input summary
    input_summary: Dict[str, Any] = field(default_factory=dict)
    
    # Mapping information
    mapping_report: Dict[str, Any] = field(default_factory=dict)
    
    # Output summary
    output_summary: Dict[str, Any] = field(default_factory=dict)
    
    # Warnings/Notes
    warnings: list = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)
    
    def to_json(self) -> str:
        """Convert to JSON string"""
        return json.dumps(self.to_dict(), indent=2)
    
    def save(self, output_path: Path):
        """Save metadata to JSON file"""
        with open(output_path, 'w') as f:
            f.write(self.to_json())
        logging.info(f"Saved pipeline metadata to {output_path}")


class ReproducibilityLogger:
    """
    Logger for tracking reproducibility metadata during enrichment analysis.
    """
    
    def __init__(self):
        self.metadata = PipelineMetadata()
        self._initialize_versions()
    
    def _initialize_versions(self):
        """Detect and record software versions"""
        import sys
        self.metadata.python_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
        
        # Try to detect key dependencies
        deps = {}
        try:
            import scipy
            deps['scipy'] = scipy.__version__
        except ImportError:
            pass
        
        try:
            import pandas
            deps['pandas'] = pandas.__version__
        except ImportError:
            pass
        
        try:
            import gseapy
            deps['gseapy'] = gseapy.__version__
        except ImportError:
            pass
        
        try:
            import mygene
            deps['mygene'] = mygene.__version__
        except ImportError:
            pass
        
        self.metadata.dependencies = deps
    
    def set_gene_set_info(
        self,
        source: str,
        version: str,
        gene_sets: Dict[str, list],
        download_date: Optional[str] = None
    ):
        """
        Record gene set database information.
        
        Args:
            source: Gene set source name (e.g., 'Reactome', 'GO_BP')
            version: Version identifier (e.g., 'v89', '2024-01')
            gene_sets: The actual gene sets for hash calculation
            download_date: ISO date when gene sets were downloaded
        """
        self.metadata.gene_set_source = source
        self.metadata.gene_set_version = version
        self.metadata.gene_set_download_date = download_date or datetime.utcnow().isoformat() + 'Z'
        
        # Calculate hash for reproducibility
        self.metadata.gene_set_hash = self._calculate_gene_set_hash(gene_sets)
    
    def _calculate_gene_set_hash(self, gene_sets: Dict[str, list]) -> str:
        """
        Calculate SHA256 hash of gene sets for reproducibility tracking.
        
        Hash is based on sorted gene set names and their sorted gene lists.
        """
        # Create deterministic string representation
        sorted_items = []
        for name in sorted(gene_sets.keys()):
            genes = sorted(gene_sets[name])
            sorted_items.append(f"{name}::{','.join(genes)}")
        
        content = "||".join(sorted_items)
        return hashlib.sha256(content.encode()).hexdigest()[:16]  # Short hash
    
    def set_method(self, method: str):
        """Set analysis method ('ORA' or 'GSEA')"""
        self.metadata.method = method
    
    def set_parameters(self, **params):
        """
        Set analysis parameters.
        
        Common parameters:
        - p_cutoff: P-value cutoff
        - fdr_method: FDR correction method (e.g., 'BH')
        - background_size: Background gene set size
        - min_size: Minimum pathway size
        - max_size: Maximum pathway size
        - permutation_num: Number of permutations (GSEA)
        """
        self.metadata.parameters.update(params)
    
    def set_input_summary(self, **summary):
        """
        Set input data summary.
        
        Common fields:
        - total_genes: Total input genes
        - mapped_genes: Successfully mapped genes
        - species: Target species
        - data_type: 'gene_list' or 'ranked_list'
        """
        self.metadata.input_summary.update(summary)
    
    def set_mapping_report(self, mapping_report: Dict):
        """Set gene ID mapping report"""
        self.metadata.mapping_report = mapping_report
    
    def set_output_summary(self, **summary):
        """
        Set output summary.
        
        Common fields:
        - total_pathways: Total pathways tested
        - significant_pathways: Number of significant pathways
        - top_pathway: Best enriched pathway
        """
        self.metadata.output_summary.update(summary)
    
    def add_warning(self, warning: str):
        """Add a warning message"""
        self.metadata.warnings.append(warning)
        logging.warning(f"Pipeline warning: {warning}")
    
    def get_metadata(self) -> PipelineMetadata:
        """Get current metadata"""
        return self.metadata
    
    def export_yaml(self, output_path: Path):
        """
        Export pipeline metadata as YAML (for maximum readability).
        
        Requires PyYAML. Falls back to JSON if not available.
        """
        try:
            import yaml
            with open(output_path, 'w') as f:
                yaml.dump(self.metadata.to_dict(), f, default_flow_style=False)
            logging.info(f"Saved pipeline metadata (YAML) to {output_path}")
        except ImportError:
            # Fallback to JSON
            self.metadata.save(output_path.with_suffix('.json'))
            logging.warning("PyYAML not available, saved as JSON instead")
    
    def export_json(self, output_path: Path):
        """Export pipeline metadata as JSON"""
        self.metadata.save(output_path)


# Convenience function
def create_pipeline_metadata(
    method: str,
    gene_set_source: str,
    gene_set_version: str,
    **parameters
) -> PipelineMetadata:
    """
    Quick metadata creation.
    
    Args:
        method: 'ORA' or 'GSEA'
        gene_set_source: Gene set database name
        gene_set_version: Version identifier
        **parameters: Analysis parameters
        
    Returns:
        PipelineMetadata object
    """
    logger = ReproducibilityLogger()
    logger.set_method(method)
    logger.metadata.gene_set_source = gene_set_source
    logger.metadata.gene_set_version = gene_set_version
    logger.set_parameters(**parameters)
    return logger.get_metadata()
