import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useBioEngine } from './hooks/useBioEngine';
import { DataImportWizard, AnalysisConfig } from './components/DataImportWizard';
import { VolcanoPlot, VolcanoPoint, VolcanoViewMode } from './components/VolcanoPlot';
import { EvidencePopup, GeneDetail } from './components/EvidencePopup';
import { PathwayVisualizer, PathwayVisualizerRef } from './components/PathwayVisualizer';
import { DataTable } from './components/DataTable';
import { WorkflowBreadcrumb, WorkflowStep } from './components/WorkflowBreadcrumb';
import { SplashScreen } from './components/SplashScreen';

import { AIChatPanel } from './components/AIChatPanel';
import { AIEventPanel } from './components/AIEventPanel';
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
import { writeTextFile, BaseDirectory, mkdir } from '@tauri-apps/plugin-fs';

import { PathwaySelectorDropdown } from './components/PathwaySelectorDropdown';
import { IntelligenceDashboard } from './components/IntelligenceDashboard';
import { RuntimeLogPanel } from './components/RuntimeLogPanel';
import { SystemHealthModal } from './components/SystemHealthModal';
import { useI18n } from './i18n';
import './App.css';
/*
import demoSession from '../assets/demos/sample_timecourse_6points.json';
import demoTcgaBrca from '../assets/demos/TCGA_BRCA_Breast_Cancer.json';
import demoAlzheimers from '../assets/demos/Alzheimers_Hippocampus.json';
import demoCovid19 from '../assets/demos/COVID19_PBMC_CytokineStorm.json';
*/
import demoScript from '../assets/sample_timecourse_6points_report.md?raw';

// ... (Types remain same) ...
import { LicenseManager } from './utils/licenseManager';
import { LicenseModal } from './components/LicenseModal';
// import { ProFeature } from './components/ProFeature'; // Using manual gating for now

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
  // Separate chat histories for each workflow phase
  perceptionChatHistory?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number; kind?: string; proposal?: any; status?: string }>;  // Insight phase chat
  explorationChatHistory?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number; kind?: string; proposal?: any; status?: string }>;  // Mapping phase chat
  synthesisChatHistory?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number; kind?: string; proposal?: any; status?: string }>;  // Synthesis phase chat
  // Legacy field for backward compatibility
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number; kind?: string; proposal?: any; status?: string }>;
  enrichmentSummary?: string;
  enrichmentResults?: any[];
  gseaResults?: { up: any[], down: any[] };
  enrichmentMetadata?: any;
  deMetadata?: any;
}

interface ProjectEntry {
  id: number;
  file_path?: string;
  file_name?: string;
  created_at?: string;
  pathway_id?: string;
  pathway_name?: string;
  gene_count?: number;
}

interface PathwayFrequency {
  pathway_id: string;
  pathway_name?: string;
  count: number;
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
  const { t, lang, setLang } = useI18n();
  const { isConnected, isLoading: engineLoading, sendCommand, activeProposal, resolveProposal, lastResponse } = useBioEngine();

  // --- 1. Core State Consolidation ---
  // (Moved to top level of App to avoid TDZ ReferenceErrors)

