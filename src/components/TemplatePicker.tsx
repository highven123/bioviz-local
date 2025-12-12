import React, { useState } from 'react';
import './TemplatePicker.css';
import useBioEngine from '../hooks/useBioEngine';
// @ts-ignore
import { invoke } from '@tauri-apps/api/core';

interface TemplatePickerProps {
  onSelect: (pathwayId: string) => void;
  disabled?: boolean;
  dataType?: 'gene' | 'protein' | 'cell';
}

interface PathwayTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  types: ('gene' | 'protein' | 'cell')[];
}

interface SearchResult {
  id: string;
  name: string;
  description: string;
}

// Initial local templates
const INITIAL_TEMPLATES: PathwayTemplate[] = [
  { id: 'hsa04210', name: 'Apoptosis', description: 'Programmed cell death pathway', icon: '💀', types: ['gene', 'protein'] },
  { id: 'hsa04115', name: 'p53 signaling pathway', description: 'Tumor suppressor p53 regulation', icon: '🛡️', types: ['gene', 'protein'] },
  { id: 'hsa04110', name: 'Cell cycle', description: 'Mitosis and cell division control', icon: '🔄', types: ['gene', 'protein'] },
  { id: 'hsa04010', name: 'MAPK signaling pathway', description: 'Mitogen-activated protein kinase cascade', icon: '📶', types: ['gene', 'protein'] },
  { id: 'hsa04151', name: 'PI3K-Akt signaling', description: 'Cell survival and growth regulation', icon: '⚡', types: ['gene', 'protein'] },
  { id: 'hsa05010', name: 'Alzheimer disease', description: 'Neurodegenerative disease pathology', icon: '🧠', types: ['gene'] },
  { id: 'hsa04064', name: 'NF-kappa B signaling', description: 'Inflammation and immunity control', icon: '🔥', types: ['gene', 'protein'] },
  { id: 'hsa04630', name: 'JAK-STAT signaling', description: 'Cytokine receptor signaling', icon: '📡', types: ['gene', 'protein'] },
  // New Cell Lineage Maps
  { id: 'hsa04640', name: 'Hematopoietic Cell Lineage', description: 'Blood cell differentiation tree', icon: 'cell', types: ['cell'] },
  { id: 'hsa04658', name: 'Th1/Th2 Differentiation', description: 'T cell subset polarization', icon: 'cell', types: ['cell'] },
  { id: 'hsa04659', name: 'Th17 Differentiation', description: 'Th17 and Treg development', icon: 'cell', types: ['cell'] },
  { id: 'hsa00010', name: 'Glycolysis / Gluconeogenesis', description: 'Glucose metabolism and ATP generation', icon: '🍞', types: ['gene', 'protein'] },
];

export const TemplatePicker: React.FC<TemplatePickerProps> = ({ onSelect, disabled = false, dataType = 'gene' }) => {
  const [selectedId, setSelectedId] = useState<string>('');
  const [isOnlineMode, setIsOnlineMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Manage templates in state so we can add new ones dynamically
  const [localTemplates, setLocalTemplates] = useState<PathwayTemplate[]>(INITIAL_TEMPLATES);

  const { sendCommand } = useBioEngine();

  const handleSelect = (pathwayId: string) => {
    setSelectedId(pathwayId);
    onSelect(pathwayId);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchResults([]);

    try {
      // @ts-ignore
      const res = await sendCommand('SEARCH_PATHWAY', { query: searchQuery }, true);
      // @ts-ignore
      if (res && res.status === 'ok' && Array.isArray(res.results)) {
        // @ts-ignore
        setSearchResults(res.results);
      } else {
        console.error("Search invalid response:", res);
      }
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleDownload = async (id: string, name: string, description: string) => {
    setDownloadingId(id);
    try {
      // @ts-ignore
      const res = await sendCommand('DOWNLOAD_PATHWAY', { id }, true);
      // @ts-ignore
      if (res && res.status === 'ok') {
        // Add to local list
        const newTemplate: PathwayTemplate = {
          id: id,
          name: name,
          description: description,
          icon: '📥',
          types: ['gene', 'protein', 'cell'] // Assume generic support
        };

        setLocalTemplates(prev => {
          if (prev.find(p => p.id === id)) return prev;
          return [newTemplate, ...prev];
        });

        // Switch back to local view and select it
        setIsOnlineMode(false);
        handleSelect(id);

        // Show success alert? Or just switch backend
        console.log("Downloaded:", (res as any).path);
      } else { // @ts-ignore
        alert(`Download failed: ${res?.message}`);
      }
    } catch (e) {
      alert(`Download error: ${e}`);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="template-picker">
      <div className="template-header">
        <h3>Select pathway template</h3>
        <button
          className={`mode-toggle-btn ${isOnlineMode ? 'active' : ''}`}
          onClick={() => setIsOnlineMode(!isOnlineMode)}
          disabled={disabled}
        >
          {isOnlineMode ? 'Back to Library' : 'Search Online'}
        </button>
      </div>

      {!isOnlineMode ? (
        <>
          <p className="template-picker-hint">
            Choose a KEGG pathway layout for visualization; templates are filtered by data type.
          </p>

          <div className="template-grid">
            {localTemplates.filter(t => t.types.includes(dataType)).map((template) => (
              <div
                key={template.id}
                className={`template-card ${selectedId === template.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                onClick={() => !disabled && handleSelect(template.id)}
              >
                <div className="template-info">
                  <div className="template-title-row">
                    <h4 className="template-name">{template.name}</h4>
                    <span className="template-id-pill">{template.id}</span>
                  </div>
                  <p className="template-description">{template.description}</p>
                  <div className="template-tags">
                    {template.types.map((t) => (
                      <span key={t} className="template-tag">
                        {t === 'gene' && 'Gene'}
                        {t === 'protein' && 'Protein'}
                        {t === 'cell' && 'Cell'}
                      </span>
                    ))}
                  </div>
                </div>
                {selectedId === template.id && (
                  <div className="template-selected-badge">✓</div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="online-search-container">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search KEGG (e.g., 'Metabolism', 'Cell Cycle')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div className="search-results-list">
            {searchResults.length === 0 && !isSearching && searchQuery && (
              <div className="no-results">No pathways found for "{searchQuery}"</div>
            )}

            {searchResults.map((res) => (
              <div key={res.id} className="search-result-item">
                <div className="result-info">
                  <span className="result-id">{res.id}</span>
                  <span className="result-name">{res.name}</span>
                  <span className="result-desc">{res.description}</span>
                </div>
                <button
                  className="download-btn"
                  disabled={downloadingId === res.id}
                  onClick={() => handleDownload(res.id, res.name, res.description)}
                >
                  {downloadingId === res.id ? 'Loading...' : 'Download'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplatePicker;
