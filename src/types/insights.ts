/**
 * AI Insight Types
 * Structured insights generated from analysis results
 */

export type InsightType = 'HIGHLIGHT' | 'RISK' | 'INFO';

export interface InsightBadge {
    type: InsightType;
    message: string;
    detail: string;
}

export interface AnalysisInsights {
    summary: string;
    badges?: InsightBadge[];  // AI-generated insight badges
    super_narrative?: string;
    layers: {
        multi_omics: any;
        temporal: any;
        druggability: any;
        topology: any;
        qc: any;
        lab: any;
        rag_hints: any;
    };
    drivers: any[];
}
