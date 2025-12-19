"""
GSEA/GO Module for BioViz v2.0
Provides local gene set enrichment analysis capabilities.
"""

import sys
import json
import logging
import csv
import pandas as pd
from typing import Dict, List, Any, Optional, Tuple, TYPE_CHECKING
from pathlib import Path
import gseapy as gp
from gene_set_utils import load_gmt, validate_gene_sets, get_gene_set_stats

# Check if gseapy is available
try:
    # gseapy and pandas are already imported at the top, this block
    # now primarily sets the availability flag and logs.
    # We re-check here to ensure the modules are indeed functional.
    _ = gp.__version__ # Accessing a gseapy attribute to trigger potential errors
    _ = pd.__version__ # Accessing a pandas attribute to trigger potential errors
    GSEAPY_AVAILABLE = True
    logging.info(f"[GSEA] gseapy version {gp.__version__} loaded successfully")
except ImportError as e:
    GSEAPY_AVAILABLE = False
    logging.warning(f"[GSEA] gseapy import failed: {e}")
    print(f"[GSEA] Warning: gseapy not installed or import failed: {e}", file=sys.stderr)


# ============================================
# Input Validation Utilities
# ============================================

def validate_gene_list(genes: List[str]) -> Tuple[List[str], List[str]]:
    """
    Validate and clean gene list.
    
    Returns:
        Tuple of (valid_genes, warnings)
    """
    if not genes:
        return [], ["Empty gene list provided"]
    
    # Remove duplicates while preserving order
    seen = set()
    valid_genes = []
    duplicates = []
    
    for gene in genes:
        gene = str(gene).strip()
        if not gene:
            continue
        if gene in seen:
            duplicates.append(gene)
        else:
            seen.add(gene)
            valid_genes.append(gene)
    
    warnings = []
    if duplicates:
        warnings.append(f"Removed {len(duplicates)} duplicate genes: {duplicates[:5]}...")
    if len(valid_genes) != len(genes):
        warnings.append(f"Filtered {len(genes) - len(valid_genes)} invalid/empty entries")
    
    return valid_genes, warnings


def validate_gene_ranking(ranking: Dict[str, float]) -> Tuple[Dict[str, float], List[str]]:
    """
    Validate and clean gene ranking dictionary.
    
    Returns:
        Tuple of (valid_ranking, warnings)
    """
    if not ranking:
        return {}, ["Empty gene ranking provided"]
    
    valid_ranking = {}
    warnings = []
    invalid_count = 0
    
    for gene, score in ranking.items():
        gene = str(gene).strip()
        if not gene:
            invalid_count += 1
            continue
        
        try:
            score = float(score)
            if not (-1e10 < score < 1e10):  # Sanity check
                warnings.append(f"Gene '{gene}' has extreme score {score}, may cause issues")
            valid_ranking[gene] = score
        except (ValueError, TypeError):
            invalid_count += 1
            warnings.append(f"Gene '{gene}' has invalid score: {score}")
    
    if invalid_count > 0:
        warnings.append(f"Removed {invalid_count} genes with invalid scores")
    
    return valid_ranking, warnings


def check_gene_set_overlap(genes: List[str], gene_set_name: str) -> Dict[str, Any]:
    """
    Check if gene list has potential overlap with a gene set library.
    Returns stats about potential enrichment.
    """
    # This is a simple heuristic check
    return {
        "gene_count": len(genes),
        "gene_set": gene_set_name,
        "estimated_coverage": "unknown"  # Would need actual gene set data
    }


# ============================================
# CSV Export Utilities
# ============================================

def export_enrichment_csv(results: Dict[str, Any], output_path: str) -> None:
    """
    Export ORA enrichment results to CSV file.
    
    CSV Format:
    Term,Overlap,P_value,Adjusted_P_value,Odds_Ratio,Combined_Score,Genes
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    enriched_terms = results.get("enriched_terms", [])
    
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            "Term", "Overlap", "P_value", "Adjusted_P_value",
            "Odds_Ratio", "Combined_Score", "Genes"
        ])
        
        for term in enriched_terms:
            writer.writerow([
                term.get("term", ""),
                term.get("overlap", ""),
                term.get("p_value", ""),
                term.get("adjusted_p_value", ""),
                term.get("odds_ratio", ""),
                term.get("combined_score", ""),
                ";".join(term.get("genes", []))
            ])
    
    logging.info(f"Exported {len(enriched_terms)} enrichment terms to {output_path}")


def export_gsea_csv(results: Dict[str, Any], output_path: str) -> None:
    """
    Export GSEA prerank results to CSV file.
    
    CSV Format:
    Term,ES,NES,NOM_p_val,FDR_q_val,FWER_p_val,Gene_Size,Leading_Edge_Genes
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Combine up and down regulated
    all_results = (results.get("up_regulated", []) + 
                   results.get("down_regulated", []))
    
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            "Term", "ES", "NES", "NOM_p_val", "FDR_q_val",
            "FWER_p_val", "Gene_Size", "Leading_Edge_Genes"
        ])
        
        for term in all_results:
            writer.writerow([
                term.get("term", ""),
                term.get("es", ""),
                term.get("nes", ""),
                term.get("p_value", ""),
                term.get("fdr", ""),
                term.get("fwer", ""),
                term.get("gene_size", ""),
                ";".join(term.get("lead_genes", []))
            ])
    
    logging.info(f"Exported {len(all_results)} GSEA terms to {output_path}")



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
    
    # Validate input
    gene_list, warnings = validate_gene_list(gene_list)
    if not gene_list:
        return {
            "status": "error",
            "message": "Empty or invalid gene list after validation",
            "warnings": warnings
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
    
    # Validate input
    gene_ranking, warnings = validate_gene_ranking(gene_ranking)
    if not gene_ranking:
        return {
            "status": "error",
            "message": "Empty or invalid gene ranking after validation",
            "warnings": warnings
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


def handle_load_gmt(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle LOAD_GMT command."""
    file_path = payload.get("path")
    if not file_path:
        return {"status": "error", "message": "No file path provided"}
    
    try:
        gene_sets = load_gmt(file_path)
        valid_sets, warnings = validate_gene_sets(gene_sets)
        stats = get_gene_set_stats(valid_sets)
        
        return {
            "status": "ok",
            "path": file_path,
            "stats": stats,
            "warnings": warnings,
            "gene_set_id": file_path  # Use path as ID for gp.enrichr
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def handle_export_csv(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle EXPORT_CSV command for results."""
    results = payload.get("results")
    output_path = payload.get("output_path")
    analysis_type = payload.get("type", "enrichr")
    
    if not results or not output_path:
        return {"status": "error", "message": "Missing results or output_path"}
    
    try:
        if analysis_type == "enrichr":
            export_enrichment_csv(results, output_path)
        else:
            export_gsea_csv(results, output_path)
            
        return {"status": "ok", "message": f"Results exported to {output_path}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

