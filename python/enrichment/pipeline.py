"""
Enrichment Analysis Pipeline for BioViz

Main orchestrator that ties together all enrichment framework components.
"""

import logging
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import asdict

from .id_mapper import GeneIdMapper, MappingReport
from .species import SpeciesDetector, SpeciesInfo
from .repro import ReproducibilityLogger, PipelineMetadata
from .ora import run_ora, ORAResult
from .gsea import run_gsea_prerank, GSEAResult
from .sources import GeneSetSourceManager


class EnrichmentPipeline:
    """
    Complete enrichment analysis pipeline.
    
    Orchestrates:
    1. Gene ID mapping
    2. Species detection
    3. Gene set loading
    4. Statistical analysis (ORA/GSEA)
    5. Reproducibility logging
    """
    
    def __init__(self):
        self.id_mapper = GeneIdMapper()
        self.species_detector = SpeciesDetector()
        self.source_manager = GeneSetSourceManager()
        self.repro_logger = ReproducibilityLogger()
        
        self.mapping_report: Optional[MappingReport] = None
        self.species_info: Optional[SpeciesInfo] = None
    
    def run_ora(
        self,
        gene_list: List[str],
        gene_set_source: str = 'reactome',
        species: str = 'auto',
        custom_gmt_path: Optional[str] = None,
        background: Optional[List[str]] = None,
        background_size: Optional[int] = None,
        p_cutoff: float = 0.05,
        min_overlap: int = 3,
        fdr_method: str = 'fdr_bh'
    ) -> Dict[str, Any]:
        """
        Run complete ORA pipeline.
        
        Args:
            gene_list: Input gene identifiers
            gene_set_source: Gene set database to use
            species: Target species ('auto' for auto-detection)
            custom_gmt_path: Path to custom GMT file (optional)
            background: Background gene set (optional)
            background_size: Explicit background size (optional)
            p_cutoff: P-value cutoff
            min_overlap: Minimum overlap genes
            fdr_method: FDR correction method
            
        Returns:
            Dictionary with results, metadata, mapping_report, warnings
        """
        warnings = []
        
        # Step 1: ID Mapping
        logging.info("Step 1/5: Gene ID mapping")
        mapping, mapping_report = self.id_mapper.map_genes(gene_list, species=species)
        self.mapping_report = mapping_report
        
        if mapping_report.unmapped_count > 0:
            warnings.append(
                f"Failed to map {mapping_report.unmapped_count}/{mapping_report.input_count} genes. "
                f"First few: {', '.join(mapping_report.unmapped_ids[:5])}"
            )
        
        # Get mapped gene list
        mapped_genes = [symbol for symbol in mapping.values() if symbol]
        
        if len(mapped_genes) < 3:
            raise ValueError(
                f"Too few genes after mapping: {len(mapped_genes)}. "
                f"Check input gene IDs and species."
            )
        
        # Step 2: Species detection
        logging.info("Step 2/5: Species detection")
        if species == 'auto':
            species_info = self.species_detector.detect_from_gene_ids(gene_list)
            if species_info.confidence < 0.8:
                warnings.append(
                    f"Low confidence in species detection ({species_info.confidence:.2f}). "
                    f"Assuming {species_info.species_key}. Specify explicitly if incorrect."
                )
        else:
            species_info = self.species_detector.validate_species(species)
        
        self.species_info = species_info
        
        # Step 3: Load gene sets
        logging.info(f"Step 3/5: Loading gene sets from {gene_set_source}")
        gene_sets, gene_set_metadata = self.source_manager.load_gene_sets(
            gene_set_source,
            species_info.species_key,
            custom_gmt_path
        )
        
        # Step 4: Run ORA
        logging.info("Step 4/5: Running ORA")
        ora_results = run_ora(
            mapped_genes,
            gene_sets,
            background=background,
            background_size=background_size,
            p_cutoff=p_cutoff,
            min_overlap=min_overlap,
            fdr_method=fdr_method
        )
        
        # Step 5: Log reproducibility metadata
        logging.info("Step 5/5: Logging metadata")
        self.repro_logger.set_method('ORA')
        self.repro_logger.set_gene_set_info(
            source=gene_set_source,
            version=gene_set_metadata.get('version', 'unknown'),
            gene_sets=gene_sets,
            download_date=gene_set_metadata.get('download_date')
        )
        self.repro_logger.set_parameters(
            p_cutoff=p_cutoff,
            fdr_method=fdr_method,
            background_size=background_size or len(set(g for genes in gene_sets.values() for g in genes)),
            min_overlap=min_overlap
        )
        self.repro_logger.set_input_summary(
            total_genes=len(gene_list),
            mapped_genes=len(mapped_genes),
            species=species_info.species_key,
            data_type='gene_list'
        )
        self.repro_logger.set_mapping_report(mapping_report.to_dict())
        self.repro_logger.set_output_summary(
            total_pathways=len(gene_sets),
            significant_pathways=len(ora_results),
            top_pathway=ora_results[0].pathway_name if ora_results else None
        )
        
        for w in warnings:
            self.repro_logger.add_warning(w)
        
        # Return complete results
        return {
            'status': 'ok',
            'method': 'ORA',
            'results': [r.to_dict() for r in ora_results],
            'metadata': self.repro_logger.get_metadata().to_dict(),
            'mapping_report': mapping_report.to_dict(),
            'warnings': warnings
        }
    
    def run_gsea(
        self,
        gene_ranking: Dict[str, float],
        gene_set_source: str = 'reactome',
        species: str = 'auto',
        custom_gmt_path: Optional[str] = None,
        min_size: int = 5,
        max_size: int = 500,
        permutation_num: int = 1000
    ) -> Dict[str, Any]:
        """
        Run complete GSEA pipeline.
        
        Args:
            gene_ranking: Dictionary of gene -> ranking score
            gene_set_source: Gene set database to use
            species: Target species ('auto' for auto-detection)
            custom_gmt_path: Path to custom GMT file (optional)
            min_size: Minimum gene set size
            max_size: Maximum gene set size
            permutation_num: Number of permutations
            
        Returns:
            Dictionary with results, metadata, mapping_report, warnings
        """
        warnings = []
        
        # Step 1: ID Mapping
        logging.info("Step 1/5: Gene ID mapping for ranked list")
        gene_list = list(gene_ranking.keys())
        mapping, mapping_report = self.id_mapper.map_genes(gene_list, species=species)
        self.mapping_report = mapping_report
        
        # Map the ranking to symbols
        mapped_ranking = {}
        for gene_id, score in gene_ranking.items():
            symbol = mapping.get(gene_id, gene_id)
            if symbol and symbol != gene_id:
                mapped_ranking[symbol] = score
            else:
                mapped_ranking[gene_id] = score
        
        if len(mapped_ranking) < 10:
            raise ValueError("Too few genes in ranking after mapping")
        
        # Step 2: Species detection
        logging.info("Step 2/5: Species detection")
        if species == 'auto':
            species_info = self.species_detector.detect_from_gene_ids(gene_list)
        else:
            species_info = self.species_detector.validate_species(species)
        
        self.species_info = species_info
        
        # Step 3: Load gene sets
        logging.info(f"Step 3/5: Loading gene sets from {gene_set_source}")
        gene_sets, gene_set_metadata = self.source_manager.load_gene_sets(
            gene_set_source,
            species_info.species_key,
            custom_gmt_path
        )
        
        # Step 4: Run GSEA
        logging.info("Step 4/5: Running GSEA prerank")
        up_results, down_results = run_gsea_prerank(
            mapped_ranking,
            gene_sets,
            min_size=min_size,
            max_size=max_size,
            permutation_num=permutation_num
        )
        
        # Step 5: Log metadata
        logging.info("Step 5/5: Logging metadata")
        self.repro_logger.set_method('GSEA')
        self.repro_logger.set_gene_set_info(
            source=gene_set_source,
            version=gene_set_metadata.get('version', 'unknown'),
            gene_sets=gene_sets,
            download_date=gene_set_metadata.get('download_date')
        )
        self.repro_logger.set_parameters(
            min_size=min_size,
            max_size=max_size,
            permutation_num=permutation_num
        )
        self.repro_logger.set_input_summary(
            total_genes=len(gene_ranking),
            mapped_genes=len(mapped_ranking),
            species=species_info.species_key,
            data_type='ranked_list'
        )
        self.repro_logger.set_mapping_report(mapping_report.to_dict())
        self.repro_logger.set_output_summary(
            total_pathways=len(gene_sets),
            significant_pathways_up=len(up_results),
            significant_pathways_down=len(down_results),
            top_pathway_up=up_results[0].pathway_name if up_results else None,
            top_pathway_down=down_results[0].pathway_name if down_results else None
        )
        
        for w in warnings:
            self.repro_logger.add_warning(w)
        
        # Return complete results
        return {
            'status': 'ok',
            'method': 'GSEA',
            'up_regulated': [r.to_dict() for r in up_results],
            'down_regulated': [r.to_dict() for r in down_results],
            'metadata': self.repro_logger.get_metadata().to_dict(),
            'mapping_report': mapping_report.to_dict(),
            'warnings': warnings
        }
