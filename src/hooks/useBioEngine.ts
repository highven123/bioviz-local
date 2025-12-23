/**
 * BioViz Local - Python Sidecar Communication Hook
 * 
 * This hook provides a clean API for communicating with the Python backend.
 * It handles event listening, command sending, and automatic cleanup.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { AIActionResponse, isProposal } from '../types/aiSafety';
import { eventBus, BioVizEvents } from '../stores/eventBus';

/** Response structure from the Python sidecar */
export interface SidecarResponse {
    status: string;
    request_id?: string;
    cmd?: string;
    message?: string;
    summary?: string;
    model?: string;
    data?: unknown;
    error?: string;
    [key: string]: unknown;
}

/** Hook return type */
export interface UseBioEngineReturn {
    /** Whether the sidecar is connected and running */
    isConnected: boolean;
    /** Whether a command is currently being processed */
    isLoading: boolean;
    /** Last response received from the sidecar */
    lastResponse: SidecarResponse | null;
    /** Last error message */
    error: string | null;
    /** Active AI PROPOSAL awaiting user confirmation (Safety Guard) */
    activeProposal: AIActionResponse | null;
    /** Send a command to the Python sidecar */
    sendCommand: (cmd: string, data?: Record<string, unknown>, waitForResponse?: boolean) => Promise<SidecarResponse | void>;
    /** Send a heartbeat to check connection */
    checkHealth: () => Promise<boolean>;
    /** Restart the sidecar process */
    restartSidecar: () => Promise<void>;
    /** Resolve (confirm or reject) an active proposal */
    resolveProposal: (proposalId: string, accepted: boolean) => Promise<void>;
    /** Summarize enrichment results using structured prompts */
    summarizeEnrichment: (enrichmentData: unknown, extras?: Record<string, unknown>) => Promise<SidecarResponse | void>;
    /** Summarize differential expression results */
    summarizeDifferentialExpression: (volcanoData: unknown, thresholds?: Record<string, unknown>) => Promise<SidecarResponse | void>;
    /** Parse natural language filter queries into structured logic */
    parseFilterQuery: (naturalLanguageQuery: string, availableFields?: unknown) => Promise<SidecarResponse | void>;
    /** Generate speculative hypotheses (Phase 3) */
    generateHypothesis: (significantGenes: unknown, pathways?: unknown, volcanoData?: unknown) => Promise<SidecarResponse | void>;
    /** Run Mechanistic Narrative Analysis (Phase 2) */
    runNarrativeAnalysis: (enrichmentResults?: unknown) => Promise<SidecarResponse | void>;
    /** Run Single-Cell Contextual Analysis (Phase 3) */
    runSingleCellAnalysis: (filePath: string, options?: { clusterKey?: string; pathways?: Record<string, string[]> }) => Promise<SidecarResponse | void>;
}


/**
 * Custom hook for communicating with the BioViz Python engine.
 * 
 * @example
 * ```tsx
 * const { isConnected, sendCommand, lastResponse } = useBioEngine();
 * 
 * const handleLoad = async () => {
 *   await sendCommand('load', { path: '/path/to/file.csv' });
 * };
 * ```
 */
