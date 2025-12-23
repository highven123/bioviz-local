import logging
import asyncio
from typing import List, Dict, Any, Optional
from .pipeline import EnrichmentPipeline
from .deduplication import deduplicator

logger = logging.getLogger("BioViz.Enrichment.Fusion")

class FusionEnrichmentPipeline:
    """
    Orchestrates multiple enrichment analyses across different sources
    and merges them into a unified, de-duplicated result set.
    """
    
    def __init__(self):
        self.pipeline = EnrichmentPipeline()

    def run_fusion_analysis(
        self, 
        genes: Any, 
        method: str = "ORA",
        sources: List[str] = None,
        species: str = "auto",
        parameters: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Runs analysis for each source, aggregates, and deduplicates.
        """
        if not sources:
            sources = ['reactome', 'kegg', 'wikipathways']
        
        params = parameters or {}
        all_results = []
        combined_metadata = {"sources_analyzed": sources}
        all_warnings = []

        logger.info(f"Starting Fusion Analysis ({method}) for sources: {sources}")

        for source in sources:
            try:
                if method.upper() == "ORA":
                    # For ORA, genes is a list
                    res = self.pipeline.run_ora(
                        gene_list=genes if isinstance(genes, list) else list(genes.keys()),
                        gene_set_source=source,
                        species=species,
                        p_cutoff=params.get('p_cutoff', 0.05),
                        min_overlap=params.get('min_overlap', 3)
                    )
                    source_results = res.get('results', [])
                else:
                    # For GSEA, genes is a dict (gene -> score)
                    res = self.pipeline.run_gsea(
                        gene_ranking=genes,
                        gene_set_source=source,
                        species=species,
                        permutation_num=params.get('permutation_num', 1000)
                    )
                    # Merge up and down results for deduplication
                    source_results = res.get('up_regulated', []) + res.get('down_regulated', [])
                
                # Tag results with their source before merging
                for r in source_results:
                    r['source'] = source
                
                all_results.extend(source_results)
                
                if res.get('warnings'):
                    all_warnings.extend([f"[{source}] {w}" for w in res['warnings']])
                    
            except Exception as e:
                logger.error(f"Failed analysis for source {source}: {e}")
                all_warnings.append(f"Source {source} failed: {str(e)}")

        if not all_results:
            return {
                "status": "error",
                "message": "No results found in any of the selected sources.",
                "warnings": all_warnings
            }

        # Run the deduplication to get the "Fusion View"
        logger.info(f"Deduplicating {len(all_results)} total terms...")
        fused_clusters = deduplicator.deduplicate(all_results)
        
        logger.info(f"Fusion complete: Reduced to {len(fused_clusters)} modules.")

        return {
            "status": "ok",
            "method": method,
            "fusion_results": fused_clusters, # The de-duplicated modules
            "total_original_terms": len(all_results),
            "total_modules": len(fused_clusters),
            "sources": sources,
            "warnings": all_warnings
        }

# Singleton
fusion_pipeline = FusionEnrichmentPipeline()
