import React, { useState, useEffect } from 'react';
import './GSEAPanel.css';
import { open, save } from '@tauri-apps/plugin-dialog';


interface EnrichedTerm {
    term: string;
    overlap: string;
    p_value: number;
    adjusted_p_value: number;
    combined_score: number;
    genes: string[];
}

interface GSEAResult {
    term: string;
    nes: number;
    p_value: number;
    fdr: number;
    lead_genes: string[];
}

interface GSEAPanelProps {
    sendCommand: (cmd: string, data?: Record<string, unknown>, waitForResponse?: boolean) => Promise<any>;
    volcanoData?: Array<{ gene: string; x: number; y: number; status: string }>;
    isConnected: boolean;
    lastResponse?: any;
    onEnrichmentResult?: (results: EnrichedTerm[]) => void;
    onGseaResult?: (up: GSEAResult[], down: GSEAResult[]) => void;
}

type AnalysisMode = 'enrichr' | 'gsea';

const GENE_SET_OPTIONS = [
    { id: 'KEGG_2021_Human', name: 'KEGG Pathways', category: 'pathway' },
    { id: 'GO_Biological_Process_2021', name: 'GO Biological Process', category: 'go' },
    { id: 'GO_Molecular_Function_2021', name: 'GO Molecular Function', category: 'go' },
    { id: 'GO_Cellular_Component_2021', name: 'GO Cellular Component', category: 'go' },
    { id: 'Reactome_2022', name: 'Reactome Pathways', category: 'pathway' },
    { id: 'WikiPathway_2021_Human', name: 'WikiPathways', category: 'pathway' },
    { id: 'MSigDB_Hallmark_2020', name: 'MSigDB Hallmarks', category: 'signature' },
];

