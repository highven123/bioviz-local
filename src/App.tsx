import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useBioEngine } from './hooks/useBioEngine';
import { DataImportWizard, AnalysisConfig } from './components/DataImportWizard';
import { VolcanoPlot, VolcanoPoint, VolcanoViewMode } from './components/VolcanoPlot';
import { EvidencePopup, GeneDetail } from './components/EvidencePopup';
import { PathwayVisualizer, PathwayVisualizerRef } from './components/PathwayVisualizer';
import { DataTable } from './components/DataTable';
import { ResultTabs } from './components/ResultTabs';
import { WorkflowBreadcrumb, WorkflowStep } from './components/WorkflowBreadcrumb';
import { SplashScreen } from './components/SplashScreen'; // New Import
import { SafetyGuardModal } from './components/SafetyGuardModal';
import { AIChatPanel } from './components/AIChatPanel';
import { InsightBadges } from './components/InsightBadges';
import { GSEAPanel } from './components/GSEAPanel';
import { ImageUploader } from './components/ImageUploader';
import { AIEventPanel } from './components/AIEventPanel';
import { exportSession, importSession } from './utils/sessionExport';
import { MultiSamplePanel } from './components/MultiSamplePanel';
import { eventBus, BioVizEvents } from './stores/eventBus';
import { ENTITY_META, resolveEntityKind, EntityKind } from './entityTypes';
import { AnalysisInsights } from './types/insights';
import { openPath } from '@tauri-apps/plugin-opener';
import { save, ask } from '@tauri-apps/plugin-dialog';
import { writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import './App.css';

// ... (Types remain same) ...
// --- Types ---
interface PathwayData {
  id: string;
  name: string;
  title?: string;
  nodes: any[];
  edges: any[];
}

interface AnalysisResult {
  pathway: PathwayData;
  statistics: any;
  volcano_data: VolcanoPoint[];
  has_pvalue: boolean;
  gene_map: Record<string, VolcanoPoint>;
  config: AnalysisConfig;
  entityKind: EntityKind;
  analysis_table_path?: string;
  sourceFilePath: string;
  insights?: AnalysisInsights;  // AI-generated insights
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;  // AI chat history per analysis
}

// Helper to derive base filename (without extension) from a full path
function getBaseName(filePath: string | undefined | null): string {
  if (!filePath) return 'analysis';
  const parts = filePath.split(/[\\/]/);
  const fileName = parts[parts.length - 1] || filePath;
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  return withoutExt || 'analysis';
}

function App() {
  const [showSplash, setShowSplash] = useState(true); // Splash State

  const { isConnected, isLoading: engineLoading, sendCommand, activeProposal, resolveProposal, lastResponse } = useBioEngine();

  // --- State ---
  const [draftConfig, setDraftConfig] = useState<AnalysisConfig | null>(null);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [maxWizardStep, setMaxWizardStep] = useState<1 | 2 | 3>(1);
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('upload');

  // Restore analysisResults from localStorage on mount
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>(() => {
    try {
      const saved = localStorage.getItem('bioviz_sessions');
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('[App] Restored', parsed.length, 'sessions from localStorage');
        return parsed;
      }
    } catch (e) {
      console.error('[App] Failed to restore sessions:', e);
    }
    return [];
  });

  const [activeResultIndex, setActiveResultIndex] = useState<number>(0);
  const [filteredGenes, setFilteredGenes] = useState<string[]>([]);
  const [activeGene, setActiveGene] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [leftPanelView, setLeftPanelView] = useState<'chart' | 'table' | 'ai-chat' | 'gsea' | 'images' | 'multi-sample'>('chart');
  const [showEvidencePopup, setShowEvidencePopup] = useState(false);
  const [chartViewMode, setChartViewMode] = useState<VolcanoViewMode>('volcano');

  const activeAnalysis = analysisResults[activeResultIndex] || null;
  const uploadedFileBase = getBaseName(activeAnalysis?.sourceFilePath);

  const [batchRunning, setBatchRunning] = useState(false);

  // License State (Simulated)
  const isPro = true;

  // Auto-save analysisResults to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('bioviz_sessions', JSON.stringify(analysisResults));
      console.log('[App] Saved', analysisResults.length, 'sessions to localStorage');
    } catch (e) {
      console.error('[App] Failed to save sessions:', e);
    }
  }, [analysisResults]);

  // --- Resizing Logic ---
  const [colSizes, setColSizes] = useState<number[]>([20, 55, 25]); // Left, Center, Right in %
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const vizRef = useRef<PathwayVisualizerRef>(null);

  // Start resizing
  const startResize = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    setDragIdx(idx);
  };

  // Handle dragging (GLOBAL effect when dragging)
  useEffect(() => {
    if (dragIdx === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const containerWidth = containerRef.current.clientWidth;
      // Convert layout to pixel positions to find current split points
      // Or easier: Calculate movement delta as percentage
      // Resizer 0 affects col 0 and 1. Resizer 1 affects col 1 and 2.

      // Get current sizes
      const sizes = [...colSizes];

      // Calculate mouse position relative to container
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const percentX = (relativeX / containerWidth) * 100;

      // Min width constraint (e.g. 10%)
      const minW = 10;

      if (dragIdx === 0) {
        // Moving Splitter 1 (between 0 and 1)
        // percentX is effectively the new size of col 0 (roughly, ignoring gutters for simplicity)
        let newCol0 = percentX;

        // Constraints
        if (newCol0 < minW) newCol0 = minW;
        if (newCol0 > (sizes[0] + sizes[1] - minW)) newCol0 = sizes[0] + sizes[1] - minW;

        // Calculate delta
        const delta = newCol0 - sizes[0];
        sizes[0] += delta;
        sizes[1] -= delta;
      }
      else if (dragIdx === 1) {
        // Moving Splitter 2 (between 1 and 2)
        // The position of splitter 2 is size[0] + size[1]
        // So new (size[0] + size[1]) = percentX

        const currentSplitPos = sizes[0] + sizes[1];
        let newSplitPos = percentX;

        // Constraints based on col1 min width and col2 min width
        if (newSplitPos < (sizes[0] + minW)) newSplitPos = sizes[0] + minW;
        if (newSplitPos > (100 - minW)) newSplitPos = 100 - minW;

        const delta = newSplitPos - currentSplitPos;
        sizes[1] += delta;
        sizes[2] -= delta;
      }

      setColSizes(sizes);
    };

    const handleMouseUp = () => {
      setDragIdx(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragIdx, colSizes]);
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const line = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev.slice(-20), line]);

    // Persist a lightweight run log for debugging (user home dir)
    const persistLog = async () => {
      try {
        await writeTextFile(
          'bioviz_run.log',
          line + '\n',
          {
            baseDir: BaseDirectory.AppData,
            append: true,
          }
        );
      } catch (e) {
        // Ignore logging failures to avoid disrupting UX
        console.warn('Run log write failed:', e);
      }
    };
    void persistLog();
  };

  // --- Actions ---
  const handleAnalysisStart = async (config: AnalysisConfig) => {
    addLog(`Running analysis for pathway: ${config.pathwayId}...`);
    setBatchRunning(true);

    // Prepare UI for new analysis
    setAnalysisResults([]);
    setActiveResultIndex(0);
    setFilteredGenes([]);
    setActiveGene(null);
    setWorkflowStep('viz');

    const primaryMethod = (config.analysisMethods && config.analysisMethods[0]) || 'auto';

    let successCount = 0;
    for (const filePath of config.filePaths) {
      const base = getBaseName(filePath);
      addLog(`▶ Analyzing: ${base}`);

      try {
        const response = await sendCommand(
          'ANALYZE',
          {
            file_path: filePath,
            mapping: config.mapping,
            template_id: config.pathwayId,
            data_type: config.dataType,
            filters: {
              method: primaryMethod,
              methods: config.analysisMethods,
            },
          },
          true,
        ) as any;

        if (response?.status !== 'ok' || !response?.pathway) {
          addLog(`❌ Analysis failed for ${base}: ${response?.message || 'Unknown error'}`);
          continue;
        }

        const volcano: VolcanoPoint[] = Array.isArray(response.volcano_data)
          ? response.volcano_data
          : [];
        const gene_map: Record<string, VolcanoPoint> = {};
        volcano.forEach((p: VolcanoPoint) => {
          gene_map[p.gene] = p;
        });

        const entityKind = resolveEntityKind(
          response.pathway?.metadata?.data_type,
          config?.dataType,
        );

        const result: AnalysisResult = {
          pathway: response.pathway,
          statistics: response.statistics,
          volcano_data: volcano,
          has_pvalue: Boolean(response.has_pvalue),
          gene_map,
          config,
          entityKind,
          analysis_table_path: response.analysis_table_path || undefined,
          sourceFilePath: filePath,
          insights: response.insights,  // AI-generated insights from backend
        };

        setAnalysisResults((prev) => [...prev, result]);
        successCount += 1;

        // v2.0: Emit event for AI proactive suggestions
        eventBus.emit(BioVizEvents.ANALYSIS_COMPLETE, {
          statistics: response.statistics,
          pathwayName: response.pathway.name || response.pathway.title,
          geneCount: volcano.length,
        });

        const pathwayName =
          response.pathway.name ||
          response.pathway.title ||
          response.pathway.id ||
          'analysis';
        addLog(`✓ Done: ${base} → ${pathwayName}`);
      } catch (e: any) {
        addLog(`❌ Analysis error for ${base}: ${e?.message || String(e)}`);
      }
    }

    setBatchRunning(false);
    if (successCount === 0) {
      alert('Analysis failed for all selected files.');
    }
  };



  const activeGeneDetail = useMemo((): GeneDetail | null => {
    if (!activeAnalysis || !activeGene) return null;
    const point = activeAnalysis.gene_map[activeGene];
    if (!point) return null;
    return {
      name: point.gene,
      logFC: point.x,
      pvalue: point.pvalue
    };
  }, [activeAnalysis, activeGene]);

  // --- Entity labels derived from analysis data (fallback: gene) ---
  const entityKind: EntityKind = activeAnalysis?.entityKind || 'gene';
  const entityLabels = ENTITY_META[entityKind];

  // --- Check if data has mean values for MA plot ---
  const hasMAData = !!activeAnalysis?.volcano_data?.some(
    (p) => typeof p.mean === 'number' && !Number.isNaN(p.mean)
  );

  // If current result doesn't support MA but view is set to MA, auto-switch to Volcano
  useEffect(() => {
    if (activeAnalysis && !hasMAData && chartViewMode === 'ma') {
      setChartViewMode('volcano');
    }
  }, [activeAnalysis, hasMAData, chartViewMode]);

  // --- Workflow navigation ---
  const canAccessMapping = maxWizardStep >= 2;
  const canAccessGallery = maxWizardStep >= 3;
  const canAccessViz = analysisResults.length > 0;

  const handleWorkflowStepClick = (step: WorkflowStep) => {
    if (step === 'upload') {
      setWizardStep(1);
      setWorkflowStep('upload');
      return;
    }
    if (step === 'mapping') {
      if (!canAccessMapping) return;
      setWizardStep(2);
      setWorkflowStep('mapping');
      return;
    }
    if (step === 'gallery') {
      if (!canAccessGallery) return;
      setWizardStep(3);
      setWorkflowStep('gallery');
      return;
    }
    if (step === 'viz') {
      // If analysis results exist, switch directly to visualization
      if (analysisResults.length > 0) {
        setWorkflowStep('viz');
        return;
      }
      // If config is ready (import + mapping + pathway selected), trigger analysis from top Step4
      if (draftConfig) {
        handleAnalysisStart(draftConfig);
      }
    }
  };

  // When user clicks a node in the pathway map,
  // sync both the active gene (for Evidence) and selection (for highlighting)
  const handlePathwayNodeClick = (name: string) => {
    setActiveGene(name);
    setFilteredGenes(name ? [name] : []);
    if (name) setShowEvidencePopup(true);
  };

  const resultTabs = useMemo(() => {
    return analysisResults.map((r, idx) => {
      const base = getBaseName(r.sourceFilePath);
      const trimmed = base.length > 12 ? `${base.slice(0, 12)}…` : base;
      const label = `${trimmed} #${idx + 1}`;
      return { key: `${r.sourceFilePath}:${idx}`, label };
    });
  }, [analysisResults]);

  const handleSelectResult = (idx: number) => {
    setActiveResultIndex(idx);
    setFilteredGenes([]);
    setActiveGene(null);
  };

  // --- Render ---

  if (showSplash) {
    return <SplashScreen onEnter={() => setShowSplash(false)} />;
  }

  return (
    <div className="workbench-container">
      {/* SAFETY GUARD: Blocks all interaction when active */}
      <SafetyGuardModal
        proposal={activeProposal}
        onRespond={resolveProposal}
      />
      {/* ... keeping the rest of the layout same ... */}

      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <h1>
            <span>🧬</span>
            BioViz <span>Local</span>
          </h1>
          {activeAnalysis && (
            <span style={{
              marginLeft: '20px',
              padding: '4px 12px',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              fontSize: '12px',
              color: 'var(--text-secondary)'
            }}>
              {(activeAnalysis.pathway.name || activeAnalysis.pathway.title || 'Pathway').replace(/hsa:?\d+/gi, '').replace(/kegg/gi, '').trim()}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <div className="status-indicator">
            <div className={`status-dot ${!isConnected ? 'disconnected' : ''}`}
              style={{ backgroundColor: isConnected ? 'var(--color-success)' : 'var(--color-danger)' }}
            />
            {isConnected ? 'Engine Ready' : 'Connecting...'}
          </div>
          <button
            onClick={() => setLeftPanelView('ai-chat')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              color: leftPanelView === 'ai-chat' ? '#fff' : 'var(--text-secondary)',
              padding: '6px 14px',
              background: leftPanelView === 'ai-chat'
                ? 'rgba(102, 126, 234, 0.3)'
                : 'rgba(102, 126, 234, 0.1)',
              border: leftPanelView === 'ai-chat'
                ? '1px solid rgba(102, 126, 234, 0.5)'
                : '1px solid transparent',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (leftPanelView !== 'ai-chat') {
                e.currentTarget.style.background = 'rgba(102, 126, 234, 0.15)';
              }
            }}
            onMouseLeave={(e) => {
              if (leftPanelView !== 'ai-chat') {
                e.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)';
              }
            }}
          >
            <span style={{ fontSize: '16px' }}>🤖</span>
            <span>BioViz AI Assistant</span>
          </button>
          {activeAnalysis && (
            <>
              <button
                onClick={() => exportSession(activeAnalysis)}
                title="Export Session (JSON + Markdown)"
                style={{
                  padding: '6px 12px',
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)'}
              >
                📥
              </button>
              <button
                onClick={async () => {
                  const imported = await importSession();
                  if (imported) {
                    setAnalysisResults(prev => [...prev, imported as any]);
                    setActiveResultIndex(analysisResults.length);
                  }
                }}
                title="Import Session (JSON)"
                style={{
                  padding: '6px 12px',
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
              >
                📤
              </button>
            </>
          )}
        </div>
      </header>

      {/* Global Workflow Stepper */}
      <WorkflowBreadcrumb
        currentStep={workflowStep}
        canAccessMapping={canAccessMapping}
        canAccessGallery={canAccessGallery}
        canAccessViz={canAccessViz}
        onStepClick={handleWorkflowStepClick}
      />

      {/* Wizard Overlay for steps 1-3 (keeps state alive) */}
      <div
        className="wizard-overlay"
        style={{ display: workflowStep === 'viz' ? 'none' : 'flex' }}
      >
        <DataImportWizard
          onComplete={handleAnalysisStart}
          onCancel={() => { }}
          addLog={addLog}
          isConnected={isConnected}
          sendCommand={sendCommand}
          activeStep={wizardStep}
          onStepChange={(s) => {
            setWizardStep(s);
            setMaxWizardStep(prev => (s > prev ? s : prev));
            setWorkflowStep(s === 1 ? 'upload' : s === 2 ? 'mapping' : 'gallery');
          }}
          onConfigPreview={setDraftConfig}
        />
      </div>

      {/* Workbench is always mounted; wizard hides it for steps 1-3 via display */}
      <main
        className="workbench-layout"
        style={{
          display: workflowStep === 'viz' ? 'grid' : 'none',
          gridTemplateColumns: `${colSizes[0]}% 6px ${colSizes[1]}% 6px ${colSizes[2]}%`, // 6px for gutters
          gap: '0', // Override default gap
        }}
        ref={containerRef}
      >
        {/* Left Panel: Volcano / Data Table */}
        <div className="panel-col" style={{ borderRight: '1px solid var(--border-subtle)' }}>
          <div className="panel-header" style={{ justifyContent: 'space-between', paddingRight: '12px' }}>
            <div className="left-panel-toggle-group">
              <button
                onClick={() => { setLeftPanelView('chart'); setChartViewMode('volcano'); }}
                className={`left-toggle-btn ${leftPanelView === 'chart' && chartViewMode === 'volcano' ? 'active' : ''}`}
              >
                Volcano
              </button>
              <button
                onClick={() => {
                  if (!hasMAData) return;
                  setLeftPanelView('chart');
                  setChartViewMode('ma');
                }}
                disabled={!hasMAData}
                className={`left-toggle-btn ${leftPanelView === 'chart' && chartViewMode === 'ma' ? 'active' : ''}`}
              >
                MA
              </button>
              <button
                onClick={() => { setLeftPanelView('chart'); setChartViewMode('ranked'); }}
                className={`left-toggle-btn ${leftPanelView === 'chart' && chartViewMode === 'ranked' ? 'active' : ''}`}
              >
                Ranked
              </button>
              <button
                onClick={() => setLeftPanelView('table')}
                className={`left-toggle-btn ${leftPanelView === 'table' ? 'active' : ''}`}
              >
                Table
              </button>
            </div>

            {filteredGenes.length > 0 && leftPanelView === 'chart' && (
              <span
                style={{ fontSize: '11px', color: '#60a5fa', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => setFilteredGenes([])}
              >
                Clear ({filteredGenes.length})
              </span>
            )}
          </div>
          <div className="panel-body">
            {activeAnalysis?.volcano_data ? (
              leftPanelView === 'chart' ? (
                chartViewMode === 'ma' && !hasMAData ? (
                  <div className="empty-state">
                    Current data does not have mean expression values (e.g., BaseMean or Ctrl/Exp groups).
                    MA plot is not supported. Please switch to Volcano or Ranked view.
                  </div>
                ) : (
                  <VolcanoPlot
                    data={activeAnalysis.volcano_data}
                    viewMode={chartViewMode}
                    onSelectionChange={setFilteredGenes}
                    onPointClick={setActiveGene}
                  />
                )
              ) : (
                <DataTable
                  data={activeAnalysis.volcano_data}
                  onRowClick={setActiveGene}
                  labels={entityLabels}
                />
              )
            ) : (
              <div className="empty-state">
                No Data Loaded
              </div>
            )}
          </div>
        </div>

        {/* Resizer 1 */}
        <div
          className={`resizer-gutter ${dragIdx === 0 ? 'dragging' : ''}`}
          onMouseDown={(e) => startResize(0, e)}
        />

        {/* Center Panel: Pathway */}
        <div className="panel-col" style={{ background: 'var(--bg-panel)' }}>
          <div className="panel-header">
            <span>Pathway Landscape</span>

            {/* Header Controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Empty left side or title? Title is already "Pathway Landscape" outside this div? */
                        /* Actually the "Pathway Landscape" text is inside the panel-header but outside this Flex container? */
                        /* Let's double check lines 477-482 in previous code view */
                        /* Line 477: <span>Pathway Landscape</span> */
                        /* Line 481: <div ... justifyContent: 'space-between' ...> */
                        /* So simply removing the stats div works. */}
              </div>

              {/* Right Actions: Toolbar */}
              {activeAnalysis && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    onClick={() => vizRef.current?.resetView()}
                    className="viz-tool-btn"
                    style={{
                      height: '28px',
                      padding: '0 12px',
                      fontSize: '12px',
                      gap: '6px'
                    }}
                    title="Reset View"
                  >
                    <span>🔄</span> Reset
                  </button>

                  {/* Divider */}
                  <div style={{ width: '1px', height: '18px', background: 'var(--border-subtle)', margin: '0 4px' }} />

                  <button
                    onClick={() => vizRef.current?.exportPNG()}
                    className="viz-tool-btn"
                    style={{
                      height: '28px',
                      padding: '0 12px',
                      fontSize: '12px',
                      gap: '6px'
                    }}
                    title="Export as PNG (Bitmap)"
                  >
                    <span>🖼️</span> PNG
                  </button>
                  <button
                    onClick={() => vizRef.current?.exportSVG()}
                    className="viz-tool-btn"
                    style={{
                      height: '28px',
                      padding: '0 12px',
                      fontSize: '12px',
                      gap: '6px',
                      opacity: !isPro ? 0.6 : 1
                    }}
                    title={!isPro ? "SVG (Pro Only)" : "Export as SVG"}
                  >
                    {isPro ? <span>📥</span> : <span>🔒</span>} SVG
                  </button>

                  <button
                    onClick={() => vizRef.current?.exportPPTX()}
                    className="viz-tool-btn"
                    style={{
                      height: '28px',
                      padding: '0 12px',
                      fontSize: '12px',
                      gap: '6px'
                    }}
                    title="Export as PowerPoint"
                  >
                    <span>📊</span> PPTX
                  </button>

                  {/* Divider */}
                  <div style={{ width: '1px', height: '18px', background: 'var(--border-subtle)', margin: '0 4px' }} />



                  <button
                    onClick={async () => {
                      if (!isPro) {
                        alert("Data Preservation is a Pro feature.\n\nFree version (simulated) allows viewing but not saving result tables.");
                        // In real app, block here. For simulation, proceed or return? 
                        // Prompt implies toggle acts as sim. If Free, let's block to show feature gating.
                        return;
                      }

                      try {
                        // 1. Open Save Dialog
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
                        const suggestedName = `${uploadedFileBase}_stat_${timestamp}.csv`;
                        const path = await save({
                          defaultPath: suggestedName,
                          filters: [{
                            name: 'CSV File',
                            extensions: ['csv']
                          }]
                        });

                        if (!path) return; // User cancelled

                        // 2. Build CSV content on the client side
                        // NOTE: Column 3 header intentionally avoids starting with '-' or '='
                        // to prevent Excel from auto-interpreting it as a formula.
                        const header = ['Gene', 'Log2FC', 'neg_log10(P)', 'PValue', 'Status', 'Mean'];
                        const escape = (v: unknown): string => {
                          if (v === null || v === undefined) return '';
                          const s = String(v);
                          if (s.includes('"') || s.includes(',') || s.includes('\n')) {
                            return `"${s.replace(/"/g, '""')}"`;
                          }
                          return s;
                        };
                        const lines = [
                          header.join(','),
                          ...activeAnalysis.volcano_data.map(p => [
                            escape(p.gene),
                            escape(p.x),
                            escape(p.y),
                            escape(p.pvalue),
                            escape(p.status),
                            escape(p.mean)
                          ].join(','))
                        ];
                        const csvContent = lines.join('\n');

                        // 3. Write CSV file using Tauri FS plugin
                        await writeTextFile(path, csvContent);

                        // 4. Confirm & Open
                        const shouldOpen = await ask(`Data saved successfully to:\n${path}\n\nDo you want to open it now?`, {
                          title: 'Save Successful',
                          kind: 'info',
                          okLabel: 'Open File',
                          cancelLabel: 'Close'
                        });

                        if (shouldOpen) {
                          try {
                            await openPath(path);
                          } catch (e) {
                            alert("Failed to open file: " + e);
                          }
                        }

                      } catch (e) {
                        alert("Failed to save data: " + e);
                      }
                    }}
                    className="viz-tool-btn"
                    style={{
                      height: '28px',
                      padding: '0 12px',
                      fontSize: '12px',
                      gap: '6px',
                      borderRadius: '4px',
                      background: 'transparent',
                      border: '1px solid var(--border-subtle)',
                      color: isPro ? 'var(--text-secondary)' : 'var(--text-dim)',
                      opacity: isPro ? 1 : 0.7
                    }}
                  >
                    {isPro ? <span>📂</span> : <span>🔒</span>} Data
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="panel-body" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <ResultTabs
              tabs={resultTabs}
              activeIndex={activeResultIndex}
              onSelect={handleSelectResult}
            />

            {(engineLoading || batchRunning) && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 50,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)'
              }}>
                <div className="spinner" style={{ marginBottom: '16px' }}></div>
                <p style={{ color: 'white' }}>Processing Analysis...</p>
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {activeAnalysis ? (
                <>
                  {/* AI Insights */}
                  {activeAnalysis.insights && (
                    <InsightBadges insights={activeAnalysis.insights} />
                  )}

                  {/* Pathway Visualization */}
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <PathwayVisualizer
                      ref={vizRef}
                      nodes={activeAnalysis.pathway.nodes}
                      edges={activeAnalysis.pathway.edges}
                      title={activeAnalysis.pathway.name}
                      theme="dark"
                      pathwayId={activeAnalysis.pathway.id}
                      dataType={entityKind}
                      sourceFileBase={uploadedFileBase}
                      onNodeClick={handlePathwayNodeClick}
                      selectedNodeNames={filteredGenes}
                      isPro={isPro}
                    />
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <p style={{ fontSize: '40px', marginBottom: '10px', opacity: 0.5 }}>🧬</p>
                  Start a new analysis to view pathway
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resizer 2 */}
        <div
          className={`resizer-gutter ${dragIdx === 1 ? 'dragging' : ''}`}
          onMouseDown={(e) => startResize(1, e)}
        />

        {/* Right Panel: AI Chat */}
        <div className="panel-col">
          <div className="panel-header" style={{ display: 'flex', gap: '8px', padding: '8px 12px' }}>
            <button
              onClick={() => setLeftPanelView('ai-chat')}
              style={{
                flex: 1,
                padding: '8px',
                background: leftPanelView === 'ai-chat' ? 'var(--brand-primary)' : 'transparent',
                color: leftPanelView === 'ai-chat' ? 'white' : 'var(--text-dim)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              🤖 AI Chat
            </button>
            <button
              onClick={() => setLeftPanelView('gsea')}
              style={{
                flex: 1,
                padding: '8px',
                background: leftPanelView === 'gsea' ? 'var(--brand-primary)' : 'transparent',
                color: leftPanelView === 'gsea' ? 'white' : 'var(--text-dim)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              🧬 GSEA
            </button>
            <button
              onClick={() => setLeftPanelView('images')}
              style={{
                flex: 1,
                padding: '8px',
                background: leftPanelView === 'images' ? 'var(--brand-primary)' : 'transparent',
                color: leftPanelView === 'images' ? 'white' : 'var(--text-dim)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              🖼️ Images
            </button>
            <button
              onClick={() => setLeftPanelView('multi-sample')}
              style={{
                flex: 1,
                padding: '8px',
                background: leftPanelView === 'multi-sample' ? 'var(--brand-primary)' : 'transparent',
                color: leftPanelView === 'multi-sample' ? 'white' : 'var(--text-dim)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              🔄 Multi
            </button>
          </div>
          <div className="panel-body">
            {leftPanelView === 'ai-chat' && (
              <AIChatPanel
                sendCommand={async (cmd, data) => { await sendCommand(cmd, data, false); }}
                isConnected={isConnected}
                lastResponse={lastResponse}
                analysisContext={activeAnalysis ? {
                  pathway: activeAnalysis.pathway,
                  volcanoData: activeAnalysis.volcano_data,
                  statistics: activeAnalysis.statistics
                } : undefined}
                chatHistory={activeAnalysis?.chatHistory || []}
                onChatUpdate={(messages) => {
                  if (activeAnalysis) {
                    setAnalysisResults(prev => {
                      const updated = [...prev];
                      if (updated[activeResultIndex]) {
                        updated[activeResultIndex] = {
                          ...updated[activeResultIndex],
                          chatHistory: messages
                        };
                      }
                      return updated;
                    });
                  }
                }}
              />
            )}
            {leftPanelView === 'gsea' && (
              <GSEAPanel
                sendCommand={async (cmd, data) => { await sendCommand(cmd, data, false); }}
                volcanoData={activeAnalysis?.volcano_data}
                isConnected={isConnected}
                lastResponse={lastResponse}
              />
            )}
            {leftPanelView === 'images' && (
              <ImageUploader
                sendCommand={async (cmd, data) => { await sendCommand(cmd, data, false); }}
                isConnected={isConnected}
              />
            )}
            {leftPanelView === 'multi-sample' && (
              <MultiSamplePanel
                sendCommand={async (cmd, data) => { await sendCommand(cmd, data, false); }}
                isConnected={isConnected}
                currentFilePath={activeAnalysis?.sourceFilePath}
                lastResponse={lastResponse}
                onSampleGroupChange={(groupName, groupData) => {
                  // When sample group changes, update the volcano data for pathway visualization
                  if (activeAnalysis && groupData.length > 0) {
                    // Convert multi-sample group data to volcano format
                    const newVolcanoData = groupData.map(d => ({
                      gene: d.gene,
                      x: d.logfc,
                      y: -Math.log10(d.pvalue),
                      pvalue: d.pvalue,
                      status: d.logfc > 0 && d.pvalue < 0.05 ? 'UP' as const :
                        (d.logfc < 0 && d.pvalue < 0.05 ? 'DOWN' as const : 'NS' as const)
                    }));

                    // Update the active analysis with new volcano data
                    setAnalysisResults(prev => {
                      const updated = [...prev];
                      if (updated[activeResultIndex]) {
                        updated[activeResultIndex] = {
                          ...updated[activeResultIndex],
                          volcano_data: newVolcanoData,
                          // Note: Don't modify sourceFilePath to avoid file loading errors
                        };
                      }
                      return updated;
                    });

                    addLog(`📊 Switched to sample group: ${groupName} (${groupData.length} genes)`);
                  }
                }}
              />
            )}
          </div>
        </div>

        {/* Evidence Popup Overlay */}
        {showEvidencePopup && activeGene && (
          <EvidencePopup
            gene={activeGene}
            geneData={activeGeneDetail}
            entityKind={entityKind}
            labels={entityLabels}
            onClose={() => {
              setShowEvidencePopup(false);
              setActiveGene(null);
            }}
          />
        )}

      </main>

      {/* Footer / Logs */}
      <footer style={{
        height: '30px',
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', fontSize: '11px', color: 'var(--text-dim)',
        flexShrink: 0
      }}>
        <div>BioViz Local v1.0.0 • Workbench Mode</div>
        <div style={{ display: 'flex', gap: '8px', maxWidth: '500px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={{ color: 'var(--brand-primary)' }}>Last:</span> {logs.length > 0 ? logs[logs.length - 1] : 'Ready'}
        </div>
      </footer>

      {/* v2.0: AI Event Panel for proactive suggestions */}
      <AIEventPanel
        sendCommand={async (cmd, data) => { await sendCommand(cmd, data, false); }}
        isConnected={isConnected}
        onNavigateToGSEA={() => setLeftPanelView('gsea')}
      />

    </div>
  );
}

export default App;
