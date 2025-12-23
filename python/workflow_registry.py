# BioViz Workflow Registry
# Defines atomic, observable steps using the Motia framework shim.

try:
    import motia
except ImportError:
    # Fallback if running directly without proper path setup, though structure ensures it works
    import sys
    import os
    sys.path.append(os.path.dirname(__file__))
    import motia


from biologic_logic import biologic_studio
import pandas as pd
import logging
from typing import Dict, Any, List

# --- Narrative Engine Imports ---
try:
    from narrative.deduplication import deduplicator
    from narrative.literature_rag import rag_client
except ImportError:
    # Handle relative imports if needed during build/test quirks
    import sys
    import os
    sys.path.append(os.path.join(os.path.dirname(__file__), 'narrative'))
    from narrative.deduplication import deduplicator
    from narrative.literature_rag import rag_client
# --------------------------------

logger = logging.getLogger("BioViz.Workflow")

@motia.step(name="LoadData", description="Loads and preprocesses expression data from CSV/Excel.")
def step_load_data(file_path: str, mapping: Dict[str, str]) -> pd.DataFrame:
    """
    Loads data and returns a DataFrame.
    In a real scenario, this might return a reference ID or save to a temp parquet.
    For this MVP, we return the object (Motia shim handles it in-memory).
    """
    import os
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    # Simplified loader for the workflow context
    # In production, this reuse bio_core.handle_load logic via a shared utility
    ext = file_path.lower().split('.')[-1]
    if ext in ['csv', 'txt', 'tsv']:
        df = pd.read_csv(file_path, sep='\t' if ext == 'tsv' else ',')
    elif ext in ['xlsx', 'xls']:
        df = pd.read_excel(file_path)
    else:
        raise ValueError("Unsupported format")

    # Basic standardization based on mapping
    # Expected mapping: {'gene': 'col_a', 'logfc': 'col_b', 'pvalue': 'col_c'}
    gene_col = mapping.get('gene')
    logfc_col = mapping.get('value') 
    pval_col = mapping.get('pvalue')

    if not gene_col or gene_col not in df.columns:
        raise ValueError(f"Gene column '{gene_col}' not found")
    
    # Standardize columns
    rename_dict = {gene_col: 'gene', logfc_col: 'log2FC'}
    if pval_col and pval_col in df.columns:
        rename_dict[pval_col] = 'pvalue'
    
    df = df.rename(columns=rename_dict)
    
    # Filter for valid rows
    df = df.dropna(subset=['gene'])
    logger.info(f"Loaded {len(df)} rows from {file_path}")
    return df

@motia.step(name="MultiOmicsAnalysis", description="Checks for cross-omics validation.")
def step_multi_omics(df: pd.DataFrame, context: Any = None) -> Dict[str, Any]:
    # context is injected by Motia engine
    # Convert DF to list of dicts for logic engine if needed, or modify engine to accept DF
    # logic engine expects list of dicts for 'de_results' usually
    records = df.to_dict('records')
    result = biologic_studio._layer_multi_omics(pd.DataFrame(records), {})
    return result

@motia.step(name="DruggabilityScan", description="Identifies actionable drug targets.")
def step_druggability(df: pd.DataFrame) -> Dict[str, Any]:
    return biologic_studio._layer_actionability(df)

@motia.step(name="GenerateSummary", description="Synthesizes findings into a narrative.")
def step_generate_summary(insights: Dict[str, Any]) -> str:
    # MVP: Simple string concatenation
    # Future: Call LLM
    summary = []
    if insights.get('druggability', {}).get('active'):
        summary.append(f"Found {len(insights['druggability']['hits'])} druggable targets.")
    
    if insights.get('multi_omics', {}).get('active'):
        summary.append(insights['multi_omics']['note'])
        
    if not summary:
        return "No significant actionable insights found."
    
    return " | ".join(summary)

@motia.step(name="SaveResults", description="Saves the analysis output to disk.")
def step_save_results(data: Any, output_path: str) -> str:
    # Mock save for MVP; replace with real persistence later.
    logger.info("Saving results to %s (mock).", output_path)
    return output_path

