import React, { useState, useEffect } from 'react';
import { useBioEngine } from '../hooks/useBioEngine';
import GmtUploader from './GmtUploader';
import './EnrichmentPanel.css';

interface EnrichmentPanelProps {
    volcanoData?: any[];
    onEnrichmentComplete?: (results: any) => void;
    onPathwayClick?: (pathwayId: string, source: string) => void;
}

interface EnrichmentResult {
    pathway_id?: string;
    pathway_name: string;
    p_value: number;
    fdr: number;
    odds_ratio?: number;
    nes?: number;
    hit_genes: string[];
    overlap_ratio: string;
}

export const EnrichmentPanel: React.FC<EnrichmentPanelProps> = ({
    volcanoData,
    onEnrichmentComplete,
    onPathwayClick
}) => {
    const { sendCommand, lastResponse } = useBioEngine();

    const [method, setMethod] = useState<'ORA' | 'GSEA'>('ORA');
    const [geneSetSource, setGeneSetSource] = useState('reactome');
    const [species, setSpecies] = useState('human');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<EnrichmentResult[]>([]);
    const [intelligenceReport, setIntelligenceReport] = useState<any>(null);
    const [summary, setSummary] = useState<string | null>(null);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

    // Static list - could be dynamic from backend in future
    const availableSources = [
        { id: 'reactome', name: 'Reactome Pathways' },
        { id: 'wikipathways', name: 'WikiPathways' },
        { id: 'go_bp', name: 'GO Biological Process' },
        { id: 'kegg', name: 'KEGG (Custom GMT)' },
        { id: 'custom', name: '📁 Upload Custom GMT' }
    ];

    const [customGmtPath, setCustomGmtPath] = useState<string | null>(null);

    // Extract genes from volcano data
    const getGeneList = () => {
        if (!volcanoData || volcanoData.length === 0) return [];
        return volcanoData
            .filter(d => d.pvalue < 0.05)  // Significant genes
            .map(d => d.gene);
    };

    const getGeneRanking = () => {
        if (!volcanoData || volcanoData.length === 0) return {};
        const ranking: Record<string, number> = {};
        volcanoData.forEach(d => {
            // Ranking score = log2FC * -log10(pvalue)
            // In our volcanoData, x is log2FC and y is -log10(pvalue)
            const score = d.x * (d.y || 0);
            ranking[d.gene] = score;
        });
        return ranking;
    };

    // Handle response
    useEffect(() => {
        if (!lastResponse) return;

        if (lastResponse.cmd === 'ENRICH_RUN') {
            setIsLoading(false);
            if (lastResponse.status === 'ok') {
                const upReg = (lastResponse.up_regulated || []) as EnrichmentResult[];
                const downReg = (lastResponse.down_regulated || []) as EnrichmentResult[];
                const oraResults = (lastResponse.results || []) as EnrichmentResult[];
                const res: EnrichmentResult[] = method === 'ORA' ? oraResults : [...upReg, ...downReg];

                setResults(res);
                setIntelligenceReport(lastResponse.intelligence_report || null);
                const warnings = (lastResponse.warnings || []) as string[];
                setFeedback({
                    type: warnings.length > 0 ? 'warning' : 'success',
                    message: `Analysis complete. Found ${res.length} pathways. ${warnings.join('; ')}`
                });

                if (onEnrichmentComplete) {
                    onEnrichmentComplete(lastResponse);
                }
            } else {
                setFeedback({
                    type: 'error',
                    message: lastResponse.message || 'Enrichment analysis failed'
                });
            }
        } else if (lastResponse.cmd === 'SUMMARIZE_ENRICHMENT') {
            setIsSummarizing(false);
            if (lastResponse.status === 'ok') {
                setSummary(lastResponse.summary || null);
            }
        }
    }, [lastResponse, method, onEnrichmentComplete]);

    const generateSummary = async (enrichmentResults: EnrichmentResult[]) => {
        setIsSummarizing(true);
        setSummary(null);
        try {
            await sendCommand('SUMMARIZE_ENRICHMENT', {
                enrichment_data: enrichmentResults,
                volcano_data: volcanoData,
                method: method
            });
        } catch (err) {
            console.error('Failed to generate summary:', err);
            setIsSummarizing(false);
        }
    };

    const handleRunEnrichment = async () => {
        const genes = method === 'ORA' ? getGeneList() : getGeneRanking();

        if ((method === 'ORA' && genes.length === 0) ||
            (method === 'GSEA' && Object.keys(genes).length === 0)) {
            setFeedback({
                type: 'warning',
                message: 'No significant genes found. Load data first.'
            });
            return;
        }

        setIsLoading(true);
        setFeedback(null);
        setResults([]);
        setIntelligenceReport(null);
        setSummary(null);

        try {
            await sendCommand('ENRICH_RUN', {
                method,
                genes,
                gene_set_source: geneSetSource,
                species,
                custom_gmt_path: geneSetSource === 'custom' ? customGmtPath : undefined,
                parameters: {
                    p_cutoff: 0.05,
                    fdr_method: 'fdr_bh',
                    min_overlap: 3,
                    min_size: 5,
                    max_size: 500,
                    permutation_num: 1000
                }
            });
        } catch (err) {
            setFeedback({
                type: 'error',
                message: `Failed to run enrichment: ${err}`
            });
            setIsLoading(false);
        }
    };

    return (
        <div className="enrichment-panel">
            <div className="enrichment-header">
                <h3>🧬 Enrichment Analysis v2.0</h3>
            </div>

            {/* Method Selection */}
            <div className="enrichment-method">
                <label>Method</label>
                <div className="method-toggle">
                    <button
                        className={method === 'ORA' ? 'active' : ''}
                        onClick={() => setMethod('ORA')}
                    >
                        ORA
                    </button>
                    <button
                        className={method === 'GSEA' ? 'active' : ''}
                        onClick={() => setMethod('GSEA')}
                    >
                        GSEA
                    </button>
                </div>
            </div>

            {/* Source Selection */}
            <div className="enrichment-controls">
                <label>
                    Gene Set Source
                    <select
                        value={geneSetSource}
                        onChange={(e) => setGeneSetSource(e.target.value)}
                    >
                        {availableSources.map((src) => (
                            <option key={src.id} value={src.id}>
                                {src.name}
                            </option>
                        ))}
                    </select>
                </label>

                {/* Custom GMT Upload */}
                {geneSetSource === 'custom' && (
                    <div className="custom-gmt-section">
                        <GmtUploader
                            onGmtLoaded={(path, stats) => {
                                setCustomGmtPath(path);
                                setFeedback({
                                    type: 'success',
                                    message: `Loaded ${stats.geneSets} gene sets (${stats.totalGenes} total genes)`
                                });
                            }}
                            disabled={isLoading}
                        />
                    </div>
                )}

                <label>
                    Species
                    <select
                        value={species}
                        onChange={(e) => setSpecies(e.target.value)}
                    >
                        <option value="human">Human</option>
                        <option value="mouse">Mouse</option>
                        <option value="rat">Rat</option>
                        <option value="auto">Auto-detect</option>
                    </select>
                </label>
            </div>

            {/* Run Button */}
            <button
                className="enrichment-run-btn"
                onClick={handleRunEnrichment}
                disabled={isLoading}
            >
                {isLoading ? '⏳ Running...' : '▶️ Run Enrichment'}
            </button>

            {/* Feedback */}
            {feedback && (
                <div className={`enrichment-feedback ${feedback.type}`}>
                    {feedback.type === 'success' && <span className="feedback-icon">✅</span>}
                    {feedback.type === 'warning' && <span className="feedback-icon">⚠️</span>}
                    {feedback.type === 'error' && <span className="feedback-icon">❌</span>}
                    <div className="feedback-message">{feedback.message}</div>
                    <button className="feedback-close" onClick={() => setFeedback(null)}>×</button>
                </div>
            )}

            {/* Info */}
            <div className="enrichment-info">
                <span>📊 {volcanoData?.length || 0} genes loaded</span>
                <span>✓ {method === 'ORA' ? 'Over-Representation' : 'Gene Set Enrichment'}</span>
            </div>

            {/* Advanced Intelligence Report */}
            {intelligenceReport && (
                <div className="intelligence-report-box">
                    <div className="report-main-header">
                        <div className="summary-status">
                            <span className="status-dot"></span>
                            <span className="summary-text">{intelligenceReport.summary}</span>
                        </div>
                        {!summary && !isSummarizing && (
                            <button
                                className="ai-insight-btn"
                                onClick={() => generateSummary(results)}
                            >
                                ✨ AI Deep Analysis
                            </button>
                        )}
                    </div>

                    <div className="intelligence-details">
                        {intelligenceReport.drivers && intelligenceReport.drivers.length > 0 && (
                            <div className="insight-item">
                                <span className="insight-icon">🎯</span>
                                <div className="insight-content">
                                    <div className="insight-label">Key Drivers</div>
                                    <div className="insight-value">{intelligenceReport.drivers.map((d: any) => d.gene).join(', ')}</div>
                                    <div className="insight-note">Influencing {intelligenceReport.drivers[0].count} pathways</div>
                                </div>
                            </div>
                        )}

                        {intelligenceReport.orphans && intelligenceReport.orphans.length > 0 && (
                            <div className="insight-item">
                                <span className="insight-icon">🔍</span>
                                <div className="insight-content">
                                    <div className="insight-label">Orphan Genes</div>
                                    <div className="insight-value">{intelligenceReport.orphans.join(', ')}</div>
                                    <div className="insight-note">High impact, but not in top pathways</div>
                                </div>
                            </div>
                        )}

                        {intelligenceReport.antagonistic && intelligenceReport.antagonistic.length > 0 && (
                            <div className="insight-item warning-insight">
                                <span className="insight-icon">⚖️</span>
                                <div className="insight-content">
                                    <div className="insight-label">Antagonistic Regulation</div>
                                    <div className="insight-value">{intelligenceReport.antagonistic[0]}</div>
                                    <div className="insight-note">Pathways with mixed up/down regulation</div>
                                </div>
                            </div>
                        )}

                        {intelligenceReport.redundant_themes && intelligenceReport.redundant_themes.length > 0 && (
                            <div className="insight-item theme-insight">
                                <span className="insight-icon">📚</span>
                                <div className="insight-content">
                                    <div className="insight-label">Systemic Redundancy</div>
                                    <div className="insight-value">{intelligenceReport.redundant_themes.slice(0, 2).join(', ')}</div>
                                    <div className="insight-note">Multiple hits in related functional hubs</div>
                                </div>
                            </div>
                        )}

                        {intelligenceReport.silent_paths && intelligenceReport.silent_paths.length > 0 && (
                            <div className="insight-item precise-insight">
                                <span className="insight-icon">🎯</span>
                                <div className="insight-content">
                                    <div className="insight-label">Precise Regulation</div>
                                    <div className="insight-value">{intelligenceReport.silent_paths[0]}</div>
                                    <div className="insight-note">Significant despite very few active members</div>
                                </div>
                            </div>
                        )}

                        {intelligenceReport.full_details && intelligenceReport.full_details.length > 1 && (
                            <div className="additional-notes">
                                {intelligenceReport.full_details.slice(1).map((note: string, idx: number) => (
                                    <div key={idx} className="note-bullet">• {note}</div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* AI Summary Report */}
            {(isSummarizing || summary) && (
                <div className="enrichment-summary-report ai-report">
                    <div className="report-header">
                        <span className="report-icon">🤖</span>
                        <h4>AI Deep Insight Report</h4>
                        {isSummarizing && <div className="typing-dots"><span>.</span><span>.</span><span>.</span></div>}
                    </div>
                    {summary && (
                        <div className="report-content">
                            {summary.split('\n').map((line, i) => (
                                <p key={i}>{line}</p>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Results */}
            {results.length > 0 && (
                <div className="enrichment-results">
                    <div className="results-header">
                        <h4>Top Enriched Pathways ({results.length})</h4>
                        <button
                            className="export-btn"
                            onClick={async () => {
                                console.log('[Export] Starting export, results count:', results.length);

                                if (!results || results.length === 0) {
                                    setFeedback({ type: 'error', message: 'No results to export' });
                                    return;
                                }

                                try {
                                    // Export results as CSV
                                    const csvContent = [
                                        ['Pathway', 'P-value', 'FDR', method === 'ORA' ? 'Odds Ratio' : 'NES', 'Overlap', 'Top Genes'].join(','),
                                        ...results.map(r => [
                                            `"${r.pathway_name}"`,
                                            r.p_value?.toExponential(3) || '',
                                            r.fdr?.toFixed(4) || '',
                                            method === 'ORA' ? (r.odds_ratio?.toFixed(2) || '') : (r.nes?.toFixed(2) || ''),
                                            r.overlap_ratio || '',
                                            `"${(r.hit_genes || []).slice(0, 5).join(', ')}"`
                                        ].join(','))
                                    ].join('\n');

                                    console.log('[Export] CSV generated, length:', csvContent.length);

                                    // Use Tauri dialog API for cross-platform file saving
                                    const { save } = await import('@tauri-apps/plugin-dialog');
                                    const { writeTextFile } = await import('@tauri-apps/plugin-fs');

                                    const defaultName = `enrichment_${geneSetSource}_${new Date().toISOString().slice(0, 10)}.csv`;
                                    const filePath = await save({
                                        defaultPath: defaultName,
                                        filters: [{ name: 'CSV', extensions: ['csv'] }]
                                    });

                                    if (filePath) {
                                        await writeTextFile(filePath, csvContent);
                                        console.log('[Export] File saved to:', filePath);
                                        setFeedback({ type: 'success', message: `Results exported to: ${filePath}` });
                                    } else {
                                        console.log('[Export] User cancelled save dialog');
                                    }
                                } catch (err) {
                                    console.error('[Export] Error:', err);
                                    setFeedback({ type: 'error', message: `Export failed: ${err}` });
                                }
                            }}
                            title="Export to CSV"
                        >
                            📥 Export
                        </button>
                    </div>

                    <div className="results-table-container">
                        <table className="results-table">
                            <thead>
                                <tr>
                                    <th>Pathway</th>
                                    <th>P-value</th>
                                    <th>FDR</th>
                                    {method === 'ORA' && <th>Odds Ratio</th>}
                                    {method === 'GSEA' && <th>NES</th>}
                                    <th>Overlap</th>
                                    <th>Genes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.slice(0, 20).map((result, idx) => (
                                    <tr key={idx}>
                                        <td className="pathway-name">
                                            {geneSetSource === 'reactome' ? (
                                                <button
                                                    className="pathway-link"
                                                    onClick={() => {
                                                        // Use pathway name for search since gseapy doesn't include Reactome IDs
                                                        onPathwayClick?.(result.pathway_name, 'reactome');
                                                    }}
                                                    title="Click to search and view pathway diagram"
                                                >
                                                    {result.pathway_name}
                                                </button>
                                            ) : (
                                                result.pathway_name
                                            )}
                                        </td>
                                        <td>{result.p_value.toExponential(2)}</td>
                                        <td>{result.fdr.toFixed(4)}</td>
                                        {method === 'ORA' && <td>{result.odds_ratio?.toFixed(2)}</td>}
                                        {method === 'GSEA' && <td>{result.nes?.toFixed(2)}</td>}
                                        <td>{result.overlap_ratio}</td>
                                        <td className="hit-genes">
                                            {(result.hit_genes || []).slice(0, 5).join(', ')}
                                            {(result.hit_genes || []).length > 5 && '...'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
