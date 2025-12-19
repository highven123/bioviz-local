/**
 * Session Export/Import Utilities
 * Uses Tauri native dialog for reliable file saving
 */

import { save, open, ask } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';

export interface AnalysisSession {
    pathway: any;
    statistics: any;
    volcano_data: any[];
    chatHistory?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
    sourceFilePath: string;
    [key: string]: any;
}

export async function exportSessionAsJSON(analysis: AnalysisSession): Promise<boolean> {
    const baseName = analysis.sourceFilePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'session';
    const defaultName = `${baseName}_session.json`;



    try {

        const filePath = await save({
            title: 'Save Analysis Session',
            defaultPath: defaultName,
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });


        if (!filePath) {

            return false; // User cancelled
        }

        const jsonData = JSON.stringify(analysis, null, 2);

        await writeTextFile(filePath, jsonData);

        return true;
    } catch (error) {
        console.error('[Export] Failed to export JSON:', error);
        alert(`Export failed: ${error}`);
        return false;
    }
}

export async function exportSessionAsMarkdown(analysis: AnalysisSession): Promise<boolean> {

    const baseName = analysis.sourceFilePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'session';
    const defaultName = `${baseName}_report.md`;


    let markdown = `# BioViz Analysis Session\n\n`;
    markdown += `**Date**: ${new Date().toLocaleString()}\n`;
    markdown += `**Dataset**: ${analysis.sourceFilePath}\n`;
    markdown += `**Pathway**: ${analysis.pathway?.title || analysis.pathway?.id || 'Unknown'}\n\n`;

    if (analysis.statistics) {
        const stats = analysis.statistics;
        markdown += `## Statistics\n\n`;
        markdown += `- Total Genes: ${stats.total_nodes || 0}\n`;
        markdown += `- Upregulated: ${stats.upregulated || 0}\n`;
        markdown += `- Downregulated: ${stats.downregulated || 0}\n\n`;
    }

    if (analysis.enrichrResults && analysis.enrichrResults.length > 0) {
        markdown += `## Enrichment Analysis (ORA)\n\n`;
        markdown += `| Term | Adj. P-value | Overlap |\n`;
        markdown += `| :--- | :--- | :--- |\n`;
        analysis.enrichrResults.slice(0, 10).forEach((res: any) => {
            markdown += `| ${res.term} | ${res.adjusted_p_value.toExponential(2)} | ${res.overlap} |\n`;
        });
        markdown += `\n`;
    }

    if (analysis.gseaResults && (analysis.gseaResults.up.length > 0 || analysis.gseaResults.down.length > 0)) {
        markdown += `## GSEA Results\n\n`;
        markdown += `| Term | NES | FDR | Status |\n`;
        markdown += `| :--- | :--- | :--- | :--- |\n`;
        const allGsea = [
            ...analysis.gseaResults.up.slice(0, 5).map((r: any) => ({ ...r, status: 'UP' })),
            ...analysis.gseaResults.down.slice(0, 5).map((r: any) => ({ ...r, status: 'DOWN' }))
        ];
        allGsea.forEach(res => {
            markdown += `| ${res.term} | ${res.nes.toFixed(2)} | ${res.fdr.toExponential(2)} | ${res.status} |\n`;
        });
        markdown += `\n`;
    }

    if (analysis.chatHistory && analysis.chatHistory.length > 0) {
        markdown += `## AI Conversation\n\n`;
        analysis.chatHistory.forEach(msg => {
            const role = msg.role === 'user' ? '👤 **User**' : '🤖 **AI**';
            markdown += `### ${role}\n${msg.content}\n\n---\n\n`;
        });
    } else {
        markdown += `## AI Conversation\n\nNo conversation history.\n\n`;
    }

    try {
        const filePath = await save({
            title: 'Save Analysis Report',
            defaultPath: defaultName,
            filters: [{ name: 'Markdown', extensions: ['md'] }]
        });

        if (!filePath) {
            return false; // User cancelled
        }

        await writeTextFile(filePath, markdown);
        return true;
    } catch (error) {
        console.error('Failed to export Markdown:', error);
        alert(`Export failed: ${error}`);
        return false;
    }
}

export async function exportSession(analysis: AnalysisSession): Promise<void> {


    if (!analysis) {
        alert('No analysis data to export!');
        return;
    }

    try {
        // Ask user to choose format
        const saveAsJson = await ask('选择导出格式：\n\n• JSON - 可重新导入继续分析\n• Markdown - 人类可读报告', {
            title: '导出分析报告',
            kind: 'info',
            okLabel: 'JSON',
            cancelLabel: 'Markdown'
        });



        if (saveAsJson) {
            const success = await exportSessionAsJSON(analysis);
            if (success) {
                alert('Session saved successfully!');
            }
        } else {
            const success = await exportSessionAsMarkdown(analysis);
            if (success) {
                alert('Report saved successfully!');
            }
        }
    } catch (error) {
        console.error('[Export] Error in exportSession:', error);
        alert(`Export error: ${error}`);
    }


}

export async function importSession(): Promise<AnalysisSession | null> {
    try {
        const filePath = await open({
            title: 'Import Analysis Session',
            filters: [{ name: 'JSON', extensions: ['json'] }],
            multiple: false
        });

        if (!filePath || Array.isArray(filePath)) {
            return null;
        }

        const text = await readTextFile(filePath);
        const imported = JSON.parse(text) as AnalysisSession;
        return imported;
    } catch (error) {
        alert('Failed to import session: ' + error);
        return null;
    }
}
