import React, { useState, useEffect, useMemo } from 'react';
import { FileDropZone } from './FileDropZone';
import './DataImportWizard.css'; // New CSS file
import { open } from '@tauri-apps/plugin-dialog';


// --- Types ---

export type AnalysisMethod = 'auto' | 'ttest' | 'precomputed';

export interface AnalysisConfig {
    /** One or more input data files (batch mode when length > 1). */
    filePaths: string[];
    mapping: {
        gene: string;
        value: string;
        pvalue?: string;
        /** Optional: explicit control/experiment columns for raw matrix data */
        controlCols?: string[];
        treatCols?: string[];
    };
    pathwayId?: string;
    dataType: 'gene' | 'protein' | 'cell';
    /** Statistical methods to apply (multi-select). The first one is used for visualization. */
    analysisMethods: AnalysisMethod[];
}

interface DataImportWizardProps {
    onComplete: (config: AnalysisConfig) => void;
    onCancel: () => void;
    addLog: (msg: string) => void;
    isConnected: boolean;
    sendCommand: (cmd: string, data?: Record<string, unknown>, waitForResponse?: boolean) => Promise<any>;
    /** Current step (1=Import, 2=Map), can be controlled externally */
    activeStep?: 1 | 2;
    /** Step change callback, for syncing external navigation */
    onStepChange?: (step: 1 | 2) => void;
    /** Pass current config (if ready) back to parent component, for triggering analysis from top Step4 */
    onConfigPreview?: (config: AnalysisConfig | null) => void;
    /** One-click demo loader */
    onLoadDemo?: () => void;
    /** Optional demo script preview (Markdown plain text) */
    demoScript?: string;
    demoTitle?: string;
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
        const parsed = JSON.parse(saved);
        // Backward compatibility: v1 stored `filePath` as a string.
        if (parsed && !Array.isArray(parsed.filePaths) && typeof parsed.filePath === 'string') {
            parsed.filePaths = [parsed.filePath];
        }
        if (!parsed || !Array.isArray(parsed.filePaths) || parsed.filePaths.length === 0) return null;

        // Fix: Convert empty pathwayId to undefined (from old configs)
        if (parsed.pathwayId === '') {
            console.warn('[BioViz] Auto-fixing old config: empty pathwayId -> undefined');
            parsed.pathwayId = undefined;
            // Persist the fix so we don't hit this again
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    ...parsed,
                    timestamp: Date.now()
                }));
            } catch (e) {
                console.warn('Failed to persist config fix:', e);
            }
        }

        return parsed as AnalysisConfig;
    } catch (e) {
        console.warn("Failed to load last config:", e);
        return null;
    }
};

// --- Component ---

