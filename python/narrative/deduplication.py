import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional

class SemanticAggregator:
    """
    Implements pathway de-duplication and clustering logic.
    Goal: Reduce 100+ similar pathways (e.g., 'T cell activation', 'Lymphocyte activation') 
    into ~10 distinct 'Biological Modules'.
    """

    def __init__(self, similarity_threshold: float = 0.4):
        self.threshold = similarity_threshold

    def calculate_jaccard(self, set_a: set, set_b: set) -> float:
        """Calculates Jaccard Index: Intersection / Union"""
        intersection = len(set_a.intersection(set_b))
        union = len(set_a.union(set_b))
        if union == 0:
            return 0.0
        return intersection / union

    def deduplicate(self, enrichment_df: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Main entry point.
        Expects a DataFrame with columns: ['Term', 'Genes'] (Genes as semicolon or space separated string).
        Returns a list of structured 'Module' dicts.
        """
        if enrichment_df.empty:
            return []

        # Standardize DF
        df = enrichment_df.copy()
        # Ensure we have a set of genes for each term
        # Assuming 'Genes' col formatting is typical (e.g., "TP53;EGFR" or "TP53, EGFR")
        df['GeneSet'] = df['Genes'].apply(
            lambda x: set(str(x).replace(';', ' ').replace(',', ' ').split()) if pd.notnull(x) else set()
        )
        
        # Sort by P-value (most significant first) to pick "Representatives"
        if 'Adjusted P-value' in df.columns:
            df = df.sort_values('Adjusted P-value')
        elif 'P-value' in df.columns:
            df = df.sort_values('P-value')
            
        data = df.to_dict('records')
        clusters = [] # List of {'rep': record, 'members': [record, ...]}
        
        assigned_indices = set()

        for i, row_a in enumerate(data):
            if i in assigned_indices:
                continue
            
            # Start a new cluster with this term as the Representative (because it has lowest P-val)
            current_cluster = {
                "representative": row_a['Term'],
                "p_value": row_a.get('Adjusted P-value', row_a.get('P-value', 0)),
                "genes": list(row_a['GeneSet']),
                "members": [row_a['Term']],  # Include itself
                "size": 1
            }
            assigned_indices.add(i)
            
            # Find all subsequent terms that are similar to this representative
            for j in range(i + 1, len(data)):
                if j in assigned_indices:
                    continue
                
                row_b = data[j]
                similarity = self.calculate_jaccard(row_a['GeneSet'], row_b['GeneSet'])
                
                if similarity >= self.threshold:
                    current_cluster['members'].append(row_b['Term'])
                    # Merge gene sets for a comprehensive view? 
                    # For now, keep rep's genes or union? Union is safer for "Module" view.
                    # row_a['GeneSet'].update(row_b['GeneSet']) 
                    current_cluster['size'] += 1
                    assigned_indices.add(j)
            
            # Format output for the next step (Narrative)
            # Simplify 'members' if too long
            if len(current_cluster['members']) > 5:
                current_cluster['members_str'] = ", ".join(current_cluster['members'][:5]) + f", ... ({len(current_cluster['members'])} total)"
            else:
                current_cluster['members_str'] = ", ".join(current_cluster['members'])
                
            clusters.append(current_cluster)

        return clusters

# Singleton
deduplicator = SemanticAggregator()
