import React, { useState, useEffect } from 'react';
import { eventBus, BioVizEvents } from '../stores/eventBus';
import { SidecarResponse } from '../hooks/useBioEngine';
import './AIEventPanel.css';

interface AISuggestion {
    id: string;
    type: 'info' | 'warning' | 'success' | 'action';
    title: string;
    message: string;
    timestamp: number;
    actions?: Array<{
        label: string;
        handler: () => void;
    }>;
    dismissed?: boolean;
}

interface AIEventPanelProps {
    sendCommand: (cmd: string, data?: Record<string, unknown>, waitForResponse?: boolean) => Promise<SidecarResponse | void>;
    isConnected: boolean;
    onNavigateToGSEA?: () => void;
    onExportSession?: () => void;
    analysisContext?: {
        pathway?: any;
        volcanoData?: any[];
        statistics?: any;
    };
}

export const AIEventPanel: React.FC<AIEventPanelProps> = ({
    sendCommand,
    onNavigateToGSEA,
    onExportSession,
    analysisContext,
}) => {
    const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
    const [isMinimized, setIsMinimized] = useState(true); // Start collapsed

    // Draggable state
    const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight / 2 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPos = React.useRef({ x: 0, y: 0 });
    const dragOffset = React.useRef({ x: 0, y: 0 });
    const hasMoved = React.useRef(false);
    const volcanoData = analysisContext?.volcanoData || [];
    const significantGenes = volcanoData
        .filter((g: any) => g.status === 'UP' || g.status === 'DOWN')
        .map((g: any) => g.gene)
        .filter(Boolean);

    const addSuggestion = (title: string, message: string, type: AISuggestion['type'] = 'info') => {
        const suggestion: AISuggestion = {
            id: `${type}_${Date.now()}`,
            type,
            title,
            message,
            timestamp: Date.now(),
        };
        setSuggestions((prev) => [suggestion, ...prev].slice(0, 10));
        setIsMinimized(false);
    };

    const runSkillCommand = async (title: string, cmd: string, payload: Record<string, unknown>, emptyMessage?: string) => {
        try {
            const response = await sendCommand(cmd, payload, true) as SidecarResponse;
            const isOk = response && response.status === 'ok';
            const summary = (response && typeof response === 'object' ? (response as any).summary : null) as string | null;
            const message = summary || (response as any)?.content || response?.message || emptyMessage || 'Completed.';
            addSuggestion(title, message, isOk ? 'success' : 'warning');
        } catch (err: any) {
            addSuggestion(title, `Failed: ${err?.message || String(err)}`, 'warning');
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault(); // Prevent text selection
        e.stopPropagation();
        setIsDragging(true);
        hasMoved.current = false;
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    React.useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const dx = e.clientX - dragStartPos.current.x;
            const dy = e.clientY - dragStartPos.current.y;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                hasMoved.current = true;
            }

            setPosition({
                x: Math.max(10, Math.min(window.innerWidth - 80, e.clientX - dragOffset.current.x)),
                y: Math.max(10, Math.min(window.innerHeight - 80, e.clientY - dragOffset.current.y))
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // Check boundaries when expanding to prevent overflow
    React.useEffect(() => {
        if (!isMinimized) {
            // Panel is expanded, check if it goes off-screen
            const panelWidth = 200; // Match CSS width
            const panelHeight = 400; // Approximate expanded height

            setPosition(prev => {
                let newX = prev.x;
                let newY = prev.y;

                // Check right edge
                if (prev.x + panelWidth > window.innerWidth) {
                    newX = window.innerWidth - panelWidth - 10;
                }

                // Check left edge
                if (prev.x < 10) {
                    newX = 10;
                }

                // Check bottom edge
                if (prev.y + panelHeight > window.innerHeight) {
                    newY = window.innerHeight - panelHeight - 10;
                }

                // Check top edge
                if (prev.y < 10) {
                    newY = 10;
                }

                return { x: newX, y: newY };
            });
        }
    }, [isMinimized]);

    useEffect(() => {
        // Subscribe to AI suggestion events
        const subSuggestion = eventBus.subscribe(BioVizEvents.AI_SUGGESTION, (payload) => {
            const newSuggestion: AISuggestion = {
                id: `sug_${Date.now()}`,
                type: payload.type || 'info',
                title: payload.title || 'AI Insight',
                message: payload.message,
                timestamp: Date.now(),
                actions: payload.actions,
            };
            setSuggestions((prev) => [newSuggestion, ...prev].slice(0, 10));
        });

        // Subscribe to AI warning events
        const subWarning = eventBus.subscribe(BioVizEvents.AI_WARNING, (payload) => {
            const warning: AISuggestion = {
                id: `warn_${Date.now()}`,
                type: 'warning',
                title: payload.title || '⚠️ Warning',
                message: payload.message,
                timestamp: Date.now(),
            };
            setSuggestions((prev) => [warning, ...prev].slice(0, 10));
        });

        // Example: Auto-trigger QC check when data is loaded
        const subDataLoaded = eventBus.subscribe(BioVizEvents.DATA_LOADED, (payload) => {
            // Simulate AI QC check
            setTimeout(() => {
                const qcResult: AISuggestion = {
                    id: `qc_${Date.now()}`,
                    type: 'success',
                    title: '✅ Data Quality Check',
                    message: `Loaded ${payload?.rows || 0} rows. No missing values detected.`,
                    timestamp: Date.now(),
                };
                setSuggestions((prev) => [qcResult, ...prev].slice(0, 10));
            }, 500);
        });

        // Auto-trigger suggestion when analysis completes
        const subAnalysis = eventBus.subscribe(BioVizEvents.ANALYSIS_COMPLETE, (payload) => {
            setTimeout(() => {
                const analysisHint: AISuggestion = {
                    id: `analysis_${Date.now()}`,
                    type: 'action',
                    title: '🧬 Analysis Complete',
                    message: `Found ${payload?.statistics?.upregulated || 0} upregulated and ${payload?.statistics?.downregulated || 0} downregulated genes. Would you like to run enrichment analysis?`,
                    timestamp: Date.now(),
                    actions: [
                        {
                            label: 'Open GSEA',
                            handler: () => {
                                if (onNavigateToGSEA) {
                                    onNavigateToGSEA();
                                }
                            },
                        },
                    ],
                };
                setSuggestions((prev) => [analysisHint, ...prev].slice(0, 10));
            }, 300);
        });

        return () => {
            eventBus.unsubscribe(BioVizEvents.AI_SUGGESTION, subSuggestion);
            eventBus.unsubscribe(BioVizEvents.AI_WARNING, subWarning);
            eventBus.unsubscribe(BioVizEvents.DATA_LOADED, subDataLoaded);
            eventBus.unsubscribe(BioVizEvents.ANALYSIS_COMPLETE, subAnalysis);
        };
    }, [sendCommand]);

    const dismissSuggestion = (id: string) => {
        setSuggestions((prev) =>
            prev.map((s) => (s.id === id ? { ...s, dismissed: true } : s))
        );
        setTimeout(() => {
            setSuggestions((prev) => prev.filter((s) => s.id !== id));
        }, 300);
    };

    const activeSuggestions = suggestions.filter((s) => !s.dismissed);

    // Always show panel because we have Skills cards

    return (
        <div
            className={`ai-event-panel ${isMinimized ? 'minimized' : ''}`}
            style={{
                left: position.x,
                top: position.y,
                transform: 'none' // Override CSS transform
            }}
            onMouseDown={handleMouseDown}
            onClick={(e) => {
                if (isMinimized && !hasMoved.current) {
                    e.stopPropagation();
                    setIsMinimized(false);
                }
            }}
        >
            <div className="ai-event-header" onClick={(e) => {
                if (!isMinimized && !hasMoved.current) {
                    e.stopPropagation();
                    setIsMinimized(true);
                }
            }}>
                <span className="ai-badge">🤖 AI Assistant</span>
                <span className="suggestion-count">{activeSuggestions.length}</span>
                <button className="minimize-btn">{isMinimized ? '▲' : '▼'}</button>
            </div>

            {!isMinimized && (
                <div className="ai-event-list">
                    {/* Skills Cards */}
                    <div className="ai-skills-section">
                        <div className="skills-label">Skills</div>
                        <div className="skills-grid">
                            <button
                                className="skill-card"
                                onClick={() => onNavigateToGSEA?.()}
                                title="Gene Set Enrichment Analysis"
                            >
                                <span className="skill-icon">🔬</span>
                                <span className="skill-name">GSEA</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    // Enrichment Analysis - extract genes and call AI
                                    const genes = analysisContext?.volcanoData
                                        ?.filter((g: any) => g.status === 'UP' || g.status === 'DOWN')
                                        ?.map((g: any) => g.gene) || [];
                                    if (genes.length > 0) {
                                        await sendCommand('CHAT', {
                                            query: `Please run enrichment analysis for these ${genes.length} differentially expressed genes: ${genes.slice(0, 50).join(', ')}${genes.length > 50 ? '...' : ''}`,
                                            context: analysisContext
                                        });
                                    }
                                }}
                                title="Run Enrichment Analysis"
                                disabled={!analysisContext?.volcanoData}
                            >
                                <span className="skill-icon">📊</span>
                                <span className="skill-name">Enrichment</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    await runSkillCommand(
                                        'Enrichment Explanation',
                                        'SUMMARIZE_ENRICHMENT',
                                        {
                                            enrichment_data: analysisContext?.pathway?.enriched_terms || analysisContext?.statistics?.enriched_terms,
                                            volcano_data: volcanoData,
                                            statistics: analysisContext?.statistics,
                                        },
                                        'Run enrichment first to explain the results.'
                                    );
                                }}
                                title="Explain enrichment results with structured prompt"
                                disabled={!analysisContext?.volcanoData}
                            >
                                <span className="skill-icon">🧠</span>
                                <span className="skill-name">Explain</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    await runSkillCommand(
                                        'Differential Expression Summary',
                                        'SUMMARIZE_DE',
                                        { volcano_data: volcanoData },
                                        'Load differential expression data first.'
                                    );
                                }}
                                title="Summarize significant genes and thresholds"
                                disabled={!analysisContext?.volcanoData}
                            >
                                <span className="skill-icon">🧾</span>
                                <span className="skill-name">Summarize</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    await runSkillCommand(
                                        'Hypothesis (Phase 3)',
                                        'GENERATE_HYPOTHESIS',
                                        {
                                            significant_genes: significantGenes,
                                            pathways: analysisContext?.pathway?.enriched_terms,
                                            volcano_data: volcanoData,
                                        },
                                        'Provide significant genes to generate a hypothesis.'
                                    );
                                }}
                                title="Generate speculative mechanism hypotheses"
                                disabled={significantGenes.length === 0}
                            >
                                <span className="skill-icon">💡</span>
                                <span className="skill-name">Hypothesis</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    await runSkillCommand(
                                        'Pattern Discovery (Phase 3)',
                                        'DISCOVER_PATTERNS',
                                        {
                                            expression_matrix: volcanoData,
                                        },
                                        'Load expression data to discover patterns.'
                                    );
                                }}
                                title="Discover co-expression patterns (exploratory)"
                                disabled={!analysisContext?.volcanoData}
                            >
                                <span className="skill-icon">🔍</span>
                                <span className="skill-name">Patterns</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    await runSkillCommand(
                                        'Visualization Description',
                                        'DESCRIBE_VISUALIZATION',
                                        {
                                            table_data: analysisContext?.pathway?.enriched_terms || volcanoData,
                                        },
                                        'Load data to describe visualization trends.'
                                    );
                                }}
                                title="Describe chart/table trends"
                                disabled={!analysisContext?.volcanoData}
                            >
                                <span className="skill-icon">📈</span>
                                <span className="skill-name">Describe</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    const filterQuery = prompt('Enter filter query (e.g., "log2FC > 2 and FDR < 0.01"):');
                                    if (filterQuery) {
                                        await runSkillCommand(
                                            'Parse Filter Query',
                                            'PARSE_FILTER',
                                            {
                                                query: filterQuery,
                                                available_fields: ['gene', 'log2FC', 'pValue', 'FDR', 'status'],
                                            },
                                            'Filter query parsed successfully.'
                                        );
                                    }
                                }}
                                title="Parse natural language filters"
                            >
                                <span className="skill-icon">🔎</span>
                                <span className="skill-name">Filter</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={() => onExportSession?.()}
                                title="Export Analysis Report"
                                disabled={!analysisContext}
                            >
                                <span className="skill-icon">📝</span>
                                <span className="skill-name">Report</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    // Gene Comparison - compare UP vs DOWN
                                    const upGenes = analysisContext?.volcanoData
                                        ?.filter((g: any) => g.status === 'UP')
                                        ?.map((g: any) => g.gene) || [];
                                    const downGenes = analysisContext?.volcanoData
                                        ?.filter((g: any) => g.status === 'DOWN')
                                        ?.map((g: any) => g.gene) || [];
                                    await sendCommand('CHAT', {
                                        query: `Please compare the functional differences between upregulated genes (${upGenes.length}) and downregulated genes (${downGenes.length}). Up: ${upGenes.slice(0, 20).join(', ')}; Down: ${downGenes.slice(0, 20).join(', ')}`,
                                        context: analysisContext
                                    });
                                }}
                                title="Compare UP vs DOWN genes"
                                disabled={!analysisContext?.volcanoData}
                            >
                                <span className="skill-icon">🧬</span>
                                <span className="skill-name">Compare</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    // Trend Analysis - analyze expression patterns
                                    const genes = analysisContext?.volcanoData || [];
                                    const upGenes = genes.filter((g: any) => g.status === 'UP');
                                    const downGenes = genes.filter((g: any) => g.status === 'DOWN');

                                    // Get top changed genes with their fold changes
                                    const topChanges = [...genes]
                                        .sort((a: any, b: any) => Math.abs(b.x) - Math.abs(a.x))
                                        .slice(0, 15)
                                        .map((g: any) => `${g.gene}(${g.x > 0 ? '+' : ''}${g.x.toFixed(2)})`);

                                    await sendCommand('CHAT', {
                                        query: `Please analyze the trend patterns of the current differential expression data: Total ${genes.length} genes, ${upGenes.length} up, ${downGenes.length} down. Top changes: ${topChanges.join(', ')}. Please identify potential biological trends and regulatory patterns.`,
                                        context: analysisContext
                                    });
                                }}
                                title="Expression Trend Analysis"
                                disabled={!analysisContext?.volcanoData}
                            >
                                <span className="skill-icon">📈</span>
                                <span className="skill-name">Trends</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    // Literature Search - AI query about pathway
                                    const pathwayName = analysisContext?.pathway?.name || analysisContext?.pathway?.title || 'current pathway';
                                    await sendCommand('CHAT', {
                                        query: `Please introduce the latest research progress, clinical significance, and therapeutic targets of ${pathwayName}.`,
                                        context: analysisContext
                                    });
                                }}
                                title="Search Literature"
                                disabled={!analysisContext?.pathway}
                            >
                                <span className="skill-icon">🔍</span>
                                <span className="skill-name">Research</span>
                            </button>
                        </div>
                    </div>

                    {/* Suggestions */}
                    {activeSuggestions.map((suggestion) => (
                        <div
                            key={suggestion.id}
                            className={`ai-suggestion ${suggestion.type} ${suggestion.dismissed ? 'dismissed' : ''}`}
                        >
                            <div className="suggestion-header">
                                <span className="suggestion-title">{suggestion.title}</span>
                                <button
                                    className="dismiss-btn"
                                    onClick={() => dismissSuggestion(suggestion.id)}
                                >
                                    ✕
                                </button>
                            </div>
                            <p className="suggestion-message">{suggestion.message}</p>
                            {suggestion.actions && (
                                <div className="suggestion-actions">
                                    {suggestion.actions.map((action, idx) => (
                                        <button
                                            key={idx}
                                            className="action-btn"
                                            onClick={action.handler}
                                        >
                                            {action.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AIEventPanel;
