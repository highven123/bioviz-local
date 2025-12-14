"""
BioViz Local - AI Insight Generator
Generates structured insight badges from analysis results using deterministic heuristics.
"""

from typing import Dict, List, Any, Literal

# Type definitions matching frontend
InsightType = Literal["HIGHLIGHT", "RISK", "INFO"]

class InsightBadge:
    """Represents a single insight badge."""
    def __init__(self, type: InsightType, message: str, detail: str = ""):
        self.type = type
        self.message = message
        self.detail = detail
    
    def to_dict(self) -> Dict[str, str]:
        return {
            "type": self.type,
            "message": self.message,
            "detail": self.detail
        }


def generate_insights(analysis_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate structured insights from analysis results.
    
    Args:
        analysis_result: Dictionary containing:
            - statistics: {"percent_upregulated": float, "percent_downregulated": float, ...}
            - volcano_data: [{"gene": str, "x": float, "pvalue": float, "status": str}, ...]
            - gene_count: int
            - has_pvalue: bool
    
    Returns:
        Dictionary with:
            - summary: str (narrative summary)
            - badges: List[Dict] (insight badges)
    """
    
    badges: List[InsightBadge] = []
    
    # Extract data
    stats = analysis_result.get("statistics", {})
    volcano_data = analysis_result.get("volcano_data", [])
    gene_count = analysis_result.get("gene_count", 0)
    has_pvalue = analysis_result.get("has_pvalue", False)
    
    percent_up = stats.get("percent_upregulated", 0.0)
    percent_down = stats.get("percent_downregulated", 0.0)
    total_nodes = stats.get("total_nodes", 0)
    upregulated = stats.get("upregulated", 0)
    downregulated = stats.get("downregulated", 0)
    
    # ============================================
    # Rule 1: Activity Badge
    # ============================================
    total_activity = percent_up + percent_down
    
    if total_activity > 40:
        badges.append(InsightBadge(
            type="HIGHLIGHT",
            message="🔥 High Pathway Activity",
            detail=f"{total_activity:.1f}% of genes show significant changes"
        ))
    
    if percent_up > 0 and percent_down > 0:
        if percent_up > percent_down * 2:
            badges.append(InsightBadge(
                type="HIGHLIGHT",
                message="📈 Dominant Upregulation",
                detail=f"{upregulated} upregulated vs {downregulated} downregulated genes"
            ))
        elif percent_down > percent_up * 2:
            badges.append(InsightBadge(
                type="HIGHLIGHT",
                message="📉 Dominant Downregulation",
                detail=f"{downregulated} downregulated vs {upregulated} upregulated genes"
            ))
    
    # ============================================
    # Rule 2: Top Genes Badge
    # ============================================
    if volcano_data and len(volcano_data) > 0:
        # Filter only significant genes (UP or DOWN)
        significant_genes = [g for g in volcano_data if g.get("status") in ["UP", "DOWN"]]
        
        if significant_genes:
            # Sort by p-value (ascending) if available, otherwise by absolute LogFC
            if has_pvalue:
                sorted_genes = sorted(
                    significant_genes,
                    key=lambda g: (g.get("pvalue", 1.0), -abs(g.get("x", 0)))
                )
            else:
                sorted_genes = sorted(
                    significant_genes,
                    key=lambda g: -abs(g.get("x", 0))
                )
            
            # Take top 3
            top_genes = sorted_genes[:3]
            
            if top_genes:
                gene_names = [g.get("gene", "Unknown") for g in top_genes]
                badges.append(InsightBadge(
                    type="HIGHLIGHT",
                    message=f"⭐ Top Hits: {', '.join(gene_names)}",
                    detail=_format_top_genes_detail(top_genes, has_pvalue)
                ))
    
    # ============================================
    # Rule 3: QC/Risk Badges
    # ============================================
    if gene_count < 10:
        badges.append(InsightBadge(
            type="RISK",
            message="⚠️ Low Gene Count",
            detail=f"Only {gene_count} genes mapped. Results may be unreliable."
        ))
    
    if not has_pvalue:
        badges.append(InsightBadge(
            type="RISK",
            message="⚠️ No Statistical Testing",
            detail="P-values missing in source data. Cannot assess significance."
        ))
    
    # Low coverage check
    if total_nodes > 0 and gene_count > 0:
        coverage = (gene_count / total_nodes) * 100
        if coverage < 20:
            badges.append(InsightBadge(
                type="RISK",
                message="⚠️ Low Pathway Coverage",
                detail=f"Only {coverage:.1f}% of pathway nodes have data ({gene_count}/{total_nodes})"
            ))
    
    # ============================================
    # Rule 4: Generate Summary (Deterministic Template)
    # ============================================
    summary = _generate_summary(
        gene_count=gene_count,
        upregulated=upregulated,
        downregulated=downregulated,
        percent_up=percent_up,
        percent_down=percent_down,
        has_pvalue=has_pvalue
    )
    
    # ============================================
    # Return structured result
    # ============================================
    return {
        "summary": summary,
        "badges": [badge.to_dict() for badge in badges]
    }


def _format_top_genes_detail(top_genes: List[Dict], has_pvalue: bool) -> str:
    """Format detail string for top genes."""
    details = []
    for gene in top_genes:
        gene_name = gene.get("gene", "Unknown")
        logfc = gene.get("x", 0)
        
        if has_pvalue:
            pval = gene.get("pvalue", 1.0)
            details.append(f"{gene_name}: LogFC={logfc:.2f}, P={pval:.4f}")
        else:
            details.append(f"{gene_name}: LogFC={logfc:.2f}")
    
    return " | ".join(details)


def _generate_summary(
    gene_count: int,
    upregulated: int,
    downregulated: int,
    percent_up: float,
    percent_down: float,
    has_pvalue: bool
) -> str:
    """
    Generate a narrative summary using deterministic templates.
    This is a lightweight alternative to LLM-based summary generation.
    """
    
    # Determine dominant direction
    if upregulated > downregulated * 2:
        direction = "strong upregulation"
    elif downregulated > upregulated * 2:
        direction = "strong downregulation"
    elif upregulated > 0 or downregulated > 0:
        direction = "mixed regulation"
    else:
        direction = "no significant changes"
    
    # Build summary
    parts = []
    
    # Gene count
    parts.append(f"Analysis of {gene_count} genes")
    
    # Direction
    if upregulated > 0 or downregulated > 0:
        parts.append(f"shows {direction}")
        
        # Add specifics
        if upregulated > 0 and downregulated > 0:
            parts.append(f"({upregulated} up, {downregulated} down)")
        elif upregulated > 0:
            parts.append(f"({upregulated} upregulated)")
        else:
            parts.append(f"({downregulated} downregulated)")
    else:
        parts.append("shows no significant differential expression")
    
    # Statistical note
    if not has_pvalue:
        parts.append("Note: Statistical significance not assessed.")
    
    return " ".join(parts) + "."


# ============================================
# Example usage / Testing
# ============================================
if __name__ == "__main__":
    # Test with sample data
    sample_result = {
        "statistics": {
            "total_nodes": 20,
            "upregulated": 10,
            "downregulated": 2,
            "percent_upregulated": 50.0,
            "percent_downregulated": 10.0
        },
        "volcano_data": [
            {"gene": "TP53", "x": 2.5, "pvalue": 0.001, "status": "UP"},
            {"gene": "MYC", "x": 3.2, "pvalue": 0.0005, "status": "UP"},
            {"gene": "BRCA1", "x": -2.1, "pvalue": 0.002, "status": "DOWN"},
            {"gene": "EGFR", "x": 1.8, "pvalue": 0.01, "status": "UP"},
        ],
        "gene_count": 25,
        "has_pvalue": True
    }
    
    insights = generate_insights(sample_result)
    
    print("=" * 60)
    print("INSIGHT GENERATOR TEST")
    print("=" * 60)
    print(f"\nSummary: {insights['summary']}")
    print(f"\nBadges ({len(insights['badges'])}):")
    for badge in insights["badges"]:
        print(f"  [{badge['type']}] {badge['message']}")
        if badge['detail']:
            print(f"      → {badge['detail']}")
    print()
