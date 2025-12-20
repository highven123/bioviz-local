"""
BioViz Local - KEGG Pathway Mapper
Maps gene expression data to KEGG pathway nodes and applies color coding
"""

import json
import sys
from typing import Dict, List, Optional
from pathlib import Path


def load_pathway_template(pathway_id: str) -> Optional[Dict]:
    """
    Load a KEGG pathway template from assets/templates/
    If not found locally, automatically download from KEGG and cache it.
    
    Args:
        pathway_id: KEGG pathway ID (e.g., 'hsa04210', 'hsa04115', 'hsa04110')
    
    Returns:
        Pathway template dict or None if not found
    """
    import sys
    import logging
    
    # Try multiple possible locations
    search_paths = []
    
    # PyInstaller temporary directory (standard for --onefile bundles)
    if hasattr(sys, '_MEIPASS'):
         search_paths.append(Path(sys._MEIPASS) / 'assets' / 'templates' / f'{pathway_id}.json')

    # User-writable custom templates directory (highest priority for caching)
    user_template_dir = Path.home() / '.bioviz_local' / 'templates'
    user_template_path = user_template_dir / f'{pathway_id}.json'
    
    search_paths.extend([
        user_template_path,
        # Development: relative to this file
        Path(__file__).parent.parent / 'assets' / 'templates' / f'{pathway_id}.json',
        # Packaged app: relative to executable
        Path(sys.executable).parent / 'assets' / 'templates' / f'{pathway_id}.json',
        # Packaged app: in Resources on macOS
        Path(sys.executable).parent.parent / 'Resources' / 'assets' / 'templates' / f'{pathway_id}.json',
        # Packaged app: in Resources/_up_ on macOS (Tauri pattern)
        Path(sys.executable).parent.parent / 'Resources' / '_up_' / 'assets' / 'templates' / f'{pathway_id}.json',
        # Alternative: current working directory
        Path.cwd() / 'assets' / 'templates' / f'{pathway_id}.json',
        # Alternative: parent of CWD (if running from src-tauri)
        Path.cwd().parent / 'assets' / 'templates' / f'{pathway_id}.json',
    ])
    
    # Try to load from existing locations
    for template_path in search_paths:
        if template_path.exists():
            try:
                with open(template_path, 'r', encoding='utf-8') as f:
                    logging.info(f"[TEMPLATE] Loaded {pathway_id} from {template_path}")
                    return json.load(f)
            except Exception as e:
                logging.warning(f"[TEMPLATE] Failed to read {template_path}: {e}")
                continue
    
    # Not found locally - try to download from KEGG
    logging.info(f"[TEMPLATE] {pathway_id} not found locally, attempting auto-download from KEGG...")
    
    try:
        # Import download function (defined in bio_core.py)
        # We need to be careful about circular imports
        import urllib.request
        import xml.etree.ElementTree as ET
        
        # Step 1: Download KGML from KEGG
        kgml_url = f'http://rest.kegg.jp/get/{pathway_id}/kgml'
        logging.info(f"[TEMPLATE] Downloading from {kgml_url}")
        
        headers = {'User-Agent': 'BioViz/1.0 (Educational/Research)'}
        req = urllib.request.Request(kgml_url, headers=headers)
        
        with urllib.request.urlopen(req, timeout=30) as response:
            kgml_content = response.read().decode('utf-8')
        
        if not kgml_content or kgml_content.startswith('<!DOCTYPE'):
            logging.error(f"[TEMPLATE] Failed to download {pathway_id}: Invalid response")
            return None
        
        # Step 2: Parse KGML to JSON (simplified inline version)
        root = ET.fromstring(kgml_content)
        
        template = {
            'id': pathway_id,
            'name': root.get('title', pathway_id),
            'nodes': [],
            'edges': [],
            'width': int(root.get('image_width', 800)),
            'height': int(root.get('image_height', 600))
        }
        
        # Parse entries (nodes)
        for entry in root.findall('entry'):
            entry_id = entry.get('id')
            entry_type = entry.get('type')
            names = entry.get('name', '').split()
            
            # Get graphics info
            graphics = entry.find('graphics')
            if graphics is not None:
                node = {
                    'id': entry_id,
                    'name': graphics.get('name', ''),
                    'type': entry_type,
                    'x': float(graphics.get('x', 0)),
                    'y': float(graphics.get('y', 0)),
                    'width': float(graphics.get('width', 46)),
                    'height': float(graphics.get('height', 17)),
                    'fgcolor': graphics.get('fgcolor', '#000000'),
                    'bgcolor': graphics.get('bgcolor', '#BFBFFF'),
                    'genes': names  # KEGG gene IDs
                }
                template['nodes'].append(node)
        
        # Parse relations (edges)
        for relation in root.findall('relation'):
            edge = {
                'from': relation.get('entry1'),
                'to': relation.get('entry2'),
                'type': relation.get('type', 'unknown')
            }
            template['edges'].append(edge)
        
        # Step 3: Cache to user directory for future use
        user_template_dir.mkdir(parents=True, exist_ok=True)
        with open(user_template_path, 'w', encoding='utf-8') as f:
            json.dump(template, f, indent=2)
        
        logging.info(f"[TEMPLATE] Successfully downloaded and cached {pathway_id} to {user_template_path}")
        print(f"✓ Downloaded pathway template: {pathway_id} → {template['name']}", file=sys.stderr)
        
        return template
        
    except Exception as e:
        logging.error(f"[TEMPLATE] Auto-download failed for {pathway_id}: {e}")
        print(f"✗ Failed to auto-download {pathway_id}: {e}", file=sys.stderr)
        
        # If download fails, provide helpful debug info
        print(f"[DEBUG] Failed to find {pathway_id}.json in any of these locations:", file=sys.stderr)
        for p in search_paths[:5]:  # Show first 5 paths only
            print(f"  - {p} (exists: {p.exists()})", file=sys.stderr)
        
        return None




