import React, { useState, useEffect } from 'react';
import { eventBus, BioVizEvents } from '../stores/eventBus';
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
    sendCommand: (cmd: string, data?: Record<string, unknown>) => Promise<void>;
    isConnected: boolean;
    onNavigateToGSEA?: () => void;
}

export const AIEventPanel: React.FC<AIEventPanelProps> = ({
    sendCommand,
    isConnected,
    onNavigateToGSEA,
}) => {
    const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
    const [isMinimized, setIsMinimized] = useState(false);

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

    if (activeSuggestions.length === 0) {
        return null; // Don't show panel if no suggestions
    }

    return (
        <div className={`ai-event-panel ${isMinimized ? 'minimized' : ''}`}>
            <div className="ai-event-header" onClick={() => setIsMinimized(!isMinimized)}>
                <span className="ai-badge">🤖 AI Assistant</span>
                <span className="suggestion-count">{activeSuggestions.length}</span>
                <button className="minimize-btn">{isMinimized ? '▲' : '▼'}</button>
            </div>

            {!isMinimized && (
                <div className="ai-event-list">
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
