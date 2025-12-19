"""
Gene Set Utilities for BioViz
Handles GMT file loading, validation, and gene set management.
"""

import logging
from typing import Dict, List, Tuple, Set
from pathlib import Path


def load_gmt(file_path: str) -> Dict[str, List[str]]:
    """
    Load gene sets from GMT (Gene Matrix Transposed) format file.
    
    GMT Format: Each line is tab-separated:
    <gene_set_name> <description> <gene1> <gene2> ... <geneN>
    
    Args:
        file_path: Path to GMT file
        
    Returns:
        Dictionary mapping gene set names to gene lists
        
    Raises:
        FileNotFoundError: If file doesn't exist
        ValueError: If file format is invalid
    """
    file_path = Path(file_path)
    
    if not file_path.exists():
        raise FileNotFoundError(f"GMT file not found: {file_path}")
    
    gene_sets = {}
    line_num = 0
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line_num += 1
                line = line.strip()
                
                # Skip empty lines and comments
                if not line or line.startswith('#'):
                    continue
                
                parts = line.split('\t')
                
                if len(parts) < 3:
                    logging.warning(
                        f"Line {line_num}: Expected at least 3 fields (name, description, genes), "
                        f"got {len(parts)}. Skipping."
                    )
                    continue
                
                name = parts[0]
                # parts[1] is description (not used currently)
                genes = [g.strip() for g in parts[2:] if g.strip()]
                
                if not genes:
                    logging.warning(f"Line {line_num}: Gene set '{name}' has no genes. Skipping.")
                    continue
                
                if name in gene_sets:
                    logging.warning(
                        f"Line {line_num}: Duplicate gene set name '{name}'. "
                        f"Merging genes."
                    )
                    gene_sets[name].extend(genes)
                    gene_sets[name] = list(set(gene_sets[name]))  # Remove duplicates
                else:
                    gene_sets[name] = genes
        
        logging.info(f"Loaded {len(gene_sets)} gene sets from {file_path}")
        
        return gene_sets
        
    except UnicodeDecodeError as e:
        raise ValueError(f"Invalid file encoding. Expected UTF-8: {e}")
    except Exception as e:
        raise ValueError(f"Error parsing GMT file at line {line_num}: {e}")


def save_gmt(gene_sets: Dict[str, List[str]], file_path: str, description: str = "") -> None:
    """
    Save gene sets to GMT format file.
    
    Args:
        gene_sets: Dictionary mapping gene set names to gene lists
        file_path: Output file path
        description: Optional description for all gene sets (default: empty)
    """
    file_path = Path(file_path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        for name, genes in gene_sets.items():
            # Format: name\tdescription\tgene1\tgene2\t...
            line = f"{name}\t{description}\t" + "\t".join(genes)
            f.write(line + "\n")
    
    logging.info(f"Saved {len(gene_sets)} gene sets to {file_path}")


def validate_gene_sets(gene_sets: Dict[str, List[str]], 
                       min_size: int = 5, 
                       max_size: int = 500) -> Tuple[Dict[str, List[str]], List[str]]:
    """
    Validate gene sets and filter by size.
    
    Args:
        gene_sets: Dictionary of gene set name -> gene list
        min_size: Minimum number of genes (default: 5)
        max_size: Maximum number of genes (default: 500)
        
    Returns:
        Tuple of (valid_gene_sets, warnings)
    """
    valid_sets = {}
    warnings = []
    
    for name, genes in gene_sets.items():
        # Remove duplicates
        unique_genes = list(set(genes))
        
        if len(unique_genes) != len(genes):
            warnings.append(f"'{name}': Removed {len(genes) - len(unique_genes)} duplicate genes")
        
        # Check size
        if len(unique_genes) < min_size:
            warnings.append(
                f"'{name}': Too few genes ({len(unique_genes)} < {min_size}). Excluded."
            )
            continue
        
        if len(unique_genes) > max_size:
            warnings.append(
                f"'{name}': Too many genes ({len(unique_genes)} > {max_size}). Excluded."
            )
            continue
        
        valid_sets[name] = unique_genes
    
    logging.info(
        f"Validated gene sets: {len(valid_sets)}/{len(gene_sets)} kept, "
        f"{len(warnings)} warnings"
    )
    
    return valid_sets, warnings


def get_gene_set_stats(gene_sets: Dict[str, List[str]]) -> Dict[str, any]:
    """
    Get statistics about gene sets.
    
    Returns:
        Dictionary with stats: total_sets, total_genes, avg_size, min_size, max_size
    """
    if not gene_sets:
        return {
            "total_sets": 0,
            "total_genes": 0,
            "unique_genes": 0,
            "avg_size": 0,
            "min_size": 0,
            "max_size": 0
        }
    
    sizes = [len(genes) for genes in gene_sets.values()]
    all_genes = set()
    for genes in gene_sets.values():
        all_genes.update(genes)
    
    return {
        "total_sets": len(gene_sets),
        "total_genes": sum(sizes),
        "unique_genes": len(all_genes),
        "avg_size": sum(sizes) / len(sizes),
        "min_size": min(sizes),
        "max_size": max(sizes)
    }


def merge_gene_sets(gene_sets_list: List[Dict[str, List[str]]]) -> Dict[str, List[str]]:
    """
    Merge multiple gene set dictionaries.
    
    If same gene set name appears in multiple dicts, genes are combined and deduplicated.
    
    Args:
        gene_sets_list: List of gene set dictionaries
        
    Returns:
        Merged gene sets dictionary
    """
    merged = {}
    
    for gene_sets in gene_sets_list:
        for name, genes in gene_sets.items():
            if name in merged:
                merged[name].extend(genes)
                merged[name] = list(set(merged[name]))  # Deduplicate
            else:
                merged[name] = genes.copy()
    
    return merged


def validate_gmt(file_path: str) -> Dict[str, any]:
    """
    Validate a GMT file without fully loading it.
    
    Args:
        file_path: Path to GMT file
        
    Returns:
        Dictionary with 'valid' bool and 'error' message if invalid
    """
    path = Path(file_path)
    
    if not path.exists():
        return {'valid': False, 'error': f"File not found: {path}"}
    
    if not path.suffix.lower() == '.gmt':
        return {'valid': False, 'error': "File must have .gmt extension"}
    
    try:
        valid_lines = 0
        with open(path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                
                parts = line.split('\t')
                if len(parts) < 3:
                    return {
                        'valid': False, 
                        'error': f"Line {line_num}: Invalid format (need at least 3 tab-separated columns)"
                    }
                
                valid_lines += 1
                
                # Quick validation of first 10 lines only
                if valid_lines >= 10:
                    break
        
        if valid_lines == 0:
            return {'valid': False, 'error': "No valid gene sets found in file"}
        
        return {'valid': True, 'error': None}
        
    except UnicodeDecodeError as e:
        return {'valid': False, 'error': f"File encoding error: {e}. GMT files must be UTF-8 encoded."}
    except Exception as e:
        return {'valid': False, 'error': f"Failed to read file: {e}"}
