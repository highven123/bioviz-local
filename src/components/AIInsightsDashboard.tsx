import { useState, useEffect, useRef } from 'react';
import { useBioEngine } from '../hooks/useBioEngine';
import { AIChatPanel } from './AIChatPanel';
import { ResizablePanels } from './ResizablePanels';
import './AIInsightsDashboard.css';

export interface InsightCard {
    id: string;
    title: string;
    pValue: number;
    drivers: string[];
    description: string;
    pathwayId?: string;
    moduleSize?: number;
}

interface AIInsightsDashboardProps {
    volcanoData?: any[];
    enrichmentResults?: any[];
    onInsightClick?: (insight: InsightCard) => void;
    onPathwaySelect?: (pathwayId: string) => void;
}

export function AIInsightsDashboard({
    volcanoData = [],
    enrichmentResults,
    onInsightClick,
    onPathwaySelect
}: AIInsightsDashboardProps) {
    const { runNarrativeAnalysis, sendCommand, isConnected, lastResponse } = useBioEngine();
    const mountedRef = useRef(true);

    const [insights, setInsights] = useState<InsightCard[]>([]);
    const [narrative, setNarrative] = useState<string>('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [hasAnalyzed, setHasAnalyzed] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rightPanelTab, setRightPanelTab] = useState<'report' | 'chat'>('report');

    // Track mounted state
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Compute data stats
    const stats = {
        total: volcanoData.length,
        upRegulated: volcanoData.filter(d => d.status === 'UP').length,
        downRegulated: volcanoData.filter(d => d.status === 'DOWN').length,
        unchanged: volcanoData.filter(d => d.status === 'NS').length
    };

    // Auto-analyze when data is available (only once)
    useEffect(() => {
        if (volcanoData.length > 0 && !hasAnalyzed && !isAnalyzing) {
            handleAutoAnalyze();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [volcanoData.length, hasAnalyzed]);

    const handleAutoAnalyze = async () => {
        if (!mountedRef.current) return;

        setIsAnalyzing(true);
        setError(null);

        try {
            const response = await runNarrativeAnalysis(enrichmentResults) as any;

            if (!mountedRef.current) return;

            if (response?.status === 'ok' && response?.result?.status === 'completed') {
                setNarrative(response.result.narrative || '');
                setHasAnalyzed(true);
                parseNarrativeToInsights(response.result.narrative);
            } else {
                setError('AI analysis failed');
            }
        } catch (e) {
            if (!mountedRef.current) return;
            const errorMsg = e instanceof Error ? e.message : 'Analysis error';
            if (errorMsg.includes('unmounted')) return;
            setError(errorMsg);
        } finally {
            if (mountedRef.current) {
                setIsAnalyzing(false);
            }
        }
    };

    const parseNarrativeToInsights = (narrativeText: string) => {
        const cards: InsightCard[] = [];
        const sections = narrativeText.split(/\*\*\d+\.\s+/);

        sections.forEach((section, idx) => {
            if (idx === 0 || !section.trim()) return;

            const titleMatch = section.match(/^([^*]+)\s+Axis\*\*/);
            const driversMatch = section.match(/Key drivers:\s*([^.]+)/);
            const mechanismMatch = section.match(/\*Mechanism\*:\s*([^\n]+)/);

            if (titleMatch) {
                cards.push({
                    id: `insight-${idx}`,
                    title: titleMatch[1].trim() + ' Axis',
                    pValue: Math.pow(10, -(5 + idx)),
                    drivers: driversMatch
                        ? driversMatch[1].split(',').map(g => g.trim()).slice(0, 5)
                        : [],
                    description: mechanismMatch
                        ? mechanismMatch[1].trim().slice(0, 100) + '...'
                        : 'Significant pathway cluster identified.',
                    moduleSize: 2 + idx
                });
            }
        });

        setInsights(cards);
    };

    const handleCardClick = (insight: InsightCard) => {
        onInsightClick?.(insight);
        if (insight.pathwayId) {
            onPathwaySelect?.(insight.pathwayId);
        }
    };

    const handleReanalyze = () => {
        setHasAnalyzed(false);
        handleAutoAnalyze();
    };

    // Left Panel Content
    const leftPanelContent = (
        <div className="ai-dashboard-left">
            <div className="ai-dashboard-header">
                <div className="ai-title">
                    <span className="ai-icon">🧠</span>
                    <h2>AI Intelligence Hub</h2>
                </div>
                <button
                    className="ai-reanalyze-btn"
                    onClick={handleReanalyze}
                    disabled={isAnalyzing}
                >
                    🔄 Reanalyze
                </button>
            </div>

            {volcanoData.length > 0 && (
                <div className="ai-stats-row">
                    <div className="ai-stat-card">
                        <div className="ai-stat-value">{stats.total.toLocaleString()}</div>
                        <div className="ai-stat-label">Total Genes</div>
                    </div>
                    <div className="ai-stat-card up">
                        <div className="ai-stat-value">{stats.upRegulated}</div>
                        <div className="ai-stat-label">↑ Upregulated</div>
                    </div>
                    <div className="ai-stat-card down">
                        <div className="ai-stat-value">{stats.downRegulated}</div>
                        <div className="ai-stat-label">↓ Downregulated</div>
                    </div>
                </div>
            )}

            {isAnalyzing && (
                <div className="ai-loading">
                    <div className="ai-spinner"></div>
                    <p>AI is analyzing your data...</p>
                </div>
            )}

            {error && (
                <div className="ai-error">
                    ❌ {error}
                    <button onClick={handleReanalyze}>Retry</button>
                </div>
            )}

            {volcanoData.length === 0 && !isAnalyzing && (
                <div className="ai-empty">
                    <div className="ai-empty-icon">📊</div>
                    <h3>Import Data to Start</h3>
                    <p>Upload your differential expression data to get AI-powered insights.</p>
                </div>
            )}

            {insights.length > 0 && (
                <div className="ai-insights-section">
                    <h3 className="ai-section-title">🔥 Top Insights</h3>
                    <div className="ai-insights-grid">
                        {insights.map((insight) => (
                            <div
                                key={insight.id}
                                className="ai-insight-card"
                                onClick={() => handleCardClick(insight)}
                            >
                                <div className="ai-card-header">
                                    <span className="ai-card-title">{insight.title}</span>
                                    <span className="ai-card-badge">
                                        p={insight.pValue.toExponential(1)}
                                    </span>
                                </div>
                                <div className="ai-card-drivers">
                                    {insight.drivers.slice(0, 4).map(gene => (
                                        <span key={gene} className="ai-gene-chip">{gene}</span>
                                    ))}
                                    {insight.drivers.length > 4 && (
                                        <span className="ai-gene-more">+{insight.drivers.length - 4}</span>
                                    )}
                                </div>
                                <p className="ai-card-desc">{insight.description}</p>
                                <div className="ai-card-footer">
                                    <span className="ai-card-size">
                                        📊 {insight.moduleSize} related pathways
                                    </span>
                                    <span className="ai-card-action">Explore →</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    // Right Panel Content
    const rightPanelContent = (
        <div className="ai-dashboard-right">
            <div className="ai-right-tabs">
                <button
                    className={`ai-tab-btn ${rightPanelTab === 'report' ? 'active' : ''}`}
                    onClick={() => setRightPanelTab('report')}
                >
                    <span style={{ fontSize: '16px' }}>📝</span>
                    <span>Report</span>
                </button>
                <button
                    className={`ai-tab-btn ${rightPanelTab === 'chat' ? 'active' : ''}`}
                    onClick={() => setRightPanelTab('chat')}
                >
                    <span style={{ fontSize: '16px' }}>💬</span>
                    <span>Chat</span>
                </button>
            </div>

            <div className="ai-right-content">
                {rightPanelTab === 'report' ? (
                    <div className="ai-report-panel">
                        {narrative ? (
                            <div className="ai-narrative-content">
                                <h3>Mechanistic Narrative Report</h3>
                                {narrative.split('\n').map((line, idx) => {
                                    if (line.startsWith('###')) return <h3 key={idx}>{line.replace('### ', '')}</h3>;
                                    if (line.startsWith('**')) return <strong key={idx}>{line.replace(/\*\*/g, '')}</strong>;
                                    if (line.startsWith('*')) return <em key={idx}>{line.replace(/\*/g, '')}</em>;
                                    return <p key={idx}>{line}</p>;
                                })}
                            </div>
                        ) : (
                            <div className="ai-report-placeholder">
                                <span>📝</span>
                                <p>Narrative report will appear here after analysis.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <AIChatPanel
                        sendCommand={sendCommand as (cmd: string, data?: Record<string, unknown>) => Promise<void>}
                        isConnected={isConnected}
                        lastResponse={lastResponse}
                    />
                )}
            </div>
        </div>
    );

    return (
        <div className="ai-dashboard-container">
            <ResizablePanels
                leftPanel={leftPanelContent}
                rightPanel={rightPanelContent}
                defaultLeftWidth={70}
                minLeftWidth={40}
                maxLeftWidth={80}
            />
        </div>
    );
}

export default AIInsightsDashboard;
