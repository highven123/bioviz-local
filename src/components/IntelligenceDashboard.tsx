import React, { useState } from 'react';

interface IntelligenceDashboardProps {
    data: {
        summary: string;
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
    };
    onGenerateSuperNarrative?: () => void;
    isGenerating?: boolean;
    onClose?: () => void;
}

export const IntelligenceDashboard: React.FC<IntelligenceDashboardProps> = ({ data, onClose, onGenerateSuperNarrative, isGenerating }) => {
    if (!data) return null;

    // Safety fallback for layers to prevent crashes
    const layers = data.layers || {
        multi_omics: { active: false, note: 'No data' },
        temporal: { active: false, note: 'No data' },
        druggability: { active: false, hits: [] },
        topology: { active: false, note: 'No data' },
        qc: { status: 'UNKNOWN', inflation: false, variance: 0, note: 'No data' },
        lab: { active: false, recommendations: [] },
        rag_hints: { hints: [] }
    };

    const summary = data.summary || 'No analysis results available.';
    const drivers = data.drivers || [];
    const [isNarrativeExpanded, setIsNarrativeExpanded] = useState(false);

    React.useEffect(() => {
        console.log('[Dashboard] Data updated:', {
            hasNarrative: !!data.super_narrative,
            narrativeLength: data.super_narrative?.length,
            isGenerating
        });
    }, [data.super_narrative, isGenerating]);

    console.log('[Dashboard] Rendering with narrative:', !!data.super_narrative);


    return (
        <div className="intelligence-dashboard">
            <div className="dashboard-header">
                <div className="header-main">
                    <h2><span className="icon">🧠</span> Biologic Studio Intelligence</h2>
                    <p className="summary-text">{summary}</p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button
                        className="ai-synthesize-btn"
                        onClick={onGenerateSuperNarrative}
                        disabled={isGenerating}
                    >
                        {isGenerating ? '⌛ Synthesizing layers...' : (data.super_narrative ? '🔄 Regenerate Narrative' : '✨ AI Super Narrative')}
                    </button>
                    {onClose && <button className="close-dashboard" onClick={onClose}>✕</button>}
                </div>
            </div>


            {data.super_narrative && (
                <div className="super-narrative-section">
                    <div
                        className="narrative-badge"
                        onClick={() => setIsNarrativeExpanded(!isNarrativeExpanded)}
                        style={{
                            cursor: 'pointer',
                            userSelect: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '12px 16px',
                            background: 'rgba(102, 126, 234, 0.1)',
                            borderRadius: '8px',
                            border: '1px solid rgba(102, 126, 234, 0.3)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <span style={{ fontSize: '12px', color: 'var(--brand-primary)', transition: 'transform 0.2s', transform: isNarrativeExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                        <span className="icon">🤖</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>AI Executive Summary</span>
                    </div>
                    {isNarrativeExpanded && (
                        <div className="narrative-content" style={{ marginTop: '20px', position: 'relative', zIndex: 1 }}>
                            {typeof data.super_narrative === 'string' && data.super_narrative.length > 0 ? (
                                data.super_narrative.split('\n').filter(l => l.trim()).map((line, i) => {
                                    const processed = line.trim();
                                    if (processed.startsWith('###')) {
                                        return <h4 key={i} className="narrative-h4" style={{ color: 'var(--brand-primary)', margin: '20px 0 10px 0' }}>{processed.replace(/^###\s*/, '')}</h4>;
                                    }
                                    if (processed.startsWith('**') && processed.endsWith('**')) {
                                        return <p key={i}><strong>{processed.replace(/\*\*/g, '')}</strong></p>;
                                    }
                                    return <p key={i} className="narrative-p">{processed}</p>;
                                })
                            ) : (
                                <div className="narrative-empty-state">
                                    <p>No synthesis content available. Please try regenerating.</p>
                                    <pre style={{ fontSize: '10px', opacity: 0.5 }}>Type: {typeof data.super_narrative} | Length: {String(data.super_narrative?.length)}</pre>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}


            <div className="dashboard-grid">
                {/* 1. Multi-omics Layer */}
                <div className={`insight-card ${layers.multi_omics.active ? 'active' : 'inactive'}`}>
                    <div className="card-header">
                        <span className="card-icon">🧬</span>
                        <h4>Multi-omics Synergy</h4>
                    </div>
                    <div className="card-body">
                        {layers.multi_omics.active ? (
                            <>
                                <div className="synergy-stat">
                                    <span className="score">{(layers.multi_omics.synergy_score * 100).toFixed(1)}%</span>
                                    <span className="label">Validation Rate</span>
                                </div>
                                <div className="tag-cloud">
                                    {(layers.multi_omics.concordant_hits || []).map((g: string) => (
                                        <span key={g} className="match-tag">{g}</span>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="empty-hint">{layers.multi_omics.note}</div>
                        )}
                    </div>
                </div>

                {/* 2. Temporal Layer */}
                <div className={`insight-card ${layers.temporal.active ? 'active' : 'inactive'}`}>
                    <div className="card-header">
                        <span className="card-icon">🌊</span>
                        <h4>Temporal Dynamics</h4>
                    </div>
                    <div className="card-body">
                        {layers.temporal.active ? (
                            <>
                                <div className="trend-badge">{layers.temporal.trend}</div>
                                <div className="wave-list">
                                    {(layers.temporal.waves || []).map((g: string) => (
                                        <div key={g} className="wave-item">
                                            <span>{g}</span>
                                            <div className="mini-wave">⤴️⤵️</div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="empty-hint">{layers.temporal.note}</div>
                        )}
                    </div>
                </div>

                {/* 3. Druggability Layer */}
                <div className={`insight-card ${layers.druggability.active ? 'active' : 'inactive'}`}>
                    <div className="card-header">
                        <span className="card-icon">💊</span>
                        <h4>Actionable Targets</h4>
                    </div>
                    <div className="card-body">
                        {layers.druggability.active ? (
                            <div className="target-list">
                                {(layers.druggability.hits || []).map((h: any) => (
                                    <div key={h.gene} className="target-item">
                                        <div className="target-gene">
                                            <strong>{h.gene}</strong>
                                            <span className={`dir ${h.status}`}>{h.status}</span>
                                        </div>
                                        <div className="drug-list">{h.drugs.join(', ')}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-hint">No significant druggable targets identified in this set.</div>
                        )}
                    </div>
                </div>

                {/* 4. Topology Layer */}
                <div className={`insight-card ${layers.topology.active ? 'active' : 'inactive'}`}>
                    <div className="card-header">
                        <span className="card-icon">🕸️</span>
                        <h4>Structural Topology</h4>
                    </div>
                    <div className="card-body">
                        {layers.topology.active ? (
                            <div className="bottleneck-list">
                                {(layers.topology.bottlenecks || []).map((b: string) => (
                                    <div key={b} className="bottleneck-item">
                                        <span className="rank-dot"></span>
                                        {b}
                                    </div>
                                ))}
                                <p className="topology-note">{layers.topology.note}</p>
                            </div>
                        ) : (
                            <div className="empty-hint">{layers.topology.note}</div>
                        )}
                    </div>
                </div>

                {/* 5. Statistical QC */}
                <div className={`insight-card qc-card ${layers.qc.status}`}>
                    <div className="card-header">
                        <span className="card-icon">⚖️</span>
                        <h4>Statistical Integrity</h4>
                    </div>
                    <div className="card-body">
                        <div className="qc-status">
                            <span className={`badge ${layers.qc.status}`}>{layers.qc.status}</span>
                        </div>
                        <div className="qc-metrics">
                            <div className="metric">
                                <label>P-Inflate</label>
                                <span>{layers.qc.inflation ? 'DETECTED' : 'NONE'}</span>
                            </div>
                            <div className="metric">
                                <label>LogFC Var</label>
                                <span>{(layers.qc.variance || 0).toFixed(2)}</span>
                            </div>
                        </div>
                        <p className="qc-note">{layers.qc.note}</p>
                    </div>
                </div>

                {/* 6. Laboratory Assistant */}
                <div className={`insight-card lab-card ${layers.lab.active ? 'active' : 'inactive'}`}>
                    <div className="card-header">
                        <span className="card-icon">🧪</span>
                        <h4>Laboratory Next Steps</h4>
                    </div>
                    <div className="card-body">
                        {layers.lab.active ? (
                            <ul className="lab-steps">
                                {(layers.lab.recommendations || []).map((r: string, i: number) => (
                                    <li key={i}>{r}</li>
                                ))}
                            </ul>
                        ) : (
                            <div className="empty-hint">Insufficient variance for specific bench recommendations.</div>
                        )}
                    </div>
                </div>

                {/* 7. Knowledge Hub (RAG) */}
                <div className="insight-card rag-card">
                    <div className="card-header">
                        <span className="card-icon">📖</span>
                        <h4>Knowledge context (RAG)</h4>
                    </div>
                    <div className="card-body">
                        <div className="rag-hints">
                            {(layers.rag_hints.hints || []).map((h: string, i: number) => (
                                <div key={i} className="rag-card-item">
                                    <p>{h}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Drivers highlight (Full width) */}
            {drivers.length > 0 && (
                <div className="drivers-summary">
                    <h4>Top Regulatory Hubs</h4>
                    <div className="drivers-row">
                        {drivers.map(d => (
                            <div key={d.gene} className="driver-feature">
                                <strong>{d.gene}</strong>
                                <span>Hits {d.count} paths</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