export function useBioEngine(): UseBioEngineReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [lastResponse, setLastResponse] = useState<SidecarResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Safety Guard: Active PROPOSAL awaiting user confirmation
    const [activeProposal, setActiveProposal] = useState<AIActionResponse | null>(null);

    type PendingRequest = {
        resolve: (response: SidecarResponse) => void;
        reject: (error: Error) => void;
        timeoutId: ReturnType<typeof setTimeout>;
        cmd: string;
    };
    const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map());

    // Set up event listeners
    useEffect(() => {
        let unlistenOutput: UnlistenFn | undefined;
        let unlistenError: UnlistenFn | undefined;
        let unlistenTerminated: UnlistenFn | undefined;

        const setupListeners = async () => {
            // Listen for stdout from sidecar
            unlistenOutput = await listen<string>('sidecar-output', (event) => {
                const payload = event.payload ?? '';

                // Sometimes a single stdout event contains multiple lines of JSON,
                // split by newline and parse each line to avoid whole-block parse failure.
                const lines = payload.split(/\r?\n/);

                for (const rawLine of lines) {
                    const line = rawLine.trim();
                    if (!line) continue;

                    try {
                        const response = JSON.parse(line) as SidecarResponse;
                        console.log('[BioViz] Sidecar JSON:', response);

                        // ============================================
                        // SAFETY GUARD: Intercept PROPOSAL actions
                        // ============================================
                        // If this is a PROPOSAL type (Yellow/Red Zone), 
                        // STOP all normal processing and activate the Safety Guard.
                        // The backend will NOT execute until we send CHAT_CONFIRM.
                        const aiResponse = response as unknown as AIActionResponse;
                        if (aiResponse.type === 'PROPOSAL' && isProposal(aiResponse)) {
                            console.log('[BioViz] 🛡️ SAFETY GUARD: Intercepted PROPOSAL:', aiResponse.proposal_id);
                            setActiveProposal(aiResponse);
                            // Do NOT set as lastResponse - this is intercepted
                            continue; // Skip normal processing for this message
                        }
                        // ============================================

                        setLastResponse(response);
                        setError(null);

                        // Resolve any pending waiter for this request_id
                        const requestId = typeof response.request_id === 'string' ? response.request_id : null;
                        if (requestId) {
                            const pending = pendingRequestsRef.current.get(requestId);
                            if (pending) {
                                if (response.status === 'ok' || response.status === 'error') {
                                    clearTimeout(pending.timeoutId);
                                    pendingRequestsRef.current.delete(requestId);
                                    if (response.status === 'error') {
                                        pending.reject(new Error(response.message || 'Unknown error from backend'));
                                    } else {
                                        pending.resolve(response);
                                    }
                                }
                            }
                        } else if (response.status === 'ok' || response.status === 'error') {
                            // Backward compatibility: older sidecars don't echo request_id.
                            // If there's exactly one in-flight request, assume this response is for it.
                            if (pendingRequestsRef.current.size === 1) {
                                const first = pendingRequestsRef.current.entries().next().value as [string, PendingRequest] | undefined;
                                if (first) {
                                    const [fallbackId, pending] = first;
                                    clearTimeout(pending.timeoutId);
                                    pendingRequestsRef.current.delete(fallbackId);
                                    if (response.status === 'error') {
                                        pending.reject(new Error(response.message || 'Unknown error from backend'));
                                    } else {
                                        pending.resolve(response);
                                    }
                                }
                            }
                        }

                        // Check for ready status
                        if (response.status === 'ready') {
                            setIsConnected(true);
                            console.log('[BioViz] Engine connected:', response.message);
                        }

                        // Check for alive status (heartbeat response)
                        if (response.status === 'alive') {
                            setIsConnected(true);
                        }

                        // Check for errors
                        if (response.status === 'error') {
                            setError(response.message || 'Unknown error');
                        }
                    } catch (e) {
                        // Only log error for this line, don't affect parsing of following lines
                        console.error('[BioViz] Failed to parse response line:', e, line.slice(0, 200));
                    }
                }
            });

            // Listen for stderr from sidecar
            unlistenError = await listen<string>('sidecar-error', (event) => {
                const payload = event.payload ?? '';
                const text = typeof payload === 'string' ? payload.trim() : '';

                // Treat log-level lines as console logs, not fatal errors
                if (text) {
                    if (/\[(DEBUG|INFO)\]/.test(text) || text.startsWith('[BioEngine]')) {
                        console.log('[BioViz] Sidecar log:', text);
                        return;
                    }
                    if (/\[WARNING\]/.test(text)) {
                        console.warn('[BioViz] Sidecar warning:', text);
                        return;
                    }
                }

                console.error('[BioViz] Sidecar error:', payload);
                eventBus.emit(BioVizEvents.AI_WARNING, {
                    title: 'Engine Error',
                    message: text || (typeof payload === 'string' ? payload : String(payload))
                });
                setError(text || (typeof payload === 'string' ? payload : String(payload)));
            });

            // Listen for termination
            unlistenTerminated = await listen<string>('sidecar-terminated', (event) => {
                console.warn('[BioViz] Sidecar terminated:', event.payload);
                setIsConnected(false);
                setError(`Sidecar terminated: ${event.payload}`);

                // Fail any pending requests immediately
                for (const [requestId, pending] of pendingRequestsRef.current.entries()) {
                    clearTimeout(pending.timeoutId);
                    pending.reject(new Error(`Sidecar terminated while waiting for ${requestId}`));
                }
                pendingRequestsRef.current.clear();
            });

            // Check initial connection status
            try {
                const running = await invoke<boolean>('is_sidecar_running');
                setIsConnected(running);
            } catch (e) {
                console.error('[BioViz] Failed to check sidecar status:', e);
            }
        };

        setupListeners();

        // Cleanup on unmount
        return () => {
            unlistenOutput?.();
            unlistenError?.();
            unlistenTerminated?.();

            for (const [, pending] of pendingRequestsRef.current.entries()) {
                clearTimeout(pending.timeoutId);
                pending.reject(new Error('useBioEngine unmounted while waiting for response'));
            }
            pendingRequestsRef.current.clear();
        };
    }, []);

    const createRequestId = () => {
        try {
            // Available in modern browsers / Tauri WebView.
            if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
                // @ts-ignore
                return crypto.randomUUID();
            }
        } catch {
            // ignore
        }
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };

    /**
     * Send a command to the Python sidecar
     * @param cmd Command name
     * @param data Command payload
     * @param waitForResponse Whether to return a Promise that resolves with the response.
     *                        If true, it waits for the NEXT response. This involves a race condition
     *                        risk if multiple commands are in flight, but acceptable for this low-volume app.
     */
    const sendCommand = useCallback(async (cmd: string, data?: Record<string, unknown>, waitForResponse = false): Promise<SidecarResponse | void> => {
        setIsLoading(true);
        setError(null);

        const requestId = waitForResponse ? createRequestId() : undefined;

        try {
            let responsePromise: Promise<SidecarResponse> | null = null;

            if (waitForResponse && requestId) {
                const timeoutMs = (() => {
                    const upper = cmd.toUpperCase();
                    if (upper === 'ANALYZE') return 600_000;
                    if (upper === 'LOAD') return 600_000;
                    if (upper === 'DOWNLOAD_PATHWAY') return 120_000;
                    if (upper === 'SEARCH_PATHWAY') return 30_000;
                    if (upper === 'AI_INTERPRET_STUDIO') return 180_000; // 3 mins for synthesis
                    return 60_000;
                })();

                responsePromise = new Promise<SidecarResponse>((resolve, reject) => {
                    const startedAt = Date.now();
                    const timeoutId = setTimeout(() => {
                        pendingRequestsRef.current.delete(requestId);
                        const elapsed = Date.now() - startedAt;
                        reject(new Error(`Timeout waiting for sidecar response (cmd=${cmd}, request_id=${requestId}, ms=${elapsed})`));
                    }, timeoutMs);

                    pendingRequestsRef.current.set(requestId, {
                        resolve,
                        reject,
                        timeoutId,
                        cmd,
                    });
                });
            }

            const payload = JSON.stringify({
                cmd,
                payload: data || {},
                ...(requestId ? { request_id: requestId } : {}),
            });

            await invoke('send_command', { payload });

            if (waitForResponse && responsePromise) {
                const res = await responsePromise;
                return res;
            }
        } catch (e) {
            if (requestId) {
                const pending = pendingRequestsRef.current.get(requestId);
                if (pending) {
                    clearTimeout(pending.timeoutId);
                    pendingRequestsRef.current.delete(requestId);
                }
            }
            const errorMsg = e instanceof Error ? e.message : String(e);
            setError(errorMsg);
            console.error('[BioViz] Failed to send command:', e);
            throw e; // Re-throw for caller
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Check sidecar health via heartbeat
     */
    const checkHealth = useCallback(async (): Promise<boolean> => {
        try {
            await invoke('heartbeat');
            return true;
        } catch (e) {
            console.error('[BioViz] Heartbeat failed:', e);
            setIsConnected(false);
            return false;
        }
    }, []);

    /**
     * Restart the sidecar process
     */
    const restartSidecar = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            await invoke('restart_sidecar');
            setIsConnected(true);
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            setError(errorMsg);
            setIsConnected(false);
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Resolve (confirm or reject) an active AI proposal.
     * This is the ONLY way an AI_CONFIRM command can be sent.
     * 
     * @param proposalId The UUID of the proposal
     * @param accepted True to confirm and execute, False to reject
     */
    const resolveProposal = useCallback(async (proposalId: string, accepted: boolean): Promise<void> => {
        if (!activeProposal || activeProposal.proposal_id !== proposalId) {
            console.warn('[BioViz] resolveProposal called with mismatched proposal ID');
            setActiveProposal(null);
            return;
        }

        if (accepted) {
            // Send confirmation to backend - this is the ONLY way to execute Yellow Zone actions
            console.log('[BioViz] 🟢 User CONFIRMED proposal:', proposalId);
            try {
                await sendCommand('CHAT_CONFIRM', { proposal_id: proposalId }, true);
            } catch (e) {
                console.error('[BioViz] Failed to confirm proposal:', e);
                setError(`Failed to confirm proposal: ${e}`);
            }
        } else {
            // User rejected - send rejection to backend for logging
            console.log('[BioViz] 🔴 User REJECTED proposal:', proposalId);
            try {
                await sendCommand('CHAT_REJECT', { proposal_id: proposalId }, false);
            } catch (e) {
                console.error('[BioViz] Failed to reject proposal:', e);
            }
        }

        // Clear the active proposal
        setActiveProposal(null);
    }, [activeProposal, sendCommand]);

    /**
     * Structured AI helpers built on dedicated backend commands
     */
    const summarizeEnrichment = useCallback(async (enrichmentData: unknown, extras: Record<string, unknown> = {}): Promise<SidecarResponse | void> => {
        return sendCommand('SUMMARIZE_ENRICHMENT', { enrichment_data: enrichmentData, ...extras }, true);
    }, [sendCommand]);

    const summarizeDifferentialExpression = useCallback(async (volcanoData: unknown, thresholds: Record<string, unknown> = {}): Promise<SidecarResponse | void> => {
        return sendCommand('SUMMARIZE_DE', { volcano_data: volcanoData, thresholds }, true);
    }, [sendCommand]);

    const parseFilterQuery = useCallback(async (naturalLanguageQuery: string, availableFields?: unknown): Promise<SidecarResponse | void> => {
        return sendCommand('PARSE_FILTER', { query: naturalLanguageQuery, available_fields: availableFields }, true);
    }, [sendCommand]);

    const generateHypothesis = useCallback(async (significantGenes: unknown, pathways?: unknown, volcanoData?: unknown): Promise<SidecarResponse | void> => {
        return sendCommand('GENERATE_HYPOTHESIS', { significant_genes: significantGenes, pathways, volcano_data: volcanoData }, true);
    }, [sendCommand]);

    /**
     * Run Mechanistic Narrative Analysis (Phase 2)
     * Converts enrichment results into a paper-ready narrative report.
     */
    const runNarrativeAnalysis = useCallback(async (enrichmentResults?: unknown): Promise<SidecarResponse | void> => {
        return sendCommand('AGENT_TASK', {
            intent: 'analyze_narrative',
            params: { enrichment_results: enrichmentResults }
        }, true);
    }, [sendCommand]);

    /**
     * Run Single-Cell Contextual Analysis (Phase 3)
     * Computes pathway scores, spatial interactions, and trajectory dynamics.
     */
    const runSingleCellAnalysis = useCallback(async (
        filePath: string,
        options?: { clusterKey?: string; pathways?: Record<string, string[]> }
    ): Promise<SidecarResponse | void> => {
        return sendCommand('AGENT_TASK', {
            intent: 'sc_contextual',
            params: {
                file_path: filePath,
                cluster_key: options?.clusterKey || 'cell_type',
                pathways: options?.pathways
            }
        }, true);
    }, [sendCommand]);


    return {
        isConnected,
        isLoading,
        lastResponse,
        error,
        activeProposal,
        sendCommand,
        checkHealth,
        restartSidecar,
        resolveProposal,
        summarizeEnrichment,
        summarizeDifferentialExpression,
        parseFilterQuery,
        generateHypothesis,
        runNarrativeAnalysis,
        runSingleCellAnalysis,
    };

}

export default useBioEngine;
