import React, { useState, useCallback } from 'react';
import './GmtUploader.css';

interface GmtUploaderProps {
    onGmtLoaded: (gmtPath: string, stats: GmtStats) => void;
    disabled?: boolean;
}

interface GmtStats {
    geneSets: number;
    totalGenes: number;
    avgSetSize: number;
    fileName: string;
}

const GmtUploader: React.FC<GmtUploaderProps> = ({ onGmtLoaded, disabled = false }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadedFile, setLoadedFile] = useState<GmtStats | null>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
    }, [disabled]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled) return;

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            await processFile(files[0]);
        }
    }, [disabled]);

    const processFile = async (file: File) => {
        if (!file.name.endsWith('.gmt')) {
            setError('Please select a .gmt file');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Get file path using Tauri dialog
            const { invoke } = await import('@tauri-apps/api/core');

            // Validate GMT file on backend
            const result = await invoke('validate_gmt_file', {
                path: file.name,
                // For web, we need to read and send content
                content: await file.text()
            });

            const stats = result as GmtStats;
            setLoadedFile(stats);
            onGmtLoaded(file.name, stats);
        } catch (err) {
            setError(`Failed to load GMT: ${err}`);
        } finally {
            setLoading(false);
        }
    };

    const handleBrowse = async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
                multiple: false,
                filters: [{ name: 'GMT Files', extensions: ['gmt'] }]
            });

            if (selected) {
                const { invoke } = await import('@tauri-apps/api/core');
                setLoading(true);
                setError(null);

                const result = await invoke('load_custom_gmt', { path: selected });
                const stats = result as GmtStats;
                setLoadedFile(stats);
                onGmtLoaded(selected as string, stats);
                setLoading(false);
            }
        } catch (err) {
            setError(`Failed to load: ${err}`);
            setLoading(false);
        }
    };

    return (
        <div className="gmt-uploader">
            <div
                className={`gmt-drop-zone ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {loading ? (
                    <div className="gmt-loading">
                        <span className="spinner">⏳</span>
                        <span>Validating GMT file...</span>
                    </div>
                ) : loadedFile ? (
                    <div className="gmt-loaded">
                        <span className="gmt-icon">✅</span>
                        <div className="gmt-info">
                            <div className="gmt-filename">{loadedFile.fileName}</div>
                            <div className="gmt-stats">
                                {loadedFile.geneSets} gene sets • {loadedFile.totalGenes} genes
                            </div>
                        </div>
                        <button
                            className="gmt-clear-btn"
                            onClick={() => setLoadedFile(null)}
                            title="Clear"
                        >
                            ✕
                        </button>
                    </div>
                ) : (
                    <>
                        <span className="gmt-icon">📂</span>
                        <span className="gmt-text">
                            Drag & drop .gmt file here
                        </span>
                        <button
                            className="gmt-browse-btn"
                            onClick={handleBrowse}
                            disabled={disabled}
                        >
                            Browse...
                        </button>
                    </>
                )}
            </div>

            {error && (
                <div className="gmt-error">
                    ⚠️ {error}
                </div>
            )}
        </div>
    );
};

export default GmtUploader;
