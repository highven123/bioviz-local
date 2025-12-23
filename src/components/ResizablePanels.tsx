import React, { useState, useRef, useEffect } from 'react';
import './ResizablePanels.css';

interface ResizablePanelsProps {
    leftPanel: React.ReactNode;
    rightPanel: React.ReactNode;
    defaultLeftWidth?: number; // percentage
    minLeftWidth?: number; // percentage
    maxLeftWidth?: number; // percentage
}

export const ResizablePanels: React.FC<ResizablePanelsProps> = ({
    leftPanel,
    rightPanel,
    defaultLeftWidth = 70,
    minLeftWidth = 30,
    maxLeftWidth = 85
}) => {
    const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !containerRef.current) return;

            const containerRect = containerRef.current.getBoundingClientRect();
            const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

            // Clamp the width
            const clampedWidth = Math.max(minLeftWidth, Math.min(maxLeftWidth, newLeftWidth));
            setLeftWidth(clampedWidth);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isDragging, minLeftWidth, maxLeftWidth]);

    return (
        <div className="resizable-panels-container" ref={containerRef}>
            <div 
                className="resizable-panel left-panel" 
                style={{ width: `${leftWidth}%` }}
            >
                {leftPanel}
            </div>
            
            <div 
                className="resize-handle"
                onMouseDown={() => setIsDragging(true)}
            >
                <div className="resize-handle-line" />
            </div>
            
            <div 
                className="resizable-panel right-panel" 
                style={{ width: `${100 - leftWidth}%` }}
            >
                {rightPanel}
            </div>
        </div>
    );
};
