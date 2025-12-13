import React, { useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useDropzone } from 'react-dropzone';

interface FileDropZoneProps {
    onLoadSuccess: (data: {
        filePath: string;
        columns: string[];
        preview: string[][];
        suggestedMapping: { gene?: string; value?: string; pvalue?: string };
        dataType: 'gene' | 'protein' | 'cell';
    }) => void;
    addLog: (message: string) => void;
}

import { listen } from '@tauri-apps/api/event';
import { ScientificIcon } from './ScientificIcon';
import './FileDropZone.css';

export const FileDropZone: React.FC<FileDropZoneProps> = ({ onLoadSuccess, addLog }) => {
    const [loading, setLoading] = React.useState(false);
    const [dataType, setDataType] = React.useState<'gene' | 'protein' | 'cell' | null>(null); // Null means no selection yet
    const selectedPathRef = useRef<string | null>(null);

    const handleFile = async (filePath: string) => {
        if (!dataType) return; // Should not happen

        setLoading(true);
        addLog(`📂 Loading file: ${filePath}`);

        try {
            const response = await new Promise<any>(async (resolve, reject) => {
                let unlistenOutput: (() => void) | undefined;
                let unlistenError: (() => void) | undefined;
                let timeoutId: any;

                const cleanup = () => {
                    if (unlistenOutput) unlistenOutput();
                    if (unlistenError) unlistenError();
                    clearTimeout(timeoutId);
                };

                // Listen for sidecar output
                unlistenOutput = await listen('sidecar-output', (event: any) => {
                    try {
                        const data = JSON.parse(event.payload);
                        if (data.status === 'ok' || data.status === 'error') {
                            cleanup();
                            resolve(data);
                        }
                    } catch (e) {
                        // Ignore non-JSON output
                    }
                });

                // Listen for sidecar logs
                unlistenError = await listen('sidecar-error', (event: any) => {
                    console.warn("Sidecar stderr:", event.payload);
                });

                // Timeout after 60 seconds
                timeoutId = setTimeout(() => {
                    cleanup();
                    reject(new Error("Timeout waiting for sidecar response"));
                }, 60000);

                // Send command
                invoke('send_command', {
                    payload: JSON.stringify({ cmd: 'LOAD', payload: { path: filePath } })
                }).catch(e => {
                    cleanup();
                    reject(e);
                });
            });

            if (response.status === 'ok') {
                addLog('✅ File loaded successfully');
                if (response.is_transposed) {
                    addLog('🔄 Wide matrix detected and transposed');
                }

                const cleanHeader = (val: any) => {
                    const s = String(val ?? '').trim();
                    return s.replace(/^['"`]/, '').replace(/['"`]$/, '');
                };
                const cleanedColumns = (response.columns || []).map((c: any) => cleanHeader(c));
                const suggested = response.suggested_mapping || {};

                onLoadSuccess({
                    filePath: response.path || filePath,
                    columns: cleanedColumns,
                    preview: response.preview || [],
                    suggestedMapping: {
                        gene: suggested.gene ? cleanHeader(suggested.gene) : undefined,
                        value: suggested.value ? cleanHeader(suggested.value) : undefined,
                        pvalue: suggested.pvalue ? cleanHeader(suggested.pvalue) : undefined
                    },
                    dataType: dataType
                });
            } else {
                addLog(`❌ Error: ${response.message}`);
            }
        } catch (error: any) {
            addLog(`❌ Error loading file: ${error.message || error}`);
        } finally {
            setLoading(false);
        }
    };

    const onDrop = async (files: File[]) => {
        if (files.length === 0) return;
        const file = files[0];
        // @ts-ignore - Tauri file path access
        const filePath = file.path || (await file.text());
        selectedPathRef.current = filePath;
        await handleFile(filePath);
    };

    const handleBrowseClick = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Data Files',
                    extensions: ['csv', 'xlsx', 'xls', 'txt', 'tsv']
                }]
            });

            if (selected && typeof selected === 'string') {
                selectedPathRef.current = selected;
                await handleFile(selected);
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
        multiple: false,
        noClick: true,
        disabled: !dataType // Disable drop if no type selected (though UI hides it)
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

    // Phase 2: File Upload (Specific to selected Type)
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
                        <p>Parsing dataset...</p>
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
                            Drag & Drop your {currentLabel.text} File
                        </h3>
                        <p className="file-drop-subtitle">
                            Supports .xlsx and .csv — or click anywhere in this panel.
                        </p>
                        <button className="file-drop-cta">
                            Choose File
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
