"""
Central prompt templates for BioViz AI (Phase 1 + Phase 3).
These templates enforce structured, scientific outputs with clear edge handling.
"""

import json
from typing import Any


def _format_json(data: Any) -> str:
    """Pretty-print payload data for prompt injection."""
    try:
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception:
        return str(data)


SCIENTIFIC_GUARDRAILS = """
Edge handling and scientific guardrails:
- Distinguish factual output vs speculative; label speculative pieces as "Hypothesis (not validated)".
- Use only provided data; do not invent pathway roles, statistics, or gene effects.
- State p-value/FDR/log2FC thresholds you rely on.
- If required fields are missing (e.g., no FDR column), say what is needed instead of guessing.
- If nothing meets significance (all FDR >= 0.05 or list is empty), respond "No significant findings" and suggest next steps (e.g., adjust thresholds, add data).
"""

PATHWAY_ENRICHMENT_PROMPT = """
[Phase 1] Pathway enrichment summary
Goal: Convert Reactome/WikiPathways/KEGG enrichment tables into a concise scientific narrative.

Expected inputs: pathway term/name, p-value, FDR/adjusted p-value, gene overlap/genes, optional combined score or NES.

Output sections (in order):
1) Summary: 1-2 sentences on whether significant enrichment exists (p < 0.05 or FDR < 0.05).
2) Top enriched pathways: bullets with name, p/FDR, brief biological role, key up/down genes if provided.
3) Statistical confidence: mention gene counts / multiple-testing control and any caveats (e.g., missing FDR).
4) Key genes: bullets with gene name and one-line role grounded in the pathway description.

Edge handling:
- If no significant term (FDR >= 0.05), explicitly say so and recommend follow-up analyses.
- Keep language scientific; avoid clinical claims or unprovided mechanisms.
"""

DE_SUMMARY_PROMPT = """
[Phase 1] Differential expression summary (Volcano)
Goal: Summarize significant genes from differential expression results.

Expected inputs: gene symbol, log2FC, p-value, FDR/adjusted p-value, status (UP/DOWN/NS).

Output sections:
1) Significant gene summary: counts of up/down significant genes using FDR < 0.05 and |log2FC| > threshold.
2) Bullets: top upregulated and top downregulated genes with log2FC and p/FDR.
3) Next steps: concise suggestions (e.g., enrichment, pathway check).

Edge handling:
- If no gene passes thresholds, state "No significant genes" and suggest data/threshold checks.
- Avoid speculative biology beyond the provided lists.
"""

NL_FILTER_PROMPT = """
[Phase 1] Natural language filter parser
Goal: Turn a free-text filter request into machine-executable conditions plus a short explanation.

Required output format (JSON string):
{
  "conditions": [
    {"field": "...", "operator": ">", "value": 2, "logic": "AND"},
    ...
  ],
  "explanation": "human-readable summary of the filter and thresholds",
  "needs_clarification": ["what needs to be specified when ambiguous"]
}

Rules:
- If the query is ambiguous (e.g., "very high expression"), set conditions to [] and add what is needed in needs_clarification.
- Do not invent thresholds; echo those provided or request them explicitly.
"""

VISUALIZATION_PROMPT = """
[Phase 1] Enrichment/visualization trend description
Goal: Briefly describe trends seen in enrichment or ranking tables (bar/dot/volcano-like data).

Output: 3-5 sentences or bullets covering top/bottom terms, relative scores, and whether a cluster of pathways dominates. Mention cutoffs used.

Edge handling:
- If the table is empty, say there is nothing significant to describe and ask for the data needed.
- Focus on statistical/visual patterns only; avoid clinical or causal claims.
"""

HYPOTHESIS_PROMPT = """
[Phase 3] Mechanistic hypothesis generation
Goal: Propose limited, data-bound hypotheses from significant pathways and genes.

Output sections:
- Hypothesis (prefix with "Hypothesis (not validated): ...")
- Evidence: bullet list tying pathways/genes to the hypothesis with provided stats.
- Suggested validation: brief experimental checks (e.g., qPCR, perturbation).
- Caveats: note data gaps or assumptions.

Rules:
- Stay within provided data; do not assert unsupported mechanisms.
- Clearly mark the speculative nature.
"""

PATTERN_DISCOVERY_PROMPT = """
[Phase 3] Exploratory pattern discovery
Goal: Highlight potential co-expression modules or patterns from expression data + DE results.

Output sections:
1) Pattern summary: describe 2-3 modules/clusters with representative genes and direction.
2) Why it matters: short note on possible biological themes.
3) Next steps: validation ideas (clustering stats/heatmap/qPCR).

Rules:
- Treat output as exploratory; avoid definitive claims.
- If data is insufficient, state what is missing.
"""


def render_prompt(template: str, payload: Any, extra_notes: str = "") -> str:
    """Assemble a prompt with the template, payload, guardrails, and optional extra notes."""
    data_block = _format_json(payload)
    sections = [template.strip()]
    if extra_notes:
        sections.append(extra_notes.strip())
    sections.append("Input data (JSON):\n" + data_block)
    sections.append(SCIENTIFIC_GUARDRAILS.strip())
    return "\n\n".join(sections)
