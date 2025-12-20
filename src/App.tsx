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
import { EnrichmentPanel } from './components/EnrichmentPanel';
import { ImageUploader } from './components/ImageUploader';
import { AIEventPanel } from './components/AIEventPanel';
import { DEAnalysisPanel } from './components/DEAnalysisPanel';
import { exportSession, importSession, exportSessionAsInteractiveHtml } from './utils/sessionExport';
import { MultiSamplePanel } from './components/MultiSamplePanel';
import { eventBus, BioVizEvents } from './stores/eventBus';
import { ENTITY_META, resolveEntityKind, EntityKind } from './entityTypes';
import { AnalysisInsights } from './types/insights';
import { openPath } from '@tauri-apps/plugin-opener';
import { save, ask } from '@tauri-apps/plugin-dialog';
import { writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { PathwaySelectorDropdown } from './components/PathwaySelectorDropdown';
import { TemplatePicker } from './components/TemplatePicker';
import { IntelligenceDashboard } from './components/IntelligenceDashboard';
import { RuntimeLogPanel } from './components/RuntimeLogPanel';
import './App.css';
import demoSession from '../assets/sample_timecourse_6points_session.json';
import demoScript from '../assets/sample_timecourse_6points_report.md?raw';

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
  enrichrResults?: any[];
  gseaResults?: { up: any[], down: any[] };
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
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [maxWizardStep, setMaxWizardStep] = useState<1 | 2>(1);
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

  // Separate independent states for left and right panels
  const [leftView, setLeftView] = useState<'chart' | 'table'>('chart');
  const [rightPanelView, setRightPanelView] = useState<'ai-chat' | 'images' | 'multi-sample' | 'de-analysis' | 'enrichment'>('enrichment');
  const [mainView, setMainView] = useState<'pathway' | 'intelligence'>('pathway');
  const [studioIntelligence, setStudioIntelligence] = useState<any>(null);

  // Panel visibility states for collapsible layout
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showCenterPanel, setShowCenterPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true); // Default: all panels open

  const [showEvidencePopup, setShowEvidencePopup] = useState(false);
  const [chartViewMode, setChartViewMode] = useState<VolcanoViewMode>('volcano');

  const activeAnalysis = analysisResults[activeResultIndex] || null;
  const uploadedFileBase = getBaseName(activeAnalysis?.sourceFilePath);

  const [showRuntimeLog, setShowRuntimeLog] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [isGeneratingStudioReport, setIsGeneratingStudioReport] = useState(false);

  // License State (Simulated)
  const isPro = true;

  // One-time migration: Fix old configs with empty pathwayId (v1.2.1)
  useEffect(() => {
    const STORAGE_KEY = 'bioviz_last_config';
    const VERSION_KEY = 'bioviz_config_version';
    const CURRENT_VERSION = '1.2.1';

    try {
      const lastVersion = localStorage.getItem(VERSION_KEY);

      if (lastVersion !== CURRENT_VERSION) {
        console.log(`[App] Migrating from version ${lastVersion || 'unknown'} to ${CURRENT_VERSION}`);

        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const config = JSON.parse(saved);

          // Fix empty pathwayId
          if (config.pathwayId === '') {
            console.warn('[App] Found old config with empty pathwayId, clearing it');
            config.pathwayId = undefined;
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
              ...config,
              timestamp: Date.now()
            }));
            console.log('[App] Config fixed and saved');
          }
        }

        // Mark migration complete
        localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
        console.log(`[App] Migration to v${CURRENT_VERSION} complete`);
      }
    } catch (e) {
      console.error('[App] Migration failed:', e);
    }
  }, []); // Run once on mount


  // Auto-save analysisResults to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('bioviz_sessions', JSON.stringify(analysisResults));
      console.log('[App] Saved', analysisResults.length, 'sessions to localStorage');
    } catch (e) {
      console.error('[App] Failed to save sessions:', e);
    }
  }, [analysisResults]);

  // Add keyboard shortcut to open devtools (Cmd+Shift+I or Ctrl+Shift+I)
  useEffect(() => {
    const handleKeyPress = async (e: KeyboardEvent) => {
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.key === 'I') {
        e.preventDefault();
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('open_devtools');
          console.log('[App] Developer tools toggled');
        } catch (err) {
          console.error('[App] Failed to open devtools:', err);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

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

    // Emit to EventBus so RuntimeLogPanel can catch it
    eventBus.emit(BioVizEvents.APP_LOG, { message });

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

  const handleLoadDemoSession = () => {
    const normalizedPath = 'assets/sample_timecourse_6points.csv';
    const demoAnalysis: AnalysisResult = {
      ...(demoSession as any),
      sourceFilePath: normalizedPath,
      config: {
        ...(demoSession as any).config,
        filePaths: [normalizedPath]
      },
      entityKind: resolveEntityKind((demoSession as any).entityKind || 'gene')
    };

    setAnalysisResults(prev => {
      const next = [...prev, demoAnalysis];
      setActiveResultIndex(next.length - 1);
      return next;
    });
    setWorkflowStep('viz');
    setMaxWizardStep(2);
    setWizardStep(2);
    addLog('🎬 Loaded demo session (sample_timecourse_6points).');
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
            template_id: config.pathwayId || undefined, // Send undefined if not set
            data_type: config.dataType,
            filters: {
              method: primaryMethod,
              methods: config.analysisMethods,
            },
          },
          true,
        ) as any;

        if (response?.status !== 'ok') {
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
          pathwayName: response.pathway?.name || response.pathway?.title || 'analysis',
          geneCount: volcano.length,
        });

        const pathwayName =
          response.pathway?.name ||
          response.pathway?.title ||
          response.pathway?.id ||
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

  const handleGenerateSuperNarrative = async () => {
    if (!studioIntelligence) return;
    setIsGeneratingStudioReport(true);
    addLog("Synthesizing 7-layer Studio Intelligence report...");
    const requestId = `studio-${Date.now()}`;
    addLog(`✨ AI Synthesis started... (ID: ${requestId})`);
    try {
      const res = await sendCommand('AI_INTERPRET_STUDIO', {
        intelligence_data: studioIntelligence
      }, true);

      if (res && (res as any).super_narrative) {
        const narrative = (res as any).super_narrative;
        console.log('[BioViz] 🤖 AI Narrative Received:', narrative.length, 'chars');
        addLog(`AI Synthesis complete (${narrative.length} chars).`);

        // Force a fresh object to ensure re-render
        setStudioIntelligence((prev: any) => {
          if (!prev) return null;
          const next = { ...prev, super_narrative: narrative };
          console.log('[BioViz] 🔄 Updating Studio Intelligence State:', next);
          return next;
        });

        // Also save to active result if possible to persist across view switches
        if (activeAnalysis && activeResultIndex >= 0) {
          setAnalysisResults(prev => {
            const next = [...prev];
            if (next[activeResultIndex]) {
              const currentInsights = next[activeResultIndex].insights || {
                summary: '',
                layers: {
                  multi_omics: { active: false },
                  temporal: { active: false },
                  druggability: { active: false },
                  topology: { active: false },
                  qc: { status: 'PASS' },
                  lab: { active: false },
                  rag_hints: { hints: [] }
                },
                drivers: []
              };

              next[activeResultIndex] = {
                ...next[activeResultIndex],
                insights: {
                  ...currentInsights,
                  super_narrative: narrative
                }
              };
            }
            return next;
          });
        }
        addLog("AI Super Narrative analysis complete.");
      } else {
        addLog("AI Synthesis returned no narrative content.");
      }
    } catch (err) {
      console.error('Failed to generate studio report:', err);
      addLog(`Failed to generate AI Super Narrative: ${err}`);
    } finally {
      setIsGeneratingStudioReport(false);
    }
  };

  const handleEnrichmentComplete = React.useCallback((res: any) => {
    console.log('[App] Enrichment results arrived:', res.cmd);

    // Handle custom Studio Toggle action from AI Deep Insight
    if (res?.type === 'TOGGLE_STUDIO_VIEW') {
      setStudioIntelligence(res.data);
      setMainView('intelligence');
      return;
    }

    // Save insights to session
    if (activeAnalysis && res?.intelligence_report) {
      setAnalysisResults(prev => {
        const updated = [...prev];
        if (updated[activeResultIndex]) {
          updated[activeResultIndex] = {
            ...updated[activeResultIndex],
            insights: res.intelligence_report
          };
        }
        return updated;
      });
      addLog("Analysis insights updated.");
    }
  }, [activeAnalysis, activeResultIndex]);

  const handleDEAnalysisComplete = async (response: any) => {
    if (!activeAnalysis) return;

    addLog(`Applying DE results (${response.method}) to current view...`);

    // 1. Map DE results to VolcanoPoints
    const newVolcanoData: VolcanoPoint[] = response.results.map((r: any) => {
      let y = 0;
      if (r.pvalue <= 0) {
        y = 10.0; // Cap at 10 for p-value of 0
      } else if (r.pvalue < 1) {
        y = -Math.log10(r.pvalue);
      }

      return {
        gene: r.gene,
        x: r.log2FC,
        y: y,
        pvalue: r.pvalue,
        status: r.status,
        mean: typeof r.mean_group1 === 'number' ? (r.mean_group1 + (r.mean_group2 || 0)) / 2 : 0
      };
    });

    const geneMap: Record<string, VolcanoPoint> = {};
    newVolcanoData.forEach(p => { geneMap[p.gene] = p; });

    // 2. Prepare gene expression for coloring
    const geneExpression: Record<string, number> = {};
    response.results.forEach((r: any) => {
      geneExpression[r.gene] = r.log2FC;
    });

    if (activeAnalysis.pathway) {
      try {
        // 3. Request re-coloring of the current pathway
        const colorRes = await sendCommand('COLOR_PATHWAY', {
          pathway_id: activeAnalysis.pathway.id,
          gene_expression: geneExpression,
          data_type: activeAnalysis.entityKind
        }, true) as any;

        if (colorRes && colorRes.status === 'ok') {
          // 4. Update the analysis results in state
          setAnalysisResults(prev => prev.map((item, idx) => {
            if (idx === activeResultIndex) {
              return {
                ...item,
                pathway: colorRes.pathway,
                statistics: colorRes.statistics,
                volcano_data: newVolcanoData,
                gene_map: geneMap,
                has_pvalue: true
              };
            }
            return item;
          }));
          addLog(`✓ Visualization updated with DE results.`);
        } else {
          addLog(`❌ Color pathway failed: ${colorRes?.message || 'Unknown error'}`);
        }
      } catch (e) {
        console.error('Failed to color pathway with DE results:', e);
        addLog(`❌ Failed to update visualization: ${e}`);
      }
    } else {
      // No pathway selected, just update the volcano/stats data
      // For now, we can simple update the data. Statistics update needs to be calculated.
      setAnalysisResults(prev => prev.map((item, idx) => {
        if (idx === activeResultIndex) {
          return {
            ...item,
            volcano_data: newVolcanoData,
            gene_map: geneMap,
            has_pvalue: true
            // we should probably update statistics here too if we have a way to do it locally
          };
        }
        return item;
      }));
      addLog(`✓ Results updated with DE analysis.`);
    }
  };

  const handleResetDE = async () => {
    if (!activeAnalysis) return;
    addLog("Restoring original data visualization...");

    const config = activeAnalysis.config;
    const filePath = activeAnalysis.sourceFilePath;
    const primaryMethod = (config.analysisMethods && config.analysisMethods[0]) || 'auto';

    try {
      // Re-run the initial analysis for this specific result
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

      if (response?.status === 'ok' && response?.pathway) {
        const volcano: VolcanoPoint[] = Array.isArray(response.volcano_data) ? response.volcano_data : [];
        const gene_map: Record<string, VolcanoPoint> = {};
        volcano.forEach((p: VolcanoPoint) => { gene_map[p.gene] = p; });

        setAnalysisResults(prev => prev.map((item, idx) => {
          if (idx === activeResultIndex) {
            return {
              ...item,
              pathway: response.pathway,
              statistics: response.statistics,
              volcano_data: volcano,
              gene_map: gene_map,
              has_pvalue: Boolean(response.has_pvalue)
            };
          }
          return item;
        }));
        addLog("✓ Original view restored.");
      } else {
        addLog(`❌ Reset failed: ${response?.message || 'Unknown error'}`);
      }
    } catch (e) {
      console.error('Failed to reset DE visualization:', e);
      addLog(`❌ Reset error: ${e}`);
    }
  };

  // --- Render ---

  if (showSplash) {
    return <SplashScreen onEnter={() => setShowSplash(false)} />;
  }

  return (
    <div className="app-container">
      {/* SAFETY GUARD: Blocks all interaction when active */}
      <SafetyGuardModal
        proposal={activeProposal}
        onRespond={resolveProposal}
      />

      <div className="workbench-container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Simplified Header with Logo */}
        <header
          className="app-header"
          data-tauri-drag-region
        >
          <div data-tauri-drag-region style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div data-tauri-drag-region className="header-brand">
              <h1 data-tauri-drag-region style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span data-tauri-drag-region>🧬</span>
                <span data-tauri-drag-region>BioViz <span data-tauri-drag-region style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>Local</span></span>
              </h1>
            </div>

            {activeAnalysis && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className="analysis-tag">Active Analysis</span>
                <div className="no-drag">
                  <PathwaySelectorDropdown
                    onSelect={(id) => {
                      if (activeAnalysis.config) {
                        handleAnalysisStart({ ...activeAnalysis.config, pathwayId: id });
                      }
                    }}
                    currentPathwayId={activeAnalysis.pathway?.id}
                    currentPathwayName={activeAnalysis.pathway?.name || activeAnalysis.pathway?.title}
                    dataType={activeAnalysis.entityKind === 'other' ? 'gene' : activeAnalysis.entityKind}
                    sendCommand={sendCommand}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {/* View Toggles */}
            {workflowStep === 'viz' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '4px 8px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <button
                  onClick={() => setShowLeftPanel(!showLeftPanel)}
                  title={showLeftPanel ? 'Hide Data Panel (Left)' : 'Show Data Panel (Left)'}
                  style={{
                    width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: showLeftPanel ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px', transition: 'all 0.2s'
                  }}
                >
                  📊
                </button>
                <button
                  onClick={() => setShowCenterPanel(!showCenterPanel)}
                  title={showCenterPanel ? 'Hide Pathway (Center)' : 'Show Pathway (Center)'}
                  style={{
                    width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: showCenterPanel ? 'rgba(34, 197, 94, 0.3)' : 'transparent',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px', transition: 'all 0.2s'
                  }}
                >
                  🗺️
                </button>
                <button
                  onClick={() => setShowRightPanel(!showRightPanel)}
                  title={showRightPanel ? 'Hide AI Panel (Right)' : 'Show AI Panel (Right)'}
                  style={{
                    width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: showRightPanel ? 'rgba(102, 126, 234, 0.3)' : 'transparent',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px', transition: 'all 0.2s'
                  }}
                >
                  🤖
                </button>
              </div>
            )}

            {/* Session Actions */}
            <div
              style={{
                display: 'flex',
                gap: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '4px 8px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <button
                onClick={() => activeAnalysis && exportSession(activeAnalysis)}
                disabled={!activeAnalysis}
                title="Export Session (JSON / Markdown)"
                style={{
                  width: '32px', height: '32px', borderRadius: '6px',
                  border: 'none',
                  background: activeAnalysis ? 'rgba(59,130,246,0.18)' : 'transparent',
                  color: activeAnalysis ? 'white' : 'var(--text-dim)',
                  cursor: activeAnalysis ? 'pointer' : 'not-allowed', fontSize: '16px'
                }}
              >
                📥
              </button>
              <button
                onClick={() => activeAnalysis && exportSessionAsInteractiveHtml(activeAnalysis)}
                disabled={!activeAnalysis}
                title="Export interactive HTML"
                style={{
                  width: '32px', height: '32px', borderRadius: '6px',
                  border: 'none',
                  background: activeAnalysis ? 'rgba(56,189,248,0.18)' : 'transparent',
                  color: activeAnalysis ? 'white' : 'var(--text-dim)',
                  cursor: activeAnalysis ? 'pointer' : 'not-allowed', fontSize: '16px'
                }}
              >
                🌐
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
                  width: '32px', height: '32px', borderRadius: '6px',
                  border: 'none',
                  background: 'rgba(34,197,94,0.18)',
                  color: 'white', cursor: 'pointer', fontSize: '16px'
                }}
              >
                📤
              </button>
            </div>
          </div>
        </header>

        {/* Horizontal Navigation Control (Workflow + Perspective) */}
        <div
          className="workbench-nav-bar"
          data-tauri-drag-region="true"
          style={{
            WebkitAppRegion: 'drag',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 20px',
            background: 'var(--bg-panel)',
            borderBottom: '1px solid var(--border-subtle)',
            gap: '20px'
          } as any}>
          <div style={{ flex: 1, maxWidth: '600px' }} data-tauri-drag-region="no-drag">
            <WorkflowBreadcrumb
              currentStep={workflowStep}
              canAccessMapping={canAccessMapping}
              canAccessViz={canAccessViz}
              onStepClick={handleWorkflowStepClick}
              variant="horizontal"
            />
          </div>

          {workflowStep === 'viz' && activeAnalysis && (
            <div
              className="perspective-toggles"
              data-tauri-drag-region="no-drag"
              style={{
                display: 'flex',
                gap: '4px',
                padding: '4px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)'
              }}>
              <button
                className={`perspective-btn ${mainView === 'intelligence' ? 'active' : ''}`}
                onClick={() => {
                  // Load intelligence data from active analysis if available
                  if (activeAnalysis?.insights) {
                    setStudioIntelligence(activeAnalysis.insights);
                  }
                  setMainView('intelligence');
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: mainView === 'intelligence' ? 'var(--brand-primary)' : 'transparent',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
              >
                <span>🧠</span> Studio Discovery
              </button>
              <button
                className={`perspective-btn ${mainView === 'pathway' ? 'active' : ''}`}
                onClick={() => setMainView('pathway')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: mainView === 'pathway' ? 'var(--brand-primary)' : 'transparent',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
              >
                <span>🗺️</span> Structural Map
              </button>
            </div>
          )}
        </div>

        {/* Wizard Overlay (Integrated into workbench) */}
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
              setWorkflowStep(s === 1 ? 'upload' : 'mapping');
            }}
            onConfigPreview={setDraftConfig}
            onLoadDemo={handleLoadDemoSession}
            demoScript={demoScript}
            demoTitle="Timecourse demo (Glycolysis)"
          />
        </div>

        {/* Workbench is always mounted; wizard hides it for steps 1-3 via display */}
        <main
          className="workbench-layout"
          style={{
            display: workflowStep === 'viz' ? (mainView === 'intelligence' ? 'flex' : 'grid') : 'none',
            gridTemplateColumns: mainView === 'intelligence' ? '1fr' : (() => {
              const rawLeft = showLeftPanel ? colSizes[0] : 0;
              const rawCenter = showCenterPanel ? colSizes[1] : 0;
              const rawRight = showRightPanel ? colSizes[2] : 0;
              const total = rawLeft + rawCenter + rawRight || 1;
              const scale = 100 / total;
              const leftW = rawLeft * scale;
              const centerW = rawCenter * scale;
              const rightW = rawRight * scale;
              const leftGutter = (leftW > 0 && centerW > 0) ? '6px' : '0';
              const rightGutter = (centerW > 0 && rightW > 0) ? '6px' : '0';
              return `${leftW}% ${leftGutter} ${centerW}% ${rightGutter} ${rightW}%`;
            })(),
            gap: '0',
            transition: dragIdx !== null ? 'none' : 'grid-template-columns 0.2s ease',
            position: 'relative'
          }}
          ref={containerRef}
        >
          {mainView === 'intelligence' ? (
            studioIntelligence ? (
              <IntelligenceDashboard
                data={studioIntelligence}
                onClose={() => setMainView('pathway')}
                onGenerateSuperNarrative={handleGenerateSuperNarrative}
                isGenerating={isGeneratingStudioReport}
              />
            ) : (
              // Empty state when no intelligence data
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px',
                background: 'var(--bg-panel)',
                color: 'var(--text-secondary)'
              }}>
                <div style={{ fontSize: '64px', marginBottom: '24px' }}>🧠</div>
                <h2 style={{ fontSize: '24px', marginBottom: '12px', color: 'var(--text-primary)' }}>
                  Studio Discovery
                </h2>
                <p style={{ fontSize: '14px', marginBottom: '32px', maxWidth: '500px', textAlign: 'center', lineHeight: 1.6 }}>
                  Run AI Deep Insight analysis from the Gene Sets panel to unlock the 7-layer intelligence dashboard.
                </p>
                <button
                  onClick={() => {
                    setMainView('pathway');
                    setRightPanelView('enrichment');
                  }}
                  style={{
                    padding: '12px 24px',
                    background: 'var(--brand-primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span>🧬</span> Open Gene Sets Panel
                </button>
              </div>
            )
          ) : (
            <>
              {/* Left Panel: Volcano / Data Table */}
              < div className="panel-col" style={{
                borderRight: showLeftPanel ? '1px solid var(--border-subtle)' : 'none',
                overflow: 'hidden',
                opacity: showLeftPanel ? 1 : 0,
                transition: 'opacity 0.2s ease'
              }}>
                <div className="panel-header" style={{ justifyContent: 'space-between', paddingRight: '12px' }}>
                  <div className="left-panel-toggle-group">
                    <button
                      onClick={() => { setLeftView('chart'); setChartViewMode('volcano'); }}
                      className={`left-toggle-btn ${leftView === 'chart' && chartViewMode === 'volcano' ? 'active' : ''}`}
                    >
                      Volcano
                    </button>
                    <button
                      onClick={() => {
                        if (!hasMAData) return;
                        setLeftView('chart');
                        setChartViewMode('ma');
                      }}
                      disabled={!hasMAData}
                      className={`left-toggle-btn ${leftView === 'chart' && chartViewMode === 'ma' ? 'active' : ''}`}
                    >
                      MA
                    </button>
                    <button
                      onClick={() => { setLeftView('chart'); setChartViewMode('ranked'); }}
                      className={`left-toggle-btn ${leftView === 'chart' && chartViewMode === 'ranked' ? 'active' : ''}`}
                    >
                      Ranked
                    </button>
                    <button
                      onClick={() => setLeftView('table')}
                      className={`left-toggle-btn ${leftView === 'table' ? 'active' : ''}`}
                    >
                      Table
                    </button>
                  </div>

                  {filteredGenes.length > 0 && leftView === 'chart' && (
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
                    leftView === 'chart' ? (
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
              </div >

              {/* Resizer 1 */}
              < div
                className={`resizer-gutter ${dragIdx === 0 ? 'dragging' : ''}`}
                onMouseDown={(e) => startResize(0, e)}
              />

              {/* Center Panel: Pathway */}
              <div className="panel-col" style={{
                background: 'var(--bg-panel)',
                overflow: 'hidden',
                opacity: showCenterPanel ? 1 : 0,
                transition: 'opacity 0.2s ease'
              }}>
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
                    {activeAnalysis && activeAnalysis.pathway ? (
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
                            title={activeAnalysis.pathway.title || activeAnalysis.pathway.name}
                            pathwayId={activeAnalysis.pathway.id}
                            dataType={activeAnalysis.entityKind}
                            onNodeClick={handlePathwayNodeClick}
                            selectedNodeNames={filteredGenes}
                            isPro={isPro}
                            sourceFileBase={uploadedFileBase}
                            enrichrResults={activeAnalysis.enrichrResults}
                            gseaResults={activeAnalysis.gseaResults}
                          />
                        </div>
                      </>
                    ) : (
                      <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
                        <TemplatePicker
                          onSelect={(id) => {
                            const cfg = activeAnalysis?.config || draftConfig;
                            if (cfg) {
                              handleAnalysisStart({ ...cfg, pathwayId: id });
                            }
                          }}
                          dataType={
                            ((activeAnalysis?.entityKind as any) === 'other' ? 'gene' : (activeAnalysis?.entityKind as any)) ||
                            (((draftConfig?.dataType as any) === 'other' ? 'gene' : (draftConfig?.dataType as any)) || 'gene')
                          }
                          sendCommand={sendCommand}
                        />
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
              <div className="panel-col" style={{
                overflow: 'hidden',
                opacity: showRightPanel ? 1 : 0,
                transition: 'opacity 0.2s ease'
              }}>
                <div className="panel-header" style={{ display: 'flex', gap: '8px', padding: '8px 12px' }}>
                  <button
                    onClick={() => setRightPanelView('ai-chat')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: rightPanelView === 'ai-chat' ? 'var(--brand-primary)' : 'transparent',
                      color: rightPanelView === 'ai-chat' ? 'white' : 'var(--text-dim)',
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
                    onClick={() => setRightPanelView('de-analysis')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: rightPanelView === 'de-analysis' ? 'var(--brand-primary)' : 'transparent',
                      color: rightPanelView === 'de-analysis' ? 'white' : 'var(--text-dim)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500
                    }}
                    title="DE Analysis"
                  >
                    🧪 DE Analysis
                  </button>
                  <button
                    onClick={() => setRightPanelView('enrichment')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: rightPanelView === 'enrichment' ? 'var(--brand-primary)' : 'transparent',
                      color: rightPanelView === 'enrichment' ? 'white' : 'var(--text-dim)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500
                    }}
                    title="Gene Set Enrichment (ORA & GSEA)"
                  >
                    🧬 Gene Sets
                  </button>
                  <button
                    onClick={() => setRightPanelView('images')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: rightPanelView === 'images' ? 'var(--brand-primary)' : 'transparent',
                      color: rightPanelView === 'images' ? 'white' : 'var(--text-dim)',
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
                    onClick={() => setRightPanelView('multi-sample')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: rightPanelView === 'multi-sample' ? 'var(--brand-primary)' : 'transparent',
                      color: rightPanelView === 'multi-sample' ? 'white' : 'var(--text-dim)',
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
                  {rightPanelView === 'ai-chat' && (
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
                      onNavigateToGSEA={() => setRightPanelView('enrichment')}
                    />
                  )}

                  {rightPanelView === 'de-analysis' && (
                    <DEAnalysisPanel
                      sendCommand={sendCommand}
                      isConnected={isConnected}
                      lastResponse={lastResponse}
                      currentFilePath={activeAnalysis?.sourceFilePath}
                      onAnalysisComplete={handleDEAnalysisComplete}
                      onReset={handleResetDE}
                    />
                  )}

                  {rightPanelView === 'enrichment' && (
                    <EnrichmentPanel
                      volcanoData={activeAnalysis?.volcano_data}
                      onEnrichmentComplete={handleEnrichmentComplete}
                      onPathwayClick={async (pathwayNameOrId, source, metadata) => {
                        console.log(`Pathway clicked: ${pathwayNameOrId} (${source})`, metadata);
                        addLog(`🔍 Loading pathway: ${pathwayNameOrId}`);

                        try {
                          // For Reactome, we need to search first
                          if (source === 'reactome') {
                            const response = await sendCommand(
                              'SEARCH_AND_LOAD_PATHWAY',
                              {
                                pathway_name: pathwayNameOrId,
                                source: source,
                                species: 'human'
                              },
                              true
                            );

                            if (response?.status === 'ok' && response.pathway) {
                              addLog(`✓ Found: ${response.pathway_name} (${response.gene_count} genes)`);
                              setAnalysisResults(prev => prev.map((item, idx) =>
                                idx === activeResultIndex
                                  ? { ...item, pathway: response.pathway as any }
                                  : item
                              ));
                              setMainView('pathway');
                            } else {
                              addLog(`❌ Pathway not found: ${pathwayNameOrId}`);
                            }
                          } else {
                            // WikiPathways, GO, Custom: Visualize directly in app using auto-layout
                            if (activeAnalysis?.volcano_data) {
                              // Validate pathway ID before proceeding
                              if (!pathwayNameOrId || pathwayNameOrId.trim() === '') {
                                addLog(`❌ Invalid pathway ID: "${pathwayNameOrId}"`);
                                console.error('Pathway click failed: missing pathway ID', { source, metadata });
                                return;
                              }

                              addLog(`🎨 Generating ${source} pathway diagram for: ${pathwayNameOrId}...`);

                              // Extract gene expression from current volcano data
                              const geneExpression: Record<string, number> = {};
                              activeAnalysis.volcano_data.forEach((p: any) => {
                                // Important: Use p.x which is LogFC in the frontend model
                                if (p.gene && p.x !== undefined) {
                                  geneExpression[p.gene] = p.x;
                                }
                              });

                              const response = await sendCommand(
                                'VISUALIZE_PATHWAY',
                                {
                                  template_id: pathwayNameOrId.trim(),
                                  pathway_source: source,
                                  pathway_name: metadata?.pathway_name || pathwayNameOrId,
                                  hit_genes: metadata?.hit_genes || [],
                                  gene_expression: geneExpression,
                                  data_type: activeAnalysis.entityKind === 'other' ? 'gene' : activeAnalysis.entityKind
                                },
                                true
                              );

                              if (response?.status === 'ok' && response.pathway) {
                                addLog(`✓ Pathway diagram generated (${response.gene_count} genes)`);

                                // Update analysis results with the generated pathway
                                setAnalysisResults(prev => prev.map((item, idx) =>
                                  idx === activeResultIndex
                                    ? {
                                      ...item,
                                      pathway: response.pathway as any,
                                      statistics: response.statistics as any
                                    }
                                    : item
                                ));

                                // Switch to center pathway view
                                setMainView('pathway');
                              } else {
                                addLog(`❌ Failed to generate diagram: ${response?.message || 'Unknown error'}`);
                              }
                            } else {
                              addLog(`❌ No data available for visualization`);
                            }
                          }
                        } catch (err) {
                          console.error('Failed to load pathway:', err);
                          addLog(`❌ Error: ${err}`);
                        }
                      }}
                    />
                  )}

                  {rightPanelView === 'images' && (
                    <ImageUploader
                      sendCommand={async (cmd, data) => { await sendCommand(cmd, data, false); }}
                      isConnected={isConnected}
                    />
                  )}
                  {rightPanelView === 'multi-sample' && (
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
              {
                showEvidencePopup && activeGene && (
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
                )
              }

            </>
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
          <button
            className={`log-toggle-btn ${showRuntimeLog ? 'active' : ''}`}
            onClick={() => setShowRuntimeLog(!showRuntimeLog)}
            style={{
              background: showRuntimeLog ? 'rgba(88, 166, 255, 0.2)' : 'transparent',
              border: '1px solid var(--border-subtle)',
              color: showRuntimeLog ? '#58a6ff' : 'var(--text-dim)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            📋 Log
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: isConnected ? '#238636' : '#f85149'
            }} />
          </button>
        </footer>

        {/* Runtime Log Panel Overlay */}
        {showRuntimeLog && (
          <RuntimeLogPanel onClose={() => setShowRuntimeLog(false)} />
        )}

        {/* v2.0: AI Event Panel for proactive suggestions */}
        <AIEventPanel
          sendCommand={sendCommand}
          isConnected={isConnected}
          onNavigateToGSEA={() => setRightPanelView('enrichment')}
          onExportSession={() => activeAnalysis && exportSession(activeAnalysis)}
          analysisContext={activeAnalysis ? {
            pathway: activeAnalysis.pathway,
            volcanoData: activeAnalysis.volcano_data,
            statistics: activeAnalysis.statistics
          } : undefined}
        />
      </div>
    </div>
  );
}

export default App;
