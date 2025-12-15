import React, { useState, useRef } from 'react';
import './ImageUploader.css';

interface ImageInfo {
    id: string;
    type: string;
    filename: string;
    path: string;
    analysis?: {
        description: string;
        [key: string]: any;
    };
}

interface ImageUploaderProps {
    sendCommand: (cmd: string, data?: Record<string, unknown>) => Promise<void>;
    isConnected: boolean;
    onImageAnalyzed?: (result: any) => void;
}

const IMAGE_TYPES = [
    { id: 'western_blot', name: 'Western Blot', icon: '🧪' },
    { id: 'flow_cytometry', name: 'Flow Cytometry', icon: '🔬' },
    { id: 'histology', name: 'IHC / Histology', icon: '🔍' },
    { id: 'gel', name: 'Gel / Agarose', icon: '🧫' },
    { id: 'other', name: 'Other', icon: '📷' },
];

export const ImageUploader: React.FC<ImageUploaderProps> = ({
    sendCommand,
    isConnected,
    onImageAnalyzed,
}) => {
    const [selectedType, setSelectedType] = useState('western_blot');
    const [uploadedImages, setUploadedImages] = useState<ImageInfo[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Preview
        const reader = new FileReader();
        reader.onload = (e) => {
            setPreviewImage(e.target?.result as string);
        };
        reader.readAsDataURL(file);

        // Upload to backend
        setIsUploading(true);
        try {
            await sendCommand('UPLOAD_IMAGE', {
                path: file.name, // In a real app, we'd handle file transfer
                type: selectedType,
                metadata: {
                    originalName: file.name,
                    size: file.size,
                    mimeType: file.type,
                },
            });
        } catch (error) {
            console.error('Upload failed:', error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleAnalyze = async (imageId: string) => {
        setIsAnalyzing(imageId);
        try {
            await sendCommand('ANALYZE_IMAGE', { image_id: imageId });
        } catch (error) {
            console.error('Analysis failed:', error);
        } finally {
            setIsAnalyzing(null);
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="image-uploader">
            <div className="image-header">
                <h3>🖼️ Image Analysis</h3>
                <span className="image-count">{uploadedImages.length} images</span>
            </div>

            {/* Image Type Selector */}
            <div className="image-type-selector">
                {IMAGE_TYPES.map((type) => (
                    <button
                        key={type.id}
                        className={selectedType === type.id ? 'active' : ''}
                        onClick={() => setSelectedType(type.id)}
                        title={type.name}
                    >
                        <span className="type-icon">{type.icon}</span>
                        <span className="type-name">{type.name}</span>
                    </button>
                ))}
            </div>

            {/* Upload Area */}
            <div
                className="upload-area"
                onClick={triggerFileInput}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file && fileInputRef.current) {
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        fileInputRef.current.files = dt.files;
                        handleFileSelect({ target: fileInputRef.current } as any);
                    }
                }}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*"
                    hidden
                />
                {isUploading ? (
                    <div className="upload-status">⏳ Uploading...</div>
                ) : previewImage ? (
                    <div className="preview-container">
                        <img src={previewImage} alt="Preview" className="preview-image" />
                        <button className="clear-preview" onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(null);
                        }}>✕</button>
                    </div>
                ) : (
                    <div className="upload-prompt">
                        <span className="upload-icon">📤</span>
                        <span>Drop image here or click to upload</span>
                        <span className="upload-hint">Supports PNG, JPG, TIFF</span>
                    </div>
                )}
            </div>

            {/* AI Analysis Button */}
            {previewImage && (
                <button
                    className="analyze-btn"
                    onClick={() => handleAnalyze('preview')}
                    disabled={!isConnected || isAnalyzing !== null}
                >
                    {isAnalyzing ? '🔄 Analyzing...' : '🤖 Analyze with AI'}
                </button>
            )}

            {/* Uploaded Images List */}
            {uploadedImages.length > 0 && (
                <div className="uploaded-list">
                    <h4>Uploaded Images</h4>
                    {uploadedImages.map((img) => (
                        <div key={img.id} className="uploaded-item">
                            <span className="item-icon">
                                {IMAGE_TYPES.find((t) => t.id === img.type)?.icon || '📷'}
                            </span>
                            <span className="item-name">{img.filename}</span>
                            <button
                                className="item-analyze"
                                onClick={() => handleAnalyze(img.id)}
                                disabled={isAnalyzing === img.id}
                            >
                                {isAnalyzing === img.id ? '...' : '🔍'}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="image-info">
                <p>
                    💡 AI can analyze Western Blots, Flow plots, and histology images
                    to detect bands, cell populations, and staining patterns.
                </p>
            </div>
        </div>
    );
};

export default ImageUploader;
