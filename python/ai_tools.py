"""
BioViz Local - AI Tool Definitions
Defines available tools with safety classifications for the Logic Lock system.
"""

import os
import json
from typing import Any, Callable, Dict, List, Optional, Tuple

from ai_protocol import SafetyLevel
import mapper
from prompts import (
    PATHWAY_ENRICHMENT_PROMPT,
    DE_SUMMARY_PROMPT,
    NL_FILTER_PROMPT,
    VISUALIZATION_PROMPT,
    HYPOTHESIS_PROMPT,
    PATTERN_DISCOVERY_PROMPT,
    render_prompt,
)


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

# --- Shared LLM helpers for structured prompts ---

STRUCTURED_SYSTEM_MESSAGE = (
    "You are BioViz AI. Produce concise, structured scientific outputs. "
    "Use only provided data, cite real statistics, and mark speculative content as 'Hypothesis (not validated)'. "
    "If required fields are missing, say what is needed instead of guessing."
)


def _get_llm_client_and_model() -> Tuple[Any, str]:
    """
    Create an OpenAI-compatible client based on environment configuration.
    Mirrors ai_core.py to keep provider selection consistent.
    """
    from openai import OpenAI

    provider = os.getenv("AI_PROVIDER", "ollama").lower()

    if provider == "bailian":
        api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("DASHSCOPE_API_KEY") or "sk-placeholder"
        model = os.getenv("DEEPSEEK_MODEL", "deepseek-v3.2-exp")
        client = OpenAI(api_key=api_key, base_url="https://dashscope.aliyuncs.com/compatible-mode/v1", timeout=120.0)
        return client, model

    if provider == "deepseek":
        api_key = os.getenv("DEEPSEEK_API_KEY") or "sk-placeholder"
        model = os.getenv("DEEPSEEK_MODEL", "deepseek-v3.2-exp")
        client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
        return client, model

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not set")
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        client = OpenAI(api_key=api_key)
        return client, model

    if provider == "ollama":
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
        model = os.getenv("OLLAMA_MODEL", "llama3")
        client = OpenAI(api_key="ollama", base_url=base_url)
        return client, model

    # Custom fallback
    api_key = os.getenv("CUSTOM_API_KEY", "placeholder")
    base_url = os.getenv("CUSTOM_BASE_URL", "http://localhost:11434/v1")
    model = os.getenv("CUSTOM_MODEL", "gpt-3.5-turbo")
    client = OpenAI(api_key=api_key, base_url=base_url)
    return client, model


