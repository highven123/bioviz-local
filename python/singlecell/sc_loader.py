"""
Single-Cell Data Loader
Handles AnnData import and basic preprocessing for BioViz
"""

import logging
from typing import Dict, Any, List, Optional
import pandas as pd

logger = logging.getLogger("BioViz.SingleCell")

# Conditional import - scanpy is optional
try:
    import anndata
    import scanpy as sc
    SC_AVAILABLE = True
except ImportError:
    SC_AVAILABLE = False
    logger.warning("Scanpy not installed. Single-cell features disabled.")


def load_anndata(file_path: str) -> Optional[Any]:
    """
    Load AnnData object from .h5ad file.
    
    Args:
        file_path: Path to .h5ad file
        
    Returns:
        AnnData object or None if loading fails
    """
    if not SC_AVAILABLE:
        raise RuntimeError("Scanpy not installed. Cannot load single-cell data.")
    
    try:
        adata = sc.read_h5ad(file_path)
        logger.info(f"Loaded AnnData: {adata.n_obs} cells, {adata.n_vars} genes")
        return adata
    except Exception as e:
        logger.error(f"Failed to load AnnData: {e}")
        return None


def get_cell_clusters(adata: Any, cluster_key: str = 'cell_type') -> Dict[str, List[str]]:
    """
    Extract cell type annotations from AnnData.
    
    Args:
        adata: AnnData object
        cluster_key: Column name in adata.obs containing cluster labels
        
    Returns:
        Dict mapping cluster name to list of cell IDs
    """
    if not SC_AVAILABLE or adata is None:
        return {}
    
    if cluster_key not in adata.obs.columns:
        logger.warning(f"Cluster key '{cluster_key}' not found in AnnData.obs")
        return {}
    
    clusters = {}
    for cluster_name in adata.obs[cluster_key].unique():
        cell_ids = adata.obs[adata.obs[cluster_key] == cluster_name].index.tolist()
        clusters[str(cluster_name)] = cell_ids
    
    logger.info(f"Found {len(clusters)} cell clusters")
    return clusters


def extract_expression_matrix(
    adata: Any, 
    cluster_id: Optional[str] = None,
    cluster_key: str = 'cell_type'
) -> pd.DataFrame:
    """
    Get gene expression matrix for specific cluster or all cells.
    
    Args:
        adata: AnnData object
        cluster_id: Specific cluster to extract (None = all cells)
        cluster_key: Column name for cluster annotation
        
    Returns:
        DataFrame with genes as columns, cells as rows
    """
    if not SC_AVAILABLE or adata is None:
        return pd.DataFrame()
    
    if cluster_id is not None:
        if cluster_key not in adata.obs.columns:
            logger.error(f"Cluster key '{cluster_key}' not found")
            return pd.DataFrame()
        mask = adata.obs[cluster_key] == cluster_id
        subset = adata[mask]
    else:
        subset = adata
    
    # Convert to DataFrame
    if hasattr(subset.X, 'toarray'):  # Sparse matrix
        expr_matrix = pd.DataFrame(
            subset.X.toarray(),
            index=subset.obs_names,
            columns=subset.var_names
        )
    else:  # Dense matrix
        expr_matrix = pd.DataFrame(
            subset.X,
            index=subset.obs_names,
            columns=subset.var_names
        )
    
    logger.info(f"Extracted expression matrix: {expr_matrix.shape}")
    return expr_matrix


def get_metadata_summary(adata: Any) -> Dict[str, Any]:
    """
    Extract summary metadata from AnnData object.
    
    Returns:
        Dict containing:
        - n_cells
        - n_genes
        - has_spatial: bool
        - has_pseudotime: bool
        - cluster_keys: List[str]
    """
    if not SC_AVAILABLE or adata is None:
        return {}
    
    summary = {
        "n_cells": adata.n_obs,
        "n_genes": adata.n_vars,
        "has_spatial": 'spatial' in adata.obsm.keys(),
        "has_pseudotime": any('pseudotime' in col.lower() for col in adata.obs.columns),
        "cluster_keys": [col for col in adata.obs.columns if 'cluster' in col.lower() or 'type' in col.lower()]
    }
    
    return summary
