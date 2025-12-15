import React, { useState, useEffect } from 'react';
import './GSEAPanel.css';

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
    sendCommand: (cmd: string, data?: Record<string, unknown>) => Promise<void>;
    volcanoData?: Array<{ gene: string; x: number; y: number; status: string }>;
    isConnected: boolean;
}

type AnalysisMode = 'enrichr' | 'gsea';
type GeneSetCategory = 'pathway' | 'go' | 'signature';

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
}) => {
    const [mode, setMode] = useState<AnalysisMode>('enrichr');
    const [selectedGeneSet, setSelectedGeneSet] = useState('KEGG_2021_Human');
    const [isLoading, setIsLoading] = useState(false);
    const [enrichrResults, setEnrichrResults] = useState<EnrichedTerm[]>([]);
    const [gseaUp, setGseaUp] = useState<GSEAResult[]>([]);
    const [gseaDown, setGseaDown] = useState<GSEAResult[]>([]);
    const [error, setError] = useState<string | null>(null);

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
            setError('No significant genes found. Load data first.');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            await sendCommand('ENRICHR', {
                genes,
                gene_sets: selectedGeneSet,
            });
        } catch (err) {
            setError(`Enrichr analysis failed: ${err}`);
        } finally {
            setIsLoading(false);
        }
    };

    const runGSEA = async () => {
        const ranking = getGeneRanking();
        if (Object.keys(ranking).length === 0) {
            setError('No gene data found. Load data first.');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            await sendCommand('GSEA', {
                gene_ranking: ranking,
                gene_sets: selectedGeneSet,
            });
        } catch (err) {
            setError(`GSEA analysis failed: ${err}`);
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
                    <select
                        value={selectedGeneSet}
                        onChange={(e) => setSelectedGeneSet(e.target.value)}
                    >
                        {GENE_SET_OPTIONS.map((gs) => (
                            <option key={gs.id} value={gs.id}>
                                {gs.name}
                            </option>
                        ))}
                    </select>
                </label>

                <button
                    className="gsea-run-btn"
                    onClick={handleRunAnalysis}
                    disabled={isLoading || !isConnected || !volcanoData?.length}
                >
                    {isLoading ? '⏳ Analyzing...' : '▶️ Run Analysis'}
                </button>
            </div>

            {error && <div className="gsea-error">{error}</div>}

            <div className="gsea-info">
                <span>📊 {volcanoData?.length || 0} genes loaded</span>
                <span>🔺 {getUpregulatedGenes().length} upregulated</span>
                <span>🔻 {getSignificantGenes().length - getUpregulatedGenes().length} downregulated</span>
            </div>

            {/* Results Section */}
            {enrichrResults.length > 0 && mode === 'enrichr' && (
                <div className="gsea-results">
                    <h4>Top Enriched Terms</h4>
                    <ul className="enrichr-list">
                        {enrichrResults.slice(0, 10).map((term, idx) => (
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
            )}
        </div>
    );
};

export default GSEAPanel;