def map_expression_to_color(value: float, min_val: float, max_val: float) -> str:
    """
    Map expression value to color gradient (blue -> white -> red)
    
    Args:
        value: Expression value
        min_val: Minimum value in dataset
        max_val: Maximum value in dataset
    
    Returns:
        Hex color string
    """
    # Normalize to [-1, 1]
    if max_val == min_val:
        normalized = 0
    else:
        normalized = 2 * (value - min_val) / (max_val - min_val) - 1
    
    if normalized < 0:
        # Blue gradient for downregulation
        intensity = int(255 * (1 + normalized))  # 0-255
        return f'#{intensity:02x}{intensity:02x}ff'
    else:
        # Red gradient for upregulation
        intensity = int(255 * (1 - normalized))  # 255-0
        return f'#ff{intensity:02x}{intensity:02x}'


def normalize_entity_name(name: str, entity_type: str = 'gene') -> str:
    """
    Normalize entity name based on type (gene, protein, cell).
    
    Args:
        name: Entity name (e.g., 'p53-P', 'CD4+', 'TP53')
        entity_type: 'gene', 'protein', or 'cell'
        
    Returns:
        Normalized name for matching against template
    """
    name = str(name).strip()
    
    if entity_type == 'protein':
        # Remove common modification suffixes
        # e.g., p53-P -> p53, Akt_phospho -> Akt
        if name.endswith('-P'):
            return name[:-2]
        if name.endswith('_phospho'):
            return name.replace('_phospho', '')
            
        # MVP: Treat Uniprot IDs or others as just strings for now, 
        # relying on user to provide names that match KEGG or Symbols
        return name
        
    elif entity_type == 'cell':
        # Fuzzy matching for cell types (case-insensitive)
        name_lower = name.lower()
        
        # Hematopoietic lineage mappings
        if name_lower in ['cd4', 'cd4+', 'th cell', 'helper t cell', 'cd4 t cell']:
            return 'CD4+ T cell'
        if name_lower in ['cd8', 'cd8+', 'tc', 'cytotoxic t cell', 'cytotoxic cell', 'cd8 t cell']:
            return 'CD8+ T cell'
        if name_lower in ['mono', 'monocytes', 'monocyte']:
            return 'Monocyte'
        if name_lower in ['b cell', 'b cells', 'b-cell']:
            return 'B cell'
        if name_lower in ['nk', 'nk cell', 'natural killer']:
            return 'NK cell'
        if name_lower in ['macrophage', 'macrophages']:
            return 'Macrophage'
        if name_lower in ['neutrophil', 'neutrophils']:
            return 'Neutrophil'
            
        # T Cell Subsets
        if name_lower in ['naive t', 'naive t cell', 'naive cd4', 'naive cd4+ t cell']:
            return 'Naive CD4+ T cell'
        if name_lower in ['th1', 'th1 cell']:
            return 'Th1 cell'
        if name_lower in ['th2', 'th2 cell']:
            return 'Th2 cell'
        if name_lower in ['th17', 'th17 cell']:
            return 'Th17 cell'
        if name_lower in ['treg', 'regulatory t cell', 'tregs']:
            return 'Treg cell'
        
        # Fallback: Just return capitalized for consistency
        return name
        
    else:
        # Default gene normalization (uppercase)
        return name.upper()


