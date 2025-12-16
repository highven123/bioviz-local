"""
BioViz Local - AI Tool Definitions
Defines available tools with safety classifications for the Logic Lock system.
"""

from typing import Any, Callable, Dict, List, Optional
from ai_protocol import SafetyLevel
import mapper


# --- Tool Registry ---

class ToolDefinition:
    """Represents a tool available to the AI."""
    def __init__(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        safety_level: SafetyLevel,
        handler: Callable[..., Any]
    ):
        self.name = name
        self.description = description
        self.parameters = parameters  # JSON Schema format
        self.safety_level = safety_level
        self.handler = handler
    
    def to_openai_schema(self) -> Dict[str, Any]:
        """Convert to OpenAI function calling format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters
            }
        }


# --- Green Zone Tools (Safe, Auto-Execute) ---

def _render_pathway(pathway_id: str, gene_expression: Dict[str, float], data_type: str = "gene") -> Dict:
    """Render a colored KEGG pathway."""
    colored = mapper.color_kegg_pathway(pathway_id, gene_expression, data_type=data_type)
    stats = mapper.get_pathway_statistics(colored)
    return {
        "pathway": colored,
        "statistics": stats
    }


def _get_pathway_stats(pathway_id: str, gene_expression: Dict[str, float], data_type: str = "gene") -> Dict:
    """Get statistics for a pathway without full rendering."""
    colored = mapper.color_kegg_pathway(pathway_id, gene_expression, data_type=data_type)
    return mapper.get_pathway_statistics(colored)


def _list_available_pathways() -> List[Dict[str, str]]:
    """List all available pathway templates."""
    from pathlib import Path
    import sys
    
    templates = []
    
    # Search paths for templates
    search_paths = [
        Path(__file__).parent.parent / 'assets' / 'templates',
        Path.home() / '.bioviz_local' / 'templates',
    ]
    
    if hasattr(sys, '_MEIPASS'):
        search_paths.insert(0, Path(sys._MEIPASS) / 'assets' / 'templates')
    
    seen = set()
    for path in search_paths:
        if path.exists():
            for f in path.glob("*.json"):
                pid = f.stem
                if pid not in seen:
                    seen.add(pid)
                    templates.append({
                        "id": pid,
                        "name": pid.replace("_", " ").title()
                    })
    
    return sorted(templates, key=lambda x: x["id"])


def _explain_pathway(pathway_id: str) -> str:
    """Get description of a pathway."""
    # Simple lookup for common pathways
    descriptions = {
        "hsa04210": "Apoptosis pathway - programmed cell death signaling",
        "hsa04110": "Cell cycle - regulation of cell division",
        "hsa04115": "p53 signaling pathway - tumor suppressor response",
        "hsa04151": "PI3K-Akt signaling pathway - cell survival and growth",
        "hsa04010": "MAPK signaling pathway - cell proliferation and differentiation",
    }
    return descriptions.get(pathway_id, f"KEGG pathway {pathway_id}")


def _run_enrichment(gene_list: List[str], gene_sets: str = "KEGG_2021_Human") -> Dict[str,  Any]:
    """
    Run enrichment analysis on a list of genes.
    This tool automatically extracts genes from the current analysis context.
    """
    import gsea_module
    import sys
    
    if not gene_list or len(gene_list) == 0:
        return {
            "error": "No genes provided for enrichment analysis",
            "enriched_terms": []
        }
    
    print(f"[AI Tool] Running Enrichr with {len(gene_list)} genes on {gene_sets}", file=sys.stderr)
    
    try:
        enriched_terms = gsea_module.run_enrichr(gene_list, gene_sets)
        return {
            "gene_sets": gene_sets,
            "input_genes": len(gene_list),
            "enriched_terms": enriched_terms[:20],  # Top 20 results
            "total_terms": len(enriched_terms)
        }
    except Exception as e:
        print(f"[AI Tool] Enrichment error: {e}", file=sys.stderr)
        return {
            "error": str(e),
            "enriched_terms": []
        }


# --- Yellow Zone Tools (Require Confirmation) ---

def _update_analysis_thresholds(
    pvalue_threshold: Optional[float] = None,
    logfc_threshold: Optional[float] = None
) -> Dict[str, Any]:
    """
    Update analysis thresholds.
    This is a Yellow Zone action - requires user confirmation.
    """
    result = {"updated": []}
    if pvalue_threshold is not None:
        result["pvalue_threshold"] = pvalue_threshold
        result["updated"].append("pvalue_threshold")
    if logfc_threshold is not None:
        result["logfc_threshold"] = logfc_threshold
        result["updated"].append("logfc_threshold")
    return result


def _export_analysis_data(
    output_path: str,
    format: str = "csv"
) -> Dict[str, Any]:
    """
    Export analysis data to file.
    This is a Yellow Zone action - requires user confirmation.
    """
    return {
        "action": "export",
        "output_path": output_path,
        "format": format
    }


# --- Tool Registry ---

TOOLS: List[ToolDefinition] = [
    # Green Zone - Safe to auto-execute
    ToolDefinition(
        name="render_pathway",
        description="Render and color a KEGG pathway with gene expression data. Returns the colored pathway and statistics.",
        parameters={
            "type": "object",
            "properties": {
                "pathway_id": {
                    "type": "string",
                    "description": "KEGG pathway ID (e.g., 'hsa04210' for Apoptosis)"
                },
                "gene_expression": {
                    "type": "object",
                    "description": "Dictionary mapping gene symbols to expression values (log2 fold change)",
                    "additionalProperties": {"type": "number"}
                },
                "data_type": {
                    "type": "string",
                    "enum": ["gene", "protein", "cell"],
                    "description": "Type of biological data",
                    "default": "gene"
                }
            },
            "required": ["pathway_id", "gene_expression"]
        },
        safety_level=SafetyLevel.GREEN,
        handler=_render_pathway
    ),
    
    ToolDefinition(
        name="get_pathway_stats",
        description="Get statistics for a pathway (upregulated, downregulated, unchanged counts) without full rendering.",
        parameters={
            "type": "object",
            "properties": {
                "pathway_id": {
                    "type": "string",
                    "description": "KEGG pathway ID"
                },
                "gene_expression": {
                    "type": "object",
                    "description": "Gene expression data",
                    "additionalProperties": {"type": "number"}
                },
                "data_type": {
                    "type": "string",
                    "enum": ["gene", "protein", "cell"],
                    "default": "gene"
                }
            },
            "required": ["pathway_id", "gene_expression"]
        },
        safety_level=SafetyLevel.GREEN,
        handler=_get_pathway_stats
    ),
    
    ToolDefinition(
        name="list_pathways",
        description="List all available KEGG pathway templates.",
        parameters={
            "type": "object",
            "properties": {},
            "required": []
        },
        safety_level=SafetyLevel.GREEN,
        handler=_list_available_pathways
    ),
    
    ToolDefinition(
        name="explain_pathway",
        description="Get a brief description of what a pathway does.",
        parameters={
            "type": "object",
            "properties": {
                "pathway_id": {
                    "type": "string",
                    "description": "KEGG pathway ID to explain"
                }
            },
            "required": ["pathway_id"]
        },
        safety_level=SafetyLevel.GREEN,
        handler=_explain_pathway
    ),
    
    ToolDefinition(
        name="run_enrichment",
        description="Run enrichment analysis (Enrichr) on a list of significant genes to find enriched pathways and gene sets. Use this when user asks about pathway enrichment or which pathways are most significant.",
        parameters={
            "type": "object",
            "properties": {
                "gene_list": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of gene symbols to analyze (e.g., ['LDHA', 'PKM', 'ENO1'])"
                },
                "gene_sets": {
                    "type": "string",
                    "enum": ["KEGG_2021_Human", "GO_Biological_Process_2021", "GO_Molecular_Function_2021", "Reactome_2022"],
                    "description": "Gene set database to use",
                    "default": "KEGG_2021_Human"
                }
            },
            "required": ["gene_list"]
        },
        safety_level=SafetyLevel.GREEN,
        handler=_run_enrichment
    ),
    
    # Yellow Zone - Requires confirmation
    ToolDefinition(
        name="update_thresholds",
        description="Update analysis thresholds for significance (p-value) and effect size (log fold change). REQUIRES USER CONFIRMATION.",
        parameters={
            "type": "object",
            "properties": {
                "pvalue_threshold": {
                    "type": "number",
                    "description": "New p-value threshold for significance (e.g., 0.05)"
                },
                "logfc_threshold": {
                    "type": "number",
                    "description": "New log2 fold change threshold (e.g., 1.0)"
                }
            },
            "required": []
        },
        safety_level=SafetyLevel.YELLOW,
        handler=_update_analysis_thresholds
    ),
    
    ToolDefinition(
        name="export_data",
        description="Export analysis data to a file. REQUIRES USER CONFIRMATION.",
        parameters={
            "type": "object",
            "properties": {
                "output_path": {
                    "type": "string",
                    "description": "Path where the file will be saved"
                },
                "format": {
                    "type": "string",
                    "enum": ["csv", "xlsx", "json"],
                    "description": "Output file format",
                    "default": "csv"
                }
            },
            "required": ["output_path"]
        },
        safety_level=SafetyLevel.YELLOW,
        handler=_export_analysis_data
    ),
]


# --- Helper Functions ---

def get_tool(name: str) -> Optional[ToolDefinition]:
    """Get a tool by name."""
    for tool in TOOLS:
        if tool.name == name:
            return tool
    return None


def get_openai_tools_schema() -> List[Dict[str, Any]]:
    """Get all tools in OpenAI API format."""
    return [tool.to_openai_schema() for tool in TOOLS]


def get_green_zone_tools() -> List[str]:
    """Get names of all Green Zone tools."""
    return [t.name for t in TOOLS if t.safety_level == SafetyLevel.GREEN]


def get_yellow_zone_tools() -> List[str]:
    """Get names of all Yellow Zone tools."""
    return [t.name for t in TOOLS if t.safety_level == SafetyLevel.YELLOW]


def execute_tool(name: str, args: Dict[str, Any]) -> Any:
    """Execute a tool by name with given arguments."""
    tool = get_tool(name)
    if not tool:
        raise ValueError(f"Unknown tool: {name}")
    return tool.handler(**args)