def _invoke_structured_prompt(prompt: str, temperature: float = 0.2, max_tokens: int = 900) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Call the configured LLM with a structured system message.
    Returns (content, model_name, error_message).
    """
    try:
        client, model_name = _get_llm_client_and_model()
    except Exception as e:
        return None, None, str(e)

    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": STRUCTURED_SYSTEM_MESSAGE},
                {"role": "user", "content": prompt}
            ],
            temperature=temperature,
            max_tokens=max_tokens
        )
        content = response.choices[0].message.content or ""
        return content.strip(), model_name, None
    except Exception as e:
        return None, None, str(e)


def _to_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    """Safely convert values (including percentage strings) to float."""
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    try:
        s = str(value).strip().rstrip('%')
        return float(s)
    except (ValueError, TypeError):
        return default


def _normalize_enriched_terms(enrichment_data: Any) -> List[Dict[str, Any]]:
    """
    Normalize enrichment results to a common shape.
    Supports Enrichr/GSEA-like outputs with keys such as term/name/pathway, p_value, adjusted_p_value/fdr, genes.
    """
    terms: List[Dict[str, Any]] = []

    if isinstance(enrichment_data, dict):
        for key in ["enriched_terms", "results", "terms", "pathways"]:
            if enrichment_data.get(key):
                terms = enrichment_data.get(key) or []
                break
        if not terms:
            up = enrichment_data.get("up_regulated") or []
            down = enrichment_data.get("down_regulated") or []
            terms = up + down
    elif isinstance(enrichment_data, list):
        terms = enrichment_data

    normalized: List[Dict[str, Any]] = []
    for term in terms:
        if not isinstance(term, dict):
            continue
        name = term.get("term") or term.get("name") or term.get("pathway_name") or term.get("pathway") or term.get("pathway_id") or term.get("id") or "unknown"
        pval = _to_float(term.get("p_value") or term.get("pvalue") or term.get("p") or term.get("NOM p-val"))
        fdr = _to_float(term.get("adjusted_p_value") or term.get("fdr") or term.get("q_value") or term.get("FDR q-val"))
        genes_raw = term.get("genes") or term.get("hit_genes") or term.get("overlap") or term.get("leadingEdge")
        if isinstance(genes_raw, str):
            genes = [g.strip() for g in genes_raw.replace(";", ",").split(",") if g.strip()]
        elif isinstance(genes_raw, list):
            genes = [str(g) for g in genes_raw]
        else:
            genes = []
        combined_score = _to_float(term.get("combined_score") or term.get("score") or term.get("nes"))

        normalized.append({
            "term": name,
            "p_value": pval,
            "fdr": fdr,
            "combined_score": combined_score,
            "genes": genes
        })

    return normalized


def _split_significant_genes(
    volcano_data: Optional[List[Dict[str, Any]]],
    pvalue_threshold: float = 0.05,
    logfc_threshold: float = 1.0
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Split volcano data into up/down/non-significant groups."""
    up: List[Dict[str, Any]] = []
    down: List[Dict[str, Any]] = []
    non_sig: List[Dict[str, Any]] = []

    if not volcano_data:
        return up, down, non_sig

    for row in volcano_data:
        if not isinstance(row, dict):
            continue
        gene = row.get("gene") or row.get("id") or row.get("name") or "unknown"
        logfc = _to_float(row.get("x"), 0.0) or 0.0
        pval = _to_float(row.get("pvalue"), 1.0) or 1.0
        status = str(row.get("status") or "").upper()

        if status not in {"UP", "DOWN"}:
            if pval < pvalue_threshold and abs(logfc) > logfc_threshold:
                status = "UP" if logfc > 0 else "DOWN"
            else:
                status = "NS"

        entry = {
            "gene": gene,
            "log2fc": logfc,
            "pvalue": pval,
            "status": status
        }

        if status == "UP":
            up.append(entry)
        elif status == "DOWN":
            down.append(entry)
        else:
            non_sig.append(entry)

    return up, down, non_sig


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
        result = gsea_module.run_enrichr(gene_list, gene_sets)
        
        # run_enrichr returns a dict with 'status', 'enriched_terms', etc.
        if result.get("status") == "error":
            return {
                "error": result.get("message", "Unknown error"),
                "enriched_terms": []
            }
        
        enriched_terms = result.get("enriched_terms", [])
        
        return {
            "gene_sets": gene_sets,
            "input_genes": len(gene_list),
            "enriched_terms": enriched_terms[:20] if isinstance(enriched_terms, list) else [],
            "total_terms": result.get("total_terms", len(enriched_terms))
        }
    except Exception as e:
        print(f"[AI Tool] Enrichment error: {e}", file=sys.stderr)
        return {
            "error": str(e),
            "enriched_terms": []
        }


# --- LLM-backed structured analyses ---

