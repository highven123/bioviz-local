/**
 * Session Export/Import Utilities
 */

export interface AnalysisSession {
    pathway: any;
    statistics: any;
    volcano_data: any[];
    chatHistory?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
    sourceFilePath: string;
    [key: string]: any;
}

export function exportSessionAsJSON(analysis: AnalysisSession): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = analysis.sourceFilePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'session';

    const jsonData = JSON.stringify(analysis, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseName}_session_${timestamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

export function exportSessionAsMarkdown(analysis: AnalysisSession): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = analysis.sourceFilePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'session';

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

    if (analysis.chatHistory && analysis.chatHistory.length > 0) {
        markdown += `## AI Conversation\n\n`;
        analysis.chatHistory.forEach(msg => {
            const role = msg.role === 'user' ? '👤 **User**' : '🤖 **AI**';
            markdown += `### ${role}\n${msg.content}\n\n---\n\n`;
        });
    } else {
        markdown += `## AI Conversation\n\nNo conversation history.\n\n`;
    }

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseName}_report_${timestamp}.md`;
    link.click();
    URL.revokeObjectURL(url);
}

export function exportSession(analysis: AnalysisSession): void {
    exportSessionAsJSON(analysis);
    setTimeout(() => exportSessionAsMarkdown(analysis), 100); // Slight delay to avoid download conflicts
}

export async function importSession(): Promise<AnalysisSession | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) {
                resolve(null);
                return;
            }

            try {
                const text = await file.text();
                const imported = JSON.parse(text) as AnalysisSession;
                resolve(imported);
            } catch (error) {
                alert('Failed to import session: ' + error);
                resolve(null);
            }
        };
        input.click();
    });
}
