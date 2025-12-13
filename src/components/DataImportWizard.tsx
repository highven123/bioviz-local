import React, { useState, useEffect, useMemo } from 'react';
import { FileDropZone } from './FileDropZone';
import { TemplatePicker } from './TemplatePicker';
import './DataImportWizard.css'; // New CSS file


// --- Types ---

export type AnalysisMethod = 'auto' | 'ttest' | 'precomputed';

export interface AnalysisConfig {
    filePath: string;
    mapping: {
        gene: string;
        value: string;
        pvalue?: string;
        /** Optional: explicit control/experiment columns for raw matrix data */
        controlCols?: string[];
        treatCols?: string[];
    };
    pathwayId: string;
    dataType: 'gene' | 'protein' | 'cell';
    /** Statistical methods to apply (multi-select). The first one is used for visualization. */
    analysisMethods: AnalysisMethod[];
}

interface DataImportWizardProps {
    onComplete: (config: AnalysisConfig) => void;
    onCancel: () => void;
    addLog: (msg: string) => void;
    isConnected: boolean;
    /** 当前步骤（1=Import,2=Map,3=Pathway），可由外部控制 */
    activeStep?: 1 | 2 | 3;
    /** 步骤变化回调，用于同步外部导航 */
    onStepChange?: (step: 1 | 2 | 3) => void;
    /** 将当前配置（如果已就绪）回传给父组件，用于从顶部 Step4 触发分析 */
    onConfigPreview?: (config: AnalysisConfig | null) => void;
}

interface UploadedFileInfo {
    path: string;
    columns: string[];
    preview: string[][];
    suggestedMapping: { gene?: string; value?: string; pvalue?: string };
    dataType: 'gene' | 'protein' | 'cell';
}

// --- Persistence Helpers ---

const STORAGE_KEY = 'bioviz_last_config';

const saveConfig = (config: AnalysisConfig) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...config,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.warn("Failed to save config:", e);
    }
};

const loadLastConfig = (): AnalysisConfig | null => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return null;
        return JSON.parse(saved);
    } catch (e) {
        console.warn("Failed to load last config:", e);
        return null;
    }
};

// --- Component ---