def color_kegg_pathway(
    pathway_id: str,
    gene_expression: Dict[str, float],
    log_fold_change: bool = True,
    data_type: str = 'gene'
) -> Dict:
    """
    Apply expression color coding to a KEGG pathway
    
    Args:
        pathway_id: KEGG pathway ID ('hsa04210', 'hsa04115', 'hsa04110')
        gene_expression: Dict mapping entity names to expression values
        log_fold_change: Whether values are log fold changes (default: True)
        data_type: 'gene', 'protein', or 'cell' (default: 'gene')
    
    Returns:
        Colored pathway dict ready for visualization
    
    Example:
        >>> expression = {'TP53': 2.5, 'BAX': 1.8, 'BCL2': -1.5}
        >>> colored_pathway = color_kegg_pathway('hsa04210', expression)
    """
    # Load template
    pathway = load_pathway_template(pathway_id)
    if not pathway:
        raise ValueError(f"Pathway template '{pathway_id}' not found")
    
    # Get all expression values for normalization
    values = list(gene_expression.values())
    if not values:
        return pathway  # Return uncolored if no data
    
    min_val = min(values)
    max_val = max(values)
    
    # Pre-normalize expression keys for faster lookup
    # Normalize keys in gene_expression dict to match template nodes
    normalized_expression = {}
    key_map = {} # Store mapping from normalized key -> original user key
    
    for key, val in gene_expression.items():
        norm_key = normalize_entity_name(key, data_type)
        normalized_expression[norm_key] = val
        key_map[norm_key] = key
        
        # DEBUG: Print first few entries
        if len(normalized_expression) <= 5:
            print(f"[DEBUG] Input: {key} -> {val} (type: {type(val)}), normalized to: {norm_key}", file=sys.stderr, flush=True)
        
        # Also keep original key if it matches directly (just in case)
        if key not in normalized_expression:
             normalized_expression[key] = val
             key_map[key] = key

    # Apply colors to nodes
    for node in pathway['nodes']:
        # Template nodes usually have 'name' or 'id' as the gene/entity name
        # In our templates, 'id' is often the Symbol/Name (e.g. "TP53"), 
        # but sometimes 'name' is used for display. 
        # Let's check 'name' first if available and seems like a symbol, else 'id'.
        # Our template format uses 'name' for the display label/symbol.
        node_name = node.get('name')
        if not node_name:
             node_name = str(node.get('id', ''))
        
        # For matching, we might need to be careful. 
        # If node_name is "TP53", we look for "TP53" in normalized_expression.
        
        matched_value = None
        matched_original_key = None
        
        # Direct match or Normalized match
        if node_name in normalized_expression:
            matched_value = normalized_expression[node_name]
            matched_original_key = key_map.get(node_name, node_name)
        
        # Try to fuzzy match if we are in Cell mode and exact match failed?
        # (Already handled by normalize_entity_name filling the dict with standard names)
            
        if matched_value is not None:
            # DEBUG: Print first few matches
            if len([n for n in pathway['nodes'] if n.get('expression') is not None]) < 5:
                print(f"[DEBUG] Matched {node_name}: value={matched_value}, type={type(matched_value)}", file=sys.stderr, flush=True)
            
            node['color'] = map_expression_to_color(matched_value, min_val, max_val)
            node['value'] = abs(matched_value)  # Size by absolute expression
            node['expression'] = matched_value  # Store original value
            
            # CRITICAL: Store the matched entity name (Original User Key) so frontend can link click -> data
            node['hit_name'] = matched_original_key
        else:
            # Keep default gray for nodes without data
            node['color'] = '#95a5a6'
            node['value'] = 1
            node['expression'] = None
            node['hit_name'] = None
    
    # Add metadata
    pathway['metadata'] = {
        'colored': True,
        'gene_count': len(gene_expression),
        'min_expression': min_val,
        'max_expression': max_val,
        'log_fold_change': log_fold_change,
        'data_type': data_type
    }
    
    return pathway


