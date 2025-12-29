import React, { useState, useEffect, useRef } from 'react';
import { useBioEngine } from '../hooks/useBioEngine';
import GmtUploader from './GmtUploader';
import UpSetPlot from './UpSetPlot';
import './EnrichmentPanel.css';
import { useI18n } from '../i18n';
import { eventBus, BioVizEvents } from '../stores/eventBus';

interface EnrichmentPanelProps {
    volcanoData?: any[];
    filePath?: string;
    multiSampleSets?: Array<{ label: string; genes: string[] }>;
    summary?: string;
    onEnrichmentComplete?: (results: any) => void;
    onPathwayClick?: (pathwayId: string, source: string, metadata?: { pathway_name?: string; hit_genes?: string[] }) => void;
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

const ENRICHMENT_DEFAULTS = {
    p_cutoff: 0.05,
    fdr_method: 'fdr_bh',
    min_overlap: 3,
    min_size: 5,
    max_size: 500,
    permutation_num: 1000
};

export const EnrichmentPanel: React.FC<EnrichmentPanelProps> = ({
    volcanoData,
    filePath,
    multiSampleSets = [],
    summary: summaryFromProps,
    onEnrichmentComplete,
    onPathwayClick
}) => {
    const { sendCommand, lastResponse } = useBioEngine();
    const { t } = useI18n();

    const [method, setMethod] = useState<'ORA' | 'GSEA'>('ORA');
    const [geneSetSource, setGeneSetSource] = useState('reactome');
    const [species, setSpecies] = useState('human');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<EnrichmentResult[]>([]);
    const [intelligenceReport, setIntelligenceReport] = useState<any>(null);
    const [summary, setSummary] = useState<string | null>(null);
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [summaryStale, setSummaryStale] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
    const [metadata, setMetadata] = useState<any | null>(null);
    const [fusionStats, setFusionStats] = useState<{ original: number; modules: number } | null>(null);
    const [runTimeSec, setRunTimeSec] = useState<number | null>(null);
    const [viewMode, setViewMode] = useState<'table' | 'upset'>('table');
    const [upsetSource, setUpsetSource] = useState<'current' | 'fusion' | 'multisample'>('current');
    const [upsetMaxSets, setUpsetMaxSets] = useState(3);
    const [upsetSelection, setUpsetSelection] = useState<string[]>([]);
    const summaryRef = useRef<HTMLDivElement>(null);

    // Static list - could be dynamic from backend in future
    const availableSources = [
        { id: 'fusion', name: t('✨ BioViz Multi-Source Fusion') },
        { id: 'reactome', name: t('Reactome Pathways') },
        { id: 'wikipathways', name: t('WikiPathways') },
        { id: 'go_bp', name: t('GO Biological Process') },
        { id: 'kegg', name: t('KEGG (Custom GMT)') },
        { id: 'custom', name: t('📁 Upload Custom GMT') }
    ];

    const [customGmtPath, setCustomGmtPath] = useState<string | null>(null);
    const activeProcessRef = React.useRef<string | null>(null);
    const processTimersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);

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

    const clearProcessTimers = () => {
        processTimersRef.current.forEach((id) => clearTimeout(id));
        processTimersRef.current = [];
    };

