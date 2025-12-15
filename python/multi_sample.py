"""
Multi-Sample Matrix Module for BioViz v2.0
Supports importing datasets with multiple comparison groups (e.g., Day1 vs Control, Day3 vs Control).
"""

import sys
import json
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path

try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    print("[MultiSample] Warning: pandas not installed.", file=sys.stderr)


def detect_multi_sample_columns(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Detect if the dataframe contains multiple LogFC/comparison columns.
    
    Returns:
        Dict with detected sample groups and their column mappings.
    """
    if not PANDAS_AVAILABLE:
        return {"status": "error", "message": "pandas not available"}
    
    result = {
        "is_multi_sample": False,
        "gene_column": None,
        "sample_groups": [],
        "pvalue_columns": [],
    }
    
    columns = df.columns.tolist()
    
    # Common gene column names
    gene_patterns = ['gene', 'symbol', 'name', 'protein', 'id', 'gene_name', 'gene_symbol']
    for col in columns:
        col_lower = col.lower()
        if any(p in col_lower for p in gene_patterns):
            result["gene_column"] = col
            break
    
    # Detect LogFC columns with group identifiers
    logfc_patterns = ['log2fc', 'logfc', 'log2_fold_change', 'fold_change', 'fc', 'ratio']
    pvalue_patterns = ['pval', 'p_value', 'pvalue', 'adj_p', 'fdr', 'qvalue']
    
    logfc_columns = []
    for col in columns:
        col_lower = col.lower()
        if any(p in col_lower for p in logfc_patterns):
            logfc_columns.append(col)
    
    pvalue_columns = []
    for col in columns:
        col_lower = col.lower()
        if any(p in col_lower for p in pvalue_patterns):
            pvalue_columns.append(col)
    
    result["pvalue_columns"] = pvalue_columns
    
    # If multiple LogFC columns, extract group names
    if len(logfc_columns) > 1:
        result["is_multi_sample"] = True
        
        for col in logfc_columns:
            # Try to extract group name from column
            # e.g., "Day1_LogFC" -> "Day1", "Treatment_vs_Control_logfc" -> "Treatment_vs_Control"
            group_name = col
            for p in logfc_patterns:
                group_name = group_name.lower().replace(p, '').strip('_').strip()
            
            if not group_name:
                group_name = col
            
            # Find matching p-value column
            matching_pval = None
            for pval_col in pvalue_columns:
                if group_name.lower() in pval_col.lower():
                    matching_pval = pval_col
                    break
            
            result["sample_groups"].append({
                "name": group_name,
                "logfc_column": col,
                "pvalue_column": matching_pval,
            })
    elif len(logfc_columns) == 1:
        result["sample_groups"].append({
            "name": "default",
            "logfc_column": logfc_columns[0],
            "pvalue_column": pvalue_columns[0] if pvalue_columns else None,
        })
    
    return result


def load_multi_sample_matrix(
    file_path: str,
    gene_column: Optional[str] = None
) -> Dict[str, Any]:
    """
    Load a multi-sample matrix file and return structured data.
    
    Args:
        file_path: Path to CSV/Excel file
        gene_column: Override for gene column name
    
    Returns:
        Dict with sample groups and expression data
    """
    if not PANDAS_AVAILABLE:
        return {"status": "error", "message": "pandas not available"}
    
    try:
        path = Path(file_path)
        
        # Load file based on extension
        if path.suffix.lower() in ['.xlsx', '.xls']:
            df = pd.read_excel(path)
        else:
            df = pd.read_csv(path)
        
        # Detect structure
        detection = detect_multi_sample_columns(df)
        
        if not detection.get("sample_groups"):
            return {"status": "error", "message": "No LogFC columns detected"}
        
        # Use detected or provided gene column
        gene_col = gene_column or detection.get("gene_column")
        if not gene_col or gene_col not in df.columns:
            return {"status": "error", "message": f"Gene column not found: {gene_col}"}
        
        # Build expression data for each sample group
        expression_data = {}
        
        for group in detection["sample_groups"]:
            group_name = group["name"]
            logfc_col = group["logfc_column"]
            pval_col = group.get("pvalue_column")
            
            group_data = []
            for _, row in df.iterrows():
                gene = str(row[gene_col])
                logfc = float(row[logfc_col]) if pd.notna(row[logfc_col]) else 0.0
                pval = float(row[pval_col]) if pval_col and pd.notna(row.get(pval_col)) else 1.0
                
                group_data.append({
                    "gene": gene,
                    "logfc": logfc,
                    "pvalue": pval,
                })
            
            expression_data[group_name] = group_data
        
        print(f"[MultiSample] Loaded {len(expression_data)} sample groups from {path.name}", file=sys.stderr)
        
        return {
            "status": "ok",
            "file_path": str(path),
            "gene_column": gene_col,
            "sample_groups": list(expression_data.keys()),
            "is_multi_sample": detection["is_multi_sample"],
            "expression_data": expression_data,
            "total_genes": len(df),
        }
        
    except Exception as e:
        print(f"[MultiSample] Error: {e}", file=sys.stderr)
        return {"status": "error", "message": str(e)}


def get_sample_group_data(
    matrix_data: Dict[str, Any],
    group_name: str
) -> Dict[str, float]:
    """
    Extract gene expression dictionary for a specific sample group.
    
    Args:
        matrix_data: Output from load_multi_sample_matrix
        group_name: Name of the sample group
    
    Returns:
        Dict mapping gene names to LogFC values
    """
    expression_data = matrix_data.get("expression_data", {})
    group_data = expression_data.get(group_name, [])
    
    return {item["gene"]: item["logfc"] for item in group_data}


# Handler functions for bio_core integration
def handle_load_multi_sample(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle LOAD_MULTI_SAMPLE command from frontend."""
    file_path = payload.get("path")
    gene_column = payload.get("gene_column")
    
    if not file_path:
        return {"status": "error", "message": "No file path provided"}
    
    return load_multi_sample_matrix(file_path, gene_column)


def handle_get_sample_groups(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle GET_SAMPLE_GROUPS command."""
    matrix_data = payload.get("matrix_data", {})
    
    groups = matrix_data.get("sample_groups", [])
    return {
        "status": "ok",
        "sample_groups": groups,
        "is_multi_sample": len(groups) > 1,
    }
