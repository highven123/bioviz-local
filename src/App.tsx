import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useBioEngine } from './hooks/useBioEngine';
import { DataImportWizard, AnalysisConfig } from './components/DataImportWizard';
import { VolcanoPlot, VolcanoPoint, VolcanoViewMode } from './components/VolcanoPlot';
import { EvidencePopup, GeneDetail } from './components/EvidencePopup';
import { PathwayVisualizer, PathwayVisualizerRef } from './components/PathwayVisualizer';
import { DataTable } from './components/DataTable';
import { ResultTabs } from './components/ResultTabs';
import { WorkflowBreadcrumb, WorkflowStep } from './components/WorkflowBreadcrumb';
import { SplashScreen } from './components/SplashScreen';
import { SafetyGuardModal } from './components/SafetyGuardModal';
import { AIChatPanel } from './components/AIChatPanel';
import { InsightBadges } from './components/InsightBadges';
import { EnrichmentPanel } from './components/EnrichmentPanel';
import { ImageUploader } from './components/ImageUploader';
import { DEAnalysisPanel } from './components/DEAnalysisPanel';
import { exportSession, importSession, exportSessionAsInteractiveHtml } from './utils/sessionExport';
import { MultiSamplePanel } from './components/MultiSamplePanel';
import { NarrativePanel } from './components/NarrativePanel';
import { SingleCellPanel } from './components/SingleCellPanel';
import { AIInsightsDashboard } from './components/AIInsightsDashboard';
import { eventBus, BioVizEvents } from './stores/eventBus';
import { ResizablePanels } from './components/ResizablePanels';

