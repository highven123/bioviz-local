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
    badges: InsightBadge[];
}
