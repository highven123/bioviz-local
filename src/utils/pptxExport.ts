/**
 * BioViz Local - PPTX Export Utility
 * Export pathway analysis results to PowerPoint presentations
 */

import pptxgen from 'pptxgenjs';

export interface PathwayExportData {
    pathwayId: string;
    pathwayName: string;
    statistics: {
        total_nodes: number;
        upregulated: number;
        downregulated: number;
        unchanged: number;
        percent_upregulated: number;
        percent_downregulated: number;
    };
    coloredNodes?: Array<{
        id: string;
        name: string;
        color: string;
        expression?: number;
    }>;
    enrichmentResults?: Array<{
        term: string;
        p_value: number;
        adjusted_p_value: number;
        overlap: string;
        combined_score: number;
    }>;
    gseaResults?: {
        up_regulated?: Array<{ term: string; nes: number; p_value: number; fdr: number }>;
        down_regulated?: Array<{ term: string; nes: number; p_value: number; fdr: number }>;
    };
}

/**
 * Export pathway analysis to PPTX
 */
export async function exportPathwayToPPTX(data: PathwayExportData): Promise<string> {
    const pptx = new pptxgen();

    // Slide 1: Title
    const titleSlide = pptx.addSlide();
    titleSlide.background = { color: '0A0A0F' };

    titleSlide.addText('BioViz Local', {
        x: 0.5,
        y: 2.0,
        w: 9,
        h: 1,
        fontSize: 48,
        bold: true,
        color: '6366F1',
        align: 'center'
    });

    titleSlide.addText('KEGG Pathway Analysis Report', {
        x: 0.5,
        y: 3.0,
        w: 9,
        h: 0.6,
        fontSize: 28,
        color: 'E5E7EB',
        align: 'center'
    });

    const now = new Date();
    titleSlide.addText(`Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, {
        x: 0.5,
        y: 4.0,
        w: 9,
        h: 0.4,
        fontSize: 14,
        color: '9CA3AF',
        align: 'center'
    });

    // Slide 2: Pathway Overview
    const overviewSlide = pptx.addSlide();
    overviewSlide.background = { color: '0A0A0F' };

    overviewSlide.addText(data.pathwayName, {
        x: 0.5,
        y: 0.5,
        w: 9,
        h: 0.6,
        fontSize: 32,
        bold: true,
        color: 'E5E7EB'
    });

    overviewSlide.addText(`Pathway ID: ${data.pathwayId}`, {
        x: 0.5,
        y: 1.2,
        w: 9,
        h: 0.4,
        fontSize: 16,
        color: '6366F1',
        fontFace: 'Monaco'
    });

    // Statistics table
    const statsData: any[][] = [
        [
            { text: 'Metric', options: { bold: true, color: 'E5E7EB' } },
            { text: 'Count', options: { bold: true, color: 'E5E7EB' } },
            { text: 'Percentage', options: { bold: true, color: 'E5E7EB' } }
        ],
        [
            { text: 'Total Nodes', options: { color: 'E5E7EB' } },
            { text: String(data.statistics.total_nodes), options: { color: 'E5E7EB' } },
            { text: '100%', options: { color: '9CA3AF' } }
        ],
        [
            { text: 'Upregulated', options: { color: 'EF4444' } },
            { text: String(data.statistics.upregulated), options: { color: 'EF4444', bold: true } },
            { text: `${data.statistics.percent_upregulated.toFixed(1)}%`, options: { color: 'EF4444' } }
        ],
        [
            { text: 'Downregulated', options: { color: '3B82F6' } },
            { text: String(data.statistics.downregulated), options: { color: '3B82F6', bold: true } },
            { text: `${data.statistics.percent_downregulated.toFixed(1)}%`, options: { color: '3B82F6' } }
        ],
        [
            { text: 'Unchanged', options: { color: '9CA3AF' } },
            { text: String(data.statistics.unchanged), options: { color: '9CA3AF' } },
            { text: `${((data.statistics.unchanged / data.statistics.total_nodes) * 100).toFixed(1)}%`, options: { color: '9CA3AF' } }
        ]
    ];

    overviewSlide.addTable(statsData, {
        x: 1.5,
        y: 2.0,
        w: 7,
        fontSize: 18,
        border: { type: 'solid', pt: 1, color: '2A2A3A' },
        valign: 'middle',
        align: 'center'
    });

    // Slide 3: Key Findings
    const findingsSlide = pptx.addSlide();
    findingsSlide.background = { color: '0A0A0F' };

    findingsSlide.addText('Key Findings', {
        x: 0.5,
        y: 0.5,
        w: 9,
        h: 0.6,
        fontSize: 28,
        bold: true,
        color: 'E5E7EB'
    });

    const findings = [
        `• ${data.statistics.upregulated} genes are significantly upregulated (${data.statistics.percent_upregulated.toFixed(1)}%)`,
        `• ${data.statistics.downregulated} genes are significantly downregulated (${data.statistics.percent_downregulated.toFixed(1)}%)`,
        `• ${data.statistics.unchanged} genes show no significant change or were not detected`,
        `• Total pathway coverage: ${((data.statistics.upregulated + data.statistics.downregulated) / data.statistics.total_nodes * 100).toFixed(1)}%`
    ];

    findings.forEach((finding, index) => {
        findingsSlide.addText(finding, {
            x: 0.8,
            y: 1.5 + (index * 0.6),
            w: 8.4,
            h: 0.5,
            fontSize: 16,
            color: 'E5E7EB',
            bullet: false
        });
    });

    // Slide 4: Top Regulated Genes (if data available)
    if (data.coloredNodes && data.coloredNodes.length > 0) {
        const genesSlide = pptx.addSlide();
        genesSlide.background = { color: '0A0A0F' };

        genesSlide.addText('Gene Expression Details', {
            x: 0.5,
            y: 0.5,
            w: 9,
            h: 0.6,
            fontSize: 28,
            bold: true,
            color: 'E5E7EB'
        });

        // Filter and sort genes
        const expressedGenes = data.coloredNodes
            .filter(n => n.expression !== null && n.expression !== undefined)
            .sort((a, b) => Math.abs(b.expression!) - Math.abs(a.expression!))
            .slice(0, 15);

        const geneTableData: any[][] = [
            [
                { text: 'Gene', options: { bold: true, color: 'E5E7EB', fill: '1A1A24' } },
                { text: 'LogFC', options: { bold: true, color: 'E5E7EB', fill: '1A1A24' } },
                { text: 'Regulation', options: { bold: true, color: 'E5E7EB', fill: '1A1A24' } }
            ]
        ];

        expressedGenes.forEach(gene => {
            const isUp = gene.expression! > 0;
            const color = isUp ? 'EF4444' : '3B82F6';
            const regulation = isUp ? '↑ Up' : '↓ Down';

            geneTableData.push([
                { text: gene.name, options: { color: 'E5E7EB', fontFace: 'Monaco' } },
                { text: gene.expression!.toFixed(2), options: { color, bold: true, fontFace: 'Monaco' } },
                { text: regulation, options: { color } }
            ]);
        });

        genesSlide.addTable(geneTableData, {
            x: 1.5,
            y: 1.3,
            w: 7,
            fontSize: 14,
            border: { type: 'solid', pt: 1, color: '2A2A3A' },
            valign: 'middle'
        });
    }

    // Slide 5: Enrichment Analysis (ORA)
    if (data.enrichmentResults && data.enrichmentResults.length > 0) {
        const oraSlide = pptx.addSlide();
        oraSlide.background = { color: '0A0A0F' };

        oraSlide.addText('Enrichment Analysis (ORA)', {
            x: 0.5, y: 0.5, w: 9, h: 0.6, fontSize: 28, bold: true, color: 'E5E7EB'
        });

        const oraTableData: any[][] = [
            [
                { text: 'Term', options: { bold: true, color: 'E5E7EB', fill: '1A1A24' } },
                { text: 'P-value', options: { bold: true, color: 'E5E7EB', fill: '1A1A24' } },
                { text: 'Adj. P-value', options: { bold: true, color: 'E5E7EB', fill: '1A1A24' } },
                { text: 'Overlap', options: { bold: true, color: 'E5E7EB', fill: '1A1A24' } }
            ]
        ];

        data.enrichmentResults.slice(0, 10).forEach(res => {
            oraTableData.push([
                { text: res.term, options: { color: 'E5E7EB', fontSize: 12 } },
                { text: res.p_value.toExponential(2), options: { color: 'E5E7EB', fontSize: 12 } },
                { text: res.adjusted_p_value.toExponential(2), options: { color: '6366F1', bold: true, fontSize: 12 } },
                { text: res.overlap, options: { color: '9CA3AF', fontSize: 12 } }
            ]);
        });

        oraSlide.addTable(oraTableData, {
            x: 0.5, y: 1.3, w: 9, fontSize: 12,
            border: { type: 'solid', pt: 1, color: '2A2A3A' }
        });
    }

    // Slide 6: GSEA Results
    if (data.gseaResults && (data.gseaResults.up_regulated?.length || data.gseaResults.down_regulated?.length)) {
        const gseaSlide = pptx.addSlide();
        gseaSlide.background = { color: '0A0A0F' };

        gseaSlide.addText('Gene Set Enrichment Analysis (GSEA)', {
            x: 0.5, y: 0.5, w: 9, h: 0.6, fontSize: 28, bold: true, color: 'E5E7EB'
        });

        const gseaTableData: any[][] = [
            [
                { text: 'Term', options: { bold: true, color: 'E5E7EB', fill: '1A1A24' } },
                { text: 'NES', options: { bold: true, color: 'E5E7EB', fill: '1A1A24' } },
                { text: 'P-value', options: { bold: true, color: 'E5E7EB', fill: '1A1A24' } },
                { text: 'FDR', options: { bold: true, color: 'E5E7EB', fill: '1A1A24' } }
            ]
        ];

        const allGsea = [
            ...(data.gseaResults.up_regulated || []).map(r => ({ ...r, status: 'UP' })),
            ...(data.gseaResults.down_regulated || []).map(r => ({ ...r, status: 'DOWN' }))
        ].sort((a, b) => Math.abs(b.nes) - Math.abs(a.nes)).slice(0, 10);

        allGsea.forEach(res => {
            const color = res.status === 'UP' ? 'EF4444' : '3B82F6';
            gseaTableData.push([
                { text: res.term, options: { color: 'E5E7EB', fontSize: 11 } },
                { text: res.nes.toFixed(2), options: { color, bold: true, fontSize: 11 } },
                { text: res.p_value.toExponential(2), options: { color: 'E5E7EB', fontSize: 11 } },
                { text: res.fdr.toExponential(2), options: { color, fontSize: 11 } }
            ]);
        });

        gseaSlide.addTable(gseaTableData, {
            x: 0.5, y: 1.3, w: 9, fontSize: 11,
            border: { type: 'solid', pt: 1, color: '2A2A3A' }
        });
    }

    // Save the presentation
    const fileName = `${data.pathwayId}_${data.pathwayName.replace(/\s+/g, '_')}_${Date.now()}.pptx`;
    await pptx.writeFile({ fileName });

    console.log(`[BioViz] Exported to ${fileName}`);
    return fileName;
}

export default exportPathwayToPPTX;
