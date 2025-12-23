"""
Pseudo-time Trajectory Pathway Mapping
Maps pathway activities onto developmental/differentiation trajectories
"""

import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional

logger = logging.getLogger("BioViz.SingleCell.Trajectory")


def bin_pseudotime(
    pseudotime_values: pd.Series,
    n_bins: int = 10
) -> pd.Series:
    """
    Bin continuous pseudo-time values into discrete bins.
    
    Args:
        pseudotime_values: Series of pseudo-time values per cell
        n_bins: Number of time bins to create
        
    Returns:
        Series mapping cell IDs to bin labels (e.g., "Bin_1", "Bin_2", ...)
    """
    quantiles = np.linspace(0, 1, n_bins + 1)
    bin_edges = pseudotime_values.quantile(quantiles).values
    
    bin_labels = [f"Bin_{i+1}" for i in range(n_bins)]
    binned = pd.cut(pseudotime_values, bins=bin_edges, labels=bin_labels, include_lowest=True)
    
    logger.info(f"Binned pseudo-time into {n_bins} bins")
    return binned


def compute_trajectory_dynamics(
    pathway_scores: pd.DataFrame,
    pseudotime_bins: pd.Series
) -> pd.DataFrame:
    """
    Compute mean pathway scores for each pseudo-time bin.
    
    Args:
        pathway_scores: DataFrame (cells × pathways) with AUCell scores
        pseudotime_bins: Series mapping cell IDs to time bin labels
        
    Returns:
        DataFrame (time_bins × pathways) showing pathway dynamics over time
    """
    # Align indices
    common_cells = pathway_scores.index.intersection(pseudotime_bins.index)
    scores_aligned = pathway_scores.loc[common_cells]
    bins_aligned = pseudotime_bins.loc[common_cells]
    
    # Group by time bin and compute mean
    trajectory_df = scores_aligned.groupby(bins_aligned).mean()
    
    logger.info(f"Computed trajectory dynamics: {trajectory_df.shape[0]} time points × {trajectory_df.shape[1]} pathways")
    return trajectory_df


def identify_dynamic_pathways(
    trajectory_df: pd.DataFrame,
    variance_threshold: float = 0.05
) -> List[str]:
    """
    Identify pathways that show significant dynamics over pseudo-time.
    
    Args:
        trajectory_df: DataFrame (time_bins × pathways)
        variance_threshold: Minimum variance to consider pathway as "dynamic"
        
    Returns:
        List of pathway names with high temporal variance
    """
    # Compute variance across time bins for each pathway
    pathway_variances = trajectory_df.var(axis=0)
    
    # Filter pathways with high variance
    dynamic_pathways = pathway_variances[pathway_variances >= variance_threshold].index.tolist()
    
    logger.info(f"Identified {len(dynamic_pathways)} dynamic pathways (threshold={variance_threshold})")
    return dynamic_pathways


def detect_peak_time(
    trajectory_df: pd.DataFrame,
    pathway_name: str
) -> Optional[str]:
    """
    Find the time bin where a pathway reaches peak activity.
    
    Args:
        trajectory_df: DataFrame (time_bins × pathways)
        pathway_name: Name of the pathway to analyze
        
    Returns:
        Time bin label where pathway peaks, or None if pathway not found
    """
    if pathway_name not in trajectory_df.columns:
        logger.warning(f"Pathway '{pathway_name}' not found in trajectory data")
        return None
    
    peak_bin = trajectory_df[pathway_name].idxmax()
    peak_score = trajectory_df.loc[peak_bin, pathway_name]
    
    logger.info(f"Pathway '{pathway_name}' peaks at {peak_bin} (score={peak_score:.3f})")
    return peak_bin