export const GSEAPanel: React.FC<GSEAPanelProps> = ({
    sendCommand,
    volcanoData,
    isConnected,
    lastResponse,
    onEnrichmentResult,
    onGseaResult,
}) => {

    const [mode, setMode] = useState<AnalysisMode>('enrichr');
    const [selectedGeneSet, setSelectedGeneSet] = useState('KEGG_2021_Human');
    const [availableGeneSets, setAvailableGeneSets] = useState(GENE_SET_OPTIONS);
    const [isLoading, setIsLoading] = useState(false);

    const [enrichrResults, setEnrichrResults] = useState<EnrichedTerm[]>([]);
    const [gseaUp, setGseaUp] = useState<GSEAResult[]>([]);
    const [gseaDown, setGseaDown] = useState<GSEAResult[]>([]);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

    // Handle responses from backend
    useEffect(() => {
        if (!lastResponse) return;

        if (lastResponse.cmd === 'ENRICHR') {
            setIsLoading(false);
            if (lastResponse.status === 'ok' && lastResponse.enriched_terms) {
                setEnrichrResults(lastResponse.enriched_terms);
                if (lastResponse.warnings && lastResponse.warnings.length > 0) {
                    setFeedback({ type: 'warning', message: `Analysis complete with warnings: ${lastResponse.warnings.join(', ')}` });
                } else {
                    setFeedback({ type: 'success', message: 'Enrichment analysis completed successfully.' });
                }
                if (onEnrichmentResult) onEnrichmentResult(lastResponse.enriched_terms);
            } else if (lastResponse.status === 'error') {
                setFeedback({ type: 'error', message: lastResponse.message || 'Enrichr analysis failed' });
            }
        }

        if (lastResponse.cmd === 'GSEA') {
            setIsLoading(false);
            if (lastResponse.status === 'ok') {
                setGseaUp(lastResponse.up_regulated || []);
                setGseaDown(lastResponse.down_regulated || []);
                if (lastResponse.warnings && lastResponse.warnings.length > 0) {
                    setFeedback({ type: 'warning', message: `GSEA complete with warnings: ${lastResponse.warnings.join(', ')}` });
                } else {
                    setFeedback({ type: 'success', message: 'GSEA analysis completed successfully.' });
                }
                if (onGseaResult) onGseaResult(lastResponse.up_regulated || [], lastResponse.down_regulated || []);
            } else if (lastResponse.status === 'error') {
                setFeedback({ type: 'error', message: lastResponse.message || 'GSEA analysis failed' });
            }
        }

        if (lastResponse.cmd === 'LOAD_GMT') {
            setIsLoading(false);
            if (lastResponse.status === 'ok') {
                const newGeneSet = {
                    id: lastResponse.path,
                    name: `📁 ${lastResponse.path.split('/').pop()}`,
                    category: 'local'
                };
                setAvailableGeneSets(prev => [newGeneSet, ...prev]);
                setSelectedGeneSet(lastResponse.path);

                const stats = lastResponse.stats;
                const warnings = lastResponse.warnings || [];
                const msg = `Loaded GMT: ${stats.total_sets} sets, ${stats.unique_genes} genes. ${warnings.length > 0 ? '\nWarnings: ' + warnings.join('; ') : ''}`;
                setFeedback({ type: warnings.length > 0 ? 'warning' : 'success', message: msg });
            } else {
                setFeedback({ type: 'error', message: `Failed to load GMT: ${lastResponse.message}` });
            }
        }
    }, [lastResponse]);


    // Extract gene lists from volcano data
    const getSignificantGenes = () => {
        if (!volcanoData) return [];
        return volcanoData
            .filter((d) => d.status === 'UP' || d.status === 'DOWN')
            .map((d) => d.gene);
    };

    const getUpregulatedGenes = () => {
        if (!volcanoData) return [];
        return volcanoData.filter((d) => d.status === 'UP').map((d) => d.gene);
    };

    const getGeneRanking = () => {
        if (!volcanoData) return {};
        const ranking: Record<string, number> = {};
        volcanoData.forEach((d) => {
            // Ranking score = log2FC * -log10(pvalue)
            ranking[d.gene] = d.x * d.y;
        });
        return ranking;
    };

    const runEnrichr = async () => {
        const genes = getSignificantGenes();
        if (genes.length === 0) {
            setFeedback({ type: 'warning', message: 'No significant genes found. Load data first.' });
            return;
        }

        setIsLoading(true);
        setFeedback(null);

        try {
            await sendCommand('ENRICHR', {
                genes,
                gene_sets: selectedGeneSet,
            });
        } catch (err) {
            setFeedback({ type: 'error', message: `Enrichr analysis failed: ${err}` });
        } finally {
            setIsLoading(false);
        }
    };

    const runGSEA = async () => {
        const ranking = getGeneRanking();
        if (Object.keys(ranking).length === 0) {
            setFeedback({ type: 'warning', message: '⚠️ 未找到基因数据。请先加载分析数据。' });
            return;
        }

        setIsLoading(true);
        setFeedback(null);

        try {
            await sendCommand('GSEA', {
                gene_ranking: ranking,
                gene_sets: selectedGeneSet,
            });
        } catch (err) {
            setFeedback({ type: 'error', message: `GSEA analysis failed: ${err}` });
        } finally {
            setIsLoading(false);
        }
    };

    const handleRunAnalysis = () => {
        if (mode === 'enrichr') {
            runEnrichr();
        } else {
            runGSEA();
        }
    };

    const handleLoadLocalGMT = async () => {
        try {
            const selected = await open({
                filters: [{ name: 'GMT Files', extensions: ['gmt'] }],
                multiple: false,
            });

            if (selected && typeof selected === 'string') {
                setIsLoading(true);
                setFeedback(null);
                await sendCommand('LOAD_GMT', { path: selected });
            }
        } catch (err) {
            setFeedback({ type: 'error', message: `Error opening file: ${err}` });
        }
    };

    const handleExportCSV = async (type: 'enrichr' | 'gsea') => {
        try {
            const defaultName = type === 'enrichr' ? 'enrichment_results.csv' : 'gsea_results.csv';
            const savePath = await save({
                defaultPath: defaultName,
                filters: [{ name: 'CSV Files', extensions: ['csv'] }],
            });

            if (savePath) {
                const results = type === 'enrichr' ? { enriched_terms: enrichrResults } : { up_regulated: gseaUp, down_regulated: gseaDown };
                await sendCommand('EXPORT_CSV', {
                    results,
                    output_path: savePath,
                    type
                });
                alert(`✅ Results exported to ${savePath}`);
            }
        } catch (err) {
            setFeedback({ type: 'error', message: `Export failed: ${err}` });
        }
    };


    return (
        <div className="gsea-panel">
            <div className="gsea-header">
                <h3>🧬 Enrichment Analysis</h3>
                <div className="gsea-mode-toggle">
                    <button
                        className={mode === 'enrichr' ? 'active' : ''}
                        onClick={() => setMode('enrichr')}
                    >
                        Enrichr (ORA)
                    </button>
                    <button
                        className={mode === 'gsea' ? 'active' : ''}
                        onClick={() => setMode('gsea')}
                    >
                        GSEA (Prerank)
                    </button>
                </div>
            </div>

            <div className="gsea-controls">
                <label>
                    Gene Set:
                    <div className="gene-set-selector-group">
                        <select
                            value={selectedGeneSet}
                            onChange={(e) => setSelectedGeneSet(e.target.value)}
                        >
                            {availableGeneSets.map((gs) => (
                                <option key={gs.id} value={gs.id}>
                                    {gs.name}
                                </option>
                            ))}
                        </select>
                        <button
                            className="load-gmt-btn"
                            onClick={handleLoadLocalGMT}
                            title="Load local .gmt file"
                        >
                            📂
                        </button>
                    </div>
                </label>


                <button
                    className="gsea-run-btn"
                    onClick={handleRunAnalysis}
                    disabled={isLoading || !isConnected || !volcanoData?.length}
                >
                    {isLoading ? '⏳ Analyzing...' : '▶️ Run Analysis'}
                </button>
            </div>

            {feedback && (
                <div className={`gsea-feedback ${feedback.type}`}>
                    {feedback.type === 'success' && <span className="feedback-icon">✅</span>}
                    {feedback.type === 'warning' && <span className="feedback-icon">⚠️</span>}
                    {feedback.type === 'error' && <span className="feedback-icon">❌</span>}
                    <div className="feedback-message">{feedback.message}</div>
                    <button className="feedback-close" onClick={() => setFeedback(null)}>×</button>
                </div>
            )}

            <div className="gsea-info">
                <span>📊 {volcanoData?.length || 0} genes loaded</span>
                <span>🔺 {getUpregulatedGenes().length} upregulated</span>
                <span>🔻 {getSignificantGenes().length - getUpregulatedGenes().length} downregulated</span>
            </div>

            {/* Results Section */}
            {enrichrResults.length > 0 && mode === 'enrichr' && (
                <div className="gsea-results">
                    <div className="results-header">
                        <h4>Top Enriched Terms</h4>
                        <button className="export-btn" onClick={() => handleExportCSV('enrichr')}>
                            📥 Export CSV
                        </button>
                    </div>

                    <ul className="enrichr-list">
                        {enrichrResults.slice(0, 10).map((term: EnrichedTerm, idx: number) => (
                            <li key={idx} className="enrichr-item">
                                <span className="term-name">{term.term}</span>
                                <span className="term-pvalue">
                                    P={term.adjusted_p_value.toExponential(2)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {(gseaUp.length > 0 || gseaDown.length > 0) && mode === 'gsea' && (
                <div className="gsea-results">
                    <div className="results-header">
                        <h4>GSEA Results</h4>
                        <button className="export-btn" onClick={() => handleExportCSV('gsea')}>
                            📥 Export CSV
                        </button>
                    </div>
                    <div className="gsea-columns">
                        <div className="gsea-column">
                            <h4>🔺 Upregulated Pathways</h4>

                            <ul className="gsea-list up">
                                {gseaUp.slice(0, 5).map((term, idx) => (
                                    <li key={idx}>
                                        <span>{term.term}</span>
                                        <span>NES: {term.nes.toFixed(2)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="gsea-column">
                            <h4>🔻 Downregulated Pathways</h4>
                            <ul className="gsea-list down">
                                {gseaDown.slice(0, 5).map((term, idx) => (
                                    <li key={idx}>
                                        <span>{term.term}</span>
                                        <span>NES: {term.nes.toFixed(2)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GSEAPanel;
