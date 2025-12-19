"""
Batch Enrichment Analysis for BioViz v2.1
Supports running ORA/GSEA on multiple gene lists in parallel.
"""

import logging
from typing import Dict, List, Any, Optional, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
import time


def run_batch_enrichment(
    gene_lists: Dict[str, List[str]],
    gene_set_source: str = 'reactome',
    species: str = 'human',
    method: str = 'ORA',
    parameters: Optional[Dict] = None,
    progress_callback: Optional[Callable[[str, int, int], None]] = None,
    max_workers: int = 4
) -> Dict[str, Any]:
    """
    Run enrichment analysis on multiple gene lists in parallel.
    
    Args:
        gene_lists: Dict mapping sample names to gene lists
        gene_set_source: Gene set database (reactome, go_bp, etc.)
        species: Species for analysis
        method: 'ORA' or 'GSEA'
        parameters: Optional analysis parameters
        progress_callback: Optional callback(sample_name, current, total)
        max_workers: Max parallel threads
        
    Returns:
        Dict with results for each sample
    """
    from enrichment.pipeline import EnrichmentPipeline
    
    if not gene_lists:
        return {"status": "error", "message": "No gene lists provided"}
    
    pipeline = EnrichmentPipeline()
    params = parameters or {
        'p_cutoff': 0.05,
        'fdr_method': 'fdr_bh',
        'min_overlap': 3
    }
    
    results = {}
    errors = []
    total = len(gene_lists)
    completed = 0
    
    def process_sample(sample_name: str, genes: List[str]) -> tuple:
        """Process a single sample."""
        try:
            if method.upper() == 'ORA':
                result = pipeline.run_ora(
                    gene_list=genes,
                    gene_set_source=gene_set_source,
                    species=species,
                    p_cutoff=params.get('p_cutoff', 0.05),
                    fdr_method=params.get('fdr_method', 'fdr_bh')
                )
            else:
                # For GSEA, genes should be a ranking dict
                if isinstance(genes, list):
                    # Convert list to ranking (assume uniform ranking)
                    ranking = {g: 1.0 for g in genes}
                else:
                    ranking = genes
                result = pipeline.run_gsea(
                    gene_ranking=ranking,
                    gene_set_source=gene_set_source,
                    species=species,
                    permutation_num=params.get('permutation_num', 1000)
                )
            return sample_name, result, None
        except Exception as e:
            logging.error(f"Batch analysis failed for {sample_name}: {e}")
            return sample_name, None, str(e)
    
    # Run in parallel
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(process_sample, name, genes): name 
            for name, genes in gene_lists.items()
        }
        
        for future in as_completed(futures):
            sample_name, result, error = future.result()
            completed += 1
            
            if error:
                errors.append({"sample": sample_name, "error": error})
                results[sample_name] = {"status": "error", "message": error}
            else:
                results[sample_name] = result
            
            if progress_callback:
                progress_callback(sample_name, completed, total)
    
    # Summary
    successful = sum(1 for r in results.values() if r.get('status') == 'ok')
    
    return {
        "status": "ok" if successful > 0 else "error",
        "total_samples": total,
        "successful": successful,
        "failed": len(errors),
        "results": results,
        "errors": errors if errors else None
    }


def export_batch_results(
    batch_results: Dict[str, Any],
    output_path: str,
    format: str = 'xlsx'
) -> str:
    """
    Export batch enrichment results to file.
    
    Args:
        batch_results: Results from run_batch_enrichment
        output_path: Output file path
        format: 'xlsx', 'csv', or 'json'
        
    Returns:
        Path to saved file
    """
    import pandas as pd
    import json
    from pathlib import Path
    
    output_path = Path(output_path)
    
    if format == 'json':
        with open(output_path, 'w') as f:
            json.dump(batch_results, f, indent=2, default=str)
        return str(output_path)
    
    # Convert to DataFrame for tabular export
    rows = []
    for sample_name, sample_result in batch_results.get('results', {}).items():
        if sample_result.get('status') != 'ok':
            continue
            
        result_list = sample_result.get('results', [])
        for pathway in result_list:
            rows.append({
                'Sample': sample_name,
                'Pathway': pathway.get('pathway_name', ''),
                'P-value': pathway.get('p_value', ''),
                'FDR': pathway.get('fdr', ''),
                'Odds Ratio': pathway.get('odds_ratio', ''),
                'NES': pathway.get('nes', ''),
                'Overlap': pathway.get('overlap_ratio', ''),
                'Hit Genes': ', '.join(pathway.get('hit_genes', [])[:10])
            })
    
    if not rows:
        raise ValueError("No results to export")
    
    df = pd.DataFrame(rows)
    
    if format == 'xlsx':
        # Write with multiple sheets
        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Results', index=False)
            
            # Add metadata sheet
            meta_df = pd.DataFrame([{
                'Total Samples': batch_results.get('total_samples', 0),
                'Successful': batch_results.get('successful', 0),
                'Failed': batch_results.get('failed', 0),
                'Export Date': pd.Timestamp.now().isoformat()
            }])
            meta_df.to_excel(writer, sheet_name='Metadata', index=False)
    else:  # csv
        df.to_csv(output_path, index=False)
    
    return str(output_path)


def prepare_batch_from_timecourse(
    data: List[Dict],
    timepoints: List[str],
    p_cutoff: float = 0.05
) -> Dict[str, List[str]]:
    """
    Prepare batch gene lists from time-course data.
    
    Args:
        data: List of gene data dicts with timepoint columns
        timepoints: List of timepoint column prefixes (e.g., ['4h', '8h', '1day'])
        p_cutoff: P-value cutoff for significance
        
    Returns:
        Dict mapping timepoint names to significant gene lists
    """
    gene_lists = {}
    
    for timepoint in timepoints:
        logfc_col = f"{timepoint}_logfc"
        pval_col = f"{timepoint}_pvalue"
        
        significant_genes = []
        for row in data:
            try:
                gene = row.get('Gene', row.get('gene', ''))
                pval = float(row.get(pval_col, 1.0))
                
                if pval < p_cutoff and gene:
                    significant_genes.append(gene)
            except (ValueError, TypeError):
                continue
        
        if significant_genes:
            gene_lists[timepoint] = significant_genes
    
    return gene_lists
