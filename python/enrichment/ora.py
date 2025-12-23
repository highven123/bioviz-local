"""
Over-Representation Analysis (ORA) for BioViz Enrichment Framework

Implements Fisher's exact test and hypergeometric test for pathway enrichment
with multiple testing correction.
"""

import logging
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, asdict
import warnings

# Statistical libraries
try:
    from scipy.stats import fisher_exact, hypergeom
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False
    logging.warning("scipy not installed. ORA will not be available.")

try:
    from statsmodels.stats.multitest import multipletests
    STATSMODELS_AVAILABLE = True
except ImportError:
    STATSMODELS_AVAILABLE = False
    logging.warning("statsmodels not installed. FDR correction will use simple Bonferroni.")


@dataclass
class ORAResult:
    """Result from ORA analysis for a single pathway"""
    
    pathway_id: str
    pathway_name: str
    
    # Enrichment statistics
    p_value: float
    fdr: float
    odds_ratio: float
    
    # Gene counts
    hit_genes: List[str]  # Genes in both input and pathway
    pathway_size: int  # Total genes in pathway
    background_size: int  # Total genes in background
    
    # Overlap
    overlap_ratio: str  # e.g., "15/200"
    
    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return asdict(self)
    
    @property
    def is_significant(self, alpha: float = 0.05) -> bool:
        """Check if result is significant at given alpha"""
        return self.fdr < alpha


def fisher_test(
    hit_in_pathway: int,
    hit_not_in_pathway: int,
    pathway_not_hit: int,
    background_not_hit: int
) -> Tuple[float, float]:
    """
    Perform Fisher's exact test for enrichment.
    
    Contingency table:
                    | In Pathway | Not in Pathway |
    Hit (input)     |     a      |       b        |
    Not Hit (bg)    |     c      |       d        |
    
    Args:
        hit_in_pathway: a (genes in both input and pathway)
        hit_not_in_pathway: b (genes in input but not pathway)
        pathway_not_hit: c (genes in pathway but not input)
        background_not_hit: d (genes in background but not pathway or input)
        
    Returns:
        Tuple of (odds_ratio, p_value)
    """
    if not SCIPY_AVAILABLE:
        raise RuntimeError("scipy is required for Fisher's exact test")
    
    table = [[hit_in_pathway, hit_not_in_pathway],
             [pathway_not_hit, background_not_hit]]
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        odds_ratio, p_value = fisher_exact(table, alternative='greater')
    
    return odds_ratio, p_value


def hypergeometric_test(
    hit_in_pathway: int,
    pathway_size: int,
    hit_size: int,
    background_size: int
) -> float:
    """
    Perform hypergeometric test for enrichment.
    
    P(X >= k) where:
    - k: genes in both input and pathway
    - M: background size
    - n: pathway size
    - N: input size
    
    Returns:
        P-value
    """
    if not SCIPY_AVAILABLE:
        raise RuntimeError("scipy is required for hypergeometric test")
    
    # P(X >= k) = 1 - P(X <= k-1)
    p_value = hypergeom.sf(hit_in_pathway - 1, background_size, pathway_size, hit_size)
    
    return float(p_value)


def fdr_correction(p_values: List[float], method: str = 'fdr_bh') -> List[float]:
    """
    Apply FDR correction to p-values.
    
    Args:
        p_values: List of p-values
        method: Correction method ('fdr_bh' for Benjamini-Hochberg, 'bonferroni')
        
    Returns:
        List of adjusted p-values
    """
    if STATSMODELS_AVAILABLE:
        try:
            _, adjusted, _, _ = multipletests(p_values, method=method)
            return list(adjusted)
        except Exception as e:
            logging.warning(f"FDR correction failed: {e}, using Bonferroni")
    
    # Fallback: Simple Bonferroni
    n = len(p_values)
    return [min(p * n, 1.0) for p in p_values]