@motia.step(name="SemanticDeduplication", description="Clusters similar pathways to reduce redundancy.")
def step_semantic_deduplication(enrichment_df: pd.DataFrame) -> List[Dict[str, Any]]:
    # Motia step wrapper for the logic
    # Note: 'enrichment_df' assumes the previous step returned a DataFrame or compatible list-of-dicts
    if isinstance(enrichment_df, list):
        enrichment_df = pd.DataFrame(enrichment_df)
    
    logger.info("Running Semantic De-duplication...")
    clusters = deduplicator.deduplicate(enrichment_df)
    logger.info(f"Reduced to {len(clusters)} functional modules.")
    return clusters

@motia.step(name="LiteratureScan", description="Fetches PubMed evidence for top modules.")
def step_literature_scan(modules: List[Dict[str, Any]], context: Any = None) -> List[Dict[str, Any]]:
    # Process top 3 modules to save API tokens/time in this MVP
    top_modules = modules[:3]
    enhanced_modules = []
    
    for mod in top_modules:
        term = mod['representative']
        genes = mod['genes']
        evidence = rag_client.fetch_evidence(term, list(genes))
        
        # Attach evidence to the module object
        mod_copy = mod.copy()
        mod_copy['evidence'] = evidence
        enhanced_modules.append(mod_copy)
        
    return enhanced_modules

@motia.step(name="GenerateNarrative", description="Generates the final 'Paper-ready' text.")
def step_generate_narrative(enhanced_modules: List[Dict[str, Any]]) -> str:
    # This replaces the simple 'GenerateSummary' step with the advanced Narrative logic
    narrative_parts = []
    narrative_parts.append("### Mechanistic Narrative Report\n")
    
    for i, mod in enumerate(enhanced_modules):
        term = mod['representative']
        ev = mod.get('evidence', [])
        snippet = ev[0]['snippet'] if ev else "No direct evidence found."
        
        narrative_parts.append(f"**{i+1}. {term} Axis**")
        narrative_parts.append(f"Analysis identified a cluster of {mod['size']} related pathways (including {mod.get('members_str', '')}).")
        narrative_parts.append(f"Key drivers: {', '.join(list(mod['genes'])[:5])}...")
        narrative_parts.append(f"*Mechanism*: {snippet}\n")
        
    return "\n".join(narrative_parts)

# =============================================================================
# Phase 3: Single-Cell Analysis Steps
# =============================================================================

# Import single-cell modules
try:
    from singlecell.sc_loader import load_anndata, get_cell_clusters, extract_expression_matrix, get_metadata_summary
    from singlecell.pathway_scorer import compute_aucell_scores, aggregate_scores_by_cluster
    from singlecell.spatial_lr import SpatialLRAnalyzer
    from singlecell.trajectory import bin_pseudotime, compute_trajectory_dynamics
    SC_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Single-cell modules not available: {e}")
    SC_AVAILABLE = False

@motia.step(name="LoadSingleCellData", description="Loads AnnData (.h5ad) file for single-cell analysis.")
def step_load_sc_data(file_path: str) -> Dict[str, Any]:
    """
    Load single-cell data from .h5ad file and extract metadata.
    
    Returns:
        Dict with keys: 'adata', 'metadata', 'has_spatial', 'has_pseudotime'
    """
    if not SC_AVAILABLE:
        raise RuntimeError("Single-cell modules not available. Install scanpy and anndata.")
    
    logger.info(f"Loading single-cell data from {file_path}")
    adata = load_anndata(file_path)
    
    if adata is None:
        raise ValueError(f"Failed to load AnnData from {file_path}")
    
    metadata = get_metadata_summary(adata)
    
    return {
        'adata': adata,
        'metadata': metadata,
        'has_spatial': metadata.get('has_spatial', False),
        'has_pseudotime': metadata.get('has_pseudotime', False)
    }