export const DataImportWizard: React.FC<DataImportWizardProps> = ({
    onComplete,
    addLog,
    isConnected,
    activeStep,
    onStepChange,
    onConfigPreview
}) => {
    const [step, setStep] = useState<1 | 2 | 3>(activeStep ?? 1);
    const [fileInfo, setFileInfo] = useState<UploadedFileInfo | null>(null);
    const [mapping, setMapping] = useState<{ gene: string; value: string; pvalue?: string } | null>(null);
    const [selectedPathway, setSelectedPathway] = useState<string>('');
    // Skip Wizard Logic
    const lastConfig = loadLastConfig();
    const canQuickLoad = !!lastConfig;

    // 同步外部传入的 step（例如顶栏导航点击）
    useEffect(() => {
        if (activeStep && activeStep !== step) {
            setStep(activeStep);
        }
    }, [activeStep]); // Removed 'step' dependency to avoid loop

    // Auto-skip in DEV mode logic (disabled for now as per comment)
    useEffect(() => {
        if (import.meta.env.DEV && canQuickLoad && lastConfig) {
            console.log("Dev mode & config found, available for quick load");
        }
    }, []);

    const handleQuickLoad = () => {
        if (lastConfig) {
            addLog(`⚡ Loaded previous config: ${lastConfig.filePath} (${lastConfig.pathwayId})`);
            onComplete(lastConfig);
        }
    };

    // --- Step 1: Upload ---

    const updateStep = (next: 1 | 2 | 3) => {
        if (next === step) return;
        setStep(next);
        onStepChange?.(next);
    };

    const emitConfigPreview = (overridePathwayId?: string) => {
        if (!fileInfo || !mapping) {
            onConfigPreview?.(null);
            return;
        }
        const pathwayId = overridePathwayId ?? selectedPathway;
        if (!pathwayId) {
            onConfigPreview?.(null);
            return;
        }
        const cfg: AnalysisConfig = {
            filePath: fileInfo.path,
            mapping,
            pathwayId,
            dataType: fileInfo.dataType,
            analysisMethods,
        };
        onConfigPreview?.(cfg);
    };

    const handleUploadSuccess = (data: any) => {
        setFileInfo({
            path: data.filePath,
            columns: data.columns,
            preview: data.preview,
            suggestedMapping: data.suggestedMapping,
            dataType: data.dataType
        });
        updateStep(2);
        // 上传完成但尚未映射/选路径，配置还不完整
        onConfigPreview?.(null);
    };

    // --- Step 2: Mapping ---

    const [selectedGeneCol, setSelectedGeneCol] = useState('');
    const [selectedValueCol, setSelectedValueCol] = useState('');
    const [selectedPValueCol, setSelectedPValueCol] = useState('');
    const [analysisMethods, setAnalysisMethods] = useState<AnalysisMethod[]>(['auto']);
    const [rawMode, setRawMode] = useState<'auto' | 'manual'>('auto');
    const [manualControlCols, setManualControlCols] = useState<string[]>([]);
    const [manualTreatCols, setManualTreatCols] = useState<string[]>([]);

    const [fileStamp, setFileStamp] = useState<string | null>(null);

    // Initialize mapping defaults when a new file is loaded
    useEffect(() => {
        if (step === 2 && fileInfo) {
            if (fileInfo.path !== fileStamp) {
                setFileStamp(fileInfo.path);
                const columns = fileInfo.columns || [];

                const defaultGene = fileInfo.suggestedMapping.gene || columns[0] || '';

                // Prefer suggested value; otherwise pick the first non-gene column if exists
                let defaultValue = fileInfo.suggestedMapping.value || '';
                if (!defaultValue) {
                    defaultValue = columns.find(c => c !== defaultGene) || '';
                }

                setSelectedGeneCol(defaultGene);
                setSelectedValueCol(defaultValue);
                setSelectedPValueCol(fileInfo.suggestedMapping.pvalue || '');

                // Restore analysis methods from last config if the same file is reused
                if (lastConfig && lastConfig.filePath === fileInfo.path && Array.isArray(lastConfig.analysisMethods)) {
                    setAnalysisMethods(lastConfig.analysisMethods.length > 0 ? lastConfig.analysisMethods : ['auto']);
                } else {
                    setAnalysisMethods(['auto']);
                }
            }
        }
    }, [step, fileInfo, lastConfig, fileStamp]);

    // Detect "raw matrix" layout: multiple Ctrl_*/Exp_* columns, no P-value
    const rawMatrixInfo = useMemo(() => {
        if (!fileInfo) return null;
        const colsLower = fileInfo.columns.map(c => c.toLowerCase());
        const controls: string[] = [];
        const treats: string[] = [];

        colsLower.forEach((name, idx) => {
            const original = fileInfo.columns[idx];
            if (name.includes('ctrl') || name.includes('control')) {
                controls.push(original);
            } else if (name.includes('exp') || name.includes('treat')) {
                treats.push(original);
            }
        });

        const hasP = !!fileInfo.suggestedMapping.pvalue;
        if (controls.length > 0 && treats.length > 0 && !hasP) {
            return { controls, treats };
        }
        return null;
    }, [fileInfo]);

    const isRawMatrix = !!rawMatrixInfo;

    // When raw matrix is detected, seed manual selections with detected columns
    useEffect(() => {
        if (isRawMatrix && rawMatrixInfo) {
            setManualControlCols(rawMatrixInfo.controls);
            setManualTreatCols(rawMatrixInfo.treats);
        } else {
            setManualControlCols([]);
            setManualTreatCols([]);
            setRawMode('auto');
        }
    }, [isRawMatrix, rawMatrixInfo]);

    const toggleAnalysisMethod = (method: AnalysisMethod) => {
        setAnalysisMethods(prev => {
            const exists = prev.includes(method);
            const next = exists ? prev.filter(m => m !== method) : [...prev, method];
            // Always keep at least one method selected; fallback to 'auto'
            if (next.length === 0) return ['auto'];
            return next;
        });
    };

    const handleMappingConfirm = () => {
        if (!selectedGeneCol) return;

        // 对于原始矩阵（Ctrl_*/Exp_* 多列强度），支持自动或手动选择列。
        const effectiveValueCol = isRawMatrix ? '__raw_matrix__' : selectedValueCol;
        if (!effectiveValueCol) return;

        const mappingPayload = {
            gene: selectedGeneCol,
            value: effectiveValueCol,
            pvalue: selectedPValueCol || undefined,
            controlCols: isRawMatrix && rawMode === 'manual' ? manualControlCols : undefined,
            treatCols: isRawMatrix && rawMode === 'manual' ? manualTreatCols : undefined,
        };

        setMapping(mappingPayload);
        updateStep(3);
        // 映射确定但尚未选 pathway，配置仍不完整
        onConfigPreview?.(null);
    };

    // --- Step 3: Pathway ---
    const handlePathwaySelect = (pathwayId: string) => {
        setSelectedPathway(pathwayId);
        // 当三个要素都齐了时，把配置预览回传给父组件
        emitConfigPreview(pathwayId);
    };

    const handleVisualizeClick = () => {
        if (!fileInfo || !mapping || !selectedPathway) return;

        const config: AnalysisConfig = {
            filePath: fileInfo.path,
            mapping: mapping,
            pathwayId: selectedPathway,
            dataType: fileInfo.dataType,
            analysisMethods,
        };

        onConfigPreview?.(config);
        saveConfig(config);
        onComplete(config);
    };

    // --- Renders ---

    return (
        <div className="wizard-container">
            {/* Wizard Header / Stepper */}
            <div className="wizard-header">
                <h2 className="wizard-title">New Analysis</h2>
                <div className="wizard-steps">
                    <div className={`step-indicator ${step >= 1 ? 'active' : ''}`}>1. Import</div>
                    <div className={`step-indicator ${step >= 2 ? 'active' : ''}`}>2. Map</div>
                    <div className={`step-indicator ${step >= 3 ? 'active' : ''}`}>3. Pathway</div>
                </div>
            </div>

            <div className="wizard-content">

                {/* STEP 1: UPLOAD */}
                {step === 1 && (
                    <div className="step-wrapper">
                        <div className="section-header">
                            <h3>Upload Data Matrix</h3>
                            <p>Support for .csv, .txt, .xlsx (Wide or Long format)</p>
                        </div>

                        <FileDropZone
                            onLoadSuccess={handleUploadSuccess}
                            addLog={addLog}
                        />

                        {canQuickLoad && (
                            <div className="quick-load-section">
                                <button onClick={handleQuickLoad} className="btn-quick-load">
                                    <span>⚡</span> Load Last Config
                                    <span style={{ fontSize: '11px', opacity: 0.6 }}>
                                        ({lastConfig?.pathwayId} • {lastConfig?.mapping.gene} vs {lastConfig?.mapping.value})
                                    </span>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 2: MAPPING */}
                {step === 2 && fileInfo && (
                    <div className="step-wrapper">
                        <div className="section-header">
                            <h3>Map Columns</h3>
                            <p>Specify which columns contain identifiers, effect size, and optional p-values.</p>
                        </div>

                        <div className="mapping-grid">
                            {/* Gene Column */}
                            <div className="mapping-card">
                                <label className="mapping-label">
                                    <span>Entity / Gene column</span>
                                    {fileInfo.suggestedMapping.gene && <span className="badge-auto">Auto</span>}
                                </label>
                                <select
                                    value={selectedGeneCol}
                                    onChange={e => setSelectedGeneCol(e.target.value)}
                                    className="select-input"
                                >
                                    <option value="">Select Column...</option>
                                    {fileInfo.columns.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <p className="mapping-hint">Required. Contains Gene Symbols or IDs.</p>
                            </div>

                            {/* Value Column */}
                            <div className="mapping-card">
                                <label className="mapping-label">
                                    <span>Value / Log2FC column</span>
                                    {fileInfo.suggestedMapping.value && <span className="badge-auto">Auto</span>}
                                </label>
                                {isRawMatrix ? (
                                    <>
                                        <div className="raw-value-toggle">
                                            <div className={`raw-toggle-btn ${rawMode === 'auto' ? 'active' : ''}`} onClick={() => setRawMode('auto')}>
                                                Auto (use all Ctrl / Exp columns)
                                            </div>
                                            <div className={`raw-toggle-btn ${rawMode === 'manual' ? 'active' : ''}`} onClick={() => setRawMode('manual')}>
                                                Manual (pick columns)
                                            </div>
                                        </div>

                                        {rawMode === 'auto' && (
                                            <div className="raw-value-placeholder">
                                                Detected raw matrix with replicate columns:
                                                <br />
                                                <span className="raw-matrix-group">
                                                    Control&nbsp;({rawMatrixInfo?.controls.join(', ')})
                                                </span>
                                                {' '}vs{' '}
                                                <span className="raw-matrix-group">
                                                    Experiment&nbsp;({rawMatrixInfo?.treats.join(', ')})
                                                </span>
                                                . BioViz will compute Log2FC and approximate P-values from these columns automatically.
                                            </div>
                                        )}

                                        {rawMode === 'manual' && (
                                            <div className="raw-select-group">
                                                <div className="raw-select-column">
                                                    <div className="raw-select-title">Control columns</div>
                                                    <div className="raw-select-list">
                                                        {fileInfo.columns.map((c) => {
                                                            const checked = manualControlCols.includes(c);
                                                            return (
                                                                <label key={`ctrl-${c}`} className="raw-select-option">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={() => {
                                                                            setManualControlCols(prev => checked ? prev.filter(x => x !== c) : [...prev, c]);
                                                                        }}
                                                                    />
                                                                    <span>{c}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                <div className="raw-select-column">
                                                    <div className="raw-select-title">Experiment columns</div>
                                                    <div className="raw-select-list">
                                                        {fileInfo.columns.map((c) => {
                                                            const checked = manualTreatCols.includes(c);
                                                            return (
                                                                <label key={`treat-${c}`} className="raw-select-option">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={() => {
                                                                            setManualTreatCols(prev => checked ? prev.filter(x => x !== c) : [...prev, c]);
                                                                        }}
                                                                    />
                                                                    <span>{c}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <select
                                            value={selectedValueCol}
                                            onChange={e => setSelectedValueCol(e.target.value)}
                                            className="select-input"
                                        >
                                            <option value="">Select Column...</option>
                                            {fileInfo.columns.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                        <p className="mapping-hint">Required. Fold Change or Expression.</p>
                                    </>
                                )}
                            </div>

                            {/* P-Value Column */}
                            <div className="mapping-card">
                                <label className="mapping-label">
                                    <span>P-value column (optional)</span>
                                    {fileInfo.suggestedMapping.pvalue && <span className="badge-auto">Auto</span>}
                                </label>
                                <select
                                    value={selectedPValueCol}
                                    onChange={e => setSelectedPValueCol(e.target.value)}
                                    className="select-input"
                                >
                                    <option value="">(None)</option>
                                    {fileInfo.columns.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <p className="mapping-hint">Optional. Enables Volcano Plot interactvity.</p>
                            </div>
                        </div>

                        {/* Heuristic hint for raw matrix with replicates */}
                        {isRawMatrix && rawMatrixInfo && (
                            <div className="raw-matrix-hint">
                                Detected replicate groups:{' '}
                                <span className="raw-matrix-group">
                                    Control&nbsp;({rawMatrixInfo.controls.join(', ')})
                                </span>{' '}
                                vs{' '}
                                <span className="raw-matrix-group">
                                    Experiment&nbsp;({rawMatrixInfo.treats.join(', ')})
                                </span>
                                . BioViz will automatically compute Log2FC and
                                P-values for these groups when you click
                                <strong> Visualize</strong>.
                            </div>
                        )}

                        {/* Analysis Method Selector (multi-select) */}
                        <div className="mapping-card mapping-card-accent">
                            <label className="mapping-label">
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>⚙️ Analysis Methods</span>
                                    <span className="badge-stats">Stats</span>
                                </span>
                            </label>
                            <p className="mapping-hint" style={{ marginTop: '-4px' }}>
                                Default: automatic statistics. Raw matrices will compute Log2FC / approx P-value; tick options below if you already have results.
                            </p>
                            <div className="analysis-methods-group">
                                <label className="checkbox-row">
                                    <input
                                        type="checkbox"
                                        checked={analysisMethods.includes('auto')}
                                        onChange={() => toggleAnalysisMethod('auto')}
                                    />
                                    <span>Auto (recommended)</span>
                                </label>
                                <label className="checkbox-row">
                                    <input
                                        type="checkbox"
                                        checked={analysisMethods.includes('precomputed')}
                                        onChange={() => toggleAnalysisMethod('precomputed')}
                                    />
                                    <span>Use existing Log2FC / P-Value</span>
                                </label>
                                <label className="checkbox-row">
                                    <input
                                        type="checkbox"
                                        checked={analysisMethods.includes('ttest')}
                                        onChange={() => toggleAnalysisMethod('ttest')}
                                    />
                                    <span>Two-group t-test (Ctrl vs Exp)</span>
                                </label>
                            </div>
                            <p className="mapping-hint">
                                You can pick one or multiple methods; the first selected is used for visualization.
                            </p>
                        </div>

                        {/* Preview Table */}
                        <div className="preview-container">
                            <div className="preview-header">Data Preview</div>
                            <div className="table-scroll">
                                <table className="preview-table">
                                    <thead>
                                        <tr>
                                            {fileInfo.columns.map(col => {
                                                let highlight = '';
                                                if (col === selectedGeneCol) highlight = 'col-gene';
                                                else if (col === selectedValueCol) highlight = 'col-value';
                                                else if (col === selectedPValueCol) highlight = 'col-pvalue';

                                                return <th key={col} className={highlight}>{col}</th>
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fileInfo.preview.slice(0, 5).map((row, i) => (
                                            <tr key={i}>
                                                {row.map((cell, j) => {
                                                    let highlight = '';
                                                    const col = fileInfo.columns[j];
                                                    if (col === selectedGeneCol) highlight = 'col-gene';
                                                    else if (col === selectedValueCol) highlight = 'col-value';
                                                    else if (col === selectedPValueCol) highlight = 'col-pvalue';

                                                    return <td key={j} className={highlight}>{cell}</td>
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="action-bar">
                            <button
                                onClick={() => updateStep(1)}
                                className="btn-back"
                            >
                                ← Back to Upload
                            </button>
                            <button
                                onClick={handleMappingConfirm}
                                disabled={
                                    !selectedGeneCol ||
                                    (
                                        !isRawMatrix
                                            ? !selectedValueCol
                                            : (rawMode === 'manual' && (!manualControlCols.length || !manualTreatCols.length))
                                    )
                                }
                                className="btn-primary"
                            >
                                Continue to Pathway →
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 3: PATHWAY */}
                {step === 3 && (
                    <div className="step-wrapper">
                        <div className="section-header">
                            <h3>Select Pathway</h3>
                            <p>Choose a template for visualization</p>
                        </div>

                        <div className="mapping-card" style={{ padding: '8px' }}>
                            <TemplatePicker
                                onSelect={handlePathwaySelect}
                                disabled={!isConnected}
                                dataType={fileInfo?.dataType || 'gene'}
                            />
                        </div>

                        <div className="action-bar">
                            <button
                                onClick={() => setStep(2)}
                                className="btn-back"
                            >
                                ← Back to Mapping
                            </button>
                            <button
                                onClick={handleVisualizeClick}
                                disabled={!selectedPathway || !fileInfo || !mapping}
                                className="btn-primary"
                            >
                                Run analysis & visualize
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
