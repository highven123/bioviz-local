"""
Spatial Ligand-Receptor Interaction Analysis
Identifies cell-cell communication via L-R pairs
"""

import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Any, Tuple, Optional
from scipy.spatial import distance_matrix

logger = logging.getLogger("BioViz.SingleCell.Spatial")


class SpatialLRAnalyzer:
    """
    Analyzes ligand-receptor interactions in spatial transcriptomics data.
    """
    
    def __init__(self, lr_database: Optional[pd.DataFrame] = None):
        """
        Initialize with L-R database.
        
        Args:
            lr_database: DataFrame with columns ['ligand', 'receptor', 'pathway']
                        If None, uses a minimal default database
        """
        if lr_database is None:
            # Minimal default L-R pairs for demo
            self.lr_db = pd.DataFrame({
                'ligand': ['TGFB1', 'IL6', 'TNF', 'VEGFA', 'PDGFA'],
                'receptor': ['TGFBR1', 'IL6R', 'TNFRSF1A', 'FLT1', 'PDGFRA'],
                'pathway': ['TGF-beta signaling', 'JAK-STAT signaling', 'NF-kappa B signaling', 'VEGF signaling', 'PDGF signaling']
            })
        else:
            self.lr_db = lr_database
        
        logger.info(f"Initialized with {len(self.lr_db)} L-R pairs")
    
    def find_spatial_neighbors(
        self, 
        spatial_coords: np.ndarray, 
        distance_threshold: float = 50.0
    ) -> List[Tuple[int, int]]:
        """
        Identify pairs of spatially neighboring cells.
        
        Args:
            spatial_coords: Array of shape (n_cells, 2) with x, y coordinates
            distance_threshold: Maximum distance to consider cells as neighbors
            
        Returns:
            List of tuples (cell_i, cell_j) representing neighbor pairs
        """
        dists = distance_matrix(spatial_coords, spatial_coords)
        neighbors = []
        
        for i in range(len(spatial_coords)):
            for j in range(i + 1, len(spatial_coords)):
                if dists[i, j] <= distance_threshold:
                    neighbors.append((i, j))
        
        logger.info(f"Found {len(neighbors)} neighbor pairs (threshold={distance_threshold})")
        return neighbors
    
    def detect_lr_interactions(
        self,
        expression_matrix: pd.DataFrame,
        neighbor_pairs: List[Tuple[int, int]],
        expression_threshold: float = 0.5
    ) -> List[Dict[str, Any]]:
        """
        Detect L-R interactions between neighboring cells.
        
        Args:
            expression_matrix: DataFrame (cells × genes)
            neighbor_pairs: List of (cell_i, cell_j) pairs
            expression_threshold: Minimum expression level to consider gene as "expressed"
            
        Returns:
            List of interaction dicts with keys:
            - ligand, receptor, sender_cell, receiver_cell, pathway, score
        """
        interactions =[]
        
        cell_ids = expression_matrix.index
        
        for cell_i_idx, cell_j_idx in neighbor_pairs:
            if cell_i_idx >= len(cell_ids) or cell_j_idx >= len(cell_ids):
                continue
            
            cell_i = cell_ids[cell_i_idx]
            cell_j = cell_ids[cell_j_idx]
            
            expr_i = expression_matrix.loc[cell_i]
            expr_j = expression_matrix.loc[cell_j]
            
            # Check each L-R pair
            for _, lr_pair in self.lr_db.iterrows():
                ligand = lr_pair['ligand']
                receptor = lr_pair['receptor']
                pathway = lr_pair['pathway']
                
                # Skip if genes not in data
                if ligand not in expression_matrix.columns or receptor not in expression_matrix.columns:
                    continue
                
                # Check if cell_i expresses ligand and cell_j expresses receptor
                if expr_i[ligand] > expression_threshold and expr_j[receptor] > expression_threshold:
                    interactions.append({
                        'ligand': ligand,
                        'receptor': receptor,
                        'sender_cell': str(cell_i),
                        'receiver_cell': str(cell_j),
                        'pathway': pathway,
                        'score': (expr_i[ligand] + expr_j[receptor]) / 2
                    })
                
                # Check reverse direction (cell_j -> cell_i)
                if expr_j[ligand] > expression_threshold and expr_i[receptor] > expression_threshold:
                    interactions.append({
                        'ligand': ligand,
                        'receptor': receptor,
                        'sender_cell': str(cell_j),
                        'receiver_cell': str(cell_i),
                        'pathway': pathway,
                        'score': (expr_j[ligand] + expr_i[receptor]) / 2
                    })
        
        logger.info(f"Detected {len(interactions)} L-R interactions")
        return interactions