@motia.step(name="ComputePathwayActivity", description="Computes AUCell scores for pathways in each cell.")
def step_compute_pathway_activity(
    sc_data: Dict[str, Any],
    pathways: Dict[str, List[str]],
    cluster_key: str = 'cell_type'
) -> Dict[str, Any]:
    """
    Compute pathway activity scores using AUCell algorithm.
    
    Args:
        sc_data: Dict from LoadSingleCellData step
        pathways: Dict mapping pathway names to gene lists
        cluster_key: Column name for cell clusters
        
    Returns:
        Dict with 'cell_scores' (DataFrame) and 'cluster_scores' (DataFrame)
    """
    if not SC_AVAILABLE:
        raise RuntimeError("Single-cell modules not available.")
    
    adata = sc_data['adata']
    
    # Extract expression matrix (all cells)
    expr_matrix = extract_expression_matrix(adata)
    
    # Compute AUCell scores
    logger.info(f"Computing AUCell scores for {len(pathways)} pathways")
    cell_scores = compute_aucell_scores(expr_matrix, pathways)
    
    # Aggregate by cluster if cluster annotation exists
    cluster_scores = None
    if cluster_key in adata.obs.columns:
        cluster_labels = adata.obs[cluster_key]
        cluster_scores = aggregate_scores_by_cluster(cell_scores, cluster_labels)
        logger.info(f"Aggregated scores for {len(cluster_scores)} cell clusters")
    
    return {
        'cell_scores': cell_scores,
        'cluster_scores': cluster_scores
    }

@motia.step(name="AnalyzeSpatialInteractions", description="Identifies ligand-receptor interactions in spatial data.")
def step_spatial_lr_analysis(
    sc_data: Dict[str, Any],
    pathway_scores: Dict[str, Any],
    distance_threshold: float = 50.0
) -> List[Dict[str, Any]]:
    """
    Detect spatial ligand-receptor interactions.
    
    Returns:
        List of interaction dicts
    """
    if not SC_AVAILABLE:
        raise RuntimeError("Single-cell modules not available.")
    
    adata = sc_data['adata']
    
    # Check if spatial coordinates exist
    if 'spatial' not in adata.obsm.keys():
        logger.warning("No spatial coordinates found in AnnData. Skipping spatial analysis.")
        return []
    
    # Extract spatial coordinates and expression
    spatial_coords = adata.obsm['spatial']
    expr_matrix = extract_expression_matrix(adata)
    
    # Initialize spatial analyzer
    analyzer = SpatialLRAnalyzer()  # Uses default L-R database
    
    # Find spatial neighbors
    neighbor_pairs = analyzer.find_spatial_neighbors(spatial_coords, distance_threshold)
    
    # Detect L-R interactions
    interactions = analyzer.detect_lr_interactions(expr_matrix, neighbor_pairs)
    
    logger.info(f"Detected {len(interactions)} spatial L-R interactions")
    return interactions

@motia.step(name="MapPathwayTrajectory", description="Maps pathway dynamics onto pseudo-time trajectory.")
def step_pathway_trajectory(
    sc_data: Dict[str, Any],
    pathway_scores: Dict[str, Any],
    n_bins: int = 10
) -> Dict[str, Any]:
    """
    Compute pathway dynamics over pseudo-time.
    
    Returns:
        Dict with 'trajectory_df' and 'dynamic_pathways'
    """
    if not SC_AVAILABLE:
        raise RuntimeError("Single-cell modules not available.")
    
    adata = sc_data['adata']
    cell_scores = pathway_scores['cell_scores']
    
    # Find pseudo-time column
    pseudotime_col = None
    for col in adata.obs.columns:
        if 'pseudotime' in col.lower() or 'dpt' in col.lower():
            pseudotime_col = col
            break
    
    if pseudotime_col is None:
        logger.warning("No pseudo-time annotation found. Skipping trajectory analysis.")
        return {'trajectory_df': None, 'dynamic_pathways': []}
    
    # Bin pseudo-time
    pseudotime_bins = bin_pseudotime(adata.obs[pseudotime_col], n_bins)
    
    # Compute dynamics
    trajectory_df = compute_trajectory_dynamics(cell_scores, pseudotime_bins)
    
    # Identify dynamic pathways (high variance over time)
    from singlecell.trajectory import identify_dynamic_pathways
    dynamic_pathways = identify_dynamic_pathways(trajectory_df, variance_threshold=0.05)
    
    logger.info(f"Identified {len(dynamic_pathways)} dynamic pathways over trajectory")
    
    return {
        'trajectory_df': trajectory_df,
        'dynamic_pathways': dynamic_pathways
    }
