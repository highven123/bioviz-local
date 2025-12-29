import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useI18n } from '../i18n';

interface UpSetSet {
    label: string;
    genes: string[];
}

interface UpSetPlotProps {
    sets: UpSetSet[];
    height?: number | string;
}

const comboLabel = (mask: number, labels: string[]) => {
    const parts: string[] = [];
    labels.forEach((label, idx) => {
        if (mask & (1 << idx)) {
            parts.push(label);
        }
    });
    return parts.join(' & ');
};

export const UpSetPlot: React.FC<UpSetPlotProps> = ({ sets, height = 220 }) => {
    const { t } = useI18n();
    const data = useMemo(() => {
        if (!sets.length) return [];
        const limited = sets.slice(0, 4);
        const labels = limited.map((_, i) => String.fromCharCode(65 + i));
        const genes = limited.map((s) => new Set(s.genes || []));
        const combos: { label: string; count: number; detail: string }[] = [];

        const totalMasks = (1 << genes.length) - 1;
        for (let mask = 1; mask <= totalMasks; mask += 1) {
            let intersection: Set<string> | null = null;
            for (let idx = 0; idx < genes.length; idx++) {
                if (mask & (1 << idx)) {
                    const gset = genes[idx];
                    if (!intersection) {
                        intersection = new Set(gset);
                    } else {
                        intersection = new Set([...(intersection as Set<string>)].filter((g) => gset.has(g)));
                    }
                }
            }
            combos.push({
                label: comboLabel(mask, labels),
                count: intersection ? (intersection as Set<string>).size : 0,
                detail: comboLabel(mask, limited.map((s) => s.label))
            });
        }

        return combos.sort((a, b) => b.count - a.count);
    }, [sets]);

    if (!sets.length) {
        return <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{t('No gene sets available for UpSet view.')}</div>;
    }

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'item',
            formatter: (params: any) => {
                const row = data[params.dataIndex];
                const wrap = (text: string, size: number) => {
                    const lines: string[] = [];
                    for (let i = 0; i < text.length; i += size) {
                        lines.push(text.slice(i, i + size));
                    }
                    return lines.join('<br/>');
                };
                return `<strong>${wrap(row.detail, 50)}</strong><br/>${t('Intersection')}: ${row.count}`;
            },
            position: (point: number[], params: any, _dom: unknown, rect: any, size: any) => {
                if (!rect || !size?.contentSize || !size?.viewSize) {
                    return point;
                }
                const contentW = size.contentSize[0];
                const viewW = size.viewSize[0];
                const total = data.length;
                const idx = params?.dataIndex ?? 0;
                const isLeft = idx <= Math.floor((total - 1) / 3);
                const isRight = idx >= Math.ceil((total - 1) * 2 / 3);
                let x: number;
                if (isLeft) {
                    x = rect.x + rect.width + 8;
                } else if (isRight) {
                    x = rect.x - contentW - 8;
                } else {
                    x = (viewW - contentW) / 2;
                }
                x = Math.max(8, Math.min(viewW - contentW - 8, x));
                const y = Math.max(8, rect.y - 10);
                return [x, y];
            }
        },
        grid: { left: 40, right: 20, top: 10, bottom: 30 },
        xAxis: {
            type: 'category',
            data: data.map((d) => d.label),
            axisLabel: { color: '#94a3b8', rotate: 30 },
            axisLine: { lineStyle: { color: '#475569' } }
        },
        yAxis: {
            type: 'value',
            axisLabel: { color: '#94a3b8' },
            splitLine: { lineStyle: { color: '#1f2937' } }
        },
        series: [
            {
                type: 'bar',
                data: data.map((d) => d.count),
                itemStyle: { color: '#60a5fa' },
                barWidth: '60%'
            }
        ]
    };

    return <ReactECharts option={option} style={{ height }} />;
};

export default UpSetPlot;