  // Licensing & UX
  const [isPro, setIsPro] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showHealthCheck, setShowHealthCheck] = useState(false);
  const [healthReport, setHealthReport] = useState<any>(null);

  // Wizard & Workflow
  const [draftConfig, setDraftConfig] = useState<AnalysisConfig | null>(null);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [maxWizardStep, setMaxWizardStep] = useState<1 | 2>(1);
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('upload');

  // Analysis results (initialized from localStorage)
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>(() => {
    try {
      const saved = localStorage.getItem('bioviz_sessions');
      if (saved) {
        const parsed = JSON.parse(saved);
        const normalized = (parsed || []).map((entry: any) => {
          const baseEntry = entry && entry.enrichrResults && !entry.enrichmentResults
            ? { ...entry, enrichmentResults: entry.enrichrResults }
            : entry;
          const legacyHistory = Array.isArray(baseEntry?.chatHistory) ? baseEntry.chatHistory : [];
          return {
            ...baseEntry,
            perceptionChatHistory: Array.isArray(baseEntry?.perceptionChatHistory) ? baseEntry.perceptionChatHistory : [],
            explorationChatHistory: Array.isArray(baseEntry?.explorationChatHistory) ? baseEntry.explorationChatHistory : legacyHistory,
            synthesisChatHistory: Array.isArray(baseEntry?.synthesisChatHistory) ? baseEntry.synthesisChatHistory : [],
          };
        });
        console.log('[App] Restored', normalized.length, 'sessions from localStorage');
        return normalized;
      }
    } catch (e) {
      console.error('[App] Failed to restore sessions:', e);
    }
    return [];
  });

  // Selection & UI Focus
  const [activeResultIndex, setActiveResultIndex] = useState<number>(0);
  const [filteredGenes, setFilteredGenes] = useState<string[]>([]);
  const [activeGene, setActiveGene] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showFileManager, setShowFileManager] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [isProjectMenuLoading, setIsProjectMenuLoading] = useState(false);
  const [projectHistory, setProjectHistory] = useState<ProjectEntry[]>([]);
  const [pathwayFrequency, setPathwayFrequency] = useState<PathwayFrequency[]>([]);

  // Navigation & Tool Views
  const [leftView, setLeftView] = useState<'chart' | 'table'>('chart');
  const [rightPanelView, setRightPanelView] = useState<'ai-chat' | 'images' | 'multi-sample' | 'de-analysis' | 'enrichment' | 'narrative' | 'singlecell' | 'data-explorer'>('ai-chat');
  const [mainView, setMainView] = useState<'pathway' | 'intelligence' | 'ai-insights'>('ai-insights');
  const [workflowPhase, setWorkflowPhase] = useState<'perception' | 'exploration' | 'synthesis'>('perception');
  const [explorationTool, setExplorationTool] = useState<'de-analysis' | 'enrichment' | 'multi-sample' | 'singlecell' | 'images'>('de-analysis');
  const [studioIntelligence, setStudioIntelligence] = useState<any>(null);

  // Popups & Contextual Data
  const [showEvidencePopup, setShowEvidencePopup] = useState(false);
  const [evidenceEntity, setEvidenceEntity] = useState<{ type: string; id: string } | null>(null);
  const [evidenceAudit, setEvidenceAudit] = useState<any | null>(null);
  const [evidenceDistribution, setEvidenceDistribution] = useState<any | null>(null);
  const [multiSampleData, setMultiSampleData] = useState<any | null>(null);
  const [chartViewMode, setChartViewMode] = useState<VolcanoViewMode>('volcano');

  // Background Processes
  const [showRuntimeLog, setShowRuntimeLog] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [isGeneratingStudioReport, setIsGeneratingStudioReport] = useState(false);

  // Refs
  const filehubMenuRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const vizRef = useRef<PathwayVisualizerRef>(null);

  // --- 2. Hooks & Effects ---

  // Commercial Licensing Validation
  useEffect(() => {
    const checkLicense = async () => {
      const savedKey = LicenseManager.loadLicense();
      if (savedKey) {
        const result = await LicenseManager.validateLicense(savedKey);
        setIsPro(result.valid);
        if (!result.valid) {
          console.warn("Invalid/Expired License:", result.error);
        }
      } else {
        setIsPro(false);
      }
    };
    checkLicense();
  }, []);

  // Enrichment Summary Sync
  useEffect(() => {
    if (lastResponse?.cmd !== 'SUMMARIZE_ENRICHMENT') return;
    if (lastResponse?.status !== 'ok') return;
    const summary = (lastResponse as any)?.summary || (lastResponse as any)?.content || (lastResponse as any)?.message;
    if (!summary) return;
    setAnalysisResults(prev => {
      const updated = [...prev];
      if (updated[activeResultIndex]) {
        updated[activeResultIndex] = {
          ...updated[activeResultIndex],
          enrichmentSummary: summary
        };
      }
      return updated;
    });
  }, [lastResponse, activeResultIndex]);

  // System Check on Startup
  useEffect(() => {
    if (!showSplash && isConnected) {
      const runCheck = async () => {
        try {
          console.log('[App] Running Startup System Check...');
          const report = await sendCommand('SYS_CHECK', {}, true) as any;
          if (report && (report.status === 'ok' || report.ram)) {
            const data = report.report || report;
            setHealthReport(data);
            setShowHealthCheck(true);
          }
        } catch (e) {
          console.error('System Check failed:', e);
        }
      };
      runCheck();

      // Sync License to Backend
      const syncLicense = async () => {
        const savedKey = LicenseManager.loadLicense();
        if (savedKey) {
          try {
            await sendCommand('VALIDATE_LICENSE', { key: savedKey }, true);
          } catch (e) {
            console.error('[App] Failed to sync license:', e);
          }
        }
      };
      syncLicense();
    }
  }, [showSplash, isConnected, sendCommand]);

  // Sync right panel view when workflow phase changes
  useEffect(() => {
    if (workflowPhase === 'perception') {
      setRightPanelView('ai-chat');
    } else if (workflowPhase === 'synthesis') {
      setRightPanelView('narrative');
    } else if (workflowPhase === 'exploration' && (rightPanelView === 'narrative' || rightPanelView === 'data-explorer')) {
      setRightPanelView('ai-chat');
    }
  }, [workflowPhase, setRightPanelView]);

  // Phase Transition Management
  useEffect(() => {
    if (mainView === 'ai-insights' && workflowPhase !== 'perception') {
      setWorkflowPhase('perception');
      return;
    }
    if (mainView === 'pathway' && workflowPhase !== 'exploration') {
      setWorkflowPhase('exploration');
      return;
    }
    if (mainView === 'intelligence' && workflowPhase !== 'synthesis') {
      setWorkflowPhase('synthesis');
    }
  }, [mainView, workflowPhase]);

  // Click Outside Handlers for Menus
  useEffect(() => {
    if (!showFileManager) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!filehubMenuRef.current || !event.target) return;
      if (!filehubMenuRef.current.contains(event.target as Node)) {
        setShowFileManager(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFileManager]);

  useEffect(() => {
    if (!showProjectMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!projectMenuRef.current || !event.target) return;
      if (!projectMenuRef.current.contains(event.target as Node)) {
        setShowProjectMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProjectMenu]);

  // Project History Persistence
  useEffect(() => {
    try {
      localStorage.setItem('bioviz_sessions', JSON.stringify(analysisResults));
      console.log('[App] Saved', analysisResults.length, 'sessions to localStorage');
    } catch (e) {
      console.error('[App] Failed to save sessions:', e);
    }
  }, [analysisResults]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyPress = async (e: KeyboardEvent) => {
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.key === 'I') {
        e.preventDefault();
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('open_devtools');
        } catch (err) {
          console.error('[App] Failed to open devtools:', err);
        }
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // --- 3. Callbacks & Derived Data ---

  const refreshProjectMeta = useCallback(async () => {
    setIsProjectMenuLoading(true);
    try {
      const [projectsRes, pathwaysRes] = await Promise.all([
        sendCommand('LIST_PROJECTS', { limit: 8 }, true),
        sendCommand('LIST_PATHWAYS_FREQ', { limit: 6 }, true),
      ]);
      if (projectsRes && (projectsRes as any).status === 'ok') {
        setProjectHistory(((projectsRes as any).projects || []) as ProjectEntry[]);
      }
      if (pathwaysRes && (pathwaysRes as any).status === 'ok') {
        setPathwayFrequency(((pathwaysRes as any).pathways || []) as PathwayFrequency[]);
      }
    } catch (e) {
      console.warn('Failed to load project memory:', e);
    } finally {
      setIsProjectMenuLoading(false);
    }
  }, [sendCommand]);

  useEffect(() => {
    if (showProjectMenu) refreshProjectMeta();
  }, [showProjectMenu, refreshProjectMeta]);

  useEffect(() => {
    if (analysisResults.length > 0) refreshProjectMeta();
  }, [analysisResults.length, refreshProjectMeta]);

  const activeAnalysis = analysisResults[activeResultIndex] || null;
  const uploadedFileBase = getBaseName(activeAnalysis?.sourceFilePath);

  // --- Derived State & Memorization ---
  const entityKind: EntityKind = activeAnalysis?.entityKind || 'gene';
  const entityLabels = ENTITY_META[entityKind];

  const hasMAData = !!activeAnalysis?.volcano_data?.some(
    (p) => typeof p.mean === 'number' && !Number.isNaN(p.mean)
  );

  const canAccessMapping = maxWizardStep >= 2;
  const canAccessViz = analysisResults.length > 0;

  const activeGeneDetail = useMemo((): GeneDetail | null => {
    if (!activeAnalysis || !activeGene) return null;
    const point = activeAnalysis.gene_map[activeGene];
    if (!point) return null;
    return { name: point.gene, logFC: point.x, pvalue: point.pvalue };
  }, [activeAnalysis, activeGene]);

  const commonPathways = useMemo(() => {
    const map = new Map<string, PathwayFrequency>();
    pathwayFrequency.forEach((p) => {
      if (p.pathway_id) map.set(p.pathway_id, p);
    });
    [
      { pathway_id: 'hsa04115', pathway_name: 'p53 signaling pathway', count: 0 },
      { pathway_id: 'hsa04010', pathway_name: 'MAPK signaling pathway', count: 0 },
      { pathway_id: 'hsa04151', pathway_name: 'PI3K-Akt signaling', count: 0 },
    ].forEach((p) => { if (!map.has(p.pathway_id)) map.set(p.pathway_id, p); });
    return Array.from(map.values()).sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [pathwayFrequency]);

  const multiSampleSets = useMemo(() => {
    if (!multiSampleData?.expression_data) return [];
    const groups = Object.keys(multiSampleData.expression_data);
    return groups.map((group) => {
      const genes = (multiSampleData.expression_data[group] || [])
        .filter((d: any) => d.pvalue !== undefined && d.pvalue < 0.05)
        .map((d: any) => d.gene)
        .filter(Boolean);
      return { label: group, genes };
    });
  }, [multiSampleData]);

  // Migration logic
  useEffect(() => {
    const STORAGE_KEY = 'bioviz_last_config';
    const VERSION_KEY = 'bioviz_config_version';
    const CURRENT_VERSION = '1.2.1';
    try {
      const lastVersion = localStorage.getItem(VERSION_KEY);
      if (lastVersion !== CURRENT_VERSION) {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const config = JSON.parse(saved);
          if (config.pathwayId === '') {
            config.pathwayId = undefined;
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, timestamp: Date.now() }));
          }
        }
        localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
      }
    } catch (e) {
      console.error('[App] Migration failed:', e);
    }
  }, []);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const line = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev.slice(-20), line]);
    eventBus.emit(BioVizEvents.APP_LOG, { message });
    const persistLog = async () => {
      try {
        await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true });
        await writeTextFile('bioviz_run.log', line + '\n', { baseDir: BaseDirectory.AppData, append: true });
      } catch (e) {
        console.warn('Run log write failed:', e);
      }
    };
    void persistLog();
  };


  // --- 4. Business Logic ---

  const executeAISkill = async (prompt: string, skillId?: string) => {
    if (!activeAnalysis) return;
    const userMsg: any = { role: 'user', content: prompt, timestamp: Date.now() };
    const updatedHistory = [...(activeAnalysis.explorationChatHistory || activeAnalysis.chatHistory || []), userMsg];

    setAnalysisResults(prev => {
      const updated = [...prev];
      if (updated[activeResultIndex]) {
        updated[activeResultIndex] = { ...updated[activeResultIndex], explorationChatHistory: updatedHistory, chatHistory: updatedHistory };
      }
      return updated;
    });

    const volcanoData = (activeAnalysis.volcano_data || []) as any[];
    const enrichmentResults = activeAnalysis.enrichmentResults || (activeAnalysis as any)?.pathway?.enriched_terms || (activeAnalysis as any)?.statistics?.enriched_terms;
    const significantGenes = volcanoData.filter((g: any) => g?.status === 'UP' || g?.status === 'DOWN').map((g: any) => g?.gene).filter(Boolean);
    const enrichmentMetadata = activeAnalysis.enrichmentMetadata || {};

    if (skillId) {
      if (skillId === 'sum') {
        await sendCommand(enrichmentResults ? 'SUMMARIZE_ENRICHMENT' : 'SUMMARIZE_DE', {
          ...(enrichmentResults ? { enrichment_data: enrichmentResults } : {}),
          ...(volcanoData.length ? { volcano_data: volcanoData } : {}),
          ...(activeAnalysis.statistics ? { statistics: activeAnalysis.statistics } : {}),
          ...(enrichmentResults ? { metadata: enrichmentMetadata } : {})
        }, false);
        return;
      }
      if (skillId === 'exp') {
        await sendCommand('SUMMARIZE_ENRICHMENT', {
          enrichment_data: enrichmentResults,
          volcano_data: volcanoData,
          statistics: activeAnalysis.statistics,
          metadata: enrichmentMetadata
        }, false);
        return;
      }
      if (skillId === 'hyp') {
        await sendCommand('GENERATE_HYPOTHESIS', { significant_genes: significantGenes, pathways: enrichmentResults, volcano_data: volcanoData }, false);
        return;
      }
      if (skillId === 'ref') {
        await sendCommand('CHAT', { query: prompt, context: activeAnalysis }, false);
        return;
      }
      if (skillId === 'cmp') {
        await sendCommand('DISCOVER_PATTERNS', { expression_matrix: volcanoData }, false);
        return;
      }
    }

    await sendCommand('AGENT_TASK', {
      intent: prompt,
      prompt,
      params: {
        enrichment_results: activeAnalysis.enrichmentResults,
        volcano_data: activeAnalysis.volcano_data,
        file_path: activeAnalysis.sourceFilePath,
        mapping: activeAnalysis.config?.mapping,
        data_type: activeAnalysis.config?.dataType,
        filters: activeAnalysis.config?.analysisMethods?.length ? { methods: activeAnalysis.config?.analysisMethods } : undefined
      }
    }, false);
  };










  // --- Actions ---
  const handleAnalysisStart = async (config: AnalysisConfig) => {
    addLog(t('Running analysis for pathway: {pathway}...', { pathway: config.pathwayId || 'auto' }));
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
      addLog(t('▶ Analyzing: {name}', { name: base }));

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
          addLog(t('❌ Analysis failed for {name}: {error}', { name: base, error: response?.message || t('Unknown error') }));
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
          perceptionChatHistory: [],
          explorationChatHistory: [],
          synthesisChatHistory: []
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
        addLog(t('✓ Done: {name} → {pathway}', { name: base, pathway: pathwayName }));
      } catch (e: any) {
        addLog(t('❌ Analysis error for {name}: {error}', { name: base, error: e?.message || String(e) }));
      }
    }

    setBatchRunning(false);
    if (successCount === 0) {
      alert(t('Analysis failed for all selected files.'));
    }
  };



  // If current result doesn't support MA but view is set to MA, auto-switch to Volcano
  useEffect(() => {
    if (activeAnalysis && !hasMAData && chartViewMode === 'ma') {
      setChartViewMode('volcano');
    }
  }, [activeAnalysis, hasMAData, chartViewMode]);


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

  const handleFileImport = () => {
    setWizardStep(1);
    setWorkflowStep('upload');
  };

  const handleDeleteAnalysis = (idx: number) => {
    const target = analysisResults[idx];
    if (!target) return;
    const baseName = getBaseName(target.sourceFilePath);
    const confirmDelete = window.confirm(t('Delete analysis for "{name}"?', { name: baseName }));
    if (!confirmDelete) return;

    setAnalysisResults(prev => {
      const next = prev.filter((_, index) => index !== idx);
      let nextIndex = activeResultIndex;
      if (idx === activeResultIndex) {
        nextIndex = Math.min(idx, next.length - 1);
      } else if (idx < activeResultIndex) {
        nextIndex = Math.max(0, activeResultIndex - 1);
      }
      setActiveResultIndex(nextIndex >= 0 ? nextIndex : 0);
      if (next.length === 0) {
        setWorkflowStep('upload');
        setShowFileManager(false);
      }
      return next;
    });
  };

  const buildDistributionSnapshot = (volcanoData?: VolcanoPoint[]) => {
    if (!volcanoData || volcanoData.length === 0) return null;
    const log2fc = volcanoData.map(p => p.x).filter((v) => typeof v === 'number' && !Number.isNaN(v)) as number[];
    const pvals = volcanoData.map(p => p.pvalue).filter((v) => typeof v === 'number' && !Number.isNaN(v)) as number[];
    const median = (vals: number[]) => {
      if (vals.length === 0) return null;
      const sorted = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };
    const up = volcanoData.filter(p => (p.status as string) === 'UP' || (p.status as string) === 'up').length;
    const down = volcanoData.filter(p => (p.status as string) === 'DOWN' || (p.status as string) === 'down').length;

    return {
      total: volcanoData.length,
      up,
      down,
      log2fc: {
        min: log2fc.length ? Math.min(...log2fc).toFixed(3) : null,
        max: log2fc.length ? Math.max(...log2fc).toFixed(3) : null,
        median: log2fc.length ? median(log2fc)?.toFixed(3) : null
      },
      pvalue: {
        min: pvals.length ? Math.min(...pvals).toExponential(2) : null,
        median: pvals.length ? median(pvals)?.toExponential(2) : null
      }
    };
  };

  // When user clicks a node in the pathway map,
  // sync both the active gene (for Evidence) and selection (for highlighting)
  const openEvidencePopup = async (type: string, id: string) => {
    setEvidenceEntity({ type, id });
    setEvidenceDistribution(buildDistributionSnapshot(activeAnalysis?.volcano_data));
    setEvidenceAudit(null);
    setShowEvidencePopup(true);

    if (activeAnalysis?.sourceFilePath) {
      try {
        const res = await sendCommand(
          'LIST_ENRICHMENT_AUDITS',
          { file_path: activeAnalysis.sourceFilePath, limit: 1 },
          true
        ) as any;
        if (res?.status === 'ok' && Array.isArray(res.audits) && res.audits.length > 0) {
          setEvidenceAudit(res.audits[0]);
        }
      } catch (e) {
        console.warn('[Evidence] Failed to load audit snapshot:', e);
      }
    }
  };

  const handlePathwayNodeClick = (name: string) => {
    setActiveGene(name);
    setFilteredGenes(name ? [name] : []);
    if (name) {
      void openEvidencePopup('GENE', name);
    }
  };


  const handleAIEntityClick = (type: string, id: string) => {
    console.log(`[App] AI Entity Clicked: ${type} -> ${id}`);
    if (type === 'GENE') {
      setActiveGene(id);
      setFilteredGenes([id]);
      // If in wrong view, switch to chart?
      if (leftView !== 'chart') setLeftView('chart');
      void openEvidencePopup(type, id);
    } else if (type === 'PATHWAY') {
      // If just an ID, maybe try to load? or just prompt user?
      // For now, let's just log it or highlight if current pathway matches?
      if (activeAnalysis?.pathway?.id === id) {
        addLog(t('Already on pathway {id}', { id }));
      } else {
        addLog(t('AI suggested pathway {id}. (Auto-switch not yet implemented for safety)', { id }));
      }
      void openEvidencePopup(type, id);
    } else {
      void openEvidencePopup(type, id);
    }
  };

  const handleGenerateSuperNarrative = async () => {
    if (!studioIntelligence) return;
    setIsGeneratingStudioReport(true);
    addLog(t('Synthesizing 7-layer Studio Intelligence report...'));
    const requestId = `studio-${Date.now()}`;
    addLog(t('✨ AI Synthesis started... (ID: {id})', { id: requestId }));
    try {
      const res = await sendCommand('AI_INTERPRET_STUDIO', {
        intelligence_data: studioIntelligence
      }, true);

      if (res && (res as any).super_narrative) {
        const narrative = (res as any).super_narrative;
        console.log('[BioViz] 🤖 AI Narrative Received:', narrative.length, 'chars');
        addLog(t('AI Synthesis complete ({count} chars).', { count: narrative.length }));

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
        addLog(t('AI Super Narrative analysis complete.'));
      } else {
        addLog(t('AI Synthesis returned no narrative content.'));
      }
    } catch (err) {
      console.error('Failed to generate studio report:', err);
      addLog(t('Failed to generate AI Super Narrative: {error}', { error: String(err) }));
    } finally {
      setIsGeneratingStudioReport(false);
    }
  };

  const handleEnrichmentComplete = React.useCallback((res: any) => {
    console.log('[App] Enrichment results arrived:', res.cmd);

    if (res?.cmd === 'SUMMARIZE_ENRICHMENT') {
      const summary = res?.summary || res?.content || res?.message || '';
      if (!summary || !activeAnalysis) return;
      setAnalysisResults(prev => {
        const updated = [...prev];
        if (updated[activeResultIndex]) {
          updated[activeResultIndex] = {
            ...updated[activeResultIndex],
            enrichmentSummary: summary
          };
        }
        return updated;
      });
      return;
    }

    // Handle custom Studio Toggle action from AI Deep Insight
    if (res?.type === 'TOGGLE_STUDIO_VIEW') {
      setStudioIntelligence(res.data);
      setMainView('intelligence');
      return;
    }

    // Save enrichment results + metadata + insights to session
    if (activeAnalysis) {
      const enrichmentResults = res?.results
        ? res.results
        : res?.fusion_results
          ? res.fusion_results
          : [...(res?.up_regulated || []), ...(res?.down_regulated || [])];

      setAnalysisResults(prev => {
        const updated = [...prev];
        if (updated[activeResultIndex]) {
          updated[activeResultIndex] = {
            ...updated[activeResultIndex],
            enrichmentResults: enrichmentResults || updated[activeResultIndex].enrichmentResults,
            enrichmentMetadata: res?.metadata || updated[activeResultIndex].enrichmentMetadata,
            insights: res?.intelligence_report || updated[activeResultIndex].insights
          };
        }
        return updated;
      });

      if (res?.intelligence_report) {
        addLog(t('Analysis insights updated.'));
      }
    }
  }, [activeAnalysis, activeResultIndex, mainView]);

  const handleDEAnalysisComplete = async (response: any) => {
    if (!activeAnalysis) return;

    addLog(t('Applying DE results ({method}) to current view...', { method: response.method }));

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

    const deMetadata = {
      method: response.method,
      warning: response.warning || null,
      completed_at: new Date().toISOString()
    };

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
                has_pvalue: true,
                deMetadata
              };
            }
            return item;
          }));
          addLog(t('✓ Visualization updated with DE results.'));
        } else {
          addLog(t('❌ Color pathway failed: {error}', { error: colorRes?.message || t('Unknown error') }));
        }
      } catch (e) {
        console.error('Failed to color pathway with DE results:', e);
        addLog(t('❌ Failed to update visualization: {error}', { error: String(e) }));
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
            has_pvalue: true,
            deMetadata
            // we should probably update statistics here too if we have a way to do it locally
          };
        }
        return item;

      }));
      addLog(t('✓ Results updated with DE analysis.'));
    }
  };



  const handleResetDE = async () => {
    if (!activeAnalysis) return;
    addLog(t('Restoring original data visualization...'));

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
        addLog(t('✓ Original view restored.'));
      } else {
        addLog(t('❌ Reset failed: {error}', { error: response?.message || t('Unknown error') }));
      }
    } catch (e) {
      console.error('Failed to reset DE visualization:', e);
      addLog(t('❌ Reset error: {error}', { error: String(e) }));
    }
  };

  // --- Render ---

  if (showSplash) {
    return <SplashScreen onEnter={() => setShowSplash(false)} />;
  }

  return (
    <div className="app-container">
      {/* SAFETY GUARD: No longer using global modal as AIChatPanel handles proposals inline */}

      <SystemHealthModal
        isOpen={showHealthCheck}
        onClose={() => setShowHealthCheck(false)}
        checkReport={healthReport}
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
              {!isPro && (
                <button
                  onClick={() => setShowLicenseModal(true)}
                  style={{
                    marginLeft: '8px', padding: '2px 8px', fontSize: '11px',
                    background: 'rgba(234,179,8,0.1)', color: '#f59e0b',
                    border: '1px solid rgba(234,179,8,0.3)', borderRadius: '12px', cursor: 'pointer'
                  }}
                >
                  🔓 {t('Activate Pro')}
                </button>
              )}
              {isPro && (
                <span style={{ marginLeft: '8px', padding: '2px 6px', fontSize: '10px', background: 'rgba(34,197,94,0.1)', color: '#4ade80', borderRadius: '4px', border: '1px solid rgba(34,197,94,0.2)' }}>
                  PRO
                </span>
              )}
            </div>

            <div className="header-lang-toggle no-drag">
              <button
                className={`header-lang-btn ${lang === 'en' ? 'active' : ''}`}
                onClick={() => setLang('en')}
                title={t('Switch to English')}
              >
                {t('EN')}
              </button>
              <button
                className={`header-lang-btn ${lang === 'zh' ? 'active' : ''}`}
                onClick={() => setLang('zh')}
                title={t('Switch to Chinese')}
              >
                {t('中文')}
              </button>
            </div>
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
                title={t('Export Session (JSON / Markdown)')}
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
                onClick={() => {
                  if (!isPro) {
                    setShowLicenseModal(true);
                    return;
                  }
                  if (activeAnalysis) exportSessionAsInteractiveHtml(activeAnalysis);
                }}
                disabled={!activeAnalysis}
                title={isPro ? t('Export interactive HTML') : t('Export interactive HTML (Pro only)')}
                style={{
                  width: '32px', height: '32px', borderRadius: '6px',
                  border: 'none',
                  background: activeAnalysis ? 'rgba(56,189,248,0.18)' : 'transparent',
                  color: activeAnalysis ? 'white' : 'var(--text-dim)',
                  cursor: activeAnalysis ? 'pointer' : 'not-allowed', fontSize: '16px',
                  opacity: !isPro ? 0.7 : 1,
                  position: 'relative'
                }}
              >
                🌐
                {!isPro && <span style={{ position: 'absolute', top: -2, right: -2, fontSize: '8px' }}>🔐</span>}
              </button>
              <button
                onClick={async () => {
                  const imported = await importSession();
                  if (imported) {
                    const normalized = (imported as any).enrichrResults && !(imported as any).enrichmentResults
                      ? { ...(imported as any), enrichmentResults: (imported as any).enrichrResults }
                      : imported;
                    const legacyHistory = Array.isArray((normalized as any).chatHistory) ? (normalized as any).chatHistory : [];
                    const normalizedWithChat = {
                      ...normalized,
                      perceptionChatHistory: Array.isArray((normalized as any).perceptionChatHistory) ? (normalized as any).perceptionChatHistory : [],
                      explorationChatHistory: Array.isArray((normalized as any).explorationChatHistory) ? (normalized as any).explorationChatHistory : legacyHistory,
                      synthesisChatHistory: Array.isArray((normalized as any).synthesisChatHistory) ? (normalized as any).synthesisChatHistory : []
                    };
                    setAnalysisResults(prev => [...prev, normalizedWithChat as any]);
                    setActiveResultIndex(analysisResults.length);
                  }
                }}
                title={t('Import Session (JSON)')}
                style={{
                  width: '32px', height: '32px', borderRadius: '6px',
                  border: 'none',
                  background: 'rgba(34,197,94,0.18)',
                  color: 'white', cursor: 'pointer', fontSize: '16px'
                }}
              >
                📤
              </button>
              <div className="header-menu-dropdown" ref={projectMenuRef}>
                <button
                  onClick={() => setShowProjectMenu(prev => !prev)}
                  title={t('Project History')}
                  style={{
                    width: '32px', height: '32px', borderRadius: '6px',
                    border: 'none',
                    background: 'rgba(148,163,184,0.18)',
                    color: 'white', cursor: 'pointer', fontSize: '16px'
                  }}
                >
                  🗂️
                </button>
                {showProjectMenu && (
                  <div className="header-menu-panel">
                    <div className="header-menu-section">
                      <div className="header-menu-title">{t('Recent Projects')}</div>
                      {isProjectMenuLoading && (
                        <div className="header-menu-muted">{t('Loading...')}</div>
                      )}
                      {!isProjectMenuLoading && projectHistory.length === 0 && (
                        <div className="header-menu-muted">{t('No records yet')}</div>
                      )}
                      {!isProjectMenuLoading && projectHistory.map((project) => {
                        const label = project.file_name || project.file_path || 'Untitled';
                        return (
                          <button
                            key={`project-${project.id}`}
                            type="button"
                            className="header-menu-item"
                            onClick={() => {
                              const idx = analysisResults.findIndex(
                                (item) => item.sourceFilePath === project.file_path
                              );
                              if (idx >= 0) {
                                setActiveResultIndex(idx);
                                setFilteredGenes([]);
                                setActiveGene(null);
                                setWorkflowStep('viz');
                                setMainView('pathway');
                              } else {
                                addLog(t('Project not loaded yet: {label}', { label }));
                              }
                              setShowProjectMenu(false);
                            }}
                          >
                            <span className="header-menu-item-name">{label}</span>
                            {project.pathway_name && (
                              <span className="header-menu-item-meta">{project.pathway_name}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
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
              <div className="filehub-bar no-drag">
                <div className="filehub-stats">
                  <div className="hub-stat-item">
                    <span className="hub-stat-label">{t('File')}</span>
                    <span className="hub-stat-value" title={activeAnalysis.sourceFilePath}>{uploadedFileBase}</span>
                  </div>
                  <div className="hub-stat-item">
                    <span className="hub-stat-label">{t('Genes')}</span>
                    <span className="hub-stat-value">{activeAnalysis.volcano_data.length.toLocaleString()}</span>
                  </div>
                </div>
                <div className="filehub-actions">
                  <div className="filehub-dropdown" ref={filehubMenuRef}>
                    <button
                      type="button"
                      className="filehub-action-btn triangle"
                      onClick={() => setShowFileManager(prev => !prev)}
                      aria-label={t('File actions')}
                    >
                      ▾
                    </button>
                    {showFileManager && (
                      <div className="filehub-menu">
                        {analysisResults.length === 0 ? (
                          <div className="filehub-menu-empty">{t('No files yet')}</div>
                        ) : (
                          analysisResults.map((item, idx) => (
                            <div
                              key={`${item.sourceFilePath || 'analysis'}:${idx}`}
                              className={`filehub-menu-row ${idx === activeResultIndex ? 'active' : ''}`}
                              onClick={() => {
                                setActiveResultIndex(idx);
                                setShowFileManager(false);
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  setActiveResultIndex(idx);
                                  setShowFileManager(false);
                                }
                              }}
                            >
                              <span className="filehub-menu-name">{getBaseName(item.sourceFilePath)}</span>
                              <button
                                type="button"
                                className="filehub-delete-x"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteAnalysis(idx);
                                }}
                                aria-label={`Delete ${getBaseName(item.sourceFilePath)}`}
                              >
                                ×
                              </button>
                            </div>
                          ))
                        )}
                        <button
                          type="button"
                          className="filehub-menu-item import"
                          onClick={() => {
                            setShowFileManager(false);
                            handleFileImport();
                          }}
                        >
                          ➕ {t('Add')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
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
                { id: 'ai-insights', phase: 'perception', label: t('1. Insight'), icon: '🧠', color: '#8b5cf6' },
                { id: 'pathway', phase: 'exploration', label: t('2. Mapping'), icon: '🗺️', color: '#6366f1' },
                { id: 'intelligence', phase: 'synthesis', label: t('3. Synthesis'), icon: '🤖', color: '#10b981' }
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
                      background: mainView === step.id ? `linear - gradient(135deg, ${step.color}, #6366f1)` : 'transparent',
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

            demoScript={demoScript}
            demoTitle={t('Timecourse demo (Glycolysis)')}
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
          {mainView === 'intelligence' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              {studioIntelligence ? (
                <IntelligenceDashboard
                  data={studioIntelligence}
                  onGenerateSuperNarrative={handleGenerateSuperNarrative}
                  isGenerating={isGeneratingStudioReport}
                  metadata={activeAnalysis?.enrichmentMetadata}
                  analysisContext={activeAnalysis ? {
                    pathway: activeAnalysis.pathway,
                    volcanoData: activeAnalysis.volcano_data,
                    statistics: activeAnalysis.statistics,
                    enrichmentResults: activeAnalysis.enrichmentResults
                  } : undefined}
                  chatHistory={activeAnalysis?.synthesisChatHistory}
                  onChatUpdate={(messages) => {
                    if (activeAnalysis) {
                      setAnalysisResults(prev => {
                        const updated = [...prev];
                        if (updated[activeResultIndex]) {
                          updated[activeResultIndex] = { ...updated[activeResultIndex], synthesisChatHistory: messages };
                        }
                        return updated;
                      });
                    }
                  }}
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
                    {t('Studio Discovery')}
                  </h2>
                  <p style={{ fontSize: '14px', marginBottom: '32px', maxWidth: '500px', textAlign: 'center', lineHeight: 1.6 }}>
                    {t('Run AI Deep Insight analysis from the Gene Sets panel to unlock the 7-layer intelligence dashboard.')}
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
                    <span>🧬</span> {t('Open Gene Sets Panel')}
                  </button>
                </div>
              )}
            </div>
          )}

          {mainView === 'ai-insights' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <AIInsightsDashboard
                volcanoData={activeAnalysis?.volcano_data || []}
                enrichmentResults={activeAnalysis?.enrichmentResults}
                onEntityClick={handleAIEntityClick}
                analysisContext={{
                  filePath: activeAnalysis?.sourceFilePath,
                  mapping: activeAnalysis?.config?.mapping,
                  dataType: activeAnalysis?.config?.dataType,
                  filters: activeAnalysis?.config?.analysisMethods?.length
                    ? { methods: activeAnalysis?.config?.analysisMethods }
                    : undefined,
                  metadata: activeAnalysis?.enrichmentMetadata
                }}
                insights={activeAnalysis?.insights}
                onInsightClick={(insight) => {
                  addLog(t('🧠 Exploring insight: {title}', { title: insight.title }));
                }}
                onPathwaySelect={(pathwayId) => {
                  addLog(t('📍 Navigating to pathway: {id}', { id: pathwayId }));
                  setMainView('pathway');
                }}
                chatHistory={activeAnalysis?.perceptionChatHistory}
                onChatUpdate={(messages) => {
                  if (activeAnalysis) {
                    setAnalysisResults(prev => {
                      const updated = [...prev];
                      if (updated[activeResultIndex]) {
                        updated[activeResultIndex] = { ...updated[activeResultIndex], perceptionChatHistory: messages };
                      }
                      return updated;
                    });
                  }
                }}
              />
            </div>
          )}

          {mainView === 'pathway' && (
            <div
              style={{ flex: 1, minHeight: 0, display: 'flex' }}
              className="studio-dashboard-container"
            >
              <ResizablePanels
                defaultLeftWidth={30}
                minLeftWidth={20}
                maxLeftWidth={60}
                leftPanel={
                  <div className="studio-dashboard-left">
                    {activeAnalysis && (
                      <div className="studio-left-header no-drag">
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
                    )}
                    <div className="panel-body" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', paddingTop: '12px' }}>
                      {(engineLoading || batchRunning) && (
                        <div style={{
                          position: 'absolute', inset: 0, zIndex: 50,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)'
                        }}>
                          <div className="spinner" style={{ marginBottom: '16px' }}></div>
                          <p style={{ color: 'white' }}>{t('Processing Analysis...')}</p>
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
                                enrichmentResults={activeAnalysis.enrichmentResults}
                                gseaResults={activeAnalysis.gseaResults}
                              />
                            </div>
                          </>
                        ) : (
                          <div className="pathway-empty-state">
                            <div className="pathway-empty-header">
                              <h3>{t('Common Pathways')}</h3>
                              <p>{t('Recommended based on usage frequency. Click to switch.')}</p>
                            </div>
                            <div className="pathway-empty-grid">
                              {commonPathways.map((pathway) => (
                                <button
                                  key={`empty-pathway-${pathway.pathway_id}`}
                                  className="pathway-empty-card"
                                  onClick={() => {
                                    const cfg = activeAnalysis?.config || draftConfig;
                                    if (cfg) {
                                      handleAnalysisStart({ ...cfg, pathwayId: pathway.pathway_id });
                                    } else {
                                      addLog(t('Import data to use pathway: {pathway}', { pathway: pathway.pathway_name || pathway.pathway_id || '' }));
                                    }
                                  }}
                                >
                                  <div className="pathway-empty-title">{pathway.pathway_name || pathway.pathway_id}</div>
                                  <div className="pathway-empty-meta">×{pathway.count || 0}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                }
                rightPanel={
                  <div className="studio-dashboard-right">
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
                          { id: 'data-explorer', label: t('Data'), icon: '📊', show: workflowPhase === 'perception' },
                          { id: 'narrative', label: t('Report'), icon: '📝', show: workflowPhase === 'synthesis' },
                          {
                            // Mapping phase: Show the persistent analyzer tab
                            id: explorationTool,
                            label: t('Analyzer'),
                            icon: '🔬',
                            show: workflowPhase === 'exploration'
                          },
                          { id: 'ai-chat', label: t('Chat'), icon: '🤖', show: true }
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
                              { id: 'sum', label: t('Sum'), icon: '🧾', prompt: t('Summarize the most significant findings') },
                              { id: 'exp', label: t('Exp'), icon: '🧠', prompt: t('Explain the biological significance of these results') },
                              { id: 'hyp', label: t('Hyp'), icon: '💡', prompt: t('Generate a speculative mechanism hypothesis') },
                              { id: 'ref', label: t('Ref'), icon: '📚', prompt: t('Find relevant literature evidence') },
                              { id: 'cmp', label: t('Cmp'), icon: '🧬', prompt: t('Compare functional differences in this data') }
                            ].map(skill => (
                              <button
                                key={skill.id}
                                onClick={() => {
                                  // Execute AI skill command via helper
                                  executeAISkill(skill.prompt, skill.id);
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
                              { id: 'de-analysis', label: t('DE'), icon: '🧪', type: 'module' },
                              { id: 'enrichment', label: t('Sets'), icon: '🧬', type: 'module' },
                              { id: 'multi-sample', label: t('Multi'), icon: '🔄', type: 'module' },
                              { id: 'singlecell', label: t('SC'), icon: '🧬', type: 'module' },
                              { id: 'images', label: t('Ref'), icon: '🖼️', type: 'module' },
                              {
                                id: 'stats',
                                label: t('Stats'),
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
                                  } `}
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
                          sendCommand={async (cmd, data) => { await sendCommand(cmd, data, false); }}
                          isConnected={isConnected}
                          lastResponse={lastResponse}
                          activeProposal={activeProposal}
                          onResolveProposal={resolveProposal}
                          analysisContext={activeAnalysis ? {
                            pathway: activeAnalysis.pathway,
                            volcanoData: activeAnalysis.volcano_data,
                            statistics: activeAnalysis.statistics,
                            metadata: activeAnalysis.enrichmentMetadata || activeAnalysis.deMetadata
                          } : undefined}
                          chatHistory={activeAnalysis?.explorationChatHistory || activeAnalysis?.chatHistory}
                          onChatUpdate={(messages) => {
                            if (activeAnalysis) {
                              setAnalysisResults(prev => {
                                const updated = [...prev];
                                if (updated[activeResultIndex]) {
                                  updated[activeResultIndex] = { ...updated[activeResultIndex], explorationChatHistory: messages };
                                }
                                return updated;
                              });
                            }
                          }}
                          workflowPhase={workflowPhase}
                          onEntityClick={handleAIEntityClick}
                        />
                      )}

                      {rightPanelView === 'data-explorer' && activeAnalysis && (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
                          <div className="left-panel-toggle-group">
                            <button
                              onClick={() => { setLeftView('chart'); setChartViewMode('volcano'); }}
                              className={`left-toggle-btn ${leftView === 'chart' && chartViewMode === 'volcano' ? 'active' : ''}`}
                            >{t('Volcano')}</button>
                            <button
                              onClick={() => { setLeftView('chart'); setChartViewMode('ranked'); }}
                              className={`left-toggle-btn ${leftView === 'chart' && chartViewMode === 'ranked' ? 'active' : ''}`}
                            >{t('Ranked')}</button>
                            <button
                              onClick={() => setLeftView('table')}
                              className={`left-toggle-btn ${leftView === 'table' ? 'active' : ''}`}
                            >{t('Table')}</button>
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
                          filePath={activeAnalysis?.sourceFilePath}
                          multiSampleSets={multiSampleSets}
                          summary={activeAnalysis?.enrichmentSummary}
                          onEnrichmentComplete={handleEnrichmentComplete}
                          onPathwayClick={async (pathwayNameOrId, source, metadata) => {
                            console.log(`Pathway clicked: ${pathwayNameOrId} (${source})`, metadata);
                            addLog(t('🔍 Loading pathway: {pathway}', { pathway: pathwayNameOrId }));

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
                                  addLog(t('✓ Found: {pathway} ({count} genes)', { pathway: String(response.pathway_name || ''), count: Number(response.gene_count || 0) }));
                                  setAnalysisResults(prev => prev.map((item, idx) =>
                                    idx === activeResultIndex
                                      ? { ...item, pathway: response.pathway as any }
                                      : item
                                  ));
                                  setMainView('pathway');
                                } else {
                                  addLog(t('❌ Pathway not found: {pathway}', { pathway: pathwayNameOrId }));
                                }
                              } else {
                                if (activeAnalysis?.volcano_data) {
                                  if (!pathwayNameOrId || pathwayNameOrId.trim() === '') {
                                    addLog(t('❌ Invalid pathway ID: "{pathway}"', { pathway: pathwayNameOrId }));
                                    return;
                                  }

                                  addLog(t('🎨 Generating {source} pathway diagram for: {pathway}...', { source, pathway: pathwayNameOrId }));

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
                                    addLog(t('✓ Pathway diagram generated ({count} genes)', { count: Number(response.gene_count || 0) }));

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
                                    addLog(t('❌ Failed to generate diagram: {error}', { error: response?.message || t('Unknown error') }));
                                  }
                                } else {
                                  addLog(t('❌ No data available for visualization'));
                                }
                              }
                            } catch (err) {
                              console.error('Failed to load pathway:', err);
                              addLog(t('❌ Error: {error}', { error: String(err) }));
                            }
                          }}
                        />
                      )}

                      {rightPanelView === 'narrative' && activeAnalysis && (
                        <NarrativePanel
                          enrichmentResults={activeAnalysis?.enrichmentResults}
                          analysisContext={{
                            filePath: activeAnalysis?.sourceFilePath,
                            mapping: activeAnalysis?.config?.mapping,
                            dataType: activeAnalysis?.config?.dataType,
                            filters: activeAnalysis?.config?.analysisMethods?.length
                              ? { methods: activeAnalysis?.config?.analysisMethods }
                              : undefined
                          }}
                          onEntityClick={handleAIEntityClick}
                          onComplete={(narrative) => {
                            addLog(t('📝 Narrative report generated ({count} chars)', { count: narrative.length }));
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
                          onMultiSampleData={setMultiSampleData}
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

                              addLog(t('📊 Switched to sample group: {group} ({count} genes)', { group: groupName, count: groupData.length }));
                            }
                          }}
                        />
                      )}
                      {rightPanelView === 'singlecell' && (
                        <SingleCellPanel
                          onComplete={(result) => {
                            addLog(t('🧬 Single-cell analysis complete: {count} cells', { count: result.metadata?.n_cells || 0 }));
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
            </div>
          )}
          {/* Evidence Popup Overlay */}
          {showEvidencePopup && evidenceEntity && (
            <EvidencePopup
              entityType={evidenceEntity.type}
              entityId={evidenceEntity.id}
              geneData={activeGeneDetail}
              auditSnapshot={evidenceAudit}
              distribution={evidenceDistribution}
              entityKind={entityKind}
              labels={entityLabels}
              onClose={() => {
                setShowEvidencePopup(false);
                setActiveGene(null);
                setEvidenceEntity(null);
                setEvidenceAudit(null);
                setEvidenceDistribution(null);
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
          <div>BioViz Local v1.0.0 • {t('Workbench Mode')}</div>
          <div style={{ display: 'flex', gap: '8px', maxWidth: '500px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ color: 'var(--brand-primary)' }}>{t('Last')}:</span> {logs.length > 0 ? logs[logs.length - 1] : t('Ready')}
          </div>
          <button
            className={`log - toggle - btn ${showRuntimeLog ? 'active' : ''} `}
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

        {workflowStep === 'viz' && activeAnalysis && (
          <AIEventPanel
            sendCommand={sendCommand}
            isConnected={isConnected}
            onNavigateToGSEA={() => {
              setMainView('pathway');
              setRightPanelView('enrichment');
            }}
            onExportSession={() => {
              exportSession(activeAnalysis);
            }}
            analysisContext={{
              pathway: activeAnalysis.pathway,
              volcanoData: activeAnalysis.volcano_data,
              statistics: activeAnalysis.statistics
            }}
          />
        )}
      </div>
      <LicenseModal
        isOpen={showLicenseModal}
        onClose={() => setShowLicenseModal(false)}
        onSuccess={() => {
          setIsPro(true);
          // Refresh state or show success message
        }}
      />
    </div>
  );
}

export default App;
