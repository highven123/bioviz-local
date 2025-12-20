import { useCallback, useEffect, useRef, useState } from 'react';

export interface GeneAnnotation {
    name?: string;
    summary?: string;
    drugs?: string[];
    diseases?: string[];
    fetchedAt: number;
}

type AnnotationMap = Record<string, GeneAnnotation>;

const STORAGE_KEY = 'bioviz_gene_annotations_v1';
const STALE_AFTER_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

const loadCache = (): AnnotationMap => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            return parsed as AnnotationMap;
        }
    } catch (e) {
        console.warn('[GeneAnnotations] Failed to load cache:', e);
    }
    return {};
};

const persistCache = (cache: AnnotationMap) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.warn('[GeneAnnotations] Failed to persist cache:', e);
    }
};

/**
 * Lightweight gene annotation fetcher with localStorage caching.
 * Uses mygene.info to retrieve name/summary and drug/disease hints.
 */
export function useGeneAnnotations(geneNames: string[], prefetchLimit = 24) {
    const [annotations, setAnnotations] = useState<AnnotationMap>(() => loadCache());
    const fetchingRef = useRef<Set<string>>(new Set());

    const isStale = (gene: string) => {
        const cached = annotations[gene];
        if (!cached) return true;
        return Date.now() - cached.fetchedAt > STALE_AFTER_MS;
    };

    const fetchAnnotation = useCallback(async (gene: string) => {
        if (!gene || fetchingRef.current.has(gene) || (!isStale(gene) && annotations[gene])) {
            return;
        }

        fetchingRef.current.add(gene);
        try {
            const url = `https://mygene.info/v3/query?q=symbol:${encodeURIComponent(gene)}&species=human&size=1&fields=name,summary,pharmgkb.name,drugbank.name,disease.name`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(resp.statusText);
            const data = await resp.json();
            const hit = Array.isArray(data?.hits) ? data.hits[0] : null;

            if (!hit) {
                return;
            }

            const drugs: string[] = [];
            const diseases: string[] = [];

            const pgkb = hit.pharmgkb;
            if (pgkb) {
                if (Array.isArray(pgkb)) {
                    pgkb.forEach((p: any) => {
                        if (p?.name) drugs.push(p.name);
                    });
                } else if (pgkb.name) {
                    drugs.push(pgkb.name);
                }
            }

            const dbank = hit.drugbank;
            if (dbank) {
                if (Array.isArray(dbank)) {
                    dbank.forEach((d: any) => {
                        if (d?.name) drugs.push(d.name);
                    });
                } else if (dbank.name) {
                    drugs.push(dbank.name);
                }
            }

            const dis = hit.disease;
            if (dis) {
                if (Array.isArray(dis)) {
                    dis.forEach((d: any) => {
                        if (d?.name) diseases.push(d.name);
                    });
                } else if (dis.name) {
                    diseases.push(dis.name);
                }
            }

            const next: AnnotationMap = {
                ...annotations,
                [gene]: {
                    name: hit.name,
                    summary: hit.summary,
                    drugs: Array.from(new Set(drugs)).slice(0, 6),
                    diseases: Array.from(new Set(diseases)).slice(0, 6),
                    fetchedAt: Date.now()
                }
            };

            setAnnotations(next);
            persistCache(next);
        } catch (err) {
            console.warn('[GeneAnnotations] fetch failed:', err);
        } finally {
            fetchingRef.current.delete(gene);
        }
    }, [annotations]);

    // Prefetch a small subset of genes to keep tooltip responsive.
    useEffect(() => {
        const uniqueGenes = Array.from(new Set(geneNames)).filter(Boolean).slice(0, prefetchLimit);
        uniqueGenes.forEach(g => {
            void fetchAnnotation(g);
        });
    }, [geneNames, prefetchLimit, fetchAnnotation]);

    const touch = useCallback((gene: string) => {
        void fetchAnnotation(gene);
    }, [fetchAnnotation]);

    return { annotations, touch };
}