    const buildProcessSteps = () => {
        if (geneSetSource === 'fusion') {
            return [
                t('Merging multi-source gene sets...'),
                t('Deduplicating overlapping terms...'),
                t('FDR adjustment (BH-FDR)...')
            ];
        }
        return [
            t('Extracting signature...'),
            t('Hypergeometric test...'),
            t('FDR adjustment (BH-FDR)...')
        ];
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
                setMetadata(lastResponse.metadata || null);
                setFusionStats(null);
                const elapsed = Number((lastResponse as any)?.metadata?.elapsed_time ?? (lastResponse as any)?.metadata?.runtime);
                setRunTimeSec(Number.isFinite(elapsed) ? elapsed : null);
                const warnings = (lastResponse.warnings || []) as string[];
                setFeedback({
                    type: warnings.length > 0 ? 'warning' : 'success',
                    message: t('Analysis complete. Found {count} pathways. {warnings}', {
                        count: res.length,
                        warnings: warnings.join('; ')
                    })
                });

                if (onEnrichmentComplete) {
                    onEnrichmentComplete(lastResponse);
                }
            } else {
                setFeedback({
                    type: 'error',
                    message: lastResponse.message || t('Enrichment analysis failed')
                });
            }
            if (activeProcessRef.current) {
                eventBus.emit(BioVizEvents.AI_PROCESS_COMPLETE, {
                    taskId: activeProcessRef.current,
                    status: lastResponse.status === 'ok' ? 'success' : 'error'
                });
                activeProcessRef.current = null;
                clearProcessTimers();
            }
        } else if (lastResponse.cmd === 'ENRICH_FUSION_RUN') {
            setIsLoading(false);
            if (lastResponse.status === 'ok') {
                // Fusion results are structured as modules
                const fusionResults = (lastResponse.fusion_results || []) as any[];

                // Map fusion modules to a compatible format for basic ranking but keep full structure
                setResults(fusionResults.map(m => ({
                    pathway_name: m.representative_term,
                    p_value: m.p_value,
                    fdr: m.fdr,
                    hit_genes: m.genes,
                    overlap_ratio: `${m.members?.[0]?.overlap_ratio || 'n/a'} (Fusion)`,
                    isFused: true,
                    members: m.members,
                    source: m.source
                } as any)));

                setMetadata(lastResponse.metadata || { sources: lastResponse.sources });
                setFusionStats({
                    original: Number(lastResponse.total_original_terms || 0),
                    modules: Number(lastResponse.total_modules || 0)
                });
                const elapsed = Number((lastResponse as any)?.metadata?.elapsed_time ?? (lastResponse as any)?.metadata?.runtime);
                setRunTimeSec(Number.isFinite(elapsed) ? elapsed : null);
                setFeedback({
                    type: 'success',
                    message: t('Fusion complete. Consolidated {terms} terms into {modules} biological modules.', {
                        terms: String((lastResponse as any).total_original_terms || 0),
                        modules: String((lastResponse as any).total_modules || 0)
                    })
                });

                if (onEnrichmentComplete) {
                    onEnrichmentComplete(lastResponse);
                }
            } else {
                setFeedback({ type: 'error', message: lastResponse.message || t('Fusion analysis failed') });
            }
            if (activeProcessRef.current) {
                eventBus.emit(BioVizEvents.AI_PROCESS_COMPLETE, {
                    taskId: activeProcessRef.current,
                    status: lastResponse.status === 'ok' ? 'success' : 'error'
                });
                activeProcessRef.current = null;
                clearProcessTimers();
            }
        } else if (lastResponse.cmd === 'SUMMARIZE_ENRICHMENT') {
            setIsSummarizing(false);
            if (lastResponse.status === 'ok') {
                setSummary(lastResponse.summary || null);
                onEnrichmentComplete?.(lastResponse);
            }
        }
    }, [lastResponse, method]);

    useEffect(() => {
        const resolvedSummary = summary || summaryFromProps;
        if (!resolvedSummary) return;
        const timer = window.setTimeout(() => {
            summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        return () => window.clearTimeout(timer);
    }, [summary, summaryFromProps]);

    useEffect(() => {
        setSummary(null);
        setIsSummaryOpen(false);
        setIsSummarizing(false);
        setSummaryStale(true);
    }, [geneSetSource, method]);

    useEffect(() => {
        if (!summaryFromProps) return;
        setSummaryStale(false);
    }, [summaryFromProps]);

    const displaySummary = summary || (!summaryStale ? summaryFromProps : null);

    const resolvedPCutoff = Number(metadata?.parameters?.p_cutoff ?? ENRICHMENT_DEFAULTS.p_cutoff) || ENRICHMENT_DEFAULTS.p_cutoff;
    const resolvedFdrMethod = (metadata?.parameters?.fdr_method || ENRICHMENT_DEFAULTS.fdr_method) as string;
    const estimateConfidence = (fdr: number | null) => {
        if (fdr === null || Number.isNaN(fdr)) return 0.5;
        if (fdr <= 0.001) return 0.9;
        if (fdr <= 0.01) return 0.8;
        if (fdr <= 0.05) return 0.65;
        return 0.5;
    };
    const topFdr = results.length > 0 ? Math.min(...results.map((r) => r.fdr ?? 1)) : null;
    const confidenceScore = estimateConfidence(topFdr);
    const confidencePercent = Math.round(confidenceScore * 100);

    const generateSummary = async (enrichmentResults: EnrichmentResult[]) => {
        setIsSummarizing(true);
        setSummary(null);
        try {
            await sendCommand('SUMMARIZE_ENRICHMENT', {
                enrichment_data: enrichmentResults,
                volcano_data: volcanoData,
                method: method,
                metadata: {
                    ...(metadata || {}),
                    gene_set_source: geneSetSource
                }
            });
        } catch (err) {
            console.error('Failed to generate summary:', err);
            setIsSummarizing(false);
        }
    };

    const availableUpSetSets = React.useMemo(() => {
        if (upsetSource === 'multisample') {
            return multiSampleSets || [];
        }
        if (!results || results.length === 0) return [];
        return results
            .filter(r => r.hit_genes && r.hit_genes.length > 0)
            .map((r, idx) => {
                const genes = Array.isArray(r.hit_genes)
                    ? r.hit_genes
                    : String(r.hit_genes || '').split(',').map(g => g.trim()).filter(Boolean);
                return {
                    label: r.pathway_name || `Set ${idx + 1}`,
                    genes
                };
            });
    }, [results, upsetSource, multiSampleSets]);

    const buildUpSetSets = () => {
        const limit = Math.max(2, Math.min(4, upsetMaxSets));
        if (!availableUpSetSets.length) return [];
        if (upsetSelection.length > 0) {
            return availableUpSetSets
                .filter((s) => upsetSelection.includes(s.label))
                .slice(0, limit);
        }
        return availableUpSetSets.slice(0, limit);
    };

    useEffect(() => {
        if (upsetSource === 'multisample') {
            setViewMode('upset');
        }
    }, [upsetSource]);

    const handleRunEnrichment = async () => {
        const genes = method === 'ORA' ? getGeneList() : getGeneRanking();

        if ((method === 'ORA' && genes.length === 0) ||
            (method === 'GSEA' && Object.keys(genes).length === 0)) {
            setFeedback({
                type: 'warning',
                message: t('No significant genes found. Load data first.')
            });
            return;
        }

        setIsLoading(true);
        setFeedback(null);
        setResults([]);
        setIntelligenceReport(null);
        setSummary(null);
        setMetadata(null);

        try {
            clearProcessTimers();
            const taskId = `enrich_${Date.now()}`;
            const steps = buildProcessSteps();
            activeProcessRef.current = taskId;
            eventBus.emit(BioVizEvents.AI_PROCESS_START, {
                taskId,
                taskName: t('Enrichment Analysis'),
                steps
            });
            processTimersRef.current.push(setTimeout(() => {
                eventBus.emit(BioVizEvents.AI_PROCESS_UPDATE, { taskId, stepIndex: 1 });
            }, 600));
            processTimersRef.current.push(setTimeout(() => {
                eventBus.emit(BioVizEvents.AI_PROCESS_UPDATE, { taskId, stepIndex: 2 });
            }, 1400));

            if (geneSetSource === 'fusion') {
                await sendCommand('ENRICH_FUSION_RUN', {
                    method,
                    genes,
                    sources: ['reactome', 'kegg', 'wikipathways', 'go_bp'],
                    species,
                    parameters: ENRICHMENT_DEFAULTS,
                    file_path: filePath
                });
            } else {
                await sendCommand('ENRICH_RUN', {
                    method,
                    genes,
                    gene_set_source: geneSetSource,
                    species,
                    custom_gmt_path: geneSetSource === 'custom' ? customGmtPath : undefined,
                    parameters: ENRICHMENT_DEFAULTS,
                    file_path: filePath
                });
            }
        } catch (err) {
            setFeedback({
                type: 'error',
                message: `Failed to run enrichment: ${err}`
            });
            setIsLoading(false);
            if (activeProcessRef.current) {
                eventBus.emit(BioVizEvents.AI_PROCESS_COMPLETE, {
                    taskId: activeProcessRef.current,
                    status: 'error'
                });
                activeProcessRef.current = null;
                clearProcessTimers();
            }
        }
    };

    return (
        <div className="enrichment-panel">
            <div className="enrichment-header">
                <h3>🧬 {t('Enrichment Analysis')}</h3>
            </div>

            {/* Method Selection */}
            <div className="enrichment-method">
                <label>{t('Method')}</label>
                <div className="method-toggle">
                    <button
                        className={method === 'ORA' ? 'active' : ''}
                        onClick={() => setMethod('ORA')}
                    >
                        {t('ORA')}
                    </button>
                    <button
                        className={method === 'GSEA' ? 'active' : ''}
                        onClick={() => setMethod('GSEA')}
                    >
                        {t('GSEA')}
                    </button>
                </div>
            </div>

            {/* Source Selection */}
            <div className="enrichment-controls">
                <label>
                    {t('Gene Set Source')}
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
                                    message: t('Loaded {sets} gene sets ({genes} total genes)', {
                                        sets: stats.geneSets,
                                        genes: stats.totalGenes
                                    })
                                });
                            }}
                            disabled={isLoading}
                        />
                    </div>
                )}

                <label>
                    {t('Species')}
                    <select
                        value={species}
                        onChange={(e) => setSpecies(e.target.value)}
                    >
                        <option value="human">{t('Human')}</option>
                        <option value="mouse">{t('Mouse')}</option>
                        <option value="rat">{t('Rat')}</option>
                        <option value="auto">{t('Auto-detect')}</option>
                    </select>
                </label>
            </div>

            {/* Run Button */}
            <button
                className="enrichment-run-btn"
                onClick={handleRunEnrichment}
                disabled={isLoading}
            >
                {isLoading ? t('⏳ Running...') : t('▶️ Run Enrichment')}
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

            {displaySummary && (
                <div className="enrichment-summary-banner">
                    <span className="summary-banner-icon">🤖</span>
                    <span className="summary-banner-text">{t('AI summary ready')}</span>
                    <button
                        className="summary-banner-action"
                        onClick={() => {
                            setIsSummaryOpen(true);
                            summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                    >
                        {t('View summary')}
                    </button>
                </div>
            )}

            {displaySummary && isSummaryOpen && (
                <div className="enrichment-summary-modal">
                    <button
                        className="summary-modal-close"
                        onClick={() => setIsSummaryOpen(false)}
                        type="button"
                        aria-label={t('Close')}
                    >
                        ×
                    </button>
                    <div className="summary-modal-content">
                        <div className="summary-modal-header">
                            <span className="summary-modal-title">🤖 {t('AI Deep Insight Report')}</span>
                        </div>
                        <div className="summary-modal-body">
                            {displaySummary.split('\n').map((line, i) => (
                                <p key={i}>{line}</p>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* AI Summary Report */}
            {(isSummarizing || displaySummary) && (
                <div className="enrichment-summary-report ai-report" ref={summaryRef}>
                    <div className="report-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className="report-icon">🤖</span>
                            <h4>{t('AI Deep Insight Report')}</h4>
                        </div>
                        {intelligenceReport && (
                            <button
                                className="studio-report-btn"
                                onClick={() => (onEnrichmentComplete as any)?.({
                                    type: 'TOGGLE_STUDIO_VIEW',
                                    data: intelligenceReport
                                })}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '11px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--brand-primary)',
                                    background: 'rgba(99, 102, 241, 0.1)',
                                    color: 'var(--brand-primary)',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                🔍 {t('Full Studio Report')}
                            </button>
                        )}
                        {isSummarizing && <div className="typing-dots"><span>.</span><span>.</span><span>.</span></div>}
                    </div>
                    {displaySummary && (
                        <div className="report-content">
                            {displaySummary.split('\n').map((line, i) => (
                                <p key={i}>{line}</p>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Info */}
            <div className="enrichment-info">
                <span>📊 {volcanoData?.length || 0} genes loaded</span>
                <span>✓ {method === 'ORA' ? t('Over-Representation') : t('Gene Set Enrichment')}</span>
                {fusionStats && (
                    <span className="info-badge">
                        🔁 {t('Deduplicated')} {fusionStats.original} → {fusionStats.modules}
                    </span>
                )}
            </div>
            <div className="enrichment-trust">
                <div className="confidence-row">
                    <span className="confidence-label">{t('Confidence')}</span>
                    <div className="confidence-bar">
                        <div className="confidence-fill" style={{ width: `${confidencePercent}%` }} />
                    </div>
                    <span className="confidence-value">{confidencePercent}%</span>
                </div>
                <div className="efficiency-row">
                    <span className="efficiency-label">{t('Efficiency')}</span>
                    <span className="efficiency-value">
                        {runTimeSec !== null
                            ? t('Runtime {seconds}s (manual ~30 min)', { seconds: runTimeSec.toFixed(1) })
                            : t('Manual ~30 min')}
                    </span>
                </div>
            </div>

            {/* Metadata & QC */}
            <div className="enrichment-meta">
                <div className="meta-row">
                    <span className="meta-pill primary">
                        {availableSources.find(s => s.id === geneSetSource)?.name || geneSetSource}
                        {metadata?.gene_set_version ? ` • ${metadata.gene_set_version}` : ` • ${t('cache pending')}`}
                    </span>
                    <span
                        className="meta-pill algorithm-badge"
                        title={t('Hypergeometric Test with Benjamini-Hochberg FDR correction')}
                    >
                        📐 {t('Hypergeometric Test + BH-FDR')}
                    </span>
                    <span className="meta-pill">
                        {t('Species')}: {metadata?.input_summary?.species || species}
                    </span>
                    <span className="meta-pill">
                        {t('Background')}: {metadata?.input_summary?.total_genes || metadata?.output_summary?.total_pathways || t('auto-detect')}
                    </span>
                    <span className="meta-pill accent">
                        p-threshold: {resolvedPCutoff.toFixed(2)} (FDR: {resolvedFdrMethod})
                    </span>
                </div>
                {metadata?.gene_set_download_date && (
                    <div className="meta-sub">
                        {t('Downloaded')}: {metadata.gene_set_download_date} | {t('Hash')}: {metadata.gene_set_hash || 'n/a'}
                    </div>
                )}
            </div>

            {/* Advanced Intelligence Report */}
            {intelligenceReport && (
                <div className="intelligence-report-box">
                    <div className="report-main-header">
                        <div className="summary-status">
                            <span className="status-dot"></span>
                            <span className="summary-text">
                                {isSummarizing ? t('AI Deep Analysis in progress') : intelligenceReport.summary}
                            </span>
                        </div>
                        {!summary && !isSummarizing && (
                            <button
                                className="ai-insight-btn"
                                onClick={() => generateSummary(results)}
                            >
                                ✨ {t('AI Deep Analysis')}
                            </button>
                        )}
                        {isSummarizing && (
                            <button className="ai-insight-btn" disabled>
                                ✨ {t('Analyzing...')}
                            </button>
                        )}
                    </div>

                    <div className="intelligence-details">
                        {intelligenceReport.drivers && intelligenceReport.drivers.length > 0 && (
                            <div className="insight-item">
                                <span className="insight-icon">🎯</span>
                                <div className="insight-content">
                                    <div className="insight-label">{t('Key Drivers')}</div>
                                    <div className="insight-value">{intelligenceReport.drivers.map((d: any) => d.gene).join(', ')}</div>
                                    <div className="insight-note">{t('Influencing {count} pathways', { count: intelligenceReport.drivers[0].count })}</div>
                                </div>
                            </div>
                        )}

                        {intelligenceReport.orphans && intelligenceReport.orphans.length > 0 && (
                            <div className="insight-item">
                                <span className="insight-icon">🔍</span>
                                <div className="insight-content">
                                    <div className="insight-label">{t('Orphan Genes')}</div>
                                    <div className="insight-value">{intelligenceReport.orphans.join(', ')}</div>
                                    <div className="insight-note">{t('High impact, but not in top pathways')}</div>
                                </div>
                            </div>
                        )}

                        {intelligenceReport.antagonistic && intelligenceReport.antagonistic.length > 0 && (
                            <div className="insight-item warning-insight">
                                <span className="insight-icon">⚖️</span>
                                <div className="insight-content">
                                    <div className="insight-label">{t('Antagonistic Regulation')}</div>
                                    <div className="insight-value">{intelligenceReport.antagonistic[0]}</div>
                                    <div className="insight-note">{t('Pathways with mixed up/down regulation')}</div>
                                </div>
                            </div>
                        )}

                        {intelligenceReport.redundant_themes && intelligenceReport.redundant_themes.length > 0 && (
                            <div className="insight-item theme-insight">
                                <span className="insight-icon">📚</span>
                                <div className="insight-content">
                                    <div className="insight-label">{t('Systemic Redundancy')}</div>
                                    <div className="insight-value">{intelligenceReport.redundant_themes.slice(0, 2).join(', ')}</div>
                                    <div className="insight-note">{t('Multiple hits in related functional hubs')}</div>
                                </div>
                            </div>
                        )}

                        {intelligenceReport.silent_paths && intelligenceReport.silent_paths.length > 0 && (
                            <div className="insight-item precise-insight">
                                <span className="insight-icon">🎯</span>
                                <div className="insight-content">
                                    <div className="insight-label">{t('Precise Regulation')}</div>
                                    <div className="insight-value">{intelligenceReport.silent_paths[0]}</div>
                                    <div className="insight-note">{t('Significant despite very few active members')}</div>
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

            {!intelligenceReport && !summary && !isSummarizing && results.length > 0 && (
                <div className="intelligence-report-box">
                    <div className="report-main-header">
                        <div className="summary-status">
                            <span className="status-dot"></span>
                            <span className="summary-text">
                                {geneSetSource === 'fusion' ? t('Fusion results ready') : t('Analysis ready')}
                            </span>
                        </div>
                        <button
                            className="ai-insight-btn"
                            onClick={() => generateSummary(results)}
                        >
                            ✨ {t('AI Deep Analysis')}
                        </button>
                    </div>
                    {geneSetSource === 'fusion' && (
                        <div className="fusion-note">{t('Fusion modules summarized')}</div>
                    )}
                </div>
            )}

            {!intelligenceReport && isSummarizing && (
                <div className="intelligence-report-box">
                    <div className="report-main-header">
                        <div className="summary-status">
                            <span className="status-dot"></span>
                            <span className="summary-text">{t('AI Deep Analysis in progress')}</span>
                        </div>
                        <button className="ai-insight-btn" disabled>
                            ✨ {t('Analyzing...')}
                        </button>
                    </div>
                </div>
            )}

            {/* Results */}
            {results.length > 0 && (
                <div className="enrichment-results">
                    <div className="results-header">
                        <h4>{t('Top Enriched Pathways')} ({results.length})</h4>
                        <div className="results-actions">
                            <div className="results-source">
                                <label>{t('UpSet Source')}</label>
                                <select
                                    value={upsetSource}
                                    onChange={(e) => setUpsetSource(e.target.value as any)}
                                >
                                    <option value="current">{t('Current')}</option>
                                    <option value="fusion">{t('Fusion')}</option>
                                    <option value="multisample" disabled={!multiSampleSets.length}>{t('MultiSample')}</option>
                                </select>
                            </div>
                            <div className="results-source">
                                <label>{t('Max Sets')}</label>
                                <select
                                    value={upsetMaxSets}
                                    onChange={(e) => setUpsetMaxSets(Number(e.target.value))}
                                >
                                    <option value={2}>2</option>
                                    <option value={3}>3</option>
                                    <option value={4}>4</option>
                                </select>
                            </div>
                            <div className="results-source">
                                <button
                                    className="clear-btn"
                                    type="button"
                                    onClick={() => setUpsetSelection([])}
                                    disabled={upsetSelection.length === 0}
                                >
                                    {t('Clear')}
                                </button>
                            </div>
                            <div className="results-toggle">
                                <button
                                    className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                                    onClick={() => setViewMode('table')}
                                >
                                    {t('Table')}
                                </button>
                                <button
                                    className={`toggle-btn ${viewMode === 'upset' ? 'active' : ''}`}
                                    onClick={() => setViewMode('upset')}
                                >
                                    {t('UpSet')}
                                </button>
                            </div>
                            <button
                                className="export-btn"
                                onClick={async () => {
                                    console.log('[Export] Starting export, results count:', results.length);

                                    if (!results || results.length === 0) {
                                        setFeedback({ type: 'error', message: t('No results to export') });
                                        return;
                                    }

                                    try {
                                        // Export results as CSV
                                        const csvContent = [
                                            [t('Pathway'), t('P-value'), t('FDR'), method === 'ORA' ? t('Odds Ratio') : t('NES'), t('Overlap'), t('Top Genes')].join(','),
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
                                        const selectedPath = await save({
                                            defaultPath: defaultName,
                                            filters: [{ name: 'CSV', extensions: ['csv'] }]
                                        });

                                        if (selectedPath) {
                                            await writeTextFile(selectedPath, csvContent);
                                            console.log('[Export] File saved to:', selectedPath);
                                            setFeedback({ type: 'success', message: `Results exported to: ${selectedPath}` });
                                        } else {
                                            console.log('[Export] User cancelled save dialog');
                                        }
                                    } catch (err) {
                                        console.error('[Export] Error:', err);
                                        setFeedback({ type: 'error', message: t('Export failed: {error}', { error: String(err) }) });
                                    }
                                }}
                                title={t('Export to CSV')}
                            >
                                📥 {t('Export')}
                            </button>
                        </div>
                    </div>

                    {viewMode === 'upset' ? (
                        <div className="upset-container">
                            <div className="upset-note">
                                {upsetSelection.length > 0
                                    ? t('Using custom selection ({count}).', { count: upsetSelection.length })
                                    : t('Using top {count} sets for intersections.', { count: Math.max(2, Math.min(4, upsetMaxSets)) })}
                            </div>
                            {availableUpSetSets.length > 0 && (
                                <div className="upset-picker">
                                    {availableUpSetSets.slice(0, 12).map((set) => (
                                        <button
                                            key={set.label}
                                            type="button"
                                            className={`upset-option ${upsetSelection.includes(set.label) ? 'active' : ''}`}
                                            onClick={() => {
                                                setUpsetSelection((prev) => {
                                                    const next = prev.includes(set.label)
                                                        ? prev.filter((s) => s !== set.label)
                                                        : [...prev, set.label];
                                                    return next.slice(0, 4);
                                                });
                                            }}
                                        >
                                            {set.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <UpSetPlot sets={buildUpSetSets()} height={240} />
                        </div>
                    ) : (
                        <div className="results-table-container">
                            <table className="results-table">
                                <thead>
                                    <tr>
                                        <th>{t('Pathway / Module')}</th>
                                        <th>{t('P-value')}</th>
                                        <th>{t('FDR')}</th>
                                        {method === 'ORA' && <th>{t('Odds Ratio')}</th>}
                                        {method === 'GSEA' && <th>{t('NES')}</th>}
                                        <th>{geneSetSource === 'fusion' ? t('Sources') : t('Overlap')}</th>
                                        <th>{t('Genes')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.slice(0, 30).map((result: any, idx) => (
                                        <React.Fragment key={idx}>
                                            <tr className={result.isFused ? 'fusion-row-master' : ''}>
                                                <td className="pathway-name">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {result.isFused && <span className="fusion-cluster-icon">💠</span>}
                                                        <button
                                                            className="pathway-link"
                                                            onClick={() => {
                                                                let pathwayId = result.pathway_id || result.pathway_name;
                                                                let pathwayName = result.pathway_name;

                                                                // ID Extraction logic... (kept same as before)
                                                                if (pathwayName.includes('(GO:')) {
                                                                    const match = pathwayName.match(/\(GO:(\d+)\)/);
                                                                    if (match) pathwayId = `GO:${match[1]}`;
                                                                } else if (pathwayName.match(/^GO:\d+/)) {
                                                                    pathwayId = pathwayName.split('_')[0];
                                                                } else if (pathwayName.match(/^WP\d+/)) {
                                                                    pathwayId = pathwayName.split('_')[0];
                                                                } else if (pathwayName.match(/^hsa\d+/)) {
                                                                    pathwayId = pathwayName.split(':')[0];
                                                                }

                                                                onPathwayClick?.(pathwayId, result.source || geneSetSource, {
                                                                    pathway_name: pathwayName,
                                                                    hit_genes: result.hit_genes || []
                                                                });
                                                            }}
                                                        >
                                                            {result.pathway_name}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td>{result.p_value.toExponential(2)}</td>
                                                <td className={result.fdr < 0.05 ? 'significant-fdr' : ''}>
                                                    {result.fdr.toFixed(4)}
                                                </td>
                                                {method === 'ORA' && <td>{result.odds_ratio?.toFixed(2) || t('n/a')}</td>}
                                                {method === 'GSEA' && <td>{result.nes?.toFixed(2) || t('n/a')}</td>}
                                                <td>
                                                    {result.isFused ? (
                                                        <div className="source-badges">
                                                            {Array.from(new Set(result.members?.map((m: any) => m.source) || [])).map((s: any) => (
                                                                <span key={s} className={`source-badge badge-${s}`}>{s[0].toUpperCase()}</span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        result.overlap_ratio
                                                    )}
                                                </td>
                                                <td className="hit-genes">
                                                    {(result.hit_genes || []).slice(0, 5).join(', ')}
                                                    {(result.hit_genes || []).length > 5 && '...'}
                                                </td>
                                            </tr>
                                            {/* Drill-down view for Fusion Results */}
                                            {result.isFused && result.members && result.members.length > 1 && (
                                                <tr className="fusion-drilldown-row">
                                                    <td colSpan={7}>
                                                        <div className="fusion-members-container">
                                                            <div className="fusion-members-label">{t('Consolidated Terms')}:</div>
                                                            <div className="fusion-members-list">
                                                                {result.members.map((m: any, midx: number) => (
                                                                    <div key={midx} className="fusion-member-item">
                                                                        <span className={`source-tag tag-${m.source}`}>{m.source}</span>
                                                                        <span className="member-name">{m.pathway_name}</span>
                                                                        <span className="member-stats">{t('FDR')}: {m.fdr?.toFixed(4)} | {t('Overlap')}: {m.overlap_ratio}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