export const DataImportWizard: React.FC<DataImportWizardProps> = ({
    onComplete,
    onCancel,
    addLog,
    isConnected,
    sendCommand,
    activeStep,
    onStepChange,
    onConfigPreview,
    onLoadDemo,
    demoScript,
    demoTitle
}) => {
    const [step, setStep] = useState<1 | 2>(activeStep ?? 1);
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFileInfo[] | null>(null);
    const [baseDataType, setBaseDataType] = useState<'gene' | 'protein' | 'cell' | null>(null);
    // Skip Wizard Logic
    const lastConfig = loadLastConfig();
    const canQuickLoad = !!lastConfig;

    // Sync externally passed step (e.g., top nav bar click)
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
            addLog(`⚡ Loaded previous config: ${lastConfig.filePaths?.[0]} (${lastConfig.pathwayId})`);
            onComplete(lastConfig);
        }
    };

    // --- Step 1: Upload ---

    const updateStep = (next: 1 | 2) => {
        if (next === step) return;
        // Reset state when going back to Step 1 (allows user to change data type)
        if (next === 1) {
            setUploadedFiles(null);
            setBaseDataType(null);
        }
        setStep(next);
        onStepChange?.(next);
    };

    const handleUploadSuccess = (data: any) => {
        const incoming = Array.isArray(data?.files) ? data.files : [data];
        const files: UploadedFileInfo[] = incoming
            .filter((f: any) => f && (typeof f.filePath === 'string' || typeof f.path === 'string'))
            .map((f: any) => ({
                path: f.filePath || f.path,
                columns: Array.isArray(f.columns) ? f.columns : [],
                preview: Array.isArray(f.preview) ? f.preview : [],
                suggestedMapping: f.suggestedMapping || {},
                dataType: f.dataType || 'gene',
            }));

        if (files.length === 0) return;

        const merged = (uploadedFiles || []).slice();
        files.forEach(f => {
            if (!baseDataType) {
                setBaseDataType(f.dataType);
            } else if (baseDataType !== f.dataType) {
                alert(`Data type mismatch: expected ${baseDataType}, but got ${f.dataType} for file ${f.path}. Skipped.`);
                return;
            }
            if (!merged.find(m => m.path === f.path)) {
                merged.push(f);
            }
        });

        if (merged.length === 0) return;
        setUploadedFiles(merged);
        updateStep(2);
        // Upload complete but mapping/pathway not set, config is incomplete
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
        if (step === 2 && uploadedFiles && uploadedFiles.length > 0) {
            const stamp = uploadedFiles.map(f => f.path).join('|');
            if (stamp !== fileStamp) {
                setFileStamp(stamp);
                const primary = uploadedFiles[0];
                const columns = primary.columns || [];

                const defaultGene = primary.suggestedMapping.gene || columns[0] || '';

                // Prefer suggested value; otherwise pick the first non-gene column if exists
                let defaultValue = primary.suggestedMapping.value || '';
                if (!defaultValue) {
                    defaultValue = columns.find(c => c !== defaultGene) || '';
                }

                setSelectedGeneCol(defaultGene);
                setSelectedValueCol(defaultValue);
                setSelectedPValueCol(primary.suggestedMapping.pvalue || '');

                // Restore analysis methods from last config if the same file is reused
                const lastPrimary = lastConfig?.filePaths?.[0];
                if (lastConfig && lastPrimary === primary.path && Array.isArray(lastConfig.analysisMethods)) {
                    setAnalysisMethods(lastConfig.analysisMethods.length > 0 ? lastConfig.analysisMethods : ['auto']);
                } else {
                    setAnalysisMethods(['auto']);
                }
            }
        }
    }, [step, uploadedFiles, lastConfig, fileStamp]);

    // Detect "raw matrix" layout: multiple Ctrl_*/Exp_* columns, no P-value
    const rawMatrixInfo = useMemo(() => {
        if (!uploadedFiles || uploadedFiles.length === 0) return null;
        const primary = uploadedFiles[0];
        const colsLower = primary.columns.map(c => c.toLowerCase());
        const controls: string[] = [];
        const treats: string[] = [];

        colsLower.forEach((name, idx) => {
            const original = primary.columns[idx];
            if (name.includes('ctrl') || name.includes('control')) {
                controls.push(original);
            } else if (name.includes('exp') || name.includes('treat')) {
                treats.push(original);
            }
        });

        const hasP = !!primary.suggestedMapping.pvalue;
        if (controls.length > 0 && treats.length > 0 && !hasP) {
            return { controls, treats };
        }
        return null;
    }, [uploadedFiles]);

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
        if (!uploadedFiles || uploadedFiles.length === 0) return;

        // For raw matrix (Ctrl_*/Exp_* multi-column intensities), support auto or manual column selection.
        const effectiveValueCol = isRawMatrix ? '__raw_matrix__' : selectedValueCol;
        if (!effectiveValueCol) return;

        const findFallback = (cols: string[], kind: 'gene' | 'value' | 'pvalue'): string | null => {
            const lower = cols.map(c => c.toLowerCase());
            if (kind === 'gene') {
                const keywords = ['gene', 'symbol', 'name', 'id', 'identifier', 'accession', 'cell', 'protein', 'uniprot'];
                const hit = cols.find((_c, idx) => keywords.some(k => lower[idx].includes(k)));
                return hit || null;
            }
            if (kind === 'value') {
                const keywords = ['logfc', 'log2fc', 'fold', 'fc', 'ratio', 'expr', 'value', 'intensity', 'score'];
                const hit = cols.find((_c, idx) => keywords.some(k => lower[idx].includes(k)));
                return hit || null;
            }
            if (kind === 'pvalue') {
                const keywords = ['pvalue', 'p-value', 'pval', 'p_value', 'fdr', 'qvalue', 'padj', 'adj'];
                const hit = cols.find((_c, idx) => keywords.some(k => lower[idx].includes(k)));
                return hit || null;
            }
            return null;
        };

        // Validate mapping against ALL selected files to prevent batch failures later.
        for (const f of uploadedFiles) {
            const cols = new Set(f.columns);
            if (!cols.has(selectedGeneCol)) {
                const fallback = findFallback(f.columns, 'gene');
                if (fallback) {
                    addLog(`⚠️ Gene column '${selectedGeneCol}' not found in ${f.path}, using '${fallback}'`);
                } else {
                    alert(`Column '${selectedGeneCol}' not found in file: ${f.path}`);
                    return;
                }
            }
            if (!isRawMatrix) {
                if (!selectedValueCol || !cols.has(selectedValueCol)) {
                    const fallback = findFallback(f.columns, 'value');
                    if (fallback) {
                        addLog(`⚠️ Value column '${selectedValueCol}' not found in ${f.path}, using '${fallback}'`);
                    } else {
                        alert(`Column '${selectedValueCol}' not found in file: ${f.path}`);
                        return;
                    }
                }
                if (selectedPValueCol && !cols.has(selectedPValueCol)) {
                    const fallback = findFallback(f.columns, 'pvalue');
                    if (fallback) {
                        addLog(`⚠️ P-value column '${selectedPValueCol}' not found in ${f.path}, using '${fallback}'`);
                    } else {
                        // P-value is optional - just log a warning, don't block
                        addLog(`ℹ️ P-value column '${selectedPValueCol}' not found in ${f.path}. Will proceed without p-values.`);
                    }
                }
            } else {
                if (rawMode === 'manual') {
                    for (const c of manualControlCols) {
                        if (!cols.has(c)) {
                            alert(`Control column '${c}' not found in file: ${f.path}`);
                            return;
                        }
                    }
                    for (const c of manualTreatCols) {
                        if (!cols.has(c)) {
                            alert(`Experiment column '${c}' not found in file: ${f.path}`);
                            return;
                        }
                    }
                } else {
                    const lowered = f.columns.map(c => c.toLowerCase());
                    const hasCtrl = lowered.some(c => c.includes('ctrl') || c.includes('control'));
                    const hasExp = lowered.some(c => c.includes('exp') || c.includes('treat'));
                    if (!hasCtrl || !hasExp) {
                        alert(`Raw matrix mode requires Ctrl/Exp replicate columns, but they were not detected in file: ${f.path}`);
                        return;
                    }
                }
            }
        }

        const mappingPayload = {
            gene: selectedGeneCol,
            value: effectiveValueCol,
            pvalue: selectedPValueCol || undefined,
            controlCols: isRawMatrix && rawMode === 'manual' ? manualControlCols : undefined,
            treatCols: isRawMatrix && rawMode === 'manual' ? manualTreatCols : undefined,
        };


        // Skip step 3 (Pathway) and go straight to Viz
        const primary = uploadedFiles[0];
        const config: AnalysisConfig = {
            filePaths: uploadedFiles.map(f => f.path),
            mapping: mappingPayload,
            pathwayId: undefined, // Will be selected later in Step 3
            dataType: primary.dataType,
            analysisMethods,
        };

        saveConfig(config);
        addLog('✓ Column mapping complete. Ready to visualize.');
        onComplete(config);
    };

    // --- Renders ---

    return (
        <div className="wizard-container">
            {/* Wizard Header / Stepper */}
            <div className="wizard-header">
                <h2 className="wizard-title">New Analysis</h2>
                <div className="wizard-actions">
                    <span className={`conn-pill ${isConnected ? 'ok' : 'warn'}`}>
                        {isConnected ? 'Engine ready' : 'Engine offline'}
                    </span>
                    <button className="cancel-btn" onClick={onCancel}>✕</button>
                </div>
                <div className="wizard-steps">
                    <div className={`step-indicator ${step >= 1 ? 'active' : ''}`}>1. Import</div>
                    <div className={`step-indicator ${step >= 2 ? 'active' : ''}`}>2. Map</div>
                    <div className={`step-indicator ${step === 2 ? '' : ''}`} style={{ display: 'none' }}>3. Pathway</div>
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
                            sendCommand={sendCommand}
                            onLoadSuccess={handleUploadSuccess}
                            addLog={addLog}
                        />

                        {canQuickLoad && (
                            <div className="quick-load-section">
                                <button onClick={handleQuickLoad} className="btn-quick-load">
                                    <span>⚡</span> Load Last Config
                                    <span style={{ fontSize: '11px', opacity: 0.6 }}>
                                        ({lastConfig?.pathwayId || 'No pathway'} • {lastConfig?.mapping.gene} vs {lastConfig?.mapping.value})
                                    </span>
                                </button>
                                <button
                                    onClick={() => {
                                        if (confirm('Clear saved configuration?')) {
                                            localStorage.removeItem(STORAGE_KEY);
                                            addLog('✓ Configuration cache cleared');
                                            window.location.reload();
                                        }
                                    }}
                                    className="btn-quick-load"
                                    style={{
                                        background: 'rgba(220, 38, 38, 0.1)',
                                        borderColor: 'rgba(220, 38, 38, 0.3)',
                                        marginLeft: '8px'
                                    }}
                                >
                                    <span>🗑️</span> Clear Config
                                </button>
                            </div>
                        )}

                        {onLoadDemo && (
                            <div className="demo-section">
                                <button className="demo-btn" onClick={onLoadDemo}>
                                    🎬 Load Demo Session
                                    <span className="demo-subtitle">{demoTitle || 'Glycolysis timecourse (sample)'}</span>
                                </button>
                                {demoScript && (
                                    <div className="demo-script">
                                        <div className="demo-script-title">Demo flow</div>
                                        {demoScript.split('\n').filter(Boolean).slice(0, 4).map((line, idx) => (
                                            <div key={idx} className="demo-script-line">• {line}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 2: MAPPING */}
                {step === 2 && uploadedFiles && uploadedFiles.length > 0 && (
                    <div className="step-wrapper">
                        <div className="section-header">
                            <h3>Map Columns</h3>
                            <p>Specify which columns contain identifiers, effect size, and optional p-values. Tip: Use clear column names in your data file (e.g., Gene, LogFC, PValue) with row names in the first column to avoid mapping issues.</p>
                        </div>

                        <div className="file-list-card">
                            <div className="file-list-title">
                                Selected files ({uploadedFiles.length})
                            </div>
                            <div className="file-list-items">
                                {uploadedFiles.map((f) => (
                                    <div key={f.path} className="file-list-item">
                                        <span className="file-list-name">{f.path.split(/[\\/]/).pop()}</span>
                                        <button
                                            className="file-list-remove"
                                            onClick={() => {
                                                const next = uploadedFiles.filter(x => x.path !== f.path);
                                                setUploadedFiles(next.length > 0 ? next : null);
                                                onConfigPreview?.(null);
                                                if (next.length === 0) {
                                                    updateStep(1);
                                                }
                                            }}
                                            title="Remove file"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div className="file-list-hint">
                                Column mapping and pathway selection will be applied to all selected files.
                            </div>
                            <div style={{ marginTop: '10px' }}>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    style={{ padding: '8px 12px' }}
                                    onClick={async () => {
                                        try {
                                            const selected = await open({
                                                multiple: true,
                                                filters: [{
                                                    name: 'Data Files',
                                                    extensions: ['csv', 'xlsx', 'xls', 'txt', 'tsv']
                                                }]
                                            });
                                            const picked = Array.isArray(selected)
                                                ? selected.filter((p) => typeof p === 'string') as string[]
                                                : (typeof selected === 'string' ? [selected] : []);
                                            if (picked.length === 0) return;

                                            const cleanHeader = (val: any) => {
                                                const s = String(val ?? '').trim();
                                                return s.replace(/^['"`]/, '').replace(/['"`]$/, '');
                                            };

                                            const newlyLoaded: UploadedFileInfo[] = [];
                                            for (const path of picked) {
                                                const res = await sendCommand('LOAD', { path }, true) as any;
                                                if (!res || res.status !== 'ok') {
                                                    addLog(`❌ Error loading ${path}: ${res?.message || 'Unknown error'}`);
                                                    continue;
                                                }
                                                const cols = Array.isArray(res.columns) ? res.columns.map((c: any) => cleanHeader(c)) : [];
                                                const suggested = res.suggested_mapping || {};
                                                const dataType = baseDataType || 'gene';
                                                newlyLoaded.push({
                                                    path: res.path || path,
                                                    columns: cols,
                                                    preview: Array.isArray(res.preview) ? res.preview : [],
                                                    suggestedMapping: {
                                                        gene: suggested.gene ? cleanHeader(suggested.gene) : undefined,
                                                        value: suggested.value ? cleanHeader(suggested.value) : undefined,
                                                        pvalue: suggested.pvalue ? cleanHeader(suggested.pvalue) : undefined,
                                                    },
                                                    dataType,
                                                });
                                            }

                                            if (newlyLoaded.length === 0) return;
                                            handleUploadSuccess({ files: newlyLoaded });
                                        } catch (err) {
                                            console.error('Add files failed:', err);
                                        }
                                    }}
                                >
                                    + Add Files
                                </button>
                            </div>
                        </div>

                        <div className="mapping-grid">
                            {/* Gene Column */}
                            <div className="mapping-card">
                                <label className="mapping-label">
                                    <span>Entity / Gene column</span>
                                    {uploadedFiles[0].suggestedMapping.gene && <span className="badge-auto">Auto</span>}
                                </label>
                                <select
                                    value={selectedGeneCol}
                                    onChange={e => setSelectedGeneCol(e.target.value)}
                                    className="select-input"
                                >
                                    <option value="">Select Column...</option>
                                    {uploadedFiles[0].columns.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <p className="mapping-hint">Required. Contains Gene Symbols or IDs.</p>
                            </div>

                            {/* Value Column */}
                            <div className="mapping-card">
                                <label className="mapping-label">
                                    <span>Value / Log2FC column</span>
                                    {uploadedFiles[0].suggestedMapping.value && <span className="badge-auto">Auto</span>}
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
                                                        {uploadedFiles[0].columns.map((c) => {
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
                                                        {uploadedFiles[0].columns.map((c) => {
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
                                            {uploadedFiles[0].columns.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                        <p className="mapping-hint">Required. Fold Change or Expression.</p>
                                    </>
                                )}
                            </div>

                            {/* P-Value Column */}
                            <div className="mapping-card">
                                <label className="mapping-label">
                                    <span>P-value column (optional)</span>
                                    {uploadedFiles[0].suggestedMapping.pvalue && <span className="badge-auto">Auto</span>}
                                </label>
                                <select
                                    value={selectedPValueCol}
                                    onChange={e => setSelectedPValueCol(e.target.value)}
                                    className="select-input"
                                >
                                    <option value="">(None)</option>
                                    {uploadedFiles[0].columns.map(c => <option key={c} value={c}>{c}</option>)}
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
                                            {uploadedFiles[0].columns.map(col => {
                                                let highlight = '';
                                                if (col === selectedGeneCol) highlight = 'col-gene';
                                                else if (col === selectedValueCol) highlight = 'col-value';
                                                else if (col === selectedPValueCol) highlight = 'col-pvalue';

                                                return <th key={col} className={highlight}>{col}</th>
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {uploadedFiles[0].preview.slice(0, 5).map((row, i) => (
                                            <tr key={i}>
                                                {row.map((cell, j) => {
                                                    let highlight = '';
                                                    const col = uploadedFiles[0].columns[j];
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
                                Start Visualization →
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};
