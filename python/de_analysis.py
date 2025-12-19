"""
Differential Expression (DE) Analysis Module for BioViz
Provides basic DE analysis capabilities for quick prototyping.

NOTE: For publication-quality analysis, use established tools:
- R: DESeq2, edgeR, limma
- Python: pyDESeq2, scanpy
"""

import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional, Tuple
from scipy import stats


def simple_ttest_de(
    counts: pd.DataFrame,
    group1_samples: List[str],
    group2_samples: List[str],
    p_threshold: float = 0.05,
    log2fc_threshold: float = 1.0
) -> pd.DataFrame:
    """
    Simple t-test based differential expression analysis.
    
    WARNING: This is a basic implementation for prototyping.
    For publication, use proper tools (DESeq2, edgeR).
    
    Args:
        counts: DataFrame with genes as rows, samples as columns
        group1_samples: List of sample names for group 1
        group2_samples: List of sample names for group 2
        p_threshold: P-value threshold for significance (default 0.05)
        log2fc_threshold: Log2 fold change threshold (default 1.0)
        
    Returns:
        DataFrame with columns: gene, log2FC, pvalue, FDR, status
    """
    # Validate inputs
    if counts.empty:
        raise ValueError("Empty counts matrix provided")
    
    missing_g1 = [s for s in group1_samples if s not in counts.columns]
    missing_g2 = [s for s in group2_samples if s not in counts.columns]
    
    if missing_g1:
        raise ValueError(f"Group 1 samples not found: {missing_g1}")
    if missing_g2:
        raise ValueError(f"Group 2 samples not found: {missing_g2}")
    
    if len(group1_samples) < 2 or len(group2_samples) < 2:
        raise ValueError("Each group must have at least 2 samples")
    
    results = []
    
    for gene in counts.index:
        g1_values = counts.loc[gene, group1_samples].values
        g2_values = counts.loc[gene, group2_samples].values
        
        # Skip genes with all zeros
        if np.all(g1_values == 0) and np.all(g2_values == 0):
            continue
        
        # Add pseudocount and ensure positive for log2
        g1_values = np.maximum(g1_values, 0) + 1
        g2_values = np.maximum(g2_values, 0) + 1
        
        # Log2 transform
        log2_g1 = np.log2(g1_values)
        log2_g2 = np.log2(g2_values)
        
        # Calculate mean log2 values
        mean_g1 = np.mean(log2_g1)
        mean_g2 = np.mean(log2_g2)
        
        # Log2 fold change
        log2fc = mean_g2 - mean_g1
        
        # T-test
        try:
            t_stat, pvalue = stats.ttest_ind(log2_g2, log2_g1)
            
            # Handle NaN p-values
            if np.isnan(pvalue):
                pvalue = 1.0
        except:
            pvalue = 1.0
        
        results.append({
            'gene': gene,
            'log2FC': log2fc,
            'pvalue': pvalue,
            'mean_group1': mean_g1,
            'mean_group2': mean_g2
        })
    
    # Create results DataFrame
    df = pd.DataFrame(results)
    
    if df.empty:
        logging.warning("No genes passed filtering")
        return pd.DataFrame(columns=['gene', 'log2FC', 'pvalue', 'FDR', 'status'])
    
    # FDR correction (Benjamini-Hochberg)
    df['FDR'] = df['pvalue'] # Default to pvalue if correction fails
    try:
        from statsmodels.stats.multitest import multipletests
        _, fdr_values, _, _ = multipletests(df['pvalue'], method='fdr_bh')
        df['FDR'] = fdr_values
    except ImportError:
        logging.warning("statsmodels not available, skipping BH FDR correction.")
    except Exception as e:
        logging.error(f"FDR correction failed: {e}")
    
    # Determine status
    def classify_gene(row):
        if row['FDR'] < p_threshold:
            if abs(row['log2FC']) >= log2fc_threshold:
                return 'UP' if row['log2FC'] > 0 else 'DOWN'
        return 'NS'
    
    df['status'] = df.apply(classify_gene, axis=1)
    
    # Sort by FDR
    df = df.sort_values('FDR')
    
    logging.info(
        f"DE analysis complete: {len(df)} genes, "
        f"{(df['status'] == 'UP').sum()} UP, "
        f"{(df['status'] == 'DOWN').sum()} DOWN"
    )
    
    return df


