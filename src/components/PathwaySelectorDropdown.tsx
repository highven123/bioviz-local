import React, { useState, useRef, useEffect } from 'react';
import { TemplatePicker } from './TemplatePicker';
import './PathwaySelectorDropdown.css';

interface PathwaySelectorDropdownProps {
    onSelect: (pathwayId: string) => void;
    currentPathwayId?: string;
    currentPathwayName?: string;
    dataType: 'gene' | 'protein' | 'cell';
    sendCommand: (cmd: string, data?: Record<string, unknown>, waitForResponse?: boolean) => Promise<any>;
}

export const PathwaySelectorDropdown: React.FC<PathwaySelectorDropdownProps> = ({
    onSelect,
    currentPathwayId,
    currentPathwayName,
    dataType,
    sendCommand
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (pathwayId: string) => {
        onSelect(pathwayId);
        setIsOpen(false);
    };

    const displayName = currentPathwayName
        ? currentPathwayName.replace(/hsa:?\d+/gi, '').replace(/kegg/gi, '').trim()
        : 'Select Pathway...';

    return (
        <div className="pathway-selector-container" ref={containerRef}>
            <button
                className={`pathway-selector-trigger ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="pathway-icon">🧬</span>
                <span className="pathway-name" title={currentPathwayName || ''}>{displayName}</span>
                {currentPathwayId && <span className="pathway-id">{currentPathwayId}</span>}
                <span className="dropdown-arrow">▼</span>
            </button>

            {isOpen && (
                <div className="pathway-selector-popover">
                    <TemplatePicker
                        onSelect={handleSelect}
                        dataType={dataType}
                        sendCommand={sendCommand}
                    />
                </div>
            )}
        </div>
    );
};
