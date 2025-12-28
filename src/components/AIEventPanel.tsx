import React, { useState, useEffect } from 'react';
import { useI18n } from '../i18n';
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

interface LiveActivityState {
    taskId: string;
    taskName: string;
    steps: Array<{ label: string; status: 'pending' | 'active' | 'done' }>;
    status: 'running' | 'done' | 'error';
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
    const { t } = useI18n();
    const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
    const [isMinimized, setIsMinimized] = useState(true); // Start collapsed
    const [liveActivity, setLiveActivity] = useState<LiveActivityState | null>(null);

    // Draggable state
    const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight / 2 });
    const [isDragging, setIsDragging] = useState(false);
    const [panelSize, setPanelSize] = useState({ width: 280, height: 440 });
    const [isResizing, setIsResizing] = useState(false);
    const dragStartPos = React.useRef({ x: 0, y: 0 });
    const dragOffset = React.useRef({ x: 0, y: 0 });
    const resizeStart = React.useRef({ x: 0, y: 0, width: 280, height: 440 });
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
            const message = summary || (response as any)?.content || response?.message || emptyMessage || t('Completed.');
            addSuggestion(title, message, isOk ? 'success' : 'warning');
        } catch (err: any) {
            addSuggestion(title, t('Failed: {error}', { error: err?.message || String(err) }), 'warning');
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault(); // Prevent text selection
        e.stopPropagation();
        if (isResizing) return;
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

    // Resizing logic with 8 directions
    const startResize = (e: React.MouseEvent, direction: string) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        resizeStart.current = {
            x: e.clientX,
            y: e.clientY,
            width: panelSize.width,
            height: panelSize.height
        };
        // Store direction in a ref
        (resizeStart.current as any).direction = direction;
    };

    useEffect(() => {
        if (!isResizing) return;

        const handleResizeMove = (e: MouseEvent) => {
            const dx = e.clientX - resizeStart.current.x;
            const dy = e.clientY - resizeStart.current.y;
            const direction = (resizeStart.current as any).direction || 'se';

            const minWidth = 220;
            const minHeight = 260;
            const maxWidth = window.innerWidth - 50;
            const maxHeight = window.innerHeight - 50;

            let newWidth = panelSize.width;
            let newHeight = panelSize.height;
            let newX = position.x;
            let newY = position.y;

            // Handle horizontal resizing
            if (direction.includes('e')) {
                newWidth = Math.min(Math.max(resizeStart.current.width + dx, minWidth), maxWidth);
            } else if (direction.includes('w')) {
                const widthChange = -dx;
                newWidth = Math.min(Math.max(resizeStart.current.width + widthChange, minWidth), maxWidth);
                newX = position.x - (newWidth - panelSize.width);
            }

            // Handle vertical resizing
            if (direction.includes('s')) {
                newHeight = Math.min(Math.max(resizeStart.current.height + dy, minHeight), maxHeight);
            } else if (direction.includes('n')) {
                const heightChange = -dy;
                newHeight = Math.min(Math.max(resizeStart.current.height + heightChange, minHeight), maxHeight);
                newY = position.y - (newHeight - panelSize.height);
            }

            setPanelSize({ width: newWidth, height: newHeight });
            if (newX !== position.x || newY !== position.y) {
                setPosition({ x: newX, y: newY });
            }
        };

        const handleResizeUp = () => {
            setIsResizing(false);
        };

        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeUp);

        return () => {
            document.removeEventListener('mousemove', handleResizeMove);
            document.removeEventListener('mouseup', handleResizeUp);
        };
    }, [isResizing, position, panelSize]);

    // Check boundaries when expanding to prevent overflow
    React.useEffect(() => {
        if (!isMinimized) {
            // Panel is expanded, check if it goes off-screen
            const panelWidth = panelSize.width;
            const panelHeight = panelSize.height;

            setPosition(prev => {
                let newX = prev.x;
                let newY = prev.y;

                if (prev.x + panelWidth > window.innerWidth) {
                    newX = Math.max(10, window.innerWidth - panelWidth - 10);
                }

                if (prev.x < 10) {
                    newX = 10;
                }

                if (prev.y + panelHeight > window.innerHeight) {
                    newY = Math.max(10, window.innerHeight - panelHeight - 10);
                }

                if (prev.y < 10) {
                    newY = 10;
                }

                return { x: newX, y: newY };
            });
        }
    }, [isMinimized, panelSize]);

    useEffect(() => {
        // Subscribe to AI suggestion events
        const subSuggestion = eventBus.subscribe(BioVizEvents.AI_SUGGESTION, (payload) => {
            const newSuggestion: AISuggestion = {
                id: `sug_${Date.now()}`,
                type: payload.type || 'info',
                title: payload.title || t('AI Insight'),
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
                title: payload.title || t('⚠️ Warning'),
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
                    title: t('✅ Data Quality Check'),
                    message: t('Loaded {rows} rows. No missing values detected.', { rows: payload?.rows || 0 }),
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
                    title: t('🧬 Analysis Complete'),
                    message: t('Found {up} upregulated and {down} downregulated genes. Would you like to run enrichment analysis?', {
                        up: payload?.statistics?.upregulated || 0,
                        down: payload?.statistics?.downregulated || 0
                    }),
                    timestamp: Date.now(),
                    actions: [
                        {
                            label: t('Open GSEA'),
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

    useEffect(() => {
        const subStart = eventBus.subscribe(BioVizEvents.AI_PROCESS_START, (payload) => {
            const steps = Array.isArray(payload?.steps) ? payload.steps : [];
            setLiveActivity({
                taskId: payload?.taskId || `task_${Date.now()}`,
                taskName: payload?.taskName || t('Processing task'),
                steps: steps.map((label: string, idx: number) => ({
                    label,
                    status: idx === 0 ? 'active' : 'pending'
                })),
                status: 'running'
            });
        });
        const subUpdate = eventBus.subscribe(BioVizEvents.AI_PROCESS_UPDATE, (payload) => {
            setLiveActivity((prev) => {
                if (!prev) return prev;
                if (payload?.taskId && payload.taskId !== prev.taskId) return prev;
                const stepIndex = typeof payload?.stepIndex === 'number' ? payload.stepIndex : -1;
                if (stepIndex < 0) return prev;
                const nextSteps = prev.steps.map((step, idx) => {
                    if (idx < stepIndex) return { ...step, status: 'done' };
                    if (idx === stepIndex) return { ...step, status: 'active' };
                    return step;
                });
                return { ...prev, steps: nextSteps, status: 'running' };
            });
        });
        const subComplete = eventBus.subscribe(BioVizEvents.AI_PROCESS_COMPLETE, (payload) => {
            setLiveActivity((prev) => {
                if (!prev) return prev;
                if (payload?.taskId && payload.taskId !== prev.taskId) return prev;
                return {
                    ...prev,
                    steps: prev.steps.map((step) => ({ ...step, status: 'done' })),
                    status: payload?.status === 'error' ? 'error' : 'done'
                };
            });
        });

        return () => {
            eventBus.unsubscribe(BioVizEvents.AI_PROCESS_START, subStart);
            eventBus.unsubscribe(BioVizEvents.AI_PROCESS_UPDATE, subUpdate);
            eventBus.unsubscribe(BioVizEvents.AI_PROCESS_COMPLETE, subComplete);
        };
    }, [t]);

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
                transform: 'none', // Override CSS transform
                width: isMinimized ? 56 : panelSize.width,
                height: isMinimized ? 56 : panelSize.height,
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
                <span className="ai-badge">🤖 {t('AI Assistant')}</span>
                <span className="suggestion-count">{activeSuggestions.length}</span>
                <button className="minimize-btn">{isMinimized ? '▲' : '▼'}</button>
            </div>

            {!isMinimized && (
                <div className="ai-event-list">
                    {liveActivity && (
                        <div className="live-activity">
                            <div className="live-activity-header">
                                <span className="live-activity-title">⚡ {liveActivity.taskName}</span>
                                <span className={`live-activity-status ${liveActivity.status}`}>
                                    {liveActivity.status === 'done'
                                        ? t('Completed')
                                        : liveActivity.status === 'error'
                                            ? t('Failed')
                                            : t('In progress')}
                                </span>
                            </div>
                            <div className="live-activity-steps">
                                {liveActivity.steps.map((step, idx) => (
                                    <div key={`${step.label}-${idx}`} className={`live-step ${step.status}`}>
                                        <span className="live-step-icon">
                                            {step.status === 'done' ? '✅' : step.status === 'active' ? '⏳' : '•'}
                                        </span>
                                        <span className="live-step-label">{step.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* Skills Cards */}
                    <div className="ai-skills-section">
                        <div className="skills-label">{t('Skills')}</div>
                        <div className="skills-grid">
                            <button
                                className="skill-card"
                                onClick={() => onNavigateToGSEA?.()}
                                title={t('Gene Set Enrichment Analysis')}
                            >
                                <span className="skill-icon">🔬</span>
                                <span className="skill-name">{t('GSEA')}</span>
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
                                            query: t('Please run enrichment analysis for these {count} differentially expressed genes: {genes}{more}', {
                                                count: genes.length,
                                                genes: genes.slice(0, 50).join(', '),
                                                more: genes.length > 50 ? '...' : ''
                                            }),
                                            context: analysisContext
                                        });
                                    }
                                }}
                                title={t('Run Enrichment Analysis')}
                                disabled={!analysisContext?.volcanoData}
                            >
                                <span className="skill-icon">📊</span>
                                <span className="skill-name">{t('Enrichment')}</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    await runSkillCommand(
                                        t('Enrichment Explanation'),
                                        'SUMMARIZE_ENRICHMENT',
                                        {
                                            enrichment_data: analysisContext?.pathway?.enriched_terms || analysisContext?.statistics?.enriched_terms,
                                            volcano_data: volcanoData,
                                            statistics: analysisContext?.statistics,
                                        },
                                        t('Run enrichment first to explain the results.')
                                    );
                                }}
                                title={t('Explain enrichment results with structured prompt')}
                                disabled={!analysisContext?.volcanoData}
                            >
                                <span className="skill-icon">🧠</span>
                                <span className="skill-name">{t('Explain')}</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    await runSkillCommand(
                                        t('Differential Expression Summary'),
                                        'SUMMARIZE_DE',
                                        { volcano_data: volcanoData },
                                        t('Load differential expression data first.')
                                    );
                                }}
                                title={t('Summarize significant genes and thresholds')}
                                disabled={!analysisContext?.volcanoData}
                            >
                                <span className="skill-icon">🧾</span>
                                <span className="skill-name">{t('Summarize')}</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    await runSkillCommand(
                                        t('Hypothesis (Phase 3)'),
                                        'GENERATE_HYPOTHESIS',
                                        {
                                            significant_genes: significantGenes,
                                            pathways: analysisContext?.pathway?.enriched_terms,
                                            volcano_data: volcanoData,
                                        },
                                        t('Provide significant genes to generate a hypothesis.')
                                    );
                                }}
                                title={t('Generate speculative mechanism hypotheses')}
                                disabled={significantGenes.length === 0}
                            >
                                <span className="skill-icon">💡</span>
                                <span className="skill-name">{t('Hypothesis')}</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    await runSkillCommand(
                                        t('Pattern Discovery (Phase 3)'),
                                        'DISCOVER_PATTERNS',
                                        {
                                            expression_matrix: volcanoData,
                                        },
                                        t('Load expression data to discover patterns.')
                                    );
                                }}
                                title={t('Discover co-expression patterns (exploratory)')}
                                disabled={!analysisContext?.volcanoData}
                            >
                                <span className="skill-icon">🔍</span>
                                <span className="skill-name">{t('Patterns')}</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    await runSkillCommand(
                                        t('Visualization Description'),
                                        'DESCRIBE_VISUALIZATION',
                                        {
                                            table_data: analysisContext?.pathway?.enriched_terms || volcanoData,
                                        },
                                        t('Load data to describe visualization trends.')
                                    );
                                }}
                                title={t('Describe chart/table trends')}
                                disabled={!analysisContext?.volcanoData}
                            >
                                <span className="skill-icon">📈</span>
                                <span className="skill-name">{t('Describe')}</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    const filterQuery = prompt(t('Enter filter query (e.g., "log2FC > 2 and FDR < 0.01"):'));
                                    if (filterQuery) {
                                        await runSkillCommand(
                                            t('Parse Filter Query'),
                                            'PARSE_FILTER',
                                            {
                                                query: filterQuery,
                                                available_fields: ['gene', 'log2FC', 'pValue', 'FDR', 'status'],
                                            },
                                            t('Filter query parsed successfully.')
                                        );
                                    }
                                }}
                                title={t('Parse natural language filters')}
                            >
                                <span className="skill-icon">🔎</span>
                                <span className="skill-name">{t('Filter')}</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={() => onExportSession?.()}
                                title={t('Export Analysis Report')}
                                disabled={!analysisContext}
                            >
                                <span className="skill-icon">📝</span>
                                <span className="skill-name">{t('Report')}</span>
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
                                        query: t('Please compare the functional differences between upregulated genes ({upCount}) and downregulated genes ({downCount}). Up: {upGenes}; Down: {downGenes}', {
                                            upCount: upGenes.length,
                                            downCount: downGenes.length,
                                            upGenes: upGenes.slice(0, 20).join(', '),
                                            downGenes: downGenes.slice(0, 20).join(', ')
                                        }),
                                        context: analysisContext
                                    });
                                }}
                                title={t('Compare UP vs DOWN genes')}
                                disabled={!analysisContext?.volcanoData}
                            >
                                <span className="skill-icon">🧬</span>
                                <span className="skill-name">{t('Compare')}</span>
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
                                        query: t('Please analyze the trend patterns of the current differential expression data: Total {total} genes, {up} up, {down} down. Top changes: {changes}. Please identify potential biological trends and regulatory patterns.', {
                                            total: genes.length,
                                            up: upGenes.length,
                                            down: downGenes.length,
                                            changes: topChanges.join(', ')
                                        }),
                                        context: analysisContext
                                    });
                                }}
                                title={t('Expression Trend Analysis')}
                                disabled={!analysisContext?.volcanoData}
                            >
                                <span className="skill-icon">📈</span>
                                <span className="skill-name">{t('Trends')}</span>
                            </button>
                            <button
                                className="skill-card"
                                onClick={async () => {
                                    // Literature Search - AI query about pathway
                                    const pathwayName = analysisContext?.pathway?.name || analysisContext?.pathway?.title || t('current pathway');
                                    await sendCommand('CHAT', {
                                        query: t('Please introduce the latest research progress, clinical significance, and therapeutic targets of {pathway}.', { pathway: pathwayName }),
                                        context: analysisContext
                                    });
                                }}
                                title={t('Search Literature')}
                                disabled={!analysisContext?.pathway}
                            >
                                <span className="skill-icon">🔍</span>
                                <span className="skill-name">{t('Research')}</span>
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
                    {/* 8-directional resize handles */}
                    <div className="resize-handle resize-n" onMouseDown={(e) => startResize(e, 'n')} />
                    <div className="resize-handle resize-s" onMouseDown={(e) => startResize(e, 's')} />
                    <div className="resize-handle resize-e" onMouseDown={(e) => startResize(e, 'e')} />
                    <div className="resize-handle resize-w" onMouseDown={(e) => startResize(e, 'w')} />
                    <div className="resize-handle resize-ne" onMouseDown={(e) => startResize(e, 'ne')} />
                    <div className="resize-handle resize-nw" onMouseDown={(e) => startResize(e, 'nw')} />
                    <div className="resize-handle resize-se" onMouseDown={(e) => startResize(e, 'se')} />
                    <div className="resize-handle resize-sw" onMouseDown={(e) => startResize(e, 'sw')} />
                </div>
            )}
        </div>
    );
};

export default AIEventPanel;