import { ENTITY_META, resolveEntityKind, EntityKind } from './entityTypes';
import { AnalysisInsights } from './types/insights';
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
  const [rightPanelView, setRightPanelView] = useState<'ai-chat' | 'images' | 'multi-sample' | 'de-analysis' | 'enrichment' | 'narrative' | 'singlecell' | 'data-explorer'>('ai-chat');
  const [mainView, setMainView] = useState<'pathway' | 'intelligence' | 'ai-insights'>('ai-insights');
  const [workflowPhase, setWorkflowPhase] = useState<'perception' | 'exploration' | 'synthesis'>('perception');
  const [explorationTool, setExplorationTool] = useState<'de-analysis' | 'enrichment' | 'multi-sample' | 'singlecell' | 'images'>('de-analysis');
  const [studioIntelligence, setStudioIntelligence] = useState<any>(null);

  // Helper to execute AI skills and update chat history
  const executeAISkill = async (prompt: string) => {
    if (!activeAnalysis) return;

    // Add user message to local history immediately for responsiveness
    const userMsg: any = { role: 'user', content: prompt };
    const updatedHistory = [...(activeAnalysis.chatHistory || []), userMsg];

    setAnalysisResults(prev => {
      const updated = [...prev];
      if (updated[activeResultIndex]) {
        updated[activeResultIndex] = {
          ...updated[activeResultIndex],
          chatHistory: updatedHistory
        };
      }
      return updated;
    });

    // Send command to AI sidecar
    await sendCommand("agent_task", { prompt }, false);
  };

  // Sync right panel view when workflow phase changes
  useEffect(() => {
    console.log('[useEffect] workflowPhase changed to:', workflowPhase, 'Current rightPanelView:', rightPanelView);
    if (workflowPhase === 'perception') {
      setRightPanelView('ai-chat');
    } else if (workflowPhase === 'synthesis') {
      setRightPanelView('narrative');
    } else if (workflowPhase === 'exploration' && (rightPanelView === 'narrative' || rightPanelView === 'data-explorer')) {
      // Transition from Perception/Synthesis views back to Chat or Scientific modules
      setRightPanelView('ai-chat');
    }
  }, [workflowPhase, setRightPanelView]);

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

  const containerRef = React.useRef<HTMLDivElement>(null);
  const vizRef = useRef<PathwayVisualizerRef>(null);

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
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }} data-tauri-drag-region="no-drag">
            <WorkflowBreadcrumb
              currentStep={workflowStep}
              canAccessMapping={canAccessMapping}
              canAccessViz={canAccessViz}
              onStepClick={handleWorkflowStepClick}
              variant="hub"
            />

            {workflowStep === 'viz' && activeAnalysis && (
              <div className="operation-hub-bar no-drag" style={{ margin: 0, padding: '0 12px', height: '40px', gap: '12px' }}>
                {/* Stats Section */}
                <div style={{ display: 'flex', gap: '16px', borderRight: '1px solid var(--border-subtle)', paddingRight: '12px' }}>
                  <div className="hub-stat-item">
                    <span className="hub-stat-label">File</span>
                    <span className="hub-stat-value" title={activeAnalysis.sourceFilePath}>{uploadedFileBase}</span>
                  </div>
                  <div className="hub-stat-item">
                    <span className="hub-stat-label">Genes</span>
                    <span className="hub-stat-value">{activeAnalysis.volcano_data.length.toLocaleString()}</span>
                  </div>
                </div>

                {/* Global Analysis Toggles removed as they are integrated into workflow */}
              </div>
            )}
          </div>

          {workflowStep === 'viz' && activeAnalysis && (
            <div className="science-journey-nav" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              padding: '4px',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.08)',
              height: '34px'
            }}>
              {[
                { id: 'ai-insights', phase: 'perception', label: '1. Insight', icon: '🧠', color: '#8b5cf6' },
                { id: 'pathway', phase: 'exploration', label: '2. Mapping', icon: '🗺️', color: '#6366f1' },
                { id: 'intelligence', phase: 'synthesis', label: '3. Synthesis', icon: '🤖', color: '#10b981' }
              ].map((step, idx) => (
                <React.Fragment key={step.id}>
                  <button
                    className={`journey-step-btn ${mainView === step.id ? 'active' : ''}`}
                    onClick={() => {
                      console.log('[Journey Step] Clicked:', step.label, 'Setting workflowPhase to:', step.phase);
                      setMainView(step.id as any);
                      setWorkflowPhase(step.phase as any);
                      if (step.id === 'intelligence' && activeAnalysis?.insights) {
                        setStudioIntelligence(activeAnalysis.insights);
                      }
                    }}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: mainView === step.id ? `linear-gradient(135deg, ${step.color}, #6366f1)` : 'transparent',
                      color: mainView === step.id ? 'white' : 'rgba(255,255,255,0.5)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      opacity: (step.phase === 'synthesis' && !activeAnalysis) ? 0.4 : 1,
                      pointerEvents: (step.phase === 'synthesis' && !activeAnalysis) ? 'none' : 'auto'
                    }}
                  >
                    <span style={{ fontSize: '12px' }}>{step.icon}</span>
                    <span className="step-label">{step.label}</span>
                  </button>
                  {idx < 2 && (
                    <div style={{ width: '12px', height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
                  )}
                </React.Fragment>
              ))}
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
            display: workflowStep === 'viz' ? 'flex' : 'none',
            flexDirection: 'row',
            gap: '0',
            position: 'relative',
            overflow: 'hidden'
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
          ) : mainView === 'ai-insights' ? (
            <AIInsightsDashboard
              volcanoData={activeAnalysis?.volcano_data || []}
              enrichmentResults={activeAnalysis?.enrichrResults}
              onInsightClick={(insight) => {
                addLog(`🧠 Exploring insight: ${insight.title}`);
              }}
              onPathwaySelect={(pathwayId) => {
                addLog(`📍 Navigating to pathway: ${pathwayId}`);
                setMainView('pathway');
              }}
            />

          ) : (
            <ResizablePanels
              defaultLeftWidth={65}
              minLeftWidth={40}
              maxLeftWidth={80}
              leftPanel={
                <div className="studio-dashboard-left" style={{ height: '100%', overflow: 'hidden', padding: '0', background: 'var(--bg-app)' }}>
                  <div className="panel-body" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid var(--border-subtle)' }}>
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
                          {activeAnalysis.insights && (
                            <InsightBadges insights={activeAnalysis.insights} />
                          )}
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
                        <div style={{ padding: '40px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
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
              }
              rightPanel={
                <div className="studio-dashboard-right" style={{
                  height: '100%',
                  borderLeft: '1px solid var(--border-subtle)',
                  background: 'var(--bg-panel)',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  {/* Contextual Hub Header */}
                  <div style={{
                    padding: '12px',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: 'rgba(255,255,255,0.02)',
                    flexShrink: 0
                  }}>
                    {/* Primary Hub Tabs (Phase-specific) */}
                    <div className="studio-right-tabs">
                      {[
                        { id: 'data-explorer', label: 'Data', icon: '📊', show: workflowPhase === 'perception' },
                        { id: 'narrative', label: 'Report', icon: '📝', show: workflowPhase === 'synthesis' },
                        {
                          // Mapping phase: Show the persistent analyzer tab
                          id: explorationTool,
                          label: 'ANALYZER',
                          icon: '🔬',
                          show: workflowPhase === 'exploration'
                        },
                        { id: 'ai-chat', label: 'Chat', icon: '🤖', show: true }
                      ].filter(tab => tab.show).map(tb => (
                        <button
                          key={tb.id}
                          onClick={() => setRightPanelView(tb.id as any)}
                          className={`studio-tab-btn ${rightPanelView === tb.id ? 'active' : ''}`}
                        >
                          <span style={{ fontSize: '16px' }}>{tb.icon}</span>
                          <span>{tb.label}</span>
                        </button>
                      ))}
                    </div>

                  {/* Contextual Instrument Bar (Phase 2 Exploration ONLY) */}
                  {workflowPhase === 'exploration' && (
                    <div className="hub-instrument-bar" style={{
                      display: 'flex',
                      gap: '2px',
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: '10px',
                      padding: '4px',
                      border: '1px solid rgba(255,255,255,0.08)'
                    }}>
                      {rightPanelView === 'ai-chat' ? (
                        /* AI Smart Tools Bar (When Chat is active) */
                        [
                          { id: 'sum', label: 'Sum', icon: '🧾', prompt: "Summarize the most significant findings" },
                          { id: 'exp', label: 'Exp', icon: '🧠', prompt: "Explain the biological significance of these results" },
                          { id: 'hyp', label: 'Hyp', icon: '💡', prompt: "Generate a speculative mechanism hypothesis" },
                          { id: 'ref', label: 'Ref', icon: '📚', prompt: "Find relevant literature evidence" },
                          { id: 'cmp', label: 'Cmp', icon: '🧬', prompt: "Compare functional differences in this data" }
                        ].map(skill => (
                          <button
                            key={skill.id}
                            onClick={() => {
                              // Execute AI skill command via helper
                              executeAISkill(skill.prompt);
                            }}
                            className="module-btn"
                            style={{
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '2px',
                              background: 'transparent',
                              border: '1px solid transparent',
                              borderRadius: '8px',
                              padding: '6px 2px',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <span style={{ fontSize: '16px' }}>{skill.icon}</span>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>{skill.label}</span>
                          </button>
                        ))
                      ) : (
                        /* Scientific Analysis Modules + Chart Selector (When Analyzer is active) */
                        [
                          { id: 'de-analysis', label: 'DE', icon: '🧪', type: 'module' },
                          { id: 'enrichment', label: 'Sets', icon: '🧬', type: 'module' },
                          { id: 'multi-sample', label: 'Multi', icon: '🔄', type: 'module' },
                          { id: 'singlecell', label: 'SC', icon: '🧬', type: 'module' },
                          { id: 'images', label: 'Ref', icon: '🖼️', type: 'module' },
                          {
                            id: 'stats',
                            label: 'Stats',
                            icon: '📈',
                            type: 'chart'
                          }
                        ].map(item => (
                          <button
                            key={item.id}
                            onClick={() => {
                              if ((item as any).type === 'chart') {
                                // Cycle through chart modes: volcano -> ma -> ranked -> volcano
                                const modes: VolcanoViewMode[] = ['volcano', 'ma', 'ranked'];
                                const currentIndex = modes.indexOf(chartViewMode);
                                const nextMode = modes[(currentIndex + 1) % modes.length];
                                setRightPanelView('data-explorer');
                                setChartViewMode(nextMode);
                                setLeftView('chart');
                              } else {
                                setExplorationTool(item.id as any);
                                setRightPanelView(item.id as any);
                              }
                            }}
                            className={`module-btn ${(item as any).type === 'chart'
                              ? (rightPanelView === 'data-explorer' && chartViewMode === item.id ? 'active' : '')
                              : (rightPanelView === item.id ? 'active' : '')
                              }`}
                            style={{
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '2px',
                              background: (
                                ((item as any).type === 'chart' && rightPanelView === 'data-explorer' && chartViewMode === item.id)
                                || ((item as any).type !== 'chart' && rightPanelView === item.id)
                              ) ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                              border: (
                                ((item as any).type === 'chart' && rightPanelView === 'data-explorer' && chartViewMode === item.id)
                                || ((item as any).type !== 'chart' && rightPanelView === item.id)
                              ) ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                              borderRadius: '8px',
                              padding: '6px 2px',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <span style={{ fontSize: '16px' }}>{item.icon}</span>
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              color: (
                                ((item as any).type === 'chart' && rightPanelView === 'data-explorer' && chartViewMode === item.id)
                                || ((item as any).type !== 'chart' && rightPanelView === item.id)
                              ) ? '#818cf8' : 'rgba(255,255,255,0.4)'
                            }}>{item.label}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="panel-body" style={{ flex: 1, minHeight: 0, padding: rightPanelView === 'ai-chat' ? '0' : '20px', overflowY: 'auto' }}>
                  {/* Explicitly split Chat Panels to ensure correct context and unmounting */}
                  {/* Single AI Chat Panel (Context aware) */}
                  {rightPanelView === 'ai-chat' && (
                    <AIChatPanel
                      key={`chat-${workflowPhase}`}
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
                              updated[activeResultIndex] = { ...updated[activeResultIndex], chatHistory: messages };
                            }
                            return updated;
                          });
                        }
                      }}
                      workflowPhase={workflowPhase}
                    />
                  )}

                  {rightPanelView === 'data-explorer' && activeAnalysis && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
                      <div className="left-panel-toggle-group">
                        <button
                          onClick={() => { setLeftView('chart'); setChartViewMode('volcano'); }}
                          className={`left-toggle-btn ${leftView === 'chart' && chartViewMode === 'volcano' ? 'active' : ''}`}
                        >Volcano</button>
                        <button
                          onClick={() => { setLeftView('chart'); setChartViewMode('ranked'); }}
                          className={`left-toggle-btn ${leftView === 'chart' && chartViewMode === 'ranked' ? 'active' : ''}`}
                        >Ranked</button>
                        <button
                          onClick={() => setLeftView('table')}
                          className={`left-toggle-btn ${leftView === 'table' ? 'active' : ''}`}
                        >Table</button>
                      </div>

                      <div style={{ flex: 1, minHeight: '350px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                        {leftView === 'chart' ? (
                          <VolcanoPlot
                            data={activeAnalysis.volcano_data}
                            viewMode={chartViewMode}
                            onSelectionChange={setFilteredGenes}
                            onPointClick={setActiveGene}
                          />
                        ) : (
                          <DataTable
                            data={activeAnalysis.volcano_data}
                            onRowClick={setActiveGene}
                            labels={entityLabels}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {rightPanelView === 'enrichment' && (
                    <EnrichmentPanel
                      volcanoData={activeAnalysis?.volcano_data}
                      onEnrichmentComplete={handleEnrichmentComplete}
                      onPathwayClick={async (pathwayNameOrId, source, metadata) => {
                        console.log(`Pathway clicked: ${pathwayNameOrId} (${source})`, metadata);
                        addLog(`🔍 Loading pathway: ${pathwayNameOrId}`);

                        try {
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
                            if (activeAnalysis?.volcano_data) {
                              if (!pathwayNameOrId || pathwayNameOrId.trim() === '') {
                                addLog(`❌ Invalid pathway ID: "${pathwayNameOrId}"`);
                                return;
                              }

                              addLog(`🎨 Generating ${source} pathway diagram for: ${pathwayNameOrId}...`);

                              const geneExpression: Record<string, number> = {};
                              activeAnalysis.volcano_data.forEach((p: any) => {
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

                                setAnalysisResults(prev => prev.map((item, idx) =>
                                  idx === activeResultIndex
                                    ? {
                                      ...item,
                                      pathway: response.pathway as any,
                                      statistics: response.statistics as any
                                    }
                                    : item
                                ));

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

                  {rightPanelView === 'narrative' && activeAnalysis && (
                    <NarrativePanel
                      enrichmentResults={activeAnalysis?.enrichrResults}
                      onComplete={(narrative) => {
                        addLog(`📝 Narrative report generated (${narrative.length} chars)`);
                      }}
                    />
                  )}

                  {/* Operational Panels linked from Hub */}
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
                  {rightPanelView === 'multi-sample' && (
                    <MultiSamplePanel
                      sendCommand={async (cmd, data) => { await sendCommand(cmd, data, false); }}
                      isConnected={isConnected}
                      currentFilePath={activeAnalysis?.sourceFilePath}
                      lastResponse={lastResponse}
                      onSampleGroupChange={(groupName, groupData) => {
                        if (activeAnalysis && groupData.length > 0) {
                          const newVolcanoData = groupData.map(d => ({
                            gene: d.gene,
                            x: d.logfc,
                            y: -Math.log10(d.pvalue),
                            pvalue: d.pvalue,
                            status: d.logfc > 0 && d.pvalue < 0.05 ? 'UP' as const :
                              (d.logfc < 0 && d.pvalue < 0.05 ? 'DOWN' as const : 'NS' as const)
                          }));

                          setAnalysisResults(prev => {
                            const updated = [...prev];
                            if (updated[activeResultIndex]) {
                              updated[activeResultIndex] = {
                                ...updated[activeResultIndex],
                                volcano_data: newVolcanoData,
                              };
                            }
                            return updated;
                          });

                          addLog(`📊 Switched to sample group: ${groupName} (${groupData.length} genes)`);
                        }
                      }}
                    />
                  )}
                  {rightPanelView === 'singlecell' && (
                    <SingleCellPanel
                      onComplete={(result) => {
                        addLog(`🧬 Single-cell analysis complete: ${result.metadata?.n_cells || 0} cells`);
                      }}
                    />
                  )}
                  {rightPanelView === 'images' && (
                    <ImageUploader
                      sendCommand={async (cmd, data) => { await sendCommand(cmd, data, false); }}
                      isConnected={isConnected}
                    />
                  )}
                </div>
              </div>
            }
          />
          )}

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

        {/* v2.0: AI Event Panel removed - consolidated into Agent Hub */}
      </div>
    </div>
  );
}

export default App;