def run_pydeseq2(
    counts: pd.DataFrame,
    sample_metadata: pd.DataFrame,
    design_formula: str = "~ condition",
    contrast: Optional[Tuple[str, str, str]] = None
) -> pd.DataFrame:
    """
    Run DESeq2 analysis using pyDESeq2 (if installed).
    
    Args:
        counts: Raw count matrix (genes x samples)
        sample_metadata: Sample metadata DataFrame
        design_formula: Design formula (e.g., "~ condition")
        contrast: Optional contrast for comparison (factor, numerator, denominator)
        
    Returns:
        DataFrame with DE results
        
    Raises:
        ImportError: If pyDESeq2 is not installed
    """
    try:
        from pydeseq2.dds import DeseqDataSet
        from pydeseq2.ds import DeseqStats
    except ImportError:
        raise ImportError(
            "pyDESeq2 not installed. Install with: pip install pydeseq2\n"
            "For basic analysis, use simple_ttest_de() instead."
        )
    
    # Validate inputs
    if counts.empty:
        raise ValueError("Empty counts matrix")
    
    if sample_metadata.empty:
        raise ValueError("Empty sample metadata")
    
    # Ensure counts are integers
    counts = counts.astype(int)
    
    # Create DESeqDataSet
    dds = DeseqDataSet(
        counts=counts,
        metadata=sample_metadata,
        design=design_formula,
        refit_cooks=True
    )
    
    # Run DESeq2
    dds.deseq2()
    
    # Get results
    stat_res = DeseqStats(dds, contrast=contrast)
    stat_res.summary()
    
    results = stat_res.results_df
    
    # Rename columns to match BioViz format
    results = results.rename(columns={
        'log2FoldChange': 'log2FC',
        'pvalue': 'pvalue',
        'padj': 'FDR'
    })
    
    results['gene'] = results.index
    
    # Add status column
    def classify_gene(row):
        if pd.notna(row['FDR']) and row['FDR'] < 0.05:
            if abs(row['log2FC']) >= 1.0:
                return 'UP' if row['log2FC'] > 0 else 'DOWN'
        return 'NS'
    
    results['status'] = results.apply(classify_gene, axis=1)
    
    logging.info(
        f"DESeq2 complete: {len(results)} genes, "
        f"{(results['status'] == 'UP').sum()} UP, "
        f"{(results['status'] == 'DOWN').sum()} DOWN"
    )
    
    return results[['gene', 'log2FC', 'pvalue', 'FDR', 'status']]


