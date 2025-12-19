"""
GSEA (Gene Set Enrichment Analysis) for BioViz Enrichment Framework

Refactored wrapper around gseapy for prerank analysis.
"""

import logging
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, asdict
import warnings

# GSEA library
try:
    import gseapy as gp
    import pandas as pd
    GSEAPY_AVAILABLE = True
except ImportError:
    GSEAPY_AVAILABLE = False
    logging.warning("gseapy not installed. GSEA will not be available.")


@dataclass
class GSEAResult:
    """Result from GSEA analysis for a single pathway"""
    
    pathway_id: str
    pathway_name: str
    
    # GSEA statistics
    es: float  # Enrichment Score
    nes: float  # Normalized Enrichment Score
    p_value: float
    fdr: float
    fwer: float  # Family-Wise Error Rate
    
    # Leading edge
    lead_genes: List[str]
    gene_size: int
    
    # Additional info
    rank_at_max: int
    
    def to_dict(self) -> Dict:
        """Convert to dictionary with frontend compatibility"""
        d = asdict(self)
        # Unified field for all enrichment methods
        d['hit_genes'] = self.lead_genes
        # Provide string representation of overlap for UI
        d['overlap_ratio'] = f"{len(self.lead_genes)}/{self.gene_size}" if self.gene_size > 0 else "0/0"
        return d
    
    @property
    def is_significant(self, alpha: float = 0.25) -> bool:
        """Check if result is significant (note: GSEA uses FDR < 0.25 by default)"""
        return self.fdr < alpha


def validate_gene_ranking(ranking: Dict[str, float]) -> Tuple[Dict[str, float], List[str]]:
    """
    Validate and clean gene ranking dictionary.
    
    Returns:
        Tuple of (valid_ranking, warnings)
    """
    if not ranking:
        return {}, ["Empty gene ranking provided"]
    
    valid_ranking = {}
    warnings_list = []
    invalid_count = 0
    
    for gene, score in ranking.items():
        gene = str(gene).strip()
        if not gene:
            invalid_count += 1
            continue
        
        try:
            score = float(score)
            if not (-1e10 < score < 1e10):  # Sanity check
                warnings_list.append(f"Gene '{gene}' has extreme score {score}, may cause issues")
            valid_ranking[gene] = score
        except (ValueError, TypeError):
            invalid_count += 1
            warnings_list.append(f"Gene '{gene}' has invalid score: {score}")
    
    if invalid_count > 0:
        warnings_list.append(f"Removed {invalid_count}/{len(ranking)} genes with invalid scores")
    
    return valid_ranking, warnings_list


