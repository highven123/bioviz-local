"""
Pathway Activity Scoring for Single Cells
Implements AUCell algorithm for per-cell pathway scoring
"""

import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Any

logger = logging.getLogger("BioViz.SingleCell.Scorer")


def compute_aucell_scores(
    expression_matrix: pd.DataFrame,
    gene_sets: Dict[str, List[str]],
    n_top_genes: int = 5000
) -> pd.DataFrame:
    """
    Compute AUCell scores for each cell and each gene set (pathway).
    
    AUCell Algorithm:
    1. For each cell, rank genes by expression (descending)
    2. For each gene set, compute Area Under the Curve of the gene rankings
    3. Score reflects how highly the gene set genes are expressed relative to all genes
    
    Args:
        expression_matrix: DataFrame (cells × genes)
        gene_sets: Dict mapping pathway names to lists of gene symbols
        n_top_genes: Number of top genes to consider for ranking (default 5000)
        
    Returns:
        DataFrame (cells × pathways) with AUCell scores in [0, 1]
    """
    if expression_matrix.empty:
        logger.warning("Empty expression matrix provided")
        return pd.DataFrame()
    
    # Limit to top variable genes for performance
    if expression_matrix.shape[1] > n_top_genes:
        gene_vars = expression_matrix.var(axis=0)
        top_genes = gene_vars.nlargest(n_top_genes).index
        expression_matrix = expression_matrix[top_genes]
        logger.info(f"Using top {n_top_genes} variable genes")
    
    n_cells = expression_matrix.shape[0]
    n_genes = expression_matrix.shape[1]
    
    # Compute rankings for each cell (rank 1 = highest expression)
    rankings = expression_matrix.rank(axis=1, method='average', ascending=False)
    
    # Normalize rankings to [0, 1]
    normalized_rankings = rankings / n_genes
    
    # Compute AUCell score for each gene set
    aucell_scores = {}
    
    for pathway_name, gene_list in gene_sets.items():
        # Find genes in the gene set that are present in the data
        genes_in_data = [g for g in gene_list if g in expression_matrix.columns]
        
        if len(genes_in_data) == 0:
            logger.warning(f"No genes from pathway '{pathway_name}' found in data")
            aucell_scores[pathway_name] = np.zeros(n_cells)
            continue
        
        # Get rankings for genes in this pathway
        pathway_rankings = normalized_rankings[genes_in_data]
        
        # AUCell score = mean of (1 - normalized_rank) for pathway genes
        # Higher score = genes are ranked higher (more expressed)
        auc_scores = (1 - pathway_rankings).mean(axis=1)
        
        aucell_scores[pathway_name] = auc_scores.values
        logger.debug(f"Computed AUCell for {pathway_name}: {len(genes_in_data)} genes matched")
    
    # Convert to DataFrame
    result_df = pd.DataFrame(aucell_scores, index=expression_matrix.index)
    
    logger.info(f"AUCell scoring complete: {result_df.shape[0]} cells × {result_df.shape[1]} pathways")
    return result_df


def aggregate_scores_by_cluster(
    aucell_scores: pd.DataFrame,
    cluster_labels: pd.Series
) -> pd.DataFrame:
    """
    Aggregate AUCell scores by cell cluster (cell type).
    
    Args:
        aucell_scores: DataFrame (cells × pathways)
        cluster_labels: Series mapping cell IDs to cluster names
        
    Returns:
        DataFrame (clusters × pathways) with mean scores per cluster
    """
    if aucell_scores.empty:
        return pd.DataFrame()
    
    # Align indices
    common_cells = aucell_scores.index.intersection(cluster_labels.index)
    aucell_aligned = aucell_scores.loc[common_cells]
    clusters_aligned = cluster_labels.loc[common_cells]
    
    # Group by cluster and compute mean
    cluster_scores = aucell_aligned.groupby(clusters_aligned).mean()
    
    logger.info(f"Aggregated scores: {cluster_scores.shape[0]} clusters × {cluster_scores.shape[1]} pathways")
    return cluster_scores


def identify_cluster_specific_pathways(
    cluster_scores: pd.DataFrame,
    threshold: float = 0.6
) -> Dict[str, List[str]]:
    """
    Identify pathways that are highly active in specific clusters.
    
    Args:
        cluster_scores: DataFrame (clusters × pathways)
        threshold: Minimum score to consider pathway as "active"
        
    Returns:
        Dict mapping cluster names to lists of highly active pathways
    """
    specific_pathways = {}
    
    for cluster_name in cluster_scores.index:
        scores = cluster_scores.loc[cluster_name]
        high_pathways = scores[scores >= threshold].sort_values(ascending=False)
        specific_pathways[cluster_name] = high_pathways.index.tolist()
    
    return specific_pathways