def auto_de_analysis(
    counts: pd.DataFrame,
    group1_samples: List[str],
    group2_samples: List[str],
    method: str = "auto",
    **kwargs
) -> Dict[str, Any]:
    """
    Automatically run DE analysis using best available method.
    
    Args:
        counts: Count matrix
        group1_samples: Group 1 sample names
        group2_samples: Group 2 sample names
        method: 'auto', 'ttest', or 'deseq2'
        **kwargs: Additional arguments for specific methods
        
    Returns:
        Dictionary with results and metadata
    """
    # Determine method
    if method == "auto":
        try:
            import pydeseq2
            method = "deseq2"
            logging.info("Using DESeq2 for analysis")
        except ImportError:
            method = "ttest"
            logging.info("pyDESeq2 not available, using simple t-test")
    
    # Run analysis
    if method == "deseq2":
        # Create metadata
        sample_metadata = pd.DataFrame({
            'sample': group1_samples + group2_samples,
            'condition': ['group1'] * len(group1_samples) + ['group2'] * len(group2_samples)
        })
        sample_metadata = sample_metadata.set_index('sample')
        
        results_df = run_pydeseq2(
            counts,
            sample_metadata,
            design_formula="~ condition",
            contrast=("condition", "group2", "group1")
        )
        
        # Replace NaN/inf with None for JSON serialization
        results_df = results_df.replace([np.inf, -np.inf], np.nan)
        results_list = results_df.where(pd.notnull(results_df), None).to_dict('records')
        
        return {
            "status": "ok",
            "method": "DESeq2",
            "results": results_list,
            "summary": {
                "total_genes": int(len(results_df)),
                "upregulated": int((results_df['status'] == 'UP').sum()),
                "downregulated": int((results_df['status'] == 'DOWN').sum()),
                "not_significant": int((results_df['status'] == 'NS').sum())
            },
            "warning": None
        }
    
    elif method == "ttest":
        results_df = simple_ttest_de(counts, group1_samples, group2_samples, **kwargs)
        
        # Replace NaN/inf with None for JSON serialization
        results_df = results_df.replace([np.inf, -np.inf], np.nan)
        results_list = results_df.where(pd.notnull(results_df), None).to_dict('records')
        
        return {
            "status": "ok",
            "method": "Simple t-test",
            "results": results_list,
            "summary": {
                "total_genes": int(len(results_df)),
                "upregulated": int((results_df['status'] == 'UP').sum()),
                "downregulated": int((results_df['status'] == 'DOWN').sum()),
                "not_significant": int((results_df['status'] == 'NS').sum())
            },
            "warning": "Simple t-test used. For publication, use DESeq2 or edgeR in R."
        }
    
    else:
        return {
            "status": "error",
            "message": f"Unknown method: {method}. Use 'auto', 'ttest', or 'deseq2'."
        }


# Command handler for bio_core integration
def handle_de_analysis(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle DE_ANALYSIS command from frontend.
    
    Payload should contain:
    - counts: Count matrix (dict or DataFrame)
    - group1_samples: List of sample names for group 1
    - group2_samples: List of sample names for group 2
    - method: Optional, 'auto', 'ttest', or 'deseq2'
    """
    try:
        # Extract data
        counts_data = payload.get("counts")
        counts_path = payload.get("counts_path")
        group1_samples = payload.get("group1_samples", [])
        group2_samples = payload.get("group2_samples", [])
        method = payload.get("method", "auto")
        
        # Determine counts DataFrame
        counts = None
        if counts_data is not None:
            if isinstance(counts_data, dict):
                counts = pd.DataFrame(counts_data)
                if 'gene' in counts.columns:
                    counts = counts.set_index('gene')
            elif isinstance(counts_data, pd.DataFrame):
                counts = counts_data
        elif counts_path:
            import os
            if not os.path.exists(counts_path):
                return {"status": "error", "message": f"File not found: {counts_path}"}
            
            if counts_path.endswith('.csv'):
                counts = pd.read_csv(counts_path)
            elif counts_path.endswith(('.xls', '.xlsx')):
                counts = pd.read_excel(counts_path)
            else:
                return {"status": "error", "message": "Unsupported file format. Use CSV or Excel."}
            
            # Use first column as gene index if not already
            if not counts.empty:
                gene_col = counts.columns[0]
                counts = counts.set_index(gene_col)
        
        if counts is None or counts.empty:
            return {
                "status": "error",
                "message": "Invalid counts format or empty data. Expected 'counts' (dict) or 'counts_path' (string)."
            }
        
        # Run analysis
        result = auto_de_analysis(counts, group1_samples, group2_samples, method=method)
        
        return result
        
    except Exception as e:
        logging.error(f"DE analysis error: {e}")
        return {
            "status": "error",
            "message": f"DE analysis failed: {str(e)}"
        }
