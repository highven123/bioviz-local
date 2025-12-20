import { forwardRef, useImperativeHandle, useRef, useMemo, useEffect, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, writeFile } from '@tauri-apps/plugin-fs';
import PptxGenJS from 'pptxgenjs';
import './PathwayVisualizer.css';
import { useGeneAnnotations } from '../hooks/useGeneAnnotations';

// Helper for dynamic terminology
const getTerm = (type: string | undefined, key: string): string => {
    const t = type || 'gene';
    const terms: Record<string, Record<string, string>> = {
        gene: { entity: 'Gene', value: 'Expression', up: 'Upregulated', down: 'Downregulated' },
        protein: { entity: 'Protein', value: 'Abundance', up: 'Increased', down: 'Decreased' },
        cell: { entity: 'Cell Type', value: 'Frequency', up: 'Expanded', down: 'Depleted' }
    };
    return terms[t]?.[key] || terms.gene[key];
};

interface PathwayNode {
    id: string;
    name: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    color?: string;
    value?: number;
    expression?: number;
    hit_name?: string;
}

interface PathwayEdge {
    source: string;
    target: string;
    relation?: string;
}

// ... (previous interfaces)

interface PathwayVisualizerProps {
    nodes: PathwayNode[];
    edges: PathwayEdge[];
    title?: string;
    theme?: 'dark' | 'light';
    pathwayId?: string;
    dataType?: 'gene' | 'protein' | 'cell' | 'other';
    onNodeClick?: (geneName: string) => void;
    selectedNodeNames?: string[]; // New prop for highlighting
    isPro?: boolean; // New prop for monetization tier
    /** Base name of uploaded data file (without extension), used for export filenames */
    sourceFileBase?: string;
    enrichrResults?: any[];
    gseaResults?: { up: any[], down: any[] };
}

export interface PathwayVisualizerRef {
    resetView: () => void;
    exportPNG: () => Promise<void>;
    exportSVG: () => Promise<void>;
    exportPPTX: () => Promise<void>;
}

// Helper for expression color mapping (RdBu Divergent)
const getColorForExpression = (val: number | undefined, isDark: boolean): string => {
    if (val === undefined || val === null) return isDark ? '#475569' : '#cbd5e1'; // Slate gray for background nodes

    // Scale: -2 (Blue) -> 0 (White) -> +2 (Red)
    // Clamp value to [-2.5, 2.5] for better contrast
    const clamped = Math.max(-2.5, Math.min(2.5, val));

    // Define divergent color stops (Scientific RdBu)
    // Blue palette (Down): #2166ac, #4393c3, #92c5de, #d1e5f0
    // Red palette (Up): #fddbc7, #f4a582, #d6604d, #b2182b

    if (clamped > 0) {
        // Upregulated (Light Orange to Deep Red)
        if (clamped < 0.5) return '#fddbc7';
        if (clamped < 1.0) return '#f4a582';
        if (clamped < 2.0) return '#d6604d';
        return '#b2182b';
    } else if (clamped < 0) {
        // Downregulated (Light Blue to Deep Blue)
        if (clamped > -0.5) return '#d1e5f0';
        if (clamped > -1.0) return '#92c5de';
        if (clamped > -2.0) return '#4393c3';
        return '#2166ac';
    }

    return isDark ? '#334155' : '#f8fafc'; // Neutral
};

