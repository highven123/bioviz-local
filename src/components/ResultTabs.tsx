import React from 'react';
import './ResultTabs.css';

export interface ResultTabItem {
  key: string;
  label: string;
}

interface ResultTabsProps {
  tabs: ResultTabItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export const ResultTabs: React.FC<ResultTabsProps> = ({ tabs, activeIndex, onSelect }) => {
  if (tabs.length <= 1) return null;

  return (
    <div className="result-tabs">
      {tabs.map((t, idx) => (
        <button
          key={t.key}
          className={`result-tab ${idx === activeIndex ? 'active' : ''}`}
          onClick={() => onSelect(idx)}
          title={t.label}
          type="button"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
};

