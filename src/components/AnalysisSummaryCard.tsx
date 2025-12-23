/**
 * Analysis Summary Card - Shows key statistics
 */

import React from 'react';
import './AnalysisSummaryCard.css';

interface AnalysisSummaryCardProps {
    statistics?: {
        total_nodes?: number;
        upregulated?: number;
        downregulated?: number;
        unchanged?: number;
        total_edges?: number;
    };
    dataType?: 'gene' | 'protein' | 'compound' | 'cell';
}

export const AnalysisSummaryCard: React.FC<AnalysisSummaryCardProps> = ({
    statistics,
    dataType = 'gene'
}) => {
    if (!statistics) return null;

    const entityLabel = dataType === 'gene' ? 'Gene' : dataType === 'protein' ? 'Protein' : 'Compound';
    const { total_nodes = 0, upregulated = 0, downregulated = 0, unchanged = 0 } = statistics;

    const stats = [
        { label: `Total ${entityLabel}s`, value: total_nodes, color: '#64748b', icon: '📊' },
        { label: 'Upregulated', value: upregulated, color: '#ef4444', icon: '⬆️' },
        { label: 'Downregulated', value: downregulated, color: '#3b82f6', icon: '⬇️' },
        { label: 'Unchanged', value: unchanged, color: '#94a3b8', icon: '➖' }
    ];

    return (
        <div className="analysis-summary-card">
            <div className="summary-card-header">
                <span className="summary-card-title">📈 Analysis Overview</span>
            </div>
            <div className="summary-stats-grid">
                {stats.map((stat, idx) => (
                    <div key={idx} className="stat-item" style={{ borderLeftColor: stat.color }}>
                        <div className="stat-icon">{stat.icon}</div>
                        <div className="stat-content">
                            <div className="stat-value" style={{ color: stat.color }}>{stat.value}</div>
                            <div className="stat-label">{stat.label}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
