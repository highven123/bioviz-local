"""
GSEA/GO Module for BioViz v2.0
Provides local gene set enrichment analysis capabilities.
"""

import sys
import json
import logging
from typing import Dict, List, Any, Optional
from pathlib import Path

# Check if gseapy is available
try:
    import gseapy as gp
    GSEAPY_AVAILABLE = True
    logging.info(f"[GSEA] gseapy version {gp.__version__} loaded successfully")
except ImportError as e:
    GSEAPY_AVAILABLE = False
    logging.warning(f"[GSEA] gseapy import failed: {e}")
    print(f"[GSEA] Warning: gseapy not installed or import failed: {e}", file=sys.stderr)


def check_gsea_available() -> bool:
    """Check if GSEA functionality is available."""
    return GSEAPY_AVAILABLE


def run_enrichr(
    gene_list: List[str],
    gene_sets: str = 'KEGG_2021_Human',
    organism: str = 'human'
) -> Dict[str, Any]:
    """
    Run Enrichr analysis on a gene list.
    
    Args:
        gene_list: List of gene symbols
        gene_sets: Gene set library (e.g., 'KEGG_2021_Human', 'GO_Biological_Process_2021')
        organism: Organism name
    
    Returns:
        Dictionary with enrichment results
    """
    if not GSEAPY_AVAILABLE:
        return {
            "status": "error",
            "message": "gseapy not installed. Run: pip install gseapy"
        }
    
    if not gene_list:
        return {
            "status": "error",
            "message": "Empty gene list provided"
        }
    
    try:
        print(f"[GSEA] Running Enrichr with {len(gene_list)} genes on {gene_sets}", file=sys.stderr)
        
        enr = gp.enrichr(
            gene_list=gene_list,
            gene_sets=gene_sets,
            organism=organism,
            outdir=None,  # Don't save to disk
            no_plot=True,
            cutoff=0.05
        )
        
        results = enr.results
        
        # Convert to serializable format
        enriched_terms = []
        for _, row in results.iterrows():
            enriched_terms.append({
                "term": row.get("Term", ""),
                "overlap": row.get("Overlap", ""),
                "p_value": float(row.get("P-value", 1)),
                "adjusted_p_value": float(row.get("Adjusted P-value", 1)),
                "odds_ratio": float(row.get("Odds Ratio", 0)),
                "combined_score": float(row.get("Combined Score", 0)),
                "genes": row.get("Genes", "").split(";") if row.get("Genes") else []
            })
        
        # Sort by adjusted p-value
        enriched_terms.sort(key=lambda x: x["adjusted_p_value"])
        
        print(f"[GSEA] Found {len(enriched_terms)} enriched terms", file=sys.stderr)
        
        return {
            "status": "ok",
            "gene_set": gene_sets,
            "input_genes": len(gene_list),
            "enriched_terms": enriched_terms[:20],  # Top 20
            "total_terms": len(enriched_terms)
        }
        
    except Exception as e:
        print(f"[GSEA] Error: {e}", file=sys.stderr)
        return {
            "status": "error",
            "message": str(e)
        }


def _parse_gene_size(value) -> int:
    """Parse gene size from various formats (int, float, percentage string)."""
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        # Handle percentage strings like "23.33%"
        value = value.strip().rstrip('%')
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return 0
    return 0