export const PathwayVisualizer = forwardRef<PathwayVisualizerRef, PathwayVisualizerProps>(({
    nodes,
    edges,
    title,
    theme = 'dark',
    pathwayId,
    dataType = 'gene',
    onNodeClick,
    selectedNodeNames = [],
    isPro = false,
    sourceFileBase,
    enrichrResults = [],
    gseaResults = { up: [], down: [] },
}, ref) => {
    const isDark = theme === 'dark';
    const textColor = isDark ? '#eee' : '#333';
    const bgColor = isDark ? '#1a1a24' : '#ffffff';
    const chartRef = useRef<ReactECharts>(null);

    const geneKeys = useMemo(() => {
        return Array.from(new Set(
            nodes
                .map(n => (n.hit_name || n.name || '').split(',')[0].trim())
                .filter(Boolean)
        ));
    }, [nodes]);

    const { annotations, touch } = useGeneAnnotations(geneKeys);

    const resolveGeneKey = useCallback((paramsData: any) => {
        const raw = (paramsData && (paramsData.hit_name || paramsData.id || paramsData.name)) || '';
        return raw.split(',')[0].trim();
    }, []);

    const wrapLines = useCallback((text: string, width = 100) => {
        if (!text) return '';
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let current = '';

        words.forEach((w) => {
            if ((current + ' ' + w).trim().length > width) {
                lines.push(current.trim());
                current = w;
            } else {
                current = current ? `${current} ${w}` : w;
            }
        });
        if (current) lines.push(current.trim());
        return lines.join('<br/>');
    }, []);

    useEffect(() => {
        const chart = chartRef.current?.getEchartsInstance();
        if (!chart) return;

        const handler = (params: any) => {
            if (params?.dataType === 'node') {
                const g = resolveGeneKey(params.data);
                if (g) {
                    touch(g);
                }
            }
        };

        chart.on('mouseover', handler);
        return () => {
            chart.off('mouseover', handler);
        };
    }, [resolveGeneKey, touch]);

    // Custom Click Handler
    const onChartClick = (params: any) => {
        if (params.dataType === 'node') {
            if (!onNodeClick) return;

            const primary = resolveGeneKey(params.data) || params.name;
            if (!primary) return;

            onNodeClick(primary);
            touch(primary);
        }
    };

    // PPTX Styling Constants
    const accentColor = '5DADE2';
    const bodyColor = 'EEEEEE';

    // Edge Color Mapping
    const RELATION_COLORS: Record<string, string> = {
        'activation': '#2ecc71',      // Green
        'inhibition': '#e74c3c',      // Red
        'phosphorylation': '#f39c12', // Orange
        'dephosphorylation': '#9b59b6', // Purple
        'expression': '#3498db',      // Blue
        'repression': '#e74c3c',      // Red
        'binding': '#95a5a6',         // Gray
        'indirect effect': '#95a5a6',
        'missing interaction': '#7f8c8d'
    };

    // Dynamic color palette for auto-assigned relations
    const PALETTE = ['#e17055', '#00cec9', '#6c5ce7', '#fdcb6e', '#d63031', '#0984e3', '#b2bec3'];

    // Helper to get color for a relation
    const getRelationColor = (relation: string, usedColors: Record<string, string>) => {
        const key = relation.toLowerCase().split(/[+/]/)[0].trim();
        // Check predefined
        for (const definedKey in RELATION_COLORS) {
            if (key.includes(definedKey)) return RELATION_COLORS[definedKey];
        }
        // Check if already assigned a dynamic color
        if (usedColors[key]) return usedColors[key];

        // Assign new color
        const nextColor = PALETTE[Object.keys(usedColors).length % PALETTE.length];
        usedColors[key] = nextColor;
        return nextColor;
    };

    // Helper to calculate luminance for contrast
    const getLuminance = (hexColor: string): number => {
        // Remove # if present
        const hex = hexColor.replace('#', '');

        // Convert to RGB
        const r = parseInt(hex.substr(0, 2), 16) / 255;
        const g = parseInt(hex.substr(2, 2), 16) / 255;
        const b = parseInt(hex.substr(4, 2), 16) / 255;

        // Apply gamma correction
        const rLinear = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
        const gLinear = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
        const bLinear = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

        // Calculate luminance
        return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
    };

    // Helper to get contrasting text color
    const getContrastColor = (bgColor: string): string => {
        try {
            const luminance = getLuminance(bgColor);
            // If background is light (luminance > 0.5), use dark text
            return luminance > 0.5 ? '#000000' : '#ffffff';
        } catch {
            // Fallback to white text if color parsing fails
            return '#ffffff';
        }
    };

    const option = useMemo(() => {
        // Create Map for quick node lookup
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const usedRelationsStringMap: Record<string, string> = {};

        // Format nodes for ECharts
        const graphNodes = nodes.map(node => {
            // Determine if this node is selected
            // Use hit_name first (exact match), then name (split by comma)
            let isSelected = false;
            if (selectedNodeNames.length > 0) {
                if (node.hit_name && selectedNodeNames.includes(node.hit_name)) {
                    isSelected = true;
                } else if (node.name) {
                    const parts = node.name.split(',').map(s => s.trim());
                    if (parts.some(p => selectedNodeNames.includes(p))) {
                        isSelected = true;
                    }
                }
            }

            // Base symbol size (expression-based)
            // UPDATED: Line width is now dynamic (base 1.5). Dots are exactly 2x line width (3px base).
            const baseLineWidth = 1.5;
            const dotDiameter = baseLineWidth * 2;

            const templateWidth = node.width || dotDiameter;
            const baseSize = templateWidth + (node.value ? Math.min(Math.abs(node.value) * (templateWidth / 10), templateWidth / 2) : 0);

            // Visual enhancement logic:
            // Selected nodes become larger, others keep original size and brightness
            const isDot = templateWidth < 10;
            const symbolSize = isSelected ? baseSize * 1.5 : baseSize;
            const opacity = 1.0;
            const borderColor = isDark ? '#fff' : '#333';
            const borderWidth = isDot ? 0 : 1; // Remove border for dots to keep exact size ratio

            // Dynamic color based on expression data
            // Prefer expression (Log2FC) if available, otherwise fallback to template color
            const nodeColor = getColorForExpression(node.expression || (node.value as any), isDark);

            return {
                id: node.id,
                name: node.name,
                x: node.x,
                y: node.y,
                fixed: true,
                hit_name: node.hit_name,
                symbolSize: symbolSize,
                itemStyle: {
                    color: nodeColor,
                    borderColor: borderColor,
                    borderWidth: borderWidth,
                    shadowBlur: isDot ? 0 : 5, // Remove shadow for tiny dots to avoid bloom
                    shadowColor: 'rgba(0, 0, 0, 0.3)',
                    opacity: opacity
                },
                label: {
                    show: isSelected, // Simplified: Only show label for selected nodes to avoid clutter
                    formatter: (params: any) => {
                        return params.name.replace(/hsa:?\d+/gi, '').replace(/kegg/gi, '').trim();
                    },
                    color: isDot ? (isDark ? '#bbb' : '#444') : getContrastColor(nodeColor),
                    fontSize: isSelected ? 11 : 10,
                    fontWeight: isSelected ? 'bold' : 'normal',
                    position: isDot ? 'top' : 'inside',
                    distance: isDot ? 5 : 0,
                    width: 45,
                    overflow: 'break',
                    lineHeight: 11,
                    opacity: opacity
                },
                value: node.expression,
                tooltip: {
                    formatter: (params: any) => {
                        const val = params.data?.value;
                        const valStr = val !== undefined && val !== null ? val.toFixed(3) : 'N/A';

                        const rawId = params.data?.id;
                        const idIsString = typeof rawId === 'string';
                        const showId = idIsString && !rawId.toLowerCase().startsWith('hsa');
                        const idLine = showId ? `ID: ${rawId}<br/>` : '';

                        const geneKey = resolveGeneKey(params.data);
                        const ann = geneKey ? annotations[geneKey] : undefined;
                        const wrappedSummary = ann?.summary ? wrapLines(ann.summary, 100) : '';
                        const annoSummary = wrappedSummary ? `<div style="margin-top:6px; line-height:1.4;">${wrappedSummary}</div>` : '';
                        const drugLine = ann?.drugs && ann.drugs.length > 0
                            ? `<div style="margin-top:4px;"><b>Drugs:</b> ${ann.drugs.slice(0, 3).join(', ')}${ann.drugs.length > 3 ? '...' : ''}</div>`
                            : '';
                        const diseaseLine = ann?.diseases && ann.diseases.length > 0
                            ? `<div style="margin-top:2px;"><b>Disease:</b> ${ann.diseases.slice(0, 3).join(', ')}${ann.diseases.length > 3 ? '...' : ''}</div>`
                            : '';

                        return `
            <div style="text-align: left;">
              <b>${params.name}</b><br/>
              Expression (LogFC): ${valStr}<br/>
              ${idLine}
              ${annoSummary}
              ${drugLine}
              ${diseaseLine}
            </div>
          `;
                    }
                }
            };
        });

        // Format edges with conditional coloring
        const graphLinks = edges.map(edge => {
            const sourceNode = nodeMap.get(edge.source);
            const targetNode = nodeMap.get(edge.target);

            const isRelevant = (sourceNode?.value !== undefined && sourceNode.value !== null) ||
                (targetNode?.value !== undefined && targetNode.value !== null);

            let color = '#555';
            if (isRelevant && edge.relation) {
                color = getRelationColor(edge.relation, usedRelationsStringMap);
            }

            const baseLineWidth = 1.5;
            const score = (edge as any).score || 0.4;
            const lineWidth = baseLineWidth * (score * 2);

            return {
                source: edge.source,
                target: edge.target,
                label: {
                    show: false, // Hide edge labels by default for a simpler look
                    formatter: edge.relation,
                    fontSize: 10,
                    color: isRelevant ? color : '#777',
                    opacity: 1
                },
                lineStyle: {
                    curveness: 0.2,
                    color: isRelevant ? color : '#444',
                    width: lineWidth,
                    opacity: isRelevant ? 0.8 : 0.3
                },
                symbol: ['none', 'arrow'],
                symbolSize: lineWidth * 3
            };
        });

        // Generate Edge Legend Graphics
        const legendItems = Object.keys(usedRelationsStringMap).sort();
        const legendGraphic: any[] = legendItems.map((rel, index) => {
            const color = usedRelationsStringMap[rel];
            return {
                type: 'group',
                bottom: 20 + (index * 20),
                right: 20,
                children: [
                    {
                        type: 'line',
                        left: 0,
                        top: 'middle',
                        shape: { x1: 0, y1: 0, x2: 25, y2: 0 },
                        style: { stroke: color, lineWidth: 2 }
                    },
                    {
                        type: 'text',
                        left: 30,
                        top: 'middle',
                        style: {
                            text: rel.charAt(0).toUpperCase() + rel.slice(1),
                            fill: textColor,
                            font: '12px sans-serif'
                        }
                    }
                ]
            };
        });

        // Add Edge Legend Title
        if (legendItems.length > 0) {
            legendGraphic.push({
                type: 'text',
                bottom: 20 + (legendItems.length * 20),
                right: 20,
                style: {
                    text: 'Interaction Types',
                    fill: textColor,
                    font: 'bold 12px sans-serif'
                }
            });
        }

        // Add Node Color Legend (Scientific RdBu) -- BOTTOM LEFT
        const colorScale = ['#4393C3', '#92c5de', '#f7f7f7', '#f4a582', '#d6604d']; // Blue to Red

        legendGraphic.push({
            type: 'group',
            left: 20,
            bottom: 20,
            children: [
                {
                    type: 'text',
                    left: 0,
                    top: -20,
                    style: {
                        text: 'Expression (LogFC)',
                        fill: textColor,
                        font: 'bold 12px sans-serif'
                    }
                },
                ...colorScale.map((color, i) => ({
                    type: 'rect',
                    left: i * 20,
                    top: 0,
                    shape: { width: 20, height: 10 },
                    style: { fill: color }
                })),
                {
                    type: 'text',
                    left: 0,
                    top: 15,
                    style: { text: '-2', fill: textColor, font: '10px sans-serif' }
                },
                {
                    type: 'text',
                    left: 45,
                    top: 15,
                    style: { text: '0', fill: textColor, font: '10px sans-serif' }
                },
                {
                    type: 'text',
                    left: 90,
                    top: 15,
                    style: { text: '+2', fill: textColor, font: '10px sans-serif' }
                }
            ]
        });

        // Add Stats Overlay (Top-Left)
        // Recalculate stats for the current view
        const totalNodes = nodes.length;
        const upRegulated = nodes.filter(n => n.expression !== undefined && n.expression !== null && n.expression > 0).length;
        const downRegulated = nodes.filter(n => n.expression !== undefined && n.expression !== null && n.expression < 0).length;
        const entityLabel = getTerm(dataType, 'entity');
        // Pluralize simply (can be improved if needed)
        const entityPlural = entityLabel.endsWith('y') ? entityLabel.slice(0, -1) + 'ies' : entityLabel + 's';

        legendGraphic.push({
            type: 'group',
            left: 20,
            top: 60, // Move down to avoid overlapping with title/header area if needed, as requested "put it down a bit"
            children: [
                {
                    type: 'text',
                    left: 0,
                    top: 0,
                    style: {
                        text: `${totalNodes} ${entityPlural.toLowerCase()}`,
                        fill: textColor,
                        font: 'bold 14px sans-serif'
                    }
                },
                {
                    type: 'text',
                    left: 0,
                    top: 20,
                    style: {
                        text: `${upRegulated} up`,
                        fill: '#ef4444', // Red
                        font: 'bold 14px sans-serif'
                    }
                },
                {
                    type: 'text',
                    left: 0,
                    top: 40,
                    style: {
                        text: `${downRegulated} down`,
                        fill: '#3b82f6', // Blue
                        font: 'bold 14px sans-serif'
                    }
                }
            ]
        });

        return {
            backgroundColor: 'transparent',
            title: {
                // Remove KEGG ID style patterns (e.g. hsa04110) from title if present
                text: (title || 'Pathway Visualization').replace(/hsa:?\d+/gi, '').replace(/kegg/gi, '').trim(),
                left: 'center',
                textStyle: {
                    color: textColor,
                    fontSize: 16
                }
            },
            tooltip: {
                trigger: 'item',
                backgroundColor: isDark ? 'rgba(50, 50, 50, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                borderColor: isDark ? '#333' : '#ddd',
                textStyle: {
                    color: textColor
                },
                position: (point: number[], _params: any, dom: HTMLElement, rect: any) => {
                    // Anchor tooltip below the bubble center
                    if (rect) {
                        const x = rect.x + rect.width / 2 - (dom?.clientWidth || 0) / 2;
                        const y = rect.y + rect.height + 10;
                        return [x, y];
                    }
                    return point;
                }
            },
            graphic: legendGraphic,
            series: [
                {
                    type: 'graph',
                    layout: 'none', // Use x/y provided in data
                    data: graphNodes.map(n => ({ ...n, fixed: true })), // Ensure everything is fixed
                    links: graphLinks,
                    roam: true,
                    scaleLimit: { min: 0.01, max: 100 },
                    draggable: false,
                    animation: false, // Disable all animations to prevent "flying" effect
                    lineStyle: {
                        opacity: 0.9,
                        width: 1,
                        curveness: 0.1
                    }
                }
            ]
        } as EChartsOption;
    }, [nodes, edges, title, isDark, textColor, selectedNodeNames, annotations, resolveGeneKey]);

    const handleResetView = () => {
        const chart = chartRef.current?.getEchartsInstance();
        if (chart) {
            chart.dispatchAction({
                type: 'restore'
            });
        }
    };

    const handleExportPNG = async () => {
        const chart = chartRef.current?.getEchartsInstance();
        if (!chart) return;

        try {
            const imgUrl = chart.getDataURL({
                type: 'png',
                pixelRatio: 2,
                backgroundColor: '#000000',
                excludeComponents: ['toolbox']
            });

            // Convert Base64 directly to Uint8Array for binary write
            const blob = await fetch(imgUrl).then(res => res.blob());
            const buffer = await blob.arrayBuffer();
            const bytes = new Uint8Array(buffer);

            const base = (sourceFileBase && sourceFileBase.trim()) || 'analysis';
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
            const suggestedName = `png_${base}_${timestamp}.png`;

            const filePath = await save({
                defaultPath: suggestedName,
                filters: [{
                    name: 'PNG Image',
                    extensions: ['png']
                }]
            });

            if (filePath) {
                await writeFile(filePath, bytes);
                alert('PNG exported successfully!');
            }
        } catch (err) {
            console.error('Export PNG failed:', err);
            alert(`Export PNG failed: ${err}`);
        }
    };

    const handleExportSVG = async () => {
        if (!isPro) {
            alert("SVG (Vector) Export is a Pro feature.\n\nPlease upgrade to BioViz Pro to unlock vector graphics, editable reports, and data saving.");
            return;
        }

        const chart = chartRef.current?.getEchartsInstance();
        if (!chart) return;

        try {
            // Use clean dark background for SVG export, and remove toolbar
            const svgUrl = chart.getDataURL({
                type: 'svg',
                pixelRatio: 2,
                backgroundColor: '#000000',
                excludeComponents: ['toolbox']
            });

            let svgContent: string;
            const dataIndex = svgUrl.indexOf(',') + 1;
            const data = svgUrl.slice(dataIndex);

            if (svgUrl.startsWith('data:image/svg+xml;base64,')) {
                svgContent = atob(data);
            } else if (svgUrl.startsWith('data:image/svg+xml;charset=utf-8,')) {
                svgContent = decodeURIComponent(data);
            } else {
                // Fallback or error handling for unexpected format
                // If it doesn't look like a standard data URL, try to use it as is if it looks like SVG
                // But mostly it will be a data URL.
                console.warn('Unexpected SVG data URL format:', svgUrl.substring(0, 50) + '...');
                svgContent = decodeURIComponent(data); // Try decoding anyway
            }

            // Append watermark to SVG
            let finalSvg = svgContent;

            // 1. Professional Footer (Always present, subtle)
            const footerWatermark = '<text x="98%" y="98%" text-anchor="end" fill="#94a3b8" font-family="sans-serif" font-size="12">Generated by BioViz Local</text>';

            // 2. Tiled Watermark (Free Tier Only)
            let patternDef = '';
            let patternRect = '';

            if (!isPro) {
                // Diagonal "BioViz Free" pattern
                const patternId = "watermark-pattern";
                patternDef = `
                <defs>
                    <pattern id="${patternId}" width="200" height="200" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <text x="100" y="100" text-anchor="middle" fill="rgba(150, 150, 150, 0.15)" font-size="24" font-family="sans-serif" font-weight="bold">BioViz Free</text>
                    </pattern>
                </defs>`;
                // A rect covering the whole SVG causing the pattern to repeat
                // Ensure it's on top by placing it just before end of svg
                patternRect = `<rect width="100%" height="100%" fill="url(#${patternId})" pointer-events="none"/>`;
            }

            if (svgContent.includes('</svg>')) {
                // Insert defs after <svg> start tag usually, but ECharts svg output might be complex. 
                // Safest is to prepend defs to the first content or just put it before closing if valid SVG.
                // Actually, defs should be at the top usually, but can be anywhere.
                // Let's replace closing tag with our additions.
                finalSvg = svgContent.replace('</svg>', `${patternDef}${patternRect}${footerWatermark}</svg>`);
            }

            const base = (sourceFileBase && sourceFileBase.trim()) || 'analysis';
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
            const suggestedName = `svg_${base}_${timestamp}.svg`;

            const filePath = await save({
                defaultPath: suggestedName,
                filters: [{
                    name: 'SVG Image',
                    extensions: ['svg']
                }]
            });

            if (filePath) {
                await writeTextFile(filePath, finalSvg);
                alert('SVG exported successfully!');
            }
        } catch (err) {
            console.error('Export failed:', err);
            alert(`Export failed: ${err}`);
        }
    };

    const handleExportPPTX = async () => {
        const chart = chartRef.current?.getEchartsInstance();
        if (!chart) return;

        try {
            // Manual SVG to PNG conversion for reliable rasterization
            // ECharts with renderer='svg' may typically export SVG data even when requesting PNG, or fail to render via getDataURL directly in some contexts.

            // 1. Get SVG Data URL
            const svgDataUrl = chart.getDataURL({
                type: 'svg',
                backgroundColor: '#000000',
                excludeComponents: ['toolbox']
            });

            // 2. Convert to PNG via Canvas
            const convertSvgToPng = (url: string, width: number, height: number): Promise<string> => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'Anonymous';
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        // Use 2x resolution for good quality without excessive memory usage
                        const scale = 2;
                        canvas.width = width * scale;
                        canvas.height = height * scale;

                        const ctx = canvas.getContext('2d');
                        if (!ctx) {
                            reject(new Error("Failed to get canvas context"));
                            return;
                        }

                        // Fill background explicitly
                        ctx.fillStyle = '#000000';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);

                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                        resolve(canvas.toDataURL('image/png'));
                    };
                    img.onerror = () => reject(new Error("Failed to load SVG for conversion"));
                    img.src = url;
                });
            };

            let imgUrl = '';
            try {
                imgUrl = await convertSvgToPng(svgDataUrl, chart.getWidth(), chart.getHeight());
            } catch (e) {
                console.warn("SVG to PNG conversion failed, falling back to direct capture", e);
                // Fallback (might be black/empty but worth a shot)
                imgUrl = chart.getDataURL({
                    type: 'png',
                    pixelRatio: 2,
                    backgroundColor: '#000000',
                    excludeComponents: ['toolbox']
                });
            }

            // Calculate statistics for the report
            const totalNodes = nodes.length;
            const upRegulated = nodes.filter(n => n.expression !== undefined && n.expression !== null && n.expression > 0).length;
            const downRegulated = nodes.filter(n => n.expression !== undefined && n.expression !== null && n.expression < 0).length;

            const pptx = new PptxGenJS();
            pptx.layout = 'LAYOUT_16x9';

            // Define Dark Theme Master
            pptx.defineSlideMaster({
                title: 'DARK_THEME',
                background: { color: '000000' },
                objects: [
                    { rect: { x: 0, y: 0, w: '100%', h: 0.1, fill: { color: 'E74C3C' } } } // Red accent line at top
                ],
                slideNumber: { x: '95%', y: '95%', color: '888888', fontSize: 10 }
            });

            // Common Text Styles
            const titleStyle = { x: 0.5, y: 0.5, w: 9, fontSize: 28, bold: true, color: 'FFFFFF', align: 'center' as const };
            const subTitleStyle = { x: 0.5, y: 3.5, w: 9, fontSize: 16, color: 'AAAAAA', align: 'center' as const };
            const sectionTitleStyle = { x: 0.5, y: 0.4, w: 9, fontSize: 24, bold: true, color: 'FFFFFF' };

            // Unified contact info (subtle "watermark"), placed at bottom-right of each page
            const contactText = 'BioViz Local • bioviz@bioviz.com';
            const contactOptions = {
                // Bottom-right, leaving space for page number
                x: 6.5,
                y: 5.1,
                w: 3.0,
                fontSize: 10,
                color: '666666',
                align: 'right' as const
            };

            // --- SLIDE 1: Title Slide ---
            const titleSlide = pptx.addSlide({ masterName: 'DARK_THEME' }); // Renamed slide1 to titleSlide for clarity
            titleSlide.addText('BioViz Local', { ...titleStyle, y: 2.5, fontSize: 36, color: '5DADE2' });
            titleSlide.addText('KEGG Pathway Analysis Report', { ...titleStyle, y: 3.2, fontSize: 24 });
            titleSlide.addText('Pathway ID: ' + (pathwayId || 'Unknown'), { x: 0.5, y: 3.9, w: 9, fontSize: 18, color: accentColor, align: 'center' }); // Adjusted y
            titleSlide.addText('Generated: ' + new Date().toLocaleString(), { ...subTitleStyle, y: 4.5 }); // Adjusted y
            titleSlide.addText('Generated by BioViz Local', { x: 0.5, y: 5.0, w: 9, fontSize: 14, color: '#666666', align: 'center' });
            // Watermark for Title Slide (if Free)
            if (!isPro) {
                titleSlide.addText('TRIAL VERSION - BioViz Free', {
                    x: 0, y: 0, w: '100%', h: '100%',
                    fontSize: 60, color: 'ffffff', transparency: 90,
                    rotate: 45, align: 'center', valign: 'middle'
                });
            }
            // Top-right contact info on each page
            titleSlide.addText(contactText, contactOptions);


            // --- SLIDE 2: Methodology (New "Research" Requirement) ---
            const methodSlide = pptx.addSlide({ masterName: 'DARK_THEME' });
            methodSlide.addText('Methodology', sectionTitleStyle);
            methodSlide.addText([
                { text: 'Gene expression data was mapped to KEGG Pathway ', options: { fontSize: 18, color: bodyColor } },
                { text: '[' + (pathwayId || 'hsa00000') + ']', options: { fontSize: 18, color: accentColor, bold: true } },
                { text: '. Color coding represents Log2 Fold Change (Red=Up, Blue=Down). Data processing and visualization were performed by ', options: { fontSize: 18, color: bodyColor } },
                { text: 'BioViz Local v0.1', options: { fontSize: 18, color: accentColor, bold: true } },
                { text: '.', options: { fontSize: 18, color: bodyColor } }
            ], { x: 1.0, y: 1.5, w: 8.0, h: 3.0, lineSpacing: 30 });
            methodSlide.addText(contactText, contactOptions);

            // --- SLIDE 3: Pathway Visualization ---
            const slide2 = pptx.addSlide({ masterName: 'DARK_THEME' });
            slide2.addText(title || 'Pathway Map', sectionTitleStyle);
            if (imgUrl && imgUrl.length > 100) {
                slide2.addImage({
                    data: imgUrl,
                    // Use approximately square area for pathway image, more compact visually
                    x: 2.75,          // (10 - 4.5) / 2 centered
                    y: 1.0,
                    w: 4.5,
                    h: 4.5,
                    sizing: { type: 'contain', w: 4.5, h: 4.5 }
                });

                if (isPro) {
                    // Start of professional/vector feature (placeholder for now)
                    // e.g. slide2.addText('Editable Vector Mode', { ... }); 
                }
            } else {
                slide2.addText("Image capture failed. Please ensure the chart is fully visible.", { x: 0.5, y: 2.0, color: 'FF0000', align: 'center' });
            }
            slide2.addText(contactText, contactOptions);

            // --- SLIDE 4: Summary Statistics ---
            const slide3 = pptx.addSlide({ masterName: 'DARK_THEME' });
            slide3.addText('Summary Statistics', sectionTitleStyle);

            slide3.addTable([
                [
                    { text: 'Metric', options: { fill: { color: accentColor }, color: 'FFFFFF', bold: true } },
                    { text: 'Count', options: { fill: { color: accentColor }, color: 'FFFFFF', bold: true } },
                    { text: 'Percentage', options: { fill: { color: accentColor }, color: 'FFFFFF', bold: true } }
                ],
                [
                    { text: 'Total Nodes', options: { fill: { color: '2d2d3a' }, color: bodyColor } },
                    { text: totalNodes.toString(), options: { fill: { color: '2d2d3a' }, color: bodyColor } },
                    { text: '100%', options: { fill: { color: '2d2d3a' }, color: bodyColor } }
                ],
                [
                    { text: getTerm(dataType, 'up'), options: { fill: { color: '2d2d3a' }, color: '#ff6b6b' } },
                    { text: upRegulated.toString(), options: { fill: { color: '2d2d3a' }, color: '#ff6b6b' } },
                    { text: ((upRegulated / totalNodes) * 100).toFixed(1) + '%', options: { fill: { color: '2d2d3a' }, color: '#ff6b6b' } }
                ],
                [
                    { text: getTerm(dataType, 'down'), options: { fill: { color: '2d2d3a' }, color: '#4ecdc4' } },
                    { text: downRegulated.toString(), options: { fill: { color: '2d2d3a' }, color: '#4ecdc4' } },
                    { text: ((downRegulated / totalNodes) * 100).toFixed(1) + '%', options: { fill: { color: '2d2d3a' }, color: '#4ecdc4' } }
                ]
            ], { x: 1.5, y: 1.5, w: 7.0 });
            slide3.addText(contactText, contactOptions);

            // --- SLIDE 5: Key Findings ---
            const slide4 = pptx.addSlide({ masterName: 'DARK_THEME' });
            slide4.addText('Key Findings', sectionTitleStyle);
            const findings = [
                upRegulated + ' ' + getTerm(dataType, 'entity').toLowerCase() + 's are ' + getTerm(dataType, 'up').toLowerCase() + '.',
                downRegulated + ' ' + getTerm(dataType, 'entity').toLowerCase() + 's are ' + getTerm(dataType, 'down').toLowerCase() + '.',
                (totalNodes - upRegulated - downRegulated) + ' items show no significant change or were not detected.',
                'Pathway Coverage: ' + (100 * nodes.filter(n => n.expression !== undefined && n.expression !== null).length / nodes.length).toFixed(1) + '% of total pathway nodes.'
            ];
            slide4.addText(findings.join('\n\n'), { x: 1.0, y: 1.5, w: 8.0, h: 3.5, fontSize: 16, color: bodyColor, bullet: true, lineSpacing: 40 });
            slide4.addText(contactText, contactOptions);

            // --- SLIDE 6: Gene Expression Details (Zebra Striped) ---
            const slide5 = pptx.addSlide({ masterName: 'DARK_THEME' });
            slide5.addText(getTerm(dataType, 'value') + ' Details', sectionTitleStyle);

            // Only show Top 20, to keep table neat and prevent overflow on one page
            const sortedNodes = [...nodes]
                .filter(n => n.expression !== undefined && n.expression !== null)
                .sort((a, b) => Math.abs(b.expression || 0) - Math.abs(a.expression || 0))
                .slice(0, 20);

            if (sortedNodes.length > 0) {
                const tableData = [
                    [
                        { text: getTerm(dataType, 'entity'), options: { fill: { color: accentColor }, color: 'FFFFFF', bold: true } },
                        { text: getTerm(dataType, 'value'), options: { fill: { color: accentColor }, color: 'FFFFFF', bold: true } },
                        { text: 'Status', options: { fill: { color: accentColor }, color: 'FFFFFF', bold: true } }
                    ],
                    ...sortedNodes.map((n, i) => {
                        const rowBg = i % 2 === 0 ? '2d2d3a' : '1a1a24';
                        const val = n.expression || 0;
                        return [
                            { text: n.name, options: { fill: { color: rowBg }, color: bodyColor } },
                            { text: val.toFixed(2), options: { fill: { color: rowBg }, color: val > 0 ? '#ff6b6b' : '#4ecdc4' } },
                            { text: val > 0 ? 'High' : 'Low', options: { fill: { color: rowBg }, color: val > 0 ? '#ff6b6b' : '#4ecdc4' } }
                        ];
                    })
                ];

                slide5.addTable(tableData, {
                    x: 0.75,
                    y: 1.3,
                    w: 8.5,
                    fontSize: 11
                });
            } else {
                slide5.addText("No mapping data available.", { x: 3, y: 3, color: 'FFFFFF' });
            }
            slide5.addText(contactText, contactOptions);

            // --- SLIDE 7: Enrichment Analysis (ORA) (Optional) ---
            if (enrichrResults && enrichrResults.length > 0) {
                const oraSlide = pptx.addSlide({ masterName: 'DARK_THEME' });
                oraSlide.addText('Enrichment Analysis (ORA)', sectionTitleStyle);

                const oraTableData = [
                    [
                        { text: 'Term', options: { fill: { color: accentColor }, color: 'FFFFFF', bold: true } },
                        { text: 'Adj. P-value', options: { fill: { color: accentColor }, color: 'FFFFFF', bold: true } },
                        { text: 'Overlap', options: { fill: { color: accentColor }, color: 'FFFFFF', bold: true } }
                    ],
                    ...enrichrResults.slice(0, 15).map((res, i) => {
                        const rowBg = i % 2 === 0 ? '2d2d3a' : '1a1a24';
                        return [
                            { text: res.term, options: { fill: { color: rowBg }, color: bodyColor } },
                            { text: res.adjusted_p_value.toExponential(2), options: { fill: { color: rowBg }, color: '6366F1' } },
                            { text: res.overlap, options: { fill: { color: rowBg }, color: bodyColor } }
                        ];
                    })
                ];

                oraSlide.addTable(oraTableData, {
                    x: 0.75, y: 1.3, w: 8.5, fontSize: 10
                });
                oraSlide.addText(contactText, contactOptions);
            }

            // --- SLIDE 8: GSEA Results (Optional) ---
            if (gseaResults && (gseaResults.up.length > 0 || gseaResults.down.length > 0)) {
                const gseaSlide = pptx.addSlide({ masterName: 'DARK_THEME' });
                gseaSlide.addText('GSEA Results (Top 15)', sectionTitleStyle);

                const allGsea = [
                    ...gseaResults.up.slice(0, 8).map(r => ({ ...r, status: 'UP' })),
                    ...gseaResults.down.slice(0, 8).map(r => ({ ...r, status: 'DOWN' }))
                ].sort((a, b) => Math.abs(b.nes) - Math.abs(a.nes)).slice(0, 15);

                const gseaTableData = [
                    [
                        { text: 'Term', options: { fill: { color: accentColor }, color: 'FFFFFF', bold: true } },
                        { text: 'NES', options: { fill: { color: accentColor }, color: 'FFFFFF', bold: true } },
                        { text: 'FDR', options: { fill: { color: accentColor }, color: 'FFFFFF', bold: true } }
                    ],
                    ...allGsea.map((res, i) => {
                        const rowBg = i % 2 === 0 ? '2d2d3a' : '1a1a24';
                        const color = res.status === 'UP' ? '#ff6b6b' : '#3b82f6';
                        return [
                            { text: res.term, options: { fill: { color: rowBg }, color: bodyColor } },
                            { text: res.nes.toFixed(2), options: { fill: { color: rowBg }, color: color, bold: true } },
                            { text: res.fdr.toExponential(2), options: { fill: { color: rowBg }, color: color } }
                        ];
                    })
                ];

                gseaSlide.addTable(gseaTableData, {
                    x: 0.75, y: 1.3, w: 8.5, fontSize: 10
                });
                gseaSlide.addText(contactText, contactOptions);
            }

            // --- LAST SLIDE: References ---
            const refSlide = pptx.addSlide({ masterName: 'DARK_THEME' });
            refSlide.addText('References & Acknowledgements', sectionTitleStyle);

            refSlide.addText([
                { text: '1. BioViz Local: An advanced, secure, and beautiful pathway visualization tool.', options: { fontSize: 14, color: bodyColor, breakLine: true } },
                { text: '\n\nWeChat:', options: { fontSize: 14, color: accentColor, bold: true, breakLine: true } },
                { text: 'bioviz', options: { fontSize: 14, color: '#4ecdc4' } }
            ], { x: 1.0, y: 1.5, w: 8.0, h: 4.0, lineSpacing: 25 });
            refSlide.addText(contactText, contactOptions);
            // Save
            const base = (sourceFileBase && sourceFileBase.trim()) || 'analysis';
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
            const suggestedName = `report_${base}_${timestamp}.pptx`;

            const pptxData = await pptx.write({ outputType: 'base64' }) as string;
            const binaryString = atob(pptxData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const filePath = await save({
                defaultPath: suggestedName,
                filters: [{ name: 'PowerPoint Presentation', extensions: ['pptx'] }]
            });

            if (filePath) {
                await writeFile(filePath, bytes);
                alert('Detailed PPTX Report exported successfully!');
            }

        } catch (err) {
            console.error('PPTX Export failed:', err);
            alert('PPTX Export failed: ' + err);
        }
    };

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
        resetView: handleResetView,
        exportPNG: handleExportPNG,
        exportSVG: handleExportSVG,
        exportPPTX: handleExportPPTX
    }));

    return (
        <div className="pathway-visualizer" style={{
            height: '600px',
            width: '100%',
            background: bgColor,
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid var(--color-border)',
            position: 'relative'
        }}>
            {/* Toolbar Removed - Moved to Parent Header */}

            <ReactECharts
                ref={chartRef}
                option={option}
                style={{ height: '100%', width: '100%' }}
                onEvents={{ 'click': onChartClick }}
                opts={{ renderer: 'svg' }} // Use SVG for vector export support
            />
        </div>
    );
});

PathwayVisualizer.displayName = 'PathwayVisualizer';
