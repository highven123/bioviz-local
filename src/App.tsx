import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useBioEngine } from './hooks/useBioEngine';
import { DataImportWizard, AnalysisConfig } from './components/DataImportWizard';
import { VolcanoPlot, VolcanoPoint, VolcanoViewMode } from './components/VolcanoPlot';
import { EvidencePanel, GeneDetail } from './components/EvidencePanel';
import { PathwayVisualizer, PathwayVisualizerRef } from './components/PathwayVisualizer';
import { DataTable } from './components/DataTable';
import { WorkflowBreadcrumb, WorkflowStep } from './components/WorkflowBreadcrumb';
import { ENTITY_META, resolveEntityKind, EntityKind } from './entityTypes';
import { openPath } from '@tauri-apps/plugin-opener';
import { save, ask } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import './App.css';

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
  const { isConnected, isLoading: engineLoading, lastResponse, sendCommand } = useBioEngine();

  // --- State ---
  const [pendingConfig, setPendingConfig] = useState<AnalysisConfig | null>(null);
  const [draftConfig, setDraftConfig] = useState<AnalysisConfig | null>(null);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [maxWizardStep, setMaxWizardStep] = useState<1 | 2 | 3>(1);
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('upload');
  const [analysisData, setAnalysisData] = useState<AnalysisResult | null>(null);
  const [filteredGenes, setFilteredGenes] = useState<string[]>([]);
  const [activeGene, setActiveGene] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [leftPanelView, setLeftPanelView] = useState<'chart' | 'table' | 'evidence'>('chart');
  const [chartViewMode, setChartViewMode] = useState<VolcanoViewMode>('volcano');

  const uploadedFileBase = getBaseName(analysisData?.config?.filePath);

  // License State (Simulated)
  const isPro = true;

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
    setLogs(prev => [...prev.slice(-20), `[${timestamp}] ${message}`]);
  };

  // --- BioEngine Response Handler ---
  useEffect(() => {
    if (lastResponse) {
      const response = lastResponse as any;

      // 支持旧版 engine（无 volcano_data）和新版（带 volcano_data）
      if (response.status === 'ok' && response.pathway) {
        const volcano: VolcanoPoint[] = Array.isArray(response.volcano_data)
          ? response.volcano_data
          : [];

        const gene_map: Record<string, VolcanoPoint> = {};
        volcano.forEach((p: VolcanoPoint) => {
          gene_map[p.gene] = p;
        });

        const config = pendingConfig || analysisData?.config || ({} as any);
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
        };

        setAnalysisData(result);
        setPendingConfig(null);
        setWorkflowStep('viz');
        const pathwayName =
          response.pathway.name ||
          response.pathway.title ||
          response.pathway.id ||
          'analysis';
        addLog(`✓ Analysis complete: ${pathwayName}`);
        if (response.analysis_table_path) {
          addLog(`Saved analysis table → ${response.analysis_table_path}`);
        }
        setFilteredGenes([]);
        setActiveGene(null);
      } else if (response.status === 'error') {
        addLog(`❌ Engine Error: ${response.message}`);
        alert(`Analysis Failed: ${response.message}`);
      }
    }
  }, [lastResponse]);

  // --- Actions ---
  const handleAnalysisStart = async (config: AnalysisConfig) => {
    addLog(`Running analysis for pathway: ${config.pathwayId}...`);
    // Prepare UI for new analysis
    setPendingConfig(config);
    setAnalysisData(null);
    setFilteredGenes([]);
    setActiveGene(null);
    setWorkflowStep('viz');

    const primaryMethod = (config.analysisMethods && config.analysisMethods[0]) || 'auto';

    await sendCommand('ANALYZE', {
      file_path: config.filePath,
      mapping: config.mapping,
      template_id: config.pathwayId,
      data_type: config.dataType,
      filters: {
        method: primaryMethod,
        methods: config.analysisMethods,
      }
    });
  };



  const activeGeneDetail = useMemo((): GeneDetail | null => {
    if (!analysisData || !activeGene) return null;
    const point = analysisData.gene_map[activeGene];
    if (!point) return null;
    return {
      name: point.gene,
      logFC: point.x,
      pvalue: point.pvalue
    };
  }, [analysisData, activeGene]);

  // --- Entity labels derived from analysis data (fallback: gene) ---
  const entityKind: EntityKind = analysisData?.entityKind || 'gene';
  const entityLabels = ENTITY_META[entityKind];

  // --- 是否有 MA 图所需的 mean 数据 ---
  const hasMAData = !!analysisData?.volcano_data?.some(
    (p) => typeof p.mean === 'number' && !Number.isNaN(p.mean)
  );

  // 如果当前结果不支持 MA，但视图停留在 MA，则自动退回 Volcano
  useEffect(() => {
    if (analysisData && !hasMAData && chartViewMode === 'ma') {
      setChartViewMode('volcano');
    }
  }, [analysisData, hasMAData, chartViewMode]);

  // --- Workflow navigation ---
  const canAccessMapping = maxWizardStep >= 2;
  const canAccessGallery = maxWizardStep >= 3;
  const canAccessViz = !!analysisData;

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
      // 如果已经有分析结果，直接切换到可视化
      if (analysisData) {
        setWorkflowStep('viz');
        return;
      }
      // 如果当前配置已经就绪（导入 + 映射 + 选 pathway），从顶部 Step4 触发分析
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
  };

  // --- Render ---

  return (
    <div className="workbench-container">

      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <h1>
            <span>🧬</span>
            BioViz <span>Local</span>
          </h1>
          {analysisData && (
            <span style={{
              marginLeft: '20px',
              padding: '4px 12px',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              fontSize: '12px',
              color: 'var(--text-secondary)'
            }}>
              {(analysisData.pathway.name || analysisData.pathway.title || 'Pathway').replace(/hsa:?\d+/gi, '').replace(/kegg/gi, '').trim()}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className="status-indicator">
            <div className={`status-dot ${!isConnected ? 'disconnected' : ''}`}
              style={{ backgroundColor: isConnected ? 'var(--color-success)' : 'var(--color-danger)' }}
            />
            {isConnected ? 'Engine Ready' : 'Connecting...'}
          </div>
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
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { setLeftPanelView('chart'); setChartViewMode('volcano'); }}
                style={{
                  background: leftPanelView === 'chart' && chartViewMode === 'volcano' ? 'var(--border-subtle)' : 'transparent',
                  border: 'none',
                  color: leftPanelView === 'chart' && chartViewMode === 'volcano' ? 'var(--text-primary)' : 'var(--text-dim)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                🌋 Volcano
              </button>
              {/** MA 视图仅在数据具备 mean 信息时可用 */}
              <button
                onClick={() => {
                  if (!hasMAData) return;
                  setLeftPanelView('chart');
                  setChartViewMode('ma');
                }}
                disabled={!hasMAData}
                style={{
                  background: leftPanelView === 'chart' && chartViewMode === 'ma' ? 'var(--border-subtle)' : 'transparent',
                  border: 'none',
                  color: !hasMAData
                    ? 'var(--text-muted)'
                    : leftPanelView === 'chart' && chartViewMode === 'ma'
                      ? 'var(--text-primary)'
                      : 'var(--text-dim)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: !hasMAData ? 'default' : 'pointer',
                  opacity: !hasMAData ? 0.5 : 1
                }}
              >
                MA
              </button>
              <button
                onClick={() => { setLeftPanelView('chart'); setChartViewMode('ranked'); }}
                style={{
                  background: leftPanelView === 'chart' && chartViewMode === 'ranked' ? 'var(--border-subtle)' : 'transparent',
                  border: 'none',
                  color: leftPanelView === 'chart' && chartViewMode === 'ranked' ? 'var(--text-primary)' : 'var(--text-dim)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Ranked
              </button>
              <button
                onClick={() => setLeftPanelView('table')}
                style={{
                  background: leftPanelView === 'table' ? 'var(--border-subtle)' : 'transparent',
                  border: 'none',
                  color: leftPanelView === 'table' ? 'var(--text-primary)' : 'var(--text-dim)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                📋 Data
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
            {analysisData?.volcano_data ? (
              leftPanelView === 'chart' ? (
                chartViewMode === 'ma' && !hasMAData ? (
                  <div className="empty-state">
                    当前数据没有平均表达量（如 BaseMean 或 Ctrl/Exp 分组），
                    暂不支持 MA 图，请切换到 Volcano 或 Ranked 视图。
                  </div>
                ) : (
                  <VolcanoPlot
                    data={analysisData.volcano_data}
                    viewMode={chartViewMode}
                    onSelectionChange={setFilteredGenes}
                    onPointClick={setActiveGene}
                  />
                )
              ) : (
                <DataTable
                  data={analysisData.volcano_data}
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
        <div className="panel-col" style={{ background: '#000' }}> {/* Darker bg for chart? Or var(--bg-panel)? ECharts theme is dark */}
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
              {analysisData && (
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
                          ...analysisData.volcano_data.map(p => [
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

          <div className="panel-body" style={{ position: 'relative' }}>
            {engineLoading && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 50,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)'
              }}>
                <div className="spinner" style={{ marginBottom: '16px' }}></div>
                <p style={{ color: 'white' }}>Processing Analysis...</p>
              </div>
            )}

            {analysisData ? (
              <PathwayVisualizer
                ref={vizRef}
                nodes={analysisData.pathway.nodes}
                edges={analysisData.pathway.edges}
                title={analysisData.pathway.name}
                theme="dark"
                pathwayId={analysisData.pathway.id}
                dataType={entityKind}
                sourceFileBase={uploadedFileBase}
                onNodeClick={handlePathwayNodeClick}
                selectedNodeNames={filteredGenes}
                isPro={isPro}
              />
            ) : (
              <div className="empty-state">
                <p style={{ fontSize: '40px', marginBottom: '10px', opacity: 0.5 }}>🧬</p>
                Start a new analysis to view pathway
              </div>
            )}
          </div>
        </div>

        {/* Resizer 2 */}
        <div
          className={`resizer-gutter ${dragIdx === 1 ? 'dragging' : ''}`}
          onMouseDown={(e) => startResize(1, e)}
        />

        {/* Right Panel: Evidence */}
        <div className="panel-col">
          <div className="panel-header">
            Evidence
          </div>
          <div className="panel-body">
            <EvidencePanel
              gene={activeGene}
              geneData={activeGeneDetail}
              entityKind={entityKind}
              labels={entityLabels}
            />
          </div>
        </div>

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

    </div>
  );
}

export default App;