def run_gsea_prerank(
    gene_ranking: Dict[str, float],
    gene_sets: str = 'KEGG_2021_Human',
    min_size: int = 5,
    max_size: int = 500,
    permutation_num: int = 100
) -> Dict[str, Any]:
    """
    Run GSEA prerank analysis with ranked gene list.
    
    Args:
        gene_ranking: Dictionary of gene -> ranking score (e.g., log2FC * -log10(pvalue))
        gene_sets: Gene set library
        min_size: Minimum gene set size
        max_size: Maximum gene set size
        permutation_num: Number of permutations
    
    Returns:
        Dictionary with GSEA results
    """
    if not GSEAPY_AVAILABLE:
        return {
            "status": "error",
            "message": "gseapy not installed. Run: pip install gseapy"
        }
    
    if not gene_ranking:
        return {
            "status": "error",
            "message": "Empty gene ranking provided"
        }
    
    try:
        print(f"[GSEA] Running prerank with {len(gene_ranking)} genes", file=sys.stderr)
        
        # Convert to pandas Series format
        import pandas as pd
        rnk = pd.Series(gene_ranking)
        
        pre_res = gp.prerank(
            rnk=rnk,
            gene_sets=gene_sets,
            min_size=min_size,
            max_size=max_size,
            permutation_num=permutation_num,
            outdir=None,
            no_plot=True,
            seed=42
        )
        
        results = pre_res.res2d
        
        # Convert to serializable format
        gsea_results = []
        for _, row in results.iterrows():
            gsea_results.append({
                "term": row.get("Term", ""),
                "es": float(row.get("ES", 0)),
                "nes": float(row.get("NES", 0)),
                "p_value": float(row.get("NOM p-val", 1)),
                "fdr": float(row.get("FDR q-val", 1)),
                "fwer": float(row.get("FWER p-val", 1)),
                "gene_size": _parse_gene_size(row.get("Gene %", row.get("Matched Size", 0))),
                "lead_genes": row.get("Lead_genes", "").split(";")[:5] if row.get("Lead_genes") else []
            })
        
        # Sort by NES (separate up and down)
        up_regulated = sorted(
            [r for r in gsea_results if r["nes"] > 0],
            key=lambda x: -x["nes"]
        )[:10]
        
        down_regulated = sorted(
            [r for r in gsea_results if r["nes"] < 0],
            key=lambda x: x["nes"]
        )[:10]
        
        print(f"[GSEA] Found {len(up_regulated)} up, {len(down_regulated)} down pathways", file=sys.stderr)
        
        return {
            "status": "ok",
            "gene_set": gene_sets,
            "input_genes": len(gene_ranking),
            "up_regulated": up_regulated,
            "down_regulated": down_regulated,
            "total_terms": len(gsea_results)
        }
        
    except Exception as e:
        print(f"[GSEA] Error: {e}", file=sys.stderr)
        return {
            "status": "error",
            "message": str(e)
        }


def get_available_gene_sets() -> List[Dict[str, str]]:
    """Get list of available gene set libraries."""
    return [
        {"id": "KEGG_2021_Human", "name": "KEGG Pathways (Human)", "category": "Pathway"},
        {"id": "GO_Biological_Process_2021", "name": "GO Biological Process", "category": "GO"},
        {"id": "GO_Molecular_Function_2021", "name": "GO Molecular Function", "category": "GO"},
        {"id": "GO_Cellular_Component_2021", "name": "GO Cellular Component", "category": "GO"},
        {"id": "Reactome_2022", "name": "Reactome Pathways", "category": "Pathway"},
        {"id": "WikiPathway_2021_Human", "name": "WikiPathways (Human)", "category": "Pathway"},
        {"id": "MSigDB_Hallmark_2020", "name": "MSigDB Hallmarks", "category": "Signature"},
    ]


# Handler functions for bio_core integration
def handle_run_enrichr(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle ENRICHR command from frontend."""
    gene_list = payload.get("genes", [])
    gene_sets = payload.get("gene_sets", "KEGG_2021_Human")
    
    return run_enrichr(gene_list, gene_sets)


def handle_run_gsea(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle GSEA command from frontend."""
    gene_ranking = payload.get("gene_ranking", {})
    gene_sets = payload.get("gene_sets", "KEGG_2021_Human")
    
    return run_gsea_prerank(gene_ranking, gene_sets)


def handle_get_gene_sets(_payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle GET_GENE_SETS command."""
    return {
        "status": "ok",
        "gene_sets": get_available_gene_sets()
    }
