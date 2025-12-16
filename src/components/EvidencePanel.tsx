import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { EntityKind, EntityMeta, EXTERNAL_RESOURCES } from '../entityTypes';
import './EvidencePanel.css';

// Define the detailed data structure for a gene / entity point
export interface GeneDetail {
    name: string;
    logFC: number;
    pvalue?: number;
    rawValues?: { group: string; values: number[] }[];
}

interface EvidencePanelProps {
    gene: string | null;
    geneData: GeneDetail | null;
    entityKind: EntityKind;
    labels: EntityMeta;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({
    gene,
    geneData,
    entityKind,
    labels
}) => {
    const { labelSingular } = labels;

    if (!gene) {
        return (
            <div className="empty-evidence">
                <div className="click-prompt">
                    <div className="empty-icon">👆</div>
                    <p className="prompt-text">Click to show evidence</p>
                    <p className="prompt-hint">
                        Select a {labelSingular.toLowerCase()} from the volcano plot or pathway
                    </p>
                </div>
            </div>
        );
    }

    if (!geneData) {
        return (
            <div className="empty-evidence">
                <p>No data found for {gene}</p>
            </div>
        );
    }

    // --- Chart Option ---
    const getChartOption = (): EChartsOption => {
        // Fallback: Simple Bar Chart for LogFC
        return {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis' },
            grid: { top: 30, right: 10, bottom: 30, left: 50 },
            xAxis: {
                type: 'category',
                data: ['LogFC'],
                axisLine: { lineStyle: { color: '#64748b' } },
                axisLabel: { color: '#94a3b8' }
            },
            yAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: '#334155', type: 'dashed' } },
                axisLine: { lineStyle: { color: '#64748b' } },
                axisLabel: { color: '#94a3b8' }
            },
            series: [{
                type: 'bar',
                data: [geneData.logFC],
                itemStyle: {
                    color: geneData.logFC > 0 ? '#ef4444' : '#3b82f6'
                },
                barWidth: '40%'
            }]
        };
    };

    const roundedFC = Math.pow(2, Math.abs(geneData.logFC)).toFixed(2);
    const badgeClass = geneData.logFC > 0 ? 'up' : geneData.logFC < 0 ? 'down' : 'neutral';

    const resources = EXTERNAL_RESOURCES[entityKind] || [];

    return (
        <div className="evidence-panel">

            {/* Header */}
            <div className="evidence-header">
                <div className="gene-title-row">
                    <span className="gene-symbol">{gene}</span>
                    <span className={`fc-badge ${badgeClass}`}>
                        FC: {roundedFC}x
                    </span>
                </div>
                <div className="gene-stats-row">
                    <span>Log2FC: {geneData.logFC.toFixed(3)}</span>
                    {geneData.pvalue !== undefined && (
                        <span>P: {geneData.pvalue.toExponential(2)}</span>
                    )}
                </div>
            </div>

            {/* Chart Area */}
            <div className="evidence-content">
                <h4 className="section-label">Expression Level</h4>
                <div className="chart-container">
                    <ReactECharts
                        option={getChartOption()}
                        style={{ height: '100%', width: '100%' }}
                        theme="dark"
                    />
                </div>
            </div>

            {/* External Resources */}
            {resources.length > 0 && (
                <div className="evidence-footer">
                    <h4 className="section-label">External Resources</h4>
                    <div className="external-links">
                        {resources.map(resource => (
                            <a
                                key={resource.id}
                                href={resource.buildUrl(gene)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="link-btn"
                            >
                                {resource.label}
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
