/**
 * Analysis Summary Card - Shows key statistics
 */

import React from 'react';
import './AnalysisSummaryCard.css';
import { useI18n } from '../i18n';

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
    const { t } = useI18n();
    if (!statistics) return null;

    const entityLabel = dataType === 'gene' ? 'Gene' : dataType === 'protein' ? 'Protein' : 'Compound';
    const { total_nodes = 0, upregulated = 0, downregulated = 0, unchanged = 0 } = statistics;
    const totalRegulated = upregulated + downregulated;
    const balanceRatio = totalRegulated > 0 ? Math.abs(upregulated - downregulated) / totalRegulated : 1;
    const insightChips: Array<{ label: string; icon: string }> = [];

    if (upregulated > 1000) {
        insightChips.push({ icon: '🔥', label: t('High transcriptional activity') });
    }
    if (downregulated > 1000) {
        insightChips.push({ icon: '❄️', label: t('Suppression dominant') });
    }
    if (totalRegulated > 0 && balanceRatio <= 0.15) {
        insightChips.push({ icon: '⚖️', label: t('Balanced regulation') });
    }

    const stats = [
        { label: `Total ${entityLabel}s`, value: total_nodes, color: '#64748b', icon: '📊' },
        { label: 'Upregulated', value: upregulated, color: '#ef4444', icon: '⬆️' },
        { label: 'Downregulated', value: downregulated, color: '#3b82f6', icon: '⬇️' },
        { label: 'Unchanged', value: unchanged, color: '#94a3b8', icon: '➖' }
    ];

    return (
        <div className="analysis-summary-card">
            <div className="summary-card-header">
                <span className="summary-card-title">📈 {t('Analysis Overview')}</span>
                {insightChips.length > 0 && (
                    <div className="summary-chip-row">
                        {insightChips.map((chip) => (
                            <span key={chip.label} className="summary-chip">
                                <span className="summary-chip-icon">{chip.icon}</span>
                                <span>{chip.label}</span>
                            </span>
                        ))}
                    </div>
                )}
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
            <div className="summary-footer">
                <div className="efficiency-badge">
                    ⚡ {t('Estimated time saved: ~2 hours')}
                </div>
                <div className="algorithmic-badge">
                    {t('Powered by BioEngine v2.0')}
                </div>
            </div>
        </div>
    );
};
