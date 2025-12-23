/**
 * SingleCellPanel - Single-Cell Analysis Interface
 * 
 * Provides UI for loading AnnData files and running single-cell contextual analysis.
 * Phase 3 of the BioViz AI Platform.
 */

import { useState } from 'react';
import { useBioEngine } from '../hooks/useBioEngine';
import { open } from '@tauri-apps/plugin-dialog';
import './SingleCellPanel.css';

interface SingleCellPanelProps {
    /** Callback when analysis completes */
    onComplete?: (result: any) => void;
}

interface SCAnalysisResult {
    metadata: {
        n_cells: number;
        n_genes: number;
        has_spatial: boolean;
        has_pseudotime: boolean;
    };
    lr_interactions: any[];
    trajectory: {
        dynamic_pathways: string[];
    };
}

export function SingleCellPanel({ onComplete }: SingleCellPanelProps) {
    const { runSingleCellAnalysis, isLoading } = useBioEngine();

    const [filePath, setFilePath] = useState<string | null>(null);
    const [clusterKey, setClusterKey] = useState('cell_type');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<SCAnalysisResult | null>(null);

    const handleSelectFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'AnnData',
                    extensions: ['h5ad']
                }]
            });

            if (selected && typeof selected === 'string') {
                setFilePath(selected);
                setResult(null);
                setError(null);
            }
        } catch (e) {
            console.error('File selection failed:', e);
        }
    };

    const handleAnalyze = async () => {
        if (!filePath) return;

        setIsAnalyzing(true);
        setError(null);
        setResult(null);

        try {
            const response = await runSingleCellAnalysis(filePath, { clusterKey }) as any;

            // Response format: {status: "ok", result: {status: "completed", metadata: {...}}}
            if (response?.status === 'ok' && response?.result?.status === 'completed') {
                setResult(response.result);
                onComplete?.(response.result);
            } else if (response?.status === 'error' || response?.result?.status === 'error') {
                setError(response.error || response.message || response.result?.error || 'Analysis failed');
            } else {
                console.log('Unexpected response:', response);
                setError('Unexpected response from backend');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setIsAnalyzing(false);
        }
    };


    const getFileName = (path: string) => {
        return path.split('/').pop() || path;
    };

    return (
        <div className="sc-panel">
            <div className="sc-header">
                <h3>🧬 Single-Cell Analysis</h3>
                <span className="sc-badge">Phase 3</span>
            </div>

            <div className="sc-description">
                Load an AnnData (.h5ad) file to compute pathway activity scores,
                detect spatial ligand-receptor interactions, and map dynamics onto trajectories.
            </div>

            {/* File Selector */}
            <div className="sc-file-section">
                <div className="sc-file-label">AnnData File</div>
                <button
                    className="sc-file-btn"
                    onClick={handleSelectFile}
                    disabled={isAnalyzing}
                >
                    📂 {filePath ? getFileName(filePath) : 'Select .h5ad File'}
                </button>
            </div>

            {/* Parameters */}
            {filePath && (
                <div className="sc-params">
                    <div className="sc-param-row">
                        <label>Cluster Column</label>
                        <input
                            type="text"
                            value={clusterKey}
                            onChange={(e) => setClusterKey(e.target.value)}
                            placeholder="e.g. cell_type, leiden"
                        />
                    </div>
                </div>
            )}

            {/* Analyze Button */}
            <button
                className="sc-analyze-btn"
                onClick={handleAnalyze}
                disabled={!filePath || isAnalyzing || isLoading}
            >
                {isAnalyzing ? (
                    <>
                        <span className="spinner"></span>
                        Analyzing...
                    </>
                ) : (
                    <>
                        🔬 Run Single-Cell Analysis
                    </>
                )}
            </button>

            {/* Error Display */}
            {error && (
                <div className="sc-error">
                    ❌ {error}
                </div>
            )}

            {/* Results Display */}
            {result && (
                <div className="sc-results">
                    <div className="sc-result-header">
                        ✅ Analysis Complete
                    </div>

                    {/* Metadata Summary */}
                    <div className="sc-stats-grid">
                        <div className="sc-stat">
                            <div className="sc-stat-value">{result.metadata?.n_cells?.toLocaleString() || 0}</div>
                            <div className="sc-stat-label">Cells</div>
                        </div>
                        <div className="sc-stat">
                            <div className="sc-stat-value">{result.metadata?.n_genes?.toLocaleString() || 0}</div>
                            <div className="sc-stat-label">Genes</div>
                        </div>
                        <div className="sc-stat">
                            <div className="sc-stat-value">{result.lr_interactions?.length || 0}</div>
                            <div className="sc-stat-label">L-R Pairs</div>
                        </div>
                        <div className="sc-stat">
                            <div className="sc-stat-value">{result.trajectory?.dynamic_pathways?.length || 0}</div>
                            <div className="sc-stat-label">Dynamic Pathways</div>
                        </div>
                    </div>

                    {/* Feature Badges */}
                    <div className="sc-features">
                        <span className={`sc-feature ${result.metadata?.has_spatial ? 'active' : 'inactive'}`}>
                            📍 Spatial: {result.metadata?.has_spatial ? 'Yes' : 'No'}
                        </span>
                        <span className={`sc-feature ${result.metadata?.has_pseudotime ? 'active' : 'inactive'}`}>
                            ⏱️ Trajectory: {result.metadata?.has_pseudotime ? 'Yes' : 'No'}
                        </span>
                    </div>

                    {/* L-R Interactions Preview */}
                    {result.lr_interactions && result.lr_interactions.length > 0 && (
                        <div className="sc-lr-section">
                            <h4>🔗 Top Ligand-Receptor Interactions</h4>
                            <div className="sc-lr-list">
                                {result.lr_interactions.slice(0, 5).map((lr: any, idx: number) => (
                                    <div key={idx} className="sc-lr-item">
                                        <span className="sc-lr-pair">{lr.ligand} → {lr.receptor}</span>
                                        <span className="sc-lr-pathway">{lr.pathway}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Dynamic Pathways Preview */}
                    {result.trajectory?.dynamic_pathways && result.trajectory.dynamic_pathways.length > 0 && (
                        <div className="sc-trajectory-section">
                            <h4>📈 Dynamic Pathways (High Variance Over Time)</h4>
                            <div className="sc-pathway-chips">
                                {result.trajectory.dynamic_pathways.map((pw: string, idx: number) => (
                                    <span key={idx} className="sc-pathway-chip">{pw}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default SingleCellPanel;
