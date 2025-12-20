"""
Helper functions for pathway visualization with multiple sources.
"""

from typing import Dict, List, Any


def _get_generic_statistics(volcano_data: List[Dict]) -> Dict[str, Any]:
    """
    Generate generic statistics from volcano data when no pathway is selected.
    
    Args:
        volcano_data: List of gene data with status
    
    Returns:
        Statistics dictionary
    """
    up = len([v for v in volcano_data if v.get('status') == 'UP'])
    down = len([v for v in volcano_data if v.get('status') == 'DOWN'])
    ns = len(volcano_data) - up - down
    
    return {
        'total_nodes': len(volcano_data),
        'upregulated': up,
        'downregulated': down,
        'unchanged': ns,
        'percent_upregulated': 100 * up / len(volcano_data) if volcano_data else 0,
        'percent_downregulated': 100 * down / len(volcano_data) if volcano_data else 0
    }


def _color_universal_pathway(pathway: Dict, gene_expression: Dict[str,float], data_type: str = 'gene') -> Dict:
    """
    Color a UniversalPathway diagram with gene expression data.
    
    Similar to color_kegg_pathway but works with UniversalPathway format.
    
    Args:
        pathway: UniversalPathway dictionary
        gene_expression: Dict mapping gene names to expression values (log2FC)
        data_type: Data type ('gene', 'protein', 'cell')
    
    Returns:
        Colored pathway dictionary
    """
    if not pathway or not gene_expression:
        return pathway
    
    # Normalize gene names for matching
    normalized_expression = {}
    for gene, value in gene_expression.items():
        normalized_expression[gene.upper()] = {
            'value': value,
            'original_key': gene
        }
    
    # Determine value range for color mapping
    values = [v for v in gene_expression.values() if v is not None]
    if not values:
        return pathway
    
    max_val = max(abs(min(values)), abs(max(values)))
    min_val = -max_val if min(values) < 0 else 0
    
    # Color each node
    for node in pathway.get('nodes', []):
        gene_name = node.get('name') or node.get('gene_symbol') or node.get('label')
        if not gene_name:
            continue
        
        # Try to match gene name
        gene_upper = gene_name.upper()
        matched_data = normalized_expression.get(gene_upper)
        
        if matched_data:
            value = matched_data['value']
            node['expression'] = value
            node['hit_name'] = matched_data['original_key']
            
            # Color based on expression
            if value > 0:
                # Upregulated - red
                intensity = min(abs(value) / max_val, 1.0) if max_val > 0 else 0.5
                r = 255
                g = int(255 * (1 - intensity))
                b = int(255 * (1 - intensity))
                node['color'] = f'#{r:02x}{g:02x}{b:02x}'
                node['value'] = 3  # Node size
            else:
                # Downregulated - blue
                intensity = min(abs(value) / abs(min_val), 1.0) if min_val < 0 else 0.5
                r = int(255 * (1 - intensity))
                g = int(255 * (1 - intensity))
                b = 255
                node['color'] = f'#{r:02x}{g:02x}{b:02x}'
                node['value'] = 3
        else:
            # No expression data - gray
            node['color'] = '#95a5a6'
            node['value'] = 1
            node['expression'] = None
            node['hit_name'] = None
    
    # Add metadata
    pathway['metadata'] = pathway.get('metadata', {})
    pathway['metadata'].update({
        'colored': True,
        'gene_count': len(gene_expression),
        'min_expression': min_val,
        'max_expression': max_val,
        'data_type': data_type
    })
    
    return pathway