def run_gsea_prerank(
    gene_ranking: Dict[str, float],
    gene_sets: Dict[str, List[str]],
    min_size: int = 5,
    max_size: int = 500,
    permutation_num: int = 1000,
    seed: int = 42
) -> Tuple[List[GSEAResult], List[GSEAResult]]:
    """
    Run GSEA prerank analysis with ranked gene list.
    
    Args:
        gene_ranking: Dictionary of gene -> ranking score (e.g., log2FC * -log10(pvalue))
        gene_sets: Dictionary of pathway_name -> gene_list
        min_size: Minimum gene set size
        max_size: Maximum gene set size
        permutation_num: Number of permutations for p-value calculation
        seed: Random seed for reproducibility
        
    Returns:
        Tuple of (upregulated_pathways, downregulated_pathways)
    """
    if not GSEAPY_AVAILABLE:
        raise RuntimeError("gseapy is required for GSEA. Install: pip install gseapy")
    
    # Validate input
    gene_ranking, warning_list = validate_gene_ranking(gene_ranking)
    if not gene_ranking:
        raise ValueError("Empty or invalid gene ranking after validation")
    
    for w in warning_list:
        logging.warning(f"GSEA validation: {w}")
    
    logging.info(
        f"Running GSEA prerank: {len(gene_ranking)} genes, "
        f"{len(gene_sets)} gene sets, {permutation_num} permutations"
    )
    
    try:
        # Convert to pandas Series for gseapy
        rnk = pd.Series(gene_ranking)
        
        # Jitter implementation: gseapy's Rust core (especially in newer versions) 
        # can panic if too many values are identical or if they are discrete.
        # Adding a tiny amount of noise (1e-9) to resolve this.
        if rnk.duplicated().any():
            duplicate_pct = rnk.duplicated().sum() / len(rnk) * 100
            logging.info(f"GSEA score jitter: Applied to {duplicate_pct:.1f}% duplicated values")
            # Shift slightly to ensure uniqueness without changing ranking order
            import numpy as np
            noise = np.random.uniform(0, 1e-9, size=len(rnk))
            rnk = rnk + noise
            
        # Ensure no NaN or Inf
        rnk = rnk.replace([np.inf, -np.inf], np.nan).dropna()
        if len(rnk) < min_size:
            raise ValueError(f"Insufficient valid genes ({len(rnk)}) for GSEA (min_size={min_size})")

        # Run gseapy prerank
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            pre_res = gp.prerank(
                rnk=rnk,
                gene_sets=gene_sets,
                min_size=min_size,
                max_size=max_size,
                permutation_num=permutation_num,
                outdir=None,
                no_plot=True,
                seed=seed,
                verbose=False
            )
        
        results_df = pre_res.res2d
        
        # Convert to GSEAResult objects
        gsea_results = []
        for _, row in results_df.iterrows():
            # Parse gene size (column name varies between gseapy versions)
            gene_size = row.get('Matched Size') or row.get('Set size') or row.get('Geneset Size') or row.get('Size') or 0
            if isinstance(gene_size, str):
                try:
                    if '/' in gene_size: # Handle "15/100" format if present
                        gene_size = int(gene_size.split('/')[-1])
                    else:
                        gene_size = int(gene_size.strip().rstrip('%'))
                except:
                    gene_size = 0
            
            # Parse leading edge genes
            lead_genes_str = row.get('Lead_genes', '')
            lead_genes = lead_genes_str.split(';') if lead_genes_str else []
            
            gsea_results.append(GSEAResult(
                pathway_id=str(row.get('Term', '')),
                pathway_name=str(row.get('Term', '')),
                es=float(row.get('ES', 0)),
                nes=float(row.get('NES', 0)),
                p_value=float(row.get('NOM p-val', 1)),
                fdr=float(row.get('FDR q-val', 1)),
                fwer=float(row.get('FWER p-val', 1)),
                lead_genes=lead_genes,
                gene_size=int(gene_size),
                rank_at_max=int(row.get('Rank at Max', 0)) if 'Rank at Max' in row else 0
            ))
        
        # Separate by NES sign
        up_regulated = sorted(
            [r for r in gsea_results if r.nes > 0],
            key=lambda x: -x.nes
        )[:20]  # Top 20
        
        down_regulated = sorted(
            [r for r in gsea_results if r.nes < 0],
            key=lambda x: x.nes
        )[:20]  # Top 20
        
        logging.info(
            f"GSEA complete: {len(up_regulated)} upregulated, "
            f"{len(down_regulated)} downregulated pathways"
        )
        
        return up_regulated, down_regulated
        
    except Exception as e:
        logging.error(f"GSEA failed: {e}")
        raise RuntimeError(f"GSEA analysis failed: {e}")


def quick_gsea(
    gene_ranking: Dict[str, float],
    gene_sets: Dict[str, List[str]],
    **kwargs
) -> Tuple[List[Dict], List[Dict]]:
    """
    Quick GSEA returning dictionaries instead of GSEAResult objects.
    
    Args:
        gene_ranking: Gene -> score mapping
        gene_sets: Gene set database
        **kwargs: Additional arguments for run_gsea_prerank()
        
    Returns:
        Tuple of (upregulated_dicts, downregulated_dicts)
    """
    up, down = run_gsea_prerank(gene_ranking, gene_sets, **kwargs)
    return [r.to_dict() for r in up], [r.to_dict() for r in down]
