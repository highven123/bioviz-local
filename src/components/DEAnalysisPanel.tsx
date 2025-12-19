import React, { useState, useEffect } from 'react';
import './DEAnalysisPanel.css';

interface DEAnalysisPanelProps {
    sendCommand: (cmd: string, data?: Record<string, unknown>, waitForResponse?: boolean) => Promise<any>;
    isConnected: boolean;
    lastResponse?: any;
    currentFilePath?: string;
    onAnalysisComplete?: (results: any) => void;
    onReset?: () => void;
}

export const DEAnalysisPanel: React.FC<DEAnalysisPanelProps> = ({
    sendCommand,
    isConnected,
    lastResponse,
    currentFilePath,
    onAnalysisComplete,
    onReset,
}) => {
    const [columns, setColumns] = useState<string[]>([]);
    const [group1, setGroup1] = useState<string[]>([]);
    const [group2, setGroup2] = useState<string[]>([]);
    const [method, setMethod] = useState<'auto' | 'ttest' | 'deseq2'>('auto');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // Get columns when file changes or panel loads
    useEffect(() => {
        if (currentFilePath && isConnected) {
            fetchColumns();
        }
    }, [currentFilePath, isConnected]);

    const fetchColumns = async () => {
        setIsLoading(true);
        try {
            // We use the LOAD command to just get headers if not already available
            // In a real app, we might already have this from the wizard
            await sendCommand('LOAD', { path: currentFilePath });
        } catch (err) {
            setError(`Failed to fetch columns: ${err}`);
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!lastResponse) return;

        if (lastResponse.cmd === 'LOAD' && lastResponse.status === 'ok') {
            setColumns(lastResponse.columns || []);
            setIsLoading(false);
        }

        if (lastResponse.cmd === 'DE_ANALYSIS') {
            setIsLoading(false);
            if (lastResponse.status === 'ok') {
                setResults(lastResponse);
                setError(null);
                if (onAnalysisComplete) {
                    onAnalysisComplete(lastResponse);
                }
            } else {
                setError(lastResponse.message || 'DE Analysis failed');
            }
        }
    }, [lastResponse]);

    const handleRunDE = async () => {
        if (group1.length === 0 || group2.length === 0) {
            alert('Please select samples for both groups.');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            await sendCommand('DE_ANALYSIS', {
                counts_path: currentFilePath,
                group1_samples: group1,
                group2_samples: group2,
                method: method
            });
        } catch (err) {
            setError(`Analysis trigger failed: ${err}`);
            setIsLoading(false);
        }
    };

    const toggleSample = (sample: string, group: 1 | 2) => {
        if (group === 1) {
            setGroup1(prev => prev.includes(sample) ? prev.filter(s => s !== sample) : [...prev, sample]);
            // Remove from group 2 if it's there
            setGroup2(prev => prev.filter(s => s !== sample));
        } else {
            setGroup2(prev => prev.includes(sample) ? prev.filter(s => s !== sample) : [...prev, sample]);
            // Remove from group 1 if it's there
            setGroup1(prev => prev.filter(s => s !== sample));
        }
    };

    return (
        <div className="de-panel">
            <div className="de-header">
                <h3>🧪 Differential Expression Analysis</h3>
                <p className="de-subtitle">Perform statistical comparison between two groups of samples.</p>
            </div>

            <div className="de-content">
                <div className="de-config-grid">
                    <div className="de-method-selector">
                        <label>Analysis Method:</label>
                        <select value={method} onChange={(e) => setMethod(e.target.value as any)}>
                            <option value="auto">Auto (Best available)</option>
                            <option value="ttest">Welch's t-test (Fast, local)</option>
                            <option value="deseq2">DESeq2 (Robust, requires pyDESeq2)</option>
                        </select>
                    </div>
                </div>

                <div className="sample-selection-area">
                    <div className="sample-box">
                        <h4>Group 1 (Control / Baseline)</h4>
                        <div className="sample-list">
                            {columns.slice(1).map(col => (
                                <button
                                    key={`g1-${col}`}
                                    className={`sample-item ${group1.includes(col) ? 'active' : ''}`}
                                    onClick={() => toggleSample(col, 1)}
                                >
                                    {col}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="sample-box">
                        <h4>Group 2 (Experiment / Treatment)</h4>
                        <div className="sample-list">
                            {columns.slice(1).map(col => (
                                <button
                                    key={`g2-${col}`}
                                    className={`sample-item ${group2.includes(col) ? 'active' : ''}`}
                                    onClick={() => toggleSample(col, 2)}
                                >
                                    {col}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="de-actions">
                    <button
                        className="run-de-btn"
                        onClick={handleRunDE}
                        disabled={isLoading || !isConnected || group1.length === 0 || group2.length === 0}
                    >
                        {isLoading ? '⏳ Analyzing...' : '🚀 Run DE Analysis'}
                    </button>
                </div>

                {error && <div className="de-error">{error}</div>}

                {results && (
                    <>
                        <div className="de-results-summary">
                            <h4>Analysis Summary</h4>
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <span className="label">Total Genes</span>
                                    <span className="value">{results.summary?.total_genes || 0}</span>
                                </div>
                                <div className="stat-card up">
                                    <span className="label">🔺 Upregulated</span>
                                    <span className="value">{results.summary?.upregulated || 0}</span>
                                </div>
                                <div className="stat-card down">
                                    <span className="label">🔻 Downregulated</span>
                                    <span className="value">{results.summary?.downregulated || 0}</span>
                                </div>
                            </div>
                            <p className="method-note">Method used: <strong>{results.method}</strong></p>
                        </div>

                        <div className="de-results-table-container">
                            <div className="table-header-row">
                                <h4>Top Significant Entities</h4>
                                <span className="entity-count">{results.results?.length || 0} Total</span>
                            </div>
                            <div className="table-scroll">
                                <table className="de-results-table">
                                    <thead>
                                        <tr>
                                            <th>Entity</th>
                                            <th>Log2FC</th>
                                            <th>P-value</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.results?.slice(0, 50).sort((a: any, b: any) => (a.pvalue || 1) - (b.pvalue || 1)).map((r: any) => (
                                            <tr key={r.gene}>
                                                <td className="gene-name">{r.gene}</td>
                                                <td className={`fc-val ${r.log2FC > 0 ? 'up' : r.log2FC < 0 ? 'down' : ''}`}>
                                                    {r.log2FC?.toFixed(2)}
                                                </td>
                                                <td>{r.pvalue?.toExponential(2)}</td>
                                                <td>
                                                    <span className={`status-tag ${r.status}`}>
                                                        {r.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {results.results?.length > 50 && (
                                <p className="table-note">Showing top 50 by significance.</p>
                            )}
                        </div>

                        <button
                            className="reset-view-btn"
                            onClick={() => {
                                setResults(null);
                                if (onReset) onReset();
                            }}
                        >
                            清除分析结果
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};
