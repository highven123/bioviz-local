# BioViz Agent Runtime
# Orchestrates Motia workflows based on user intent.

import logging
import json
import traceback
from typing import Dict, Any, List

try:
    import motia
except ImportError:
    import sys
    import os
    sys.path.append(os.path.dirname(__file__))
    import motia


from workflow_registry import (
    step_load_data, 
    step_multi_omics, 
    step_druggability, 
    step_generate_summary, 
    step_save_results,
    # New Narrative Steps
    step_semantic_deduplication,
    step_literature_scan,
    step_generate_narrative,
    # New Single-Cell Steps
    step_load_sc_data,
    step_compute_pathway_activity,
    step_spatial_lr_analysis,
    step_pathway_trajectory
)

logger = logging.getLogger("BioViz.AgentRuntime")

class AgentRuntime:
    def __init__(self):
        self.engine = motia.WorkflowEngine()
        self.active_workflows = {}
        logger.info("AgentRuntime initialized with Motia Engine.")


    def run_workflow(self, workflow_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes a predefined workflow by name.
        """
        try:
            if workflow_name == "comprehensive_analysis":
                return self._flow_comprehensive(params)
            elif workflow_name == "narrative_analysis":
                return self._flow_narrative(params)
            elif workflow_name == "sc_contextual":
                return self._flow_sc_contextual(params)
            else:
                raise ValueError(f"Unknown workflow: {workflow_name}")
        except Exception as e:
            logger.error(f"Workflow execution failed: {e}")
            logger.error(traceback.format_exc())
            return {"status": "error", "error": str(e)}

    def _flow_narrative(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Phase 2: The 'Job-to-be-Done' workflow.
        Sequence: Load -> Deduplicate -> RAG -> Narrative
        """
        logger.info("Starting Mechanistic Narrative Workflow...")
        
        # 1. Simulating Enrichment Inputs (In real app, this comes from 'enrichment_results')
        # For MVP, we load a dummy CSV that looks like enrichment results if not provided
        enrichment_data = params.get('enrichment_results')
        if not enrichment_data:
            # Fallback for testing: Generate synthetic data
            enrichment_data = [
                {'Term': 'Cell Cycle', 'P-value': 1e-5, 'Genes': 'TP53 CDK2 CCNB1'},
                {'Term': 'Mitotic Cell Cycle', 'P-value': 1e-4, 'Genes': 'CDK2 CCNB1'},
                {'Term': 'Viral Reproduction', 'P-value': 0.001, 'Genes': 'TP53'}, # Garbage to filter?
                {'Term': 'T Cell Receptor Signaling', 'P-value': 1e-6, 'Genes': 'CD3D CD28 ZAP70'},
                {'Term': 'PD-1 Checkpoint Pathway', 'P-value': 1e-5, 'Genes': 'PDCD1 CD274'}
            ]
        
        # 2. Semantic De-duplication
        # Merges "Cell Cycle" & "Mitotic..." -> Module 1
        modules = step_semantic_deduplication(enrichment_data)
        
        # 3. Literature RAG
        # Fetches "TP53 master regulator..." evidence
        enhanced_modules = step_literature_scan(modules)
        
        # 4. Narrative Generation
        # Writes the report
        narrative_text = step_generate_narrative(enhanced_modules)
        
        history = self.engine.context.get_history()
        
        return {
            "status": "completed",
            "narrative": narrative_text,
            "modules_found": len(modules),
            "trace": history
        }

    def _flow_comprehensive(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Hardcoded 'Planner' output for the MVP.
        Sequence: Load -> MultiOmics -> Druggability -> Summary
        """
        logger.info("Starting Comprehensive Analysis Workflow...")
        
        # 1. Load Data
        df = step_load_data(
            file_path=params['file_path'], 
            mapping=params.get('mapping', {'gene': 'Gene', 'value': 'Log2FC'})
        )
        
        # 2. Parallel Analysis (Sequential in Shim for now)
        omics_result = step_multi_omics(df)
        drugs_result = step_druggability(df)
        
        # 3. Aggregate
        insights = {
            "multi_omics": omics_result,
            "druggability": drugs_result
        }
        
        # 4. Generate Narrative
        summary_text = step_generate_summary(insights)
        
        # 5. Return context history as the "Execution Trace"
        history = self.engine.context.get_history()
        
        return {
            "status": "completed",
            "summary": summary_text,
            "insights": insights,
            "trace": history
        }

    def _flow_sc_contextual(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Phase 3: Single-Cell Contextual Analysis Workflow.
        Sequence: Load SC Data → Pathway Scoring → Spatial L-R → Trajectory
        """
        logger.info("Starting Single-Cell Contextual Analysis Workflow...")
        
        # 1. Load AnnData
        file_path = params.get('file_path')
        if not file_path:
            raise ValueError("Missing required parameter: file_path (.h5ad file)")
        
        sc_data = step_load_sc_data(file_path)
        logger.info(f"Loaded {sc_data['metadata']['n_cells']} cells, {sc_data['metadata']['n_genes']} genes")
        
        # 2. Define pathways for scoring
        pathways = params.get('pathways') or {
            'Cell Cycle': ['CDK1', 'CCNB1', 'CDC20'],
            'Apoptosis': ['TP53', 'BAX', 'CASP3'],
            'Immune Response': ['CD3D', 'CD8A', 'IFNG']
        }
        
        # 3. Compute pathway activity scores
        pathway_results = step_compute_pathway_activity(
            sc_data, pathways, cluster_key=params.get('cluster_key', 'cell_type')
        )
        
        # 4. Spatial L-R interaction analysis
        lr_interactions = []
        if sc_data['has_spatial']:
            lr_interactions = step_spatial_lr_analysis(sc_data, pathway_results)
        
        # 5. Trajectory mapping
        trajectory_result = {'trajectory_df': None, 'dynamic_pathways': []}
        if sc_data['has_pseudotime']:
            trajectory_result = step_pathway_trajectory(sc_data, pathway_results)
        
        history = self.engine.context.get_history()
        
        return {
            "status": "completed",
            "metadata": sc_data['metadata'],
            "lr_interactions": lr_interactions,
            "trajectory": trajectory_result,
            "trace": history
        }

    def process_intent(self, intent_json: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main entry point for AI Panel commands.
        Input example: {"intent": "analyze_all", "params": {...}}
        """
        intent = intent_json.get("intent")
        params = intent_json.get("params", {})
        
        if intent == "analyze_all":
            return self.run_workflow("comprehensive_analysis", params)
        elif intent == "analyze_narrative":
            # Direct shortcut for Phase 2 demo
            return self.run_workflow("narrative_analysis", params)
        elif intent == "sc_contextual":
            # Phase 3: Single-cell contextual analysis
            return self.run_workflow("sc_contextual", params)
        
        return {"status": "error", "message": "Unrecognized intent"}


# Singleton instance
agent_runtime = AgentRuntime()