def run_ora(
    gene_list: List[str],
    gene_sets: Dict[str, List[str]],
    background: Optional[List[str]] = None,
    background_size: Optional[int] = None,
    p_cutoff: float = 0.05,
    min_overlap: int = 3,
    fdr_method: str = 'fdr_bh',
    use_fisher: bool = True
) -> List[ORAResult]:
    """
    Run Over-Representation Analysis.
    
    Args:
        gene_list: List of input genes (e.g., differentially expressed)
        gene_sets: Dictionary of pathway_name -> gene_list
        background: Optional background gene set (if None, use all genes in gene_sets)
        background_size: Optional explicit background size
        p_cutoff: P-value cutoff for reporting
        min_overlap: Minimum genes required in overlap
        fdr_method: FDR correction method
        use_fisher: Use Fisher's exact test (default), else hypergeometric
        
    Returns:
        List of ORAResult objects, sorted by p-value
    """
    if not SCIPY_AVAILABLE:
        logging.warning("scipy not available. ORA analysis skipped.")
        return []  # Return empty results instead of crashing
    
    # Prepare data
    gene_set = set(gene_list)
    
    # Determine background
    if background is None:
        background = set()
        for genes in gene_sets.values():
            background.update(genes)
        background_size = len(background)
    else:
        background = set(background)
        background_size = background_size or len(background)
    
    logging.info(
        f"Running ORA: {len(gene_list)} input genes, "
        f"{len(gene_sets)} gene sets, background={background_size}"
    )
    
    # Run enrichment for each pathway
    results = []
    p_values = []
    
    for pathway_name, pathway_genes in gene_sets.items():
        pathway_set = set(pathway_genes)
        
        # Calculate overlap
        hit_genes = gene_set.intersection(pathway_set)
        
        if len(hit_genes) < min_overlap:
            continue
        
        # Contingency table components
        a = len(hit_genes)  # hit in pathway
        b = len(gene_set - pathway_set)  # hit not in pathway
        c = len(pathway_set - gene_set)  # pathway not hit
        d = background_size - a - b - c  # background not hit
        
        # Statistical test
        if use_fisher:
            odds_ratio, p_value = fisher_test(a, b, c, d)
        else:
            p_value = hypergeometric_test(a, len(pathway_set), len(gene_set), background_size)
            odds_ratio = (a / len(gene_set)) / (len(pathway_set) / background_size) if len(pathway_set) > 0 else 0
        
        p_values.append(p_value)
        
        results.append({
            'pathway_name': pathway_name,
            'p_value': p_value,
            'odds_ratio': odds_ratio,
            'hit_genes': sorted(list(hit_genes)),
            'pathway_size': len(pathway_set),
            'background_size': background_size,
            'overlap_ratio': f"{a}/{len(pathway_set)}"
        })
    
    # Apply FDR correction
    if results:
        fdr_values = fdr_correction(p_values, method=fdr_method)
        
        # Create ORAResult objects
        ora_results = []
        for res, fdr in zip(results, fdr_values):
            if res['p_value'] <= p_cutoff:  # Filter by raw p-value
                ora_results.append(ORAResult(
                    pathway_id=res['pathway_name'],  # Will be updated if we have real IDs
                    pathway_name=res['pathway_name'],
                    p_value=res['p_value'],
                    fdr=fdr,
                    odds_ratio=res['odds_ratio'],
                    hit_genes=res['hit_genes'],
                    pathway_size=res['pathway_size'],
                    background_size=res['background_size'],
                    overlap_ratio=res['overlap_ratio']
                ))
        
        # Sort by p-value
        ora_results.sort(key=lambda x: x.p_value)
        
        logging.info(f"ORA complete: {len(ora_results)}/{len(gene_sets)} pathways significant")
        
        return ora_results
    
    return []


# Convenience function for quick ORA
def quick_ora(
    gene_list: List[str],
    gene_sets: Dict[str, List[str]],
    **kwargs
) -> List[Dict]:
    """
    Quick ORA returning dictionaries instead of ORAResult objects.
    
    Args:
        gene_list: Input genes
        gene_sets: Gene set database
        **kwargs: Additional arguments for run_ora()
        
    Returns:
        List of result dictionaries
    """
    results = run_ora(gene_list, gene_sets, **kwargs)
    return [r.to_dict() for r in results]
