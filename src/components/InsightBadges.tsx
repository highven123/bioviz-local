/**
 * Insight Badges Display Component
 * Shows AI-generated insights from analysis results
 */

import React from 'react';
import { AnalysisInsights, InsightBadge } from '../types/insights';
import './InsightBadges.css';

interface InsightBadgesProps {
    insights: AnalysisInsights | null;
}

export const InsightBadges: React.FC<InsightBadgesProps> = ({ insights }) => {
    if (!insights || insights.badges.length === 0) {
        return null;
    }

    const getBadgeIcon = (type: InsightBadge['type']): string => {
        switch (type) {
            case 'HIGHLIGHT':
                return '✨';
            case 'RISK':
                return '⚠️';
            case 'INFO':
                return 'ℹ️';
            default:
                return '•';
        }
    };

    return (
        <div className="insight-badges-container">
            {insights.summary && (
                <div className="insight-summary">
                    <span className="summary-icon">🤖</span>
                    <span className="summary-text">{insights.summary}</span>
                </div>
            )}

            <div className="badges-grid">
                {insights.badges.map((badge, idx) => (
                    <div key={idx} className={`insight-badge ${badge.type.toLowerCase()}`}>
                        <div className="badge-header">
                            <span className="badge-icon">{getBadgeIcon(badge.type)}</span>
                            <span className="badge-message">{badge.message}</span>
                        </div>
                        {badge.detail && (
                            <div className="badge-detail">{badge.detail}</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
