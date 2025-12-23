/**
 * NarrativePanel - AI Mechanistic Narrative Generator
 * 
 * Converts enrichment results into paper-ready biological narrative reports.
 * Phase 2 of the BioViz AI Platform.
 */

import { useState } from 'react';
import { useBioEngine } from '../hooks/useBioEngine';
import './NarrativePanel.css';

interface NarrativePanelProps {
    /** Enrichment results to analyze */
    enrichmentResults?: any[];
    /** Callback when analysis completes */
    onComplete?: (narrative: string) => void;
}

export function NarrativePanel({ enrichmentResults, onComplete }: NarrativePanelProps) {

    const { runNarrativeAnalysis, isLoading } = useBioEngine();

    const [narrative, setNarrative] = useState<string | null>(null);
    const [modulesFound, setModulesFound] = useState<number>(0);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        setIsGenerating(true);
        setError(null);
        setNarrative(null);

        try {
            const response = await runNarrativeAnalysis(enrichmentResults) as any;

            // Response format: {status: "ok", result: {status: "completed", narrative: "..."}}
            if (response?.status === 'ok' && response?.result?.status === 'completed') {
                setNarrative(response.result.narrative);
                setModulesFound(response.result.modules_found || 0);
                onComplete?.(response.result.narrative);
            } else if (response?.status === 'error' || response?.result?.status === 'error') {
                setError(response.error || response.message || response.result?.error || 'Analysis failed');
            } else {
                console.log('Unexpected response:', response);
                setError('Unexpected response from backend');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setIsGenerating(false);
        }
    };


    const handleCopy = () => {
        if (narrative) {
            navigator.clipboard.writeText(narrative);
        }
    };

    return (
        <div className="narrative-panel">
            <div className="narrative-header">
                <h3>📝 Mechanistic Narrative</h3>
                <span className="narrative-badge">AI Analysis</span>
            </div>

            <div className="narrative-description">
                Generate a paper-ready biological narrative from your enrichment results.
                The AI will identify key functional modules and synthesize mechanistic insights.
            </div>

            <button
                className="narrative-generate-btn"
                onClick={handleGenerate}
                disabled={isGenerating || isLoading}
            >
                {isGenerating ? (
                    <>
                        <span className="spinner"></span>
                        Generating Report...
                    </>
                ) : (
                    <>
                        🧬 Generate Narrative Report
                    </>
                )}
            </button>

            {error && (
                <div className="narrative-error">
                    ❌ {error}
                </div>
            )}

            {narrative && (
                <div className="narrative-result">
                    <div className="narrative-stats">
                        <span className="stat-item">
                            📊 {modulesFound} Functional Modules Identified
                        </span>
                        <button className="copy-btn" onClick={handleCopy} title="Copy to clipboard">
                            📋 Copy
                        </button>
                    </div>

                    <div className="narrative-content">
                        {/* Render markdown-like content */}
                        {narrative.split('\n').map((line, idx) => {
                            if (line.startsWith('### ')) {
                                return <h3 key={idx}>{line.replace('### ', '')}</h3>;
                            }
                            if (line.startsWith('**') && line.endsWith('**')) {
                                return <h4 key={idx}>{line.replace(/\*\*/g, '')}</h4>;
                            }
                            if (line.startsWith('*') && line.endsWith('*')) {
                                return <em key={idx}>{line.replace(/\*/g, '')}</em>;
                            }
                            if (line.trim() === '') {
                                return <br key={idx} />;
                            }
                            return <p key={idx}>{line}</p>;
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export default NarrativePanel;
