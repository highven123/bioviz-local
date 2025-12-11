import React, { useRef } from 'react';
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
    const chartRef = useRef<HTMLDivElement>(null);
    const chartInstance = useRef<echarts.ECharts | null>(null);

    // Detect if valid P-values exist
    const hasPValues = React.useMemo(() => {
        return data.some(d => d.y > 0.01);
    }, [data]);

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

    }, [data, hasPValues, viewMode]); // Re-run when data or mode changes


    // Construct Option
    const getOption = (): EChartsOption => {
        // View 1: Standard Volcano Plot (Scatter)
        if (viewMode === 'volcano') {
            const chartData = data.map(d => [d.x, d.y, d.gene, d.status]);
            return {
                backgroundColor: 'transparent',
                // Explicit Toolbox definition ensures buttons are wired correctly
                toolbox: {
                    right: 20,
                    feature: {
                        brush: {
                            type: ['rect', 'polygon', 'clear'],
                            title: {
                                rect: 'Box Select',
                                polygon: 'Lasso Select',
                                clear: 'Clear Selection'
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
                    formatter: (params: any) => {
                        const [x, y, gene, status] = params.data;
                        return `
                  <div style="font-weight:bold; margin-bottom:4px;">${gene}</div>
                  Log2FC: ${x}<br/>
                  -Log10(P): ${y}<br/>
                  Status: ${status}
                `;
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
                    name: 'Log2 FC',
                    nameLocation: 'middle',
                    nameGap: 30,
                    splitLine: { show: false },
                    axisLine: { lineStyle: { color: '#64748b' } },
                    axisLabel: { color: '#94a3b8' }
                },
                yAxis: {
                    type: 'value',
                    name: '-Log10 P',
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
                            { xAxis: 1 },
                            { xAxis: -1 },
                            { yAxis: 1.3 } // ~0.05 p-value
                        ]
                    }
                }]
            };
        }
        // View 2: MA plot (Mean vs LogFC)
        if (viewMode === 'ma') {
            const chartData = data.map(d => [d.mean ?? 0, d.x, d.gene, d.status]);
            return {
                backgroundColor: 'transparent',
                toolbox: {
                    right: 20,
                    feature: {
                        brush: {
                            type: ['rect', 'polygon', 'clear'],
                            title: {
                                rect: 'Box Select',
                                polygon: 'Lasso Select',
                                clear: 'Clear Selection'
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
                    formatter: (params: any) => {
                        const [mean, logfc, gene, status] = params.data;
                        return `
                  <div style="font-weight:bold; margin-bottom:4px;">${gene}</div>
                  Mean: ${mean.toFixed(3)}<br/>
                  Log2FC: ${logfc}<br/>
                  Status: ${status}
                `;
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
                    name: 'Mean Expression',
                    nameLocation: 'middle',
                    nameGap: 30,
                    splitLine: { show: false },
                    axisLine: { lineStyle: { color: '#64748b' } },
                    axisLabel: { color: '#94a3b8' }
                },
                yAxis: {
                    type: 'value',
                    name: 'Log2 FC',
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
                    text: 'Ranked Expression (No P-Values)',
                    left: 'center',
                    textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 'normal' }
                },
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    formatter: (params: any) => {
                        const param = params[0];
                        return `
                           <div style="font-weight:bold;">${param.name}</div>
                           Log2FC: ${param.value.toFixed(3)}
                         `;
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
                    name: 'Log2 FC',
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
