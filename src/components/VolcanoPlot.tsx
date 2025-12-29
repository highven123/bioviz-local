import React, { useRef, useState } from 'react';
import type { EChartsOption } from 'echarts';
import * as echarts from 'echarts/core';
import {
    ScatterChart,
    BarChart
} from 'echarts/charts';
import {
    TitleComponent,
    TooltipComponent,
    GridComponent,
    BrushComponent,
    ToolboxComponent,
    MarkLineComponent,
    DatasetComponent,
    TransformComponent
} from 'echarts/components';
import { LabelLayout, UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import { useI18n } from '../i18n';

// Register components to ensure Brush/Toolbox work correctly
echarts.use([
    TitleComponent,
    TooltipComponent,
    GridComponent,
    BrushComponent, // Critical for box selection
    ToolboxComponent, // Critical for the button
    MarkLineComponent,
    DatasetComponent,
    TransformComponent,
    ScatterChart,
    BarChart,
    LabelLayout,
    UniversalTransition,
    CanvasRenderer
]);

export interface VolcanoPoint {
    gene: string;
    x: number;        // LogFC
    y: number;        // -log10(pvalue)
    status: 'UP' | 'DOWN' | 'NS';
    pvalue: number;
    mean?: number;    // Optional mean expression for MA view
}

export type VolcanoViewMode = 'volcano' | 'ma' | 'ranked';

interface VolcanoPlotProps {
    data: VolcanoPoint[];
    viewMode: VolcanoViewMode;
    onSelectionChange: (genes: string[]) => void;
    onPointClick: (gene: string) => void;
    height?: string | number;
}

export const VolcanoPlot: React.FC<VolcanoPlotProps> = ({
    data,
    viewMode,
    onSelectionChange,
    onPointClick,
    height = '100%'
}) => {
    const { t } = useI18n();
    const chartRef = useRef<HTMLDivElement>(null);
    const chartInstance = useRef<echarts.ECharts | null>(null);
    const [fcThreshold, setFcThreshold] = useState(1);
    const [pThreshold, setPThreshold] = useState(0.05);
    const linkFor = (gene: string) => {
        const safe = encodeURIComponent(gene);
        return {
            uniprot: `https://www.uniprot.org/uniprotkb?query=${safe}`,
            ncbi: `https://www.ncbi.nlm.nih.gov/gene/?term=${safe}`
        };
    };
    const renderTooltip = (title: string, lines: string[]) => {
        const links = linkFor(title);
        return `
          <div style="min-width:220px;">
            <div style="font-weight:700;margin-bottom:6px;">${title}</div>
            ${lines.map(l => `<div style="margin:2px 0;">${l}</div>`).join('')}
            <div style="margin-top:8px;display:flex;gap:8px;">
              <a href="${links.uniprot}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:none;">UniProt</a>
              <a href="${links.ncbi}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:none;">NCBI</a>
            </div>
          </div>
        `;
    };

    // Detect if valid P-values exist
    const hasPValues = React.useMemo(() => {
        return data.some(d => d.y > 0.01);
    }, [data]);

    const getDerivedStatus = React.useCallback((point: VolcanoPoint) => {
        const meetsFc = Math.abs(point.x) >= fcThreshold;
        if (!hasPValues) {
            if (!meetsFc) return 'NS';
            return point.x >= 0 ? 'UP' : 'DOWN';
        }
        const pOk = point.pvalue !== undefined && point.pvalue > 0 && point.pvalue <= pThreshold;
        if (!meetsFc || !pOk) return 'NS';
        return point.x >= 0 ? 'UP' : 'DOWN';
    }, [fcThreshold, hasPValues, pThreshold]);

    // Initialize Chart
    React.useEffect(() => {
        if (!chartRef.current) return;

        // Init
        if (!chartInstance.current) {
            chartInstance.current = echarts.init(chartRef.current, 'dark');

            // --- Event Bindings ---
            chartInstance.current.on('brushSelected', (params: any) => {
                if (!params || !params.batch || params.batch.length === 0) {
                    onSelectionChange([]);
                    return;
                }
                const indices: number[] = [];
                params.batch.forEach((batchItem: any) => {
                    (batchItem?.selected || []).forEach((sel: any) => {
                        const di = sel?.dataIndex;
                        if (Array.isArray(di)) indices.push(...di);
                        else if (typeof di === 'number') indices.push(di);
                    });
                });
                const uniqueIdx = Array.from(new Set(indices));
                if (uniqueIdx.length === 0) {
                    onSelectionChange([]);
                    return;
                }

                // Need latest data ref? The closure might stare stale data if we aren't careful.
                // But full re-init on data change prevents that.
                // For now, assume re-render updates the instance.
                // To be safe, we can look up from the chart option or just trust the prop if we re-bind.
                // Actually, brushSelected params don't give data, just indices.
                // We will rely on the fact that we re-create the chart/option on data change.
            });

            chartInstance.current.on('click', (params: any) => {
                if (params.componentType === 'series') {
                    // scatter: data[2] is gene; bar: name is gene
                    // We need to know current mode.
                    const isScatter = params.seriesType === 'scatter';
                    const gene = isScatter ? params.data[2] : params.name;
                    if (gene) onPointClick(gene);
                }
            });
        }

        // Resize handler
        const resizeObserver = new ResizeObserver(() => {
            chartInstance.current?.resize();
        });
        resizeObserver.observe(chartRef.current);

        return () => {
            resizeObserver.disconnect();
            chartInstance.current?.dispose();
            chartInstance.current = null;
        };
    }, []); // Run once on mount to setup

    // Update Option Effect
    React.useEffect(() => {
        if (!chartInstance.current) return;

        const option = getOption();
        chartInstance.current.setOption(option, true); // true = notMerge (reset)

        // Important: Update the brush event handler to close over current 'data' & 'hasPValues' or just use indices
        // Since we re-set option, indices are consistent with 'data' prop.
        // We just need to ensure the event handler knows how to map index -> gene.
        chartInstance.current.off('brushSelected');
        chartInstance.current.on('brushSelected', (params: any) => {
            if (!params || !params.batch || params.batch.length === 0) {
                onSelectionChange([]);
                return;
            }
            const indices: number[] = [];
            params.batch.forEach((batchItem: any) => {
                (batchItem?.selected || []).forEach((sel: any) => {
                    const di = sel?.dataIndex;
                    if (Array.isArray(di)) indices.push(...di);
                    else if (typeof di === 'number') indices.push(di);
                });
            });
            const uniqueIdx = Array.from(new Set(indices));

            if (uniqueIdx.length === 0) {
                onSelectionChange([]);
                return;
            }

            let selectedGenes: string[] = [];
            if (viewMode === 'ranked') {
                const sorted = [...data].sort((a, b) => b.x - a.x);
                selectedGenes = uniqueIdx.map(idx => sorted[idx]?.gene).filter(Boolean);
            } else {
                selectedGenes = uniqueIdx.map(idx => data[idx]?.gene).filter(Boolean);
            }
            onSelectionChange(selectedGenes);
        });

        if (viewMode === 'volcano') {
            updateThresholdGraphics();
        } else {
            chartInstance.current.setOption({ graphic: { $action: 'replace', elements: [] } });
        }

    }, [data, hasPValues, viewMode, fcThreshold, pThreshold]); // Re-run when data or mode changes

    React.useEffect(() => {
        if (viewMode !== 'volcano' || !data.length) return;
        const pass = data.filter((d) => {
            const meetsFc = Math.abs(d.x) >= fcThreshold;
            if (!hasPValues) return meetsFc;
            const pOk = d.pvalue !== undefined && d.pvalue > 0 && d.pvalue <= pThreshold;
            return meetsFc && pOk;
        });
        onSelectionChange(pass.map((d) => d.gene));
    }, [viewMode, data, fcThreshold, pThreshold, hasPValues, onSelectionChange]);


    // Construct Option
    const getOption = (): EChartsOption => {
        // View 1: Standard Volcano Plot (Scatter)
        if (viewMode === 'volcano') {
            const chartData = data.map(d => [d.x, d.y, d.gene, getDerivedStatus(d)]);
            return {
                backgroundColor: 'transparent',
                // Explicit Toolbox definition ensures buttons are wired correctly
                toolbox: {
                    right: 20,
                    feature: {
                        brush: {
                            type: ['rect', 'polygon', 'clear'],
                            title: {
                                rect: t('Box Select'),
                                polygon: t('Lasso Select'),
                                clear: t('Clear Selection')
                            }
                        }
                    },
                    iconStyle: {
                        borderColor: '#94a3b8'
                    },
                    emphasis: {
                        iconStyle: {
                            borderColor: '#ef4444'
                        }
                    }
                },
                tooltip: {
                    trigger: 'item',
                    triggerOn: 'mousemove',
                    enterable: true,
                    hideDelay: 120,
                    confine: true,
                    appendToBody: true,
                    formatter: (params: any) => {
                        const [x, y, gene, status] = params.data;
                        return renderTooltip(String(gene || ''), [
                            `${t('Log2FC')}: ${x}`,
                            `${t('-Log10(P)')}: ${y}`,
                            `${t('Status')}: ${status}`
                        ]);
                    }
                },
                grid: {
                    top: 40, right: 40, bottom: 50, left: 50,
                    containLabel: true
                },
                brush: {
                    xAxisIndex: 0,
                    yAxisIndex: 0,
                    transformable: true,
                    brushStyle: {
                        borderWidth: 1,
                        color: 'rgba(255,255,255,0.1)',
                        borderColor: '#ef4444'
                    }
                },
                xAxis: {
                    type: 'value',
                    name: t('Log2 FC'),
                    nameLocation: 'middle',
                    nameGap: 30,
                    splitLine: { show: false },
                    axisLine: { lineStyle: { color: '#64748b' } },
                    axisLabel: { color: '#94a3b8' }
                },
                yAxis: {
                    type: 'value',
                    name: t('-Log10 P'),
                    nameGap: 10,
                    splitLine: { lineStyle: { type: 'dashed', color: '#334155' } },
                    axisLine: { lineStyle: { color: '#64748b' } },
                    axisLabel: { color: '#94a3b8' }
                },
                series: [{
                    name: 'Genes',
                    type: 'scatter',
                    symbolSize: 6,
                    data: chartData,
                    itemStyle: {
                        color: (params: any) => {
                            const status = params.data[3];
                            if (status === 'UP') return '#ef4444';
                            if (status === 'DOWN') return '#3b82f6';
                            return '#475569';
                        },
                        opacity: 0.8
                    },
                    // Marklines for significance thresholds
                    markLine: {
                        silent: true,
                        symbol: 'none',
                        lineStyle: { type: 'dashed', color: '#94a3b8', width: 1, opacity: 0.5 },
                        data: [
                            { xAxis: fcThreshold },
                            { xAxis: -fcThreshold },
                            { yAxis: -Math.log10(pThreshold) }
                        ]
                    }
                }]
            };
        }
        // View 2: MA plot (Mean vs LogFC)
        if (viewMode === 'ma') {
            const chartData = data.map(d => [d.mean ?? 0, d.x, d.gene, getDerivedStatus(d)]);
            return {
                backgroundColor: 'transparent',
                toolbox: {
                    right: 20,
                    feature: {
                        brush: {
                            type: ['rect', 'polygon', 'clear'],
                            title: {
                                rect: t('Box Select'),
                                polygon: t('Lasso Select'),
                                clear: t('Clear Selection')
                            }
                        }
                    },
                    iconStyle: {
                        borderColor: '#94a3b8'
                    },
                    emphasis: {
                        iconStyle: {
                            borderColor: '#ef4444'
                        }
                    }
                },
                tooltip: {
                    trigger: 'item',
                    triggerOn: 'mousemove',
                    enterable: true,
                    hideDelay: 120,
                    confine: true,
                    appendToBody: true,
                    formatter: (params: any) => {
                        const [mean, logfc, gene, status] = params.data;
                        return renderTooltip(String(gene || ''), [
                            `Mean: ${Number(mean).toFixed(3)}`,
                            `Log2FC: ${logfc}`,
                            `Status: ${status}`
                        ]);
                    }
                },
                grid: {
                    top: 40, right: 40, bottom: 50, left: 50,
                    containLabel: true
                },
                brush: {
                    xAxisIndex: 0,
                    yAxisIndex: 0,
                    transformable: true,
                    brushStyle: {
                        borderWidth: 1,
                        color: 'rgba(255,255,255,0.1)',
                        borderColor: '#ef4444'
                    }
                },
                xAxis: {
                    type: 'value',
                    name: t('Mean Expression'),
                    nameLocation: 'middle',
                    nameGap: 30,
                    splitLine: { show: false },
                    axisLine: { lineStyle: { color: '#64748b' } },
                    axisLabel: { color: '#94a3b8' }
                },
                yAxis: {
                    type: 'value',
                    name: t('Log2 FC'),
                    nameGap: 10,
                    splitLine: { lineStyle: { type: 'dashed', color: '#334155' } },
                    axisLine: { lineStyle: { color: '#64748b' } },
                    axisLabel: { color: '#94a3b8' }
                },
                series: [{
                    name: 'Entities',
                    type: 'scatter',
                    symbolSize: 6,
                    data: chartData,
                    itemStyle: {
                        color: (params: any) => {
                            const status = params.data[3];
                            if (status === 'UP') return '#ef4444';
                            if (status === 'DOWN') return '#3b82f6';
                            return '#475569';
                        },
                        opacity: 0.8
                    },
                    markLine: {
                        silent: true,
                        symbol: 'none',
                        lineStyle: { type: 'dashed', color: '#94a3b8', width: 1, opacity: 0.5 },
                        data: [{ yAxis: 0 }]
                    }
                }]
            };
        }

        // View 3: Ranked LogFC Bar Chart
        {
            const sortedData = [...data].sort((a, b) => b.x - a.x);
            const xData = sortedData.map(d => d.gene);
            const yData = sortedData.map(d => d.x);

            return {
                backgroundColor: 'transparent',
                title: {
                    text: t('Ranked Expression (No P-Values)'),
                    left: 'center',
                    textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 'normal' }
                },
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    triggerOn: 'mousemove',
                    enterable: true,
                    hideDelay: 120,
                    confine: true,
                    appendToBody: true,
                    formatter: (params: any) => {
                        const param = params[0];
                        return renderTooltip(String(param.name || ''), [
                            `${t('Log2FC')}: ${Number(param.value).toFixed(3)}`
                        ]);
                    }
                },
                grid: {
                    top: 40, right: 30, bottom: 50, left: 50,
                    containLabel: true
                },
                brush: {
                    toolbox: ['rect', 'clear'],
                    xAxisIndex: 0,
                    brushStyle: {
                        borderWidth: 1,
                        color: 'rgba(255,255,255,0.1)',
                        borderColor: '#ef4444'
                    }
                },
                xAxis: {
                    type: 'category',
                    data: xData,
                    axisLabel: {
                        show: xData.length < 50,
                        color: '#94a3b8',
                        rotate: 45
                    },
                    axisTick: { show: false },
                    axisLine: { lineStyle: { color: '#64748b' } }
                },
                yAxis: {
                    type: 'value',
                    name: t('Log2 FC'),
                    splitLine: { lineStyle: { type: 'dashed', color: '#334155' } },
                    axisLabel: { color: '#94a3b8' }
                },
                series: [{
                    name: 'LogFC',
                    type: 'bar',
                    data: yData,
                    barWidth: '90%',
                    itemStyle: {
                        borderRadius: [2, 2, 0, 0],
                        color: (params: any) => {
                            return Number(params.value) >= 0 ? '#ef4444' : '#3b82f6';
                        }
                    }
                }]
            };
        }
    };

    const updateThresholdGraphics = () => {
        const chart = chartInstance.current;
        if (!chart) return;

        const grid = (chart as any).getModel().getComponent('grid')?.coordinateSystem?.getRect?.();
        if (!grid) return;

        const xAxis = (chart as any).getModel().getComponent('xAxis', 0)?.axis;
        const yAxis = (chart as any).getModel().getComponent('yAxis', 0)?.axis;
        if (!xAxis || !yAxis) return;

        const [xMin, xMax] = xAxis.scale.getExtent();
        const [yMin, yMax] = yAxis.scale.getExtent();
        const yThreshold = -Math.log10(Math.max(pThreshold, 1e-12));

        const toPixel = (x: number, y: number) =>
            chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [x, y]) as number[];
        const fromPixel = (x: number, y: number) =>
            chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [x, y]) as number[];

        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

        const posLine = toPixel(fcThreshold, yMin);
        const posLineTop = toPixel(fcThreshold, yMax);
        const negLine = toPixel(-fcThreshold, yMin);
        const negLineTop = toPixel(-fcThreshold, yMax);
        const pLine = toPixel(xMin, yThreshold);
        const pLineRight = toPixel(xMax, yThreshold);

        const makeHandle = (id: string, cx: number, cy: number, cursor: string, onDrag: (px: number, py: number) => void) => ({
            id,
            type: 'circle',
            shape: { cx, cy, r: 6 },
            style: { fill: '#fbbf24', stroke: '#0f172a', lineWidth: 1 },
            draggable: true,
            cursor,
            ondrag: (evt: any) => {
                const target = evt?.target;
                const px = (target?.shape?.cx || 0) + (target?.x || 0);
                const py = (target?.shape?.cy || 0) + (target?.y || 0);
                onDrag(px, py);
            }
        });

        const fcDrag = (px: number) => {
            const clampedX = clamp(px, grid.x, grid.x + grid.width);
            const [dx] = fromPixel(clampedX, grid.y);
            const next = Math.max(0.1, Math.abs(dx));
            setFcThreshold(Number(next.toFixed(3)));
        };

        const pDrag = (py: number) => {
            const clampedY = clamp(py, grid.y, grid.y + grid.height);
            const [, dy] = fromPixel(grid.x, clampedY);
            const nextP = Math.pow(10, -dy);
            const bounded = Math.max(1e-12, Math.min(1, nextP));
            setPThreshold(Number(bounded.toExponential(2)));
        };

        const graphics: any[] = [
            {
                id: 'fc-pos',
                type: 'line',
                shape: { x1: posLine[0], y1: posLine[1], x2: posLineTop[0], y2: posLineTop[1] },
                style: { stroke: '#fbbf24', lineWidth: 1, lineDash: [4, 4] },
                silent: true
            },
            {
                id: 'fc-neg',
                type: 'line',
                shape: { x1: negLine[0], y1: negLine[1], x2: negLineTop[0], y2: negLineTop[1] },
                style: { stroke: '#fbbf24', lineWidth: 1, lineDash: [4, 4] },
                silent: true
            },
            makeHandle('fc-pos-h', posLine[0], (posLine[1] + posLineTop[1]) / 2, 'ew-resize', (px) => fcDrag(px)),
            makeHandle('fc-neg-h', negLine[0], (negLine[1] + negLineTop[1]) / 2, 'ew-resize', (px) => fcDrag(px))
        ];

        if (hasPValues) {
            graphics.push(
                {
                    id: 'p-line',
                    type: 'line',
                    shape: { x1: pLine[0], y1: pLine[1], x2: pLineRight[0], y2: pLineRight[1] },
                    style: { stroke: '#22c55e', lineWidth: 1, lineDash: [4, 4] },
                    silent: true
                },
                makeHandle('p-h', (pLine[0] + pLineRight[0]) / 2, pLine[1], 'ns-resize', (_px, py) => pDrag(py))
            );
        }

        chart.setOption({ graphic: { $action: 'replace', elements: graphics } });
    };


    return (
        <div
            ref={chartRef}
            style={{
                height,
                width: '100%',
                position: 'relative',
                overflow: 'hidden'
            }}
        />
    );
};
