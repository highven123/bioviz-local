import pandas as pd
import numpy as np
import logging
from typing import List, Dict, Any, Optional, Set

logger = logging.getLogger("BioViz.Enrichment.Deduplication")

class EnrichmentDeduplicator:
    """
    Implements cross-source enrichment de-duplication and clustering.
    Consolidates similar pathways from KEGG, Reactome, etc., into functional modules.
    """

    def __init__(self, similarity_threshold: float = 0.45):
        self.threshold = similarity_threshold

    def calculate_jaccard(self, set_a: Set[str], set_b: Set[str]) -> float:
        """Calculates Jaccard Index: Intersection / Union"""
        if not set_a or not set_b:
            return 0.0
        intersection = len(set_a.intersection(set_b))
        union = len(set_a.union(set_b))
        return intersection / union if union > 0 else 0.0

    def deduplicate(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Groups enrichment results into clusters based on gene overlap.
        
        Args:
            results: List of result dicts, each with 'term', 'genes', 'fdr', 'p_value', 'source'.
            
        Returns:
            List of 'Modules' where each module has a representative and a list of members.
        """
        if not results:
            return []

        # Convert to a stable internal format and preprocess gene sets
        data = []
        for r in results:
            # Handle different keys for term name/genes depending on source
            term_name = r.get('term') or r.get('pathway_name') or r.get('name') or "Unknown"
            genes_raw = r.get('genes') or r.get('hit_genes') or []
            
            # Ensure genes are a set for fast comparison
            if isinstance(genes_raw, str):
                gene_set = set(genes_raw.replace(';', ' ').replace(',', ' ').split())
            else:
                gene_set = set(str(g) for g in genes_raw)
                
            data.append({
                "original_data": r,
                "term": term_name,
                "gene_set": gene_set,
                "fdr": float(r.get('fdr') or r.get('adjusted_p_value') or 1.0),
                "p_value": float(r.get('p_value') or 1.0),
                "overlap_count": len(gene_set),
                "source": r.get('source', 'unknown')
            })

        # Sort by: 1. FDR (ascending), 2. Overlap count (descending)
        # Scientific rationale: Most significant first; then most representative (broadest).
        data.sort(key=lambda x: (x['fdr'], -x['overlap_count']))
        
        clusters = []
        assigned_indices = set()

        for i, row_a in enumerate(data):
            if i in assigned_indices:
                continue
            
            # Start a new cluster with this term as Representative
            current_cluster = {
                "representative_term": row_a['term'],
                "fdr": row_a['fdr'],
                "p_value": row_a['p_value'],
                "source": row_a['source'],
                "genes": list(row_a['gene_set']),
                "cluster_size": 1,
                "members": [row_a['original_data']] # Full original data for drill-down
            }
            assigned_indices.add(i)
            
            # Find similar terms to join this cluster
            for j in range(i + 1, len(data)):
                if j in assigned_indices:
                    continue
                
                row_b = data[j]
                similarity = self.calculate_jaccard(row_a['gene_set'], row_b['gene_set'])
                
                if similarity >= self.threshold:
                    current_cluster['members'].append(row_b['original_data'])
                    current_cluster['cluster_size'] += 1
                    # Note: We keep the representative's genes, but we could union them if needed
                    assigned_indices.add(j)
            
            clusters.append(current_cluster)

        return clusters

# Singleton instance
deduplicator = EnrichmentDeduplicator()
