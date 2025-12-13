import React from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useDropzone } from 'react-dropzone';

// Single file info returned after loading
export interface LoadedFileInfo {
    filePath: string;
    fileName: string;
    columns: string[];
    preview: string[][];
    suggestedMapping: { gene?: string; value?: string; pvalue?: string };
    dataType: 'gene' | 'protein' | 'cell';
}

interface FileDropZoneProps {
    onLoadSuccess: (data: {
        files?: LoadedFileInfo[];
        filePath?: string;
        columns?: string[];
        preview?: string[][];
        suggestedMapping?: { gene?: string; value?: string; pvalue?: string };
        dataType?: 'gene' | 'protein' | 'cell';
    }) => void;
    addLog: (message: string) => void;
    sendCommand: (cmd: string, data?: Record<string, unknown>, waitForResponse?: boolean) => Promise<any>;
}

import { ScientificIcon } from './ScientificIcon';
import './FileDropZone.css';

// Helper to extract filename from path
const getFileName = (filePath: string): string => {
    const parts = filePath.split(/[\\/]/);
    return parts[parts.length - 1] || filePath;
};

export const FileDropZone: React.FC<FileDropZoneProps> = ({ onLoadSuccess, addLog, sendCommand }) => {
    const [loading, setLoading] = React.useState(false);
    const [loadingProgress, setLoadingProgress] = React.useState<string>('');
    const [dataType, setDataType] = React.useState<'gene' | 'protein' | 'cell' | null>(null);

    // Load a single file and return its info
    const loadSingleFile = async (filePath: string, dtype: 'gene' | 'protein' | 'cell'): Promise<LoadedFileInfo | null> => {
        try {
            const response = await sendCommand('LOAD', { path: filePath }, true) as any;

            if (response && response.status === 'ok') {
                const cleanHeader = (val: any) => {
                    const s = String(val ?? '').trim();
                    return s.replace(/^['"`]/, '').replace(/['"`]$/, '');
                };
                const cleanedColumns = (response.columns || []).map((c: any) => cleanHeader(c));
                const suggested = response.suggested_mapping || {};

                return {
                    filePath: response.path || filePath,
                    fileName: getFileName(response.path || filePath),
                    columns: cleanedColumns,
                    preview: response.preview || [],
                    suggestedMapping: {
                        gene: suggested.gene ? cleanHeader(suggested.gene) : undefined,
                        value: suggested.value ? cleanHeader(suggested.value) : undefined,
                        pvalue: suggested.pvalue ? cleanHeader(suggested.pvalue) : undefined
                    },
                    dataType: dtype
                };
            } else {
                addLog(`❌ Error loading ${getFileName(filePath)}: ${response?.message || 'Unknown error'}`);
                return null;
            }
        } catch (e: any) {
            addLog(`❌ Error loading ${getFileName(filePath)}: ${e.message || e}`);
            return null;
        }
    };

    // Handle multiple files
    const handleFiles = async (filePaths: string[]) => {
        if (!dataType || filePaths.length === 0) return;

        setLoading(true);
        const loadedFiles: LoadedFileInfo[] = [];

        for (let i = 0; i < filePaths.length; i++) {
            const filePath = filePaths[i];
            const fileName = getFileName(filePath);

            setLoadingProgress(`Loading ${i + 1}/${filePaths.length}: ${fileName}`);
            addLog(`📂 Loading file: ${fileName}`);

            const result = await loadSingleFile(filePath, dataType);
            if (result) {
                loadedFiles.push(result);
                addLog(`✅ Loaded: ${fileName}`);
            }
        }

        setLoading(false);
        setLoadingProgress('');

        if (loadedFiles.length > 0) {
            // Pass in a format compatible with existing handleUploadSuccess
            onLoadSuccess({ files: loadedFiles });
        }
    };

    const onDrop = async (files: File[]) => {
        if (files.length === 0) return;
        // @ts-ignore - Tauri file path access
        const filePaths = files.map(f => f.path).filter(Boolean);
        await handleFiles(filePaths);
    };

    const handleBrowseClick = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        try {
            const selected = await open({
                multiple: true, // Enable multi-select
                filters: [{
                    name: 'Data Files',
                    extensions: ['csv', 'xlsx', 'xls', 'txt', 'tsv']
                }]
            });

            if (selected) {
                // selected can be string or string[]
                const paths = Array.isArray(selected) ? selected : [selected];
                await handleFiles(paths);
            }
        } catch (error) {
            console.error("Failed to open dialog:", error);
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'text/csv': ['.csv'],
            'application/vnd.ms-excel': ['.xls'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'text/plain': ['.txt', '.tsv']
        },
        multiple: true, // Enable multiple files
        noClick: true,
        disabled: !dataType
    });

    const onContainerClick = (e: React.MouseEvent) => {
        if (isDragActive) return;
        handleBrowseClick(e);
    };

    // Phase 1: Data Type Selection
    if (!dataType) {
        return (
            <div className="dtype-selection-container">
                <h3 className="dtype-title">
                    Select Data Type
                </h3>
                <p className="dtype-subtitle">
                    Choose what kind of biological data you are uploading so BioViz can apply the right defaults.
                </p>

                <div className="dtype-grid">
                    <button onClick={() => setDataType('gene')} className="dtype-card">
                        <div className="dtype-badge">RNA</div>
                        <div className="dtype-text">
                            <span className="dtype-label">Transcriptomics</span>
                            <span className="dtype-caption">Gene expression (bulk / single‑cell)</span>
                        </div>
                    </button>

                    <button onClick={() => setDataType('protein')} className="dtype-card">
                        <div className="dtype-badge">PROT</div>
                        <div className="dtype-text">
                            <span className="dtype-label">Proteomics</span>
                            <span className="dtype-caption">Protein abundance or ratios</span>
                        </div>
                    </button>

                    <button onClick={() => setDataType('cell')} className="dtype-card">
                        <div className="dtype-badge">FLOW</div>
                        <div className="dtype-text">
                            <span className="dtype-label">Flow Cytometry</span>
                            <span className="dtype-caption">Cell population frequencies</span>
                        </div>
                    </button>
                </div>
            </div>
        );
    }

    // Phase 2: File Upload
    const typeLabels = {
        'gene': { icon: 'gene', text: 'Gene Expression' },
        'protein': { icon: 'protein', text: 'Proteomics' },
        'cell': { icon: 'cell', text: 'Flow Cytometry' }
    };
    const currentLabel = typeLabels[dataType];

    return (
        <div className="file-drop-zone-container">
            {/* Back Button */}
            <button
                onClick={(e) => { e.stopPropagation(); setDataType(null); }}
                className="file-drop-back-btn"
            >
                <span>←</span>
                <span>Change Data Type</span>
            </button>

            <div
                {...getRootProps()}
                onClick={onContainerClick}
                className="file-drop-zone"
                style={{
                    backgroundColor: isDragActive ? 'rgba(37, 99, 235, 0.24)' : 'rgba(15, 23, 42, 0.72)',
                    borderColor: isDragActive ? 'var(--brand-primary)' : 'rgba(148, 163, 184, 0.6)',
                }}
            >
                <input {...getInputProps()} />

                {loading ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <div className="spinner" style={{ marginBottom: '16px' }}>⏳</div>
                        <p>{loadingProgress || 'Parsing datasets...'}</p>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            marginBottom: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <ScientificIcon icon={currentLabel.icon} size={64} />
                            <span style={{
                                fontSize: '14px',
                                color: 'var(--accent-primary)',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '1px'
                            }}>
                                {currentLabel.text} Mode
                            </span>
                        </div>

                        <h3 className="file-drop-main-title">
                            Drag & Drop your {currentLabel.text} Files
                        </h3>
                        <p className="file-drop-subtitle">
                            Supports .xlsx and .csv — select multiple files for batch analysis.
                        </p>
                        <button className="file-drop-cta">
                            Choose Files
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