def get_pathway_statistics(pathway: Dict) -> Dict:
    """
    Calculate statistics for a colored pathway
    
    Returns:
        Dict with upregulated_count, downregulated_count, unchanged_count
    """
    # Use Sets to count UNIQUE entities (to handle duplicate nodes in graph)
    upregulated_set = set()
    downregulated_set = set()
    unchanged_set = set()
    all_nodes_set = set()

    for node in pathway['nodes']:
        name = node.get('name', 'Unknown')
        all_nodes_set.add(name)
        
        expr = node.get('expression')
        
        # DEBUG: Print first few nodes to see what's happening
        if len(all_nodes_set) <= 5:
            print(f"[DEBUG] Node: {name}, expression: {expr}, type: {type(expr)}", file=sys.stderr, flush=True)
        
        if expr is None:
            unchanged_set.add(name)
        elif expr > 0:
            upregulated_set.add(name)
        elif expr < 0:
            downregulated_set.add(name)
        else:
            unchanged_set.add(name)
    
    # Calculate counts based on unique entities
    upregulated = len(upregulated_set)
    downregulated = len(downregulated_set)
    total_unique = len(all_nodes_set)
    
    # For unchanged, we subtract up/down from total to define "Unchanged" as "Rest of the nodes"
    # This avoids double counting if a node is sometimes colored and sometimes not (unlikely but possible)
    unchanged = total_unique - upregulated - downregulated
    
    return {
        'total_nodes': total_unique,
        'upregulated': upregulated,
        'downregulated': downregulated,
        'unchanged': unchanged,
        'percent_upregulated': 100 * upregulated / total_unique if total_unique else 0,
        'percent_downregulated': 100 * downregulated / total_unique if total_unique else 0
    }


def batch_color_pathways(
    pathway_ids: List[str],
    gene_expression: Dict[str, float]
) -> Dict[str, Dict]:
    """
    Color multiple pathways with the same gene expression data
    
    Args:
        pathway_ids: List of pathway IDs
        gene_expression: Gene expression dict
    
    Returns:
        Dict mapping pathway_id to colored pathway
    """
    results = {}
    for pathway_id in pathway_ids:
        try:
            results[pathway_id] = color_kegg_pathway(pathway_id, gene_expression)
        except ValueError as e:
            print(f"Warning: {e}")
    
    return results


# Example usage for testing
if __name__ == "__main__":
    # Example gene expression data (log2 fold change)
    sample_expression = {
        # Apoptosis pathway genes
        'TNF': 1.5,
        'FAS': 2.0,
        'CASP8': 1.8,
        'CASP3': 2.5,
        'BAX': 2.2,
        'BCL2': -1.8,
        'BCLXL': -1.5,
        'XIAP': -2.0,
        
        # p53 pathway genes
        'TP53': 3.0,
        'MDM2': 1.2,
        'CDKN1A': 2.8,
        'PUMA': 2.5,
        'GADD45A': 1.9,
        
        # Cell cycle genes
        'CCND1': 1.5,
        'CDK4': 1.3,
        'RB1': -0.8,
        'E2F': 1.7,
        'CCNE1': 1.9,
        'CDK2': 1.6
    }
    
    # Test single pathway
    print("Testing hsa04210 (Apoptosis)...")
    colored_pathway = color_kegg_pathway('hsa04210', sample_expression)
    stats = get_pathway_statistics(colored_pathway)
    print(f"Statistics: {stats}")
    
    # Test batch coloring
    print("\nTesting batch coloring...")
    pathways = batch_color_pathways(
        ['hsa04210', 'hsa04115', 'hsa04110'],
        sample_expression
    )
    print(f"Colored {len(pathways)} pathways")