def summarize_enrichment(
    enrichment_data: Any,
    volcano_data: Optional[List[Dict[str, Any]]] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Summarize enrichment output into a structured narrative."""
    normalized_terms = _normalize_enriched_terms(enrichment_data or {})
    metadata = metadata or {}

    significant_terms = [
        t for t in normalized_terms
        if (t.get("fdr") is not None and t["fdr"] < 0.05) or (t.get("fdr") is None and t.get("p_value") is not None and t["p_value"] < 0.05)
    ]

    if not normalized_terms:
        return {
            "status": "ok",
            "summary": "No enrichment results were provided. Run Enrichr/GSEA first, then retry the explanation step.",
            "terms_used": []
        }

    if not significant_terms:
        return {
            "status": "ok",
            "summary": "No significant enrichment detected (all FDR >= 0.05 or missing). Consider broadening gene sets or adjusting thresholds.",
            "terms_used": []
        }

    payload = {
        "significant_terms": significant_terms[:12],
        "total_terms": len(normalized_terms),
        "cutoffs": {"p_value": 0.05, "fdr": 0.05},
        "metadata": metadata,
        "volcano_preview_genes": [
            g.get("gene") for g in (volcano_data or []) if g.get("status") in {"UP", "DOWN"}
        ][:20]
    }

    prompt = render_prompt(PATHWAY_ENRICHMENT_PROMPT, payload)
    content, model, error = _invoke_structured_prompt(prompt, temperature=0.25)

    if error or not content:
        return {"status": "error", "message": f"LLM error: {error or 'empty response'}"}

    return {
        "status": "ok",
        "summary": content,
        "model": model,
        "terms_used": [t.get("term") for t in significant_terms[:12] if isinstance(t, dict)]
    }


def summarize_de_genes(
    volcano_data: Optional[List[Dict[str, Any]]],
    thresholds: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Generate a standardized summary for differential expression results."""
    if not volcano_data:
        return {"status": "error", "message": "No differential expression data provided"}

    thresholds = thresholds or {}
    pvalue_threshold = _to_float(thresholds.get("pvalue_threshold"), 0.05) or 0.05
    logfc_threshold = _to_float(thresholds.get("logfc_threshold"), 1.0) or 1.0

    up, down, _ = _split_significant_genes(volcano_data, pvalue_threshold, logfc_threshold)

    if not up and not down:
        return {
            "status": "ok",
            "summary": f"No significant genes met the thresholds (p<{pvalue_threshold}, |log2FC|>{logfc_threshold}). Consider relaxing cutoffs or providing adjusted p-values.",
            "counts": {"up": 0, "down": 0}
        }

    top_up = sorted(up, key=lambda g: abs(g.get("log2fc", 0)), reverse=True)[:10]
    top_down = sorted(down, key=lambda g: abs(g.get("log2fc", 0)), reverse=True)[:10]

    payload = {
        "thresholds": {"p_value": pvalue_threshold, "log2fc": logfc_threshold},
        "counts": {"up": len(up), "down": len(down)},
        "top_up": top_up,
        "top_down": top_down
    }

    prompt = render_prompt(DE_SUMMARY_PROMPT, payload)
    content, model, error = _invoke_structured_prompt(prompt, temperature=0.2)

    if error or not content:
        return {"status": "error", "message": f"LLM error: {error or 'empty response'}"}

    return {
        "status": "ok",
        "summary": content,
        "model": model,
        "counts": {"up": len(up), "down": len(down)},
        "top_up": [g.get("gene") for g in top_up if isinstance(g, dict)],
        "top_down": [g.get("gene") for g in top_down if isinstance(g, dict)]
    }


def parse_filter_query(
    natural_language_query: str,
    available_fields: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Translate natural language filters into structured conditions."""
    if not natural_language_query or not natural_language_query.strip():
        return {"status": "error", "message": "Filter query is empty"}

    payload = {
        "query": natural_language_query,
        "available_fields": available_fields or []
    }
    prompt = render_prompt(NL_FILTER_PROMPT, payload, extra_notes="Respond with the JSON object only.")
    content, model, error = _invoke_structured_prompt(prompt, temperature=0.0, max_tokens=700)

    if error or not content:
        return {"status": "error", "message": f"LLM error: {error or 'empty response'}"}

    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    parsed = None
    try:
        parsed = json.loads(cleaned)
    except Exception:
        parsed = None

    return {
        "status": "ok",
        "summary": content,
        "parsed": parsed,
        "model": model
    }


def describe_visualization(table_data: Any) -> Dict[str, Any]:
    """Describe enrichment/visualization trends without making causal claims."""
    if not table_data:
        return {"status": "ok", "summary": "No visualization data provided to describe."}

    # Keep payload concise to avoid exceeding token limits
    preview = table_data
    if isinstance(table_data, list):
        preview = table_data[:25]

    prompt = render_prompt(VISUALIZATION_PROMPT, {"preview": preview})
    content, model, error = _invoke_structured_prompt(prompt, temperature=0.2, max_tokens=600)

    if error or not content:
        return {"status": "error", "message": f"LLM error: {error or 'empty response'}"}

    return {"status": "ok", "summary": content, "model": model}


def generate_hypothesis(
    significant_genes: Optional[List[str]] = None,
    pathways: Optional[Any] = None,
    volcano_data: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Produce Phase 3 exploratory hypotheses with explicit disclaimers."""
    gene_list = significant_genes or []
    if not gene_list and volcano_data:
        up, down, _ = _split_significant_genes(volcano_data)
        gene_list = [g.get("gene") for g in up + down if g.get("gene")]

    normalized_pathways = _normalize_enriched_terms(pathways or [])

    if not gene_list and not normalized_pathways:
        return {
            "status": "ok",
            "summary": "No significant genes or pathways were provided. Supply differential expression results or enrichment hits to generate a hypothesis."
        }

    payload = {
        "significant_genes": gene_list[:40],
        "pathways": normalized_pathways[:10]
    }
    prompt = render_prompt(HYPOTHESIS_PROMPT, payload, extra_notes="Always prefix speculative content with 'Hypothesis (not validated)'.")
    content, model, error = _invoke_structured_prompt(prompt, temperature=0.35, max_tokens=800)

    if error or not content:
        return {"status": "error", "message": f"LLM error: {error or 'empty response'}"}

    return {
        "status": "ok",
        "summary": content,
        "model": model
    }


def discover_patterns(expression_matrix: Any) -> Dict[str, Any]:
    """Exploratory pattern discovery for Phase 3."""
    if not expression_matrix:
        return {"status": "ok", "summary": "No expression matrix provided. Provide DE results or expression values to discover patterns."}

    preview = expression_matrix
    if isinstance(expression_matrix, list):
        # Trim to keep payload small
        preview = expression_matrix[:60]

    prompt = render_prompt(PATTERN_DISCOVERY_PROMPT, {"expression_preview": preview}, extra_notes="Treat all findings as exploratory.")
    content, model, error = _invoke_structured_prompt(prompt, temperature=0.3, max_tokens=850)

    if error or not content:
        return {"status": "error", "message": f"LLM error: {error or 'empty response'}"}

    return {"status": "ok", "summary": content, "model": model}


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
