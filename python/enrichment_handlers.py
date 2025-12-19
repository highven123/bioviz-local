"""
New enrichment framework command handlers for bio_core.py integration.

Add these functions to bio_core.py and register in the command dispatcher.
"""

# Add to imports at top of bio_core.py:
# from enrichment.pipeline import EnrichmentPipeline
# from enrichment.sources import GeneSetSourceManager

def handle_enrich_run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run enrichment analysis (ORA or GSEA).
    
    Payload:
        method: 'ORA' or 'GSEA'
        genes: List of gene IDs (for ORA) or Dict of gene->score (for GSEA)
        gene_set_source: 'reactome', 'wikipathways', 'go_bp', 'kegg', 'custom'
        species: 'human', 'mouse', 'rat', or 'auto'
        custom_gmt_path: Optional path to custom GMT file
        parameters: Optional dict with method-specific parameters
    """
    try:
        from enrichment.pipeline import EnrichmentPipeline
        
        method = payload.get('method', 'ORA').upper()
        genes = payload.get('genes', [])
        gene_set_source = payload.get('gene_set_source', 'reactome')
        species = payload.get('species', 'auto')
        custom_gmt_path = payload.get('custom_gmt_path')
        params = payload.get('parameters', {})
        
        if not genes:
            return {"status": "error", "message": "No genes provided"}
        
        pipeline = EnrichmentPipeline()
        
        if method == 'ORA':
            # ORA expects a list of genes
            if isinstance(genes, dict):
                genes = list(genes.keys())
            
            result = pipeline.run_ora(
                gene_list=genes,
                gene_set_source=gene_set_source,
                species=species,
                custom_gmt_path=custom_gmt_path,
                p_cutoff=params.get('p_cutoff', 0.05),
                min_overlap=params.get('min_overlap', 3),
                fdr_method=params.get('fdr_method', 'fdr_bh')
            )
        
        elif method == 'GSEA':
            # GSEA expects a dict of gene -> score
            if isinstance(genes, list):
                return {"status": "error", "message": "GSEA requires ranked gene list (gene -> score mapping)"}
            
            result = pipeline.run_gsea(
                gene_ranking=genes,
                gene_set_source=gene_set_source,
                species=species,
                custom_gmt_path=custom_gmt_path,
                min_size=params.get('min_size', 5),
                max_size=params.get('max_size', 500),
                permutation_num=params.get('permutation_num', 1000)
            )
        
        else:
            return {"status": "error", "message": f"Unknown method: {method}"}
        
        return result
        
    except Exception as e:
        logging.error(f"Enrichment analysis failed: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


def handle_gene_set_list(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    List available gene set sources.
    
    Payload:
        species: Optional species filter
    """
    try:
        from enrichment.sources import GeneSetSourceManager
        
        species = payload.get('species', 'human')
        manager = GeneSetSourceManager()
        
        sources = manager.get_available_sources(species)
        
        return {
            "status": "ok",
            "sources": sources,
            "species": species
        }
        
    except Exception as e:
        logging.error(f"Failed to list gene sets: {e}")
        return {"status": "error", "message": str(e)}


def handle_load_custom_gmt(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Load and validate a custom GMT file.
    
    Payload:
        path: Path to GMT file
    """
    try:
        from gene_set_utils import load_gmt, validate_gene_sets, get_gene_set_stats
        
        path = payload.get('path')
        if not path:
            return {"status": "error", "message": "No path provided"}
        
        gene_sets = load_gmt(path)
        valid_sets, warnings = validate_gene_sets(gene_sets)
        stats = get_gene_set_stats(valid_sets)
        
        return {
            "status": "ok",
            "path": path,
            "stats": stats,
            "warnings": warnings,
            "gene_set_count": len(valid_sets)
        }
        
    except Exception as e:
        logging.error(f"Failed to load GMT: {e}")
        return {"status": "error", "message": str(e)}


# Add to command dispatcher in process_command():
# 'ENRICH_RUN': handle_enrich_run,
# 'GENE_SET_LIST': handle_gene_set_list,
# 'LOAD_CUSTOM_GMT': handle_load_custom_gmt,
