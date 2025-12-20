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

export async function exportSessionAsInteractiveHtml(analysis: AnalysisSession): Promise<boolean> {
    if (!analysis) {
        alert('No analysis data to export!');
        return false;
    }

    const baseName = analysis.sourceFilePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'session';
    const defaultName = `${baseName}_share.html`;
    const safeJson = JSON.stringify(analysis).replace(/</g, '\\u003c');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>BioViz Local • Share</title>
  <style>
    body { font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b111c; color: #e7eefc; margin: 0; padding: 24px; }
    .card { background: #111827; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 16px 18px; margin-bottom: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.28); }
    h1 { margin-top: 0; }
    h2 { margin: 0 0 12px 0; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13px; }
    th { color: #b7c8e6; font-weight: 600; }
    .pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,0.06); margin-right: 8px; margin-bottom: 8px; font-size: 12px; }
    .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .tag { background: rgba(16, 185, 129, 0.15); border-radius: 8px; padding: 10px; font-size: 13px; }
    .muted { color: #9fb3d1; font-size: 13px; }
    .toggle { cursor: pointer; background: rgba(59, 130, 246, 0.16); border: 1px solid rgba(59, 130, 246, 0.3); color: #d9e7ff; padding: 8px 10px; border-radius: 8px; font-size: 12px; }
    .footer { color: #7b8aa7; font-size: 12px; text-align: center; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>BioViz Local • Shareable Report</h1>
    <div class="muted">Local-only snapshot. Open in any browser.</div>
    <div id="meta-pills"></div>
  </div>

  <div class="card">
    <h2>Pathway</h2>
    <div id="pathway-title" class="tag"></div>
    <div id="pathway-desc" class="muted" style="margin-top:6px;"></div>
  </div>

  <div class="card">
    <div style="display:flex; justify-content: space-between; align-items:center;">
      <h2>Volcano Snapshot</h2>
      <button class="toggle" data-target="volcano-table">Toggle</button>
    </div>
    <div class="muted">Top 50 points by |Log2FC| × -log10(p)</div>
    <table id="volcano-table">
      <thead><tr><th>Gene</th><th>Log2FC</th><th>-log10(p)</th><th>Status</th></tr></thead>
      <tbody id="volcano-body"></tbody>
    </table>
  </div>

  <div class="card">
    <div style="display:flex; justify-content: space-between; align-items:center;">
      <h2>Enrichment / GSEA</h2>
      <button class="toggle" data-target="enrich-table">Toggle</button>
    </div>
    <table id="enrich-table">
      <thead><tr><th>Term</th><th>Score</th><th>FDR / P</th><th>Overlap</th></tr></thead>
      <tbody id="enrich-body"></tbody>
    </table>
    <div class="muted" id="enrich-note"></div>
  </div>

  <div class="card">
    <div style="display:flex; justify-content: space-between; align-items:center;">
      <h2>AI Conversation</h2>
      <button class="toggle" data-target="chat-log">Toggle</button>
    </div>
    <div id="chat-log"></div>
  </div>

  <div class="footer">BioViz Local • Generated ${new Date().toLocaleString()}</div>

  <script id="session-data" type="application/json">${safeJson}</script>
  <script>
    const dataEl = document.getElementById('session-data');
    const data = dataEl ? JSON.parse(dataEl.textContent || '{}') : {};
    const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

    const pillHost = document.getElementById('meta-pills');
    const pills = [
      { label: 'Dataset', value: data.sourceFilePath || 'unknown' },
      { label: 'Pathway', value: data.pathway?.title || data.pathway?.name || data.pathway?.id || 'n/a' },
      { label: 'Genes', value: data.statistics?.total_nodes || data.volcano_data?.length || 'n/a' },
      { label: 'Up', value: data.statistics?.upregulated || '0' },
      { label: 'Down', value: data.statistics?.downregulated || '0' }
    ];
    pillHost.innerHTML = pills.map(p => '<span class="pill"><strong>' + esc(p.label) + ':</strong> ' + esc(p.value) + '</span>').join('');

    document.getElementById('pathway-title').textContent = data.pathway?.title || data.pathway?.name || 'Pathway';
    document.getElementById('pathway-desc').textContent = data.pathway?.description || 'No description';

    const volcano = Array.isArray(data.volcano_data) ? data.volcano_data.slice(0, 50) : [];
    const volcanoRows = volcano.map(row => {
      return '<tr><td>' + esc(row.gene) + '</td><td>' + (row.x ?? '').toFixed ? row.x.toFixed(2) : esc(row.x) + '</td><td>' + (row.y ?? '').toFixed ? row.y.toFixed(2) : esc(row.y) + '</td><td>' + esc(row.status || '') + '</td></tr>';
    }).join('');
    document.getElementById('volcano-body').innerHTML = volcanoRows || '<tr><td colspan="4" class="muted">No volcano data.</td></tr>';

    const enrichBody = document.getElementById('enrich-body');
    const enrichNote = document.getElementById('enrich-note');
    const enrichRows = [];
    if (Array.isArray(data.enrichrResults) && data.enrichrResults.length) {
      data.enrichrResults.slice(0, 15).forEach(r => {
        enrichRows.push('<tr><td>' + esc(r.term || r.pathway_name) + '</td><td>' + esc(r.nes || r.odds_ratio || '') + '</td><td>' + esc(r.adjusted_p_value || r.fdr || r.p_value || '') + '</td><td>' + esc(r.overlap || r.overlap_ratio || '') + '</td></tr>');
      });
      enrichNote.textContent = 'ORA results';
    } else if (data.gseaResults && (data.gseaResults.up?.length || data.gseaResults.down?.length)) {
      const combined = [...(data.gseaResults.up || []), ...(data.gseaResults.down || [])];
      combined.slice(0, 15).forEach(r => {
        enrichRows.push('<tr><td>' + esc(r.term || r.pathway_name) + '</td><td>' + esc(r.nes || '') + '</td><td>' + esc(r.fdr || r.p_value || '') + '</td><td>' + esc(r.overlap || r.overlap_ratio || '') + '</td></tr>');
      });
      enrichNote.textContent = 'GSEA prerank results';
    } else {
      enrichNote.textContent = 'No enrichment results attached.';
    }
    enrichBody.innerHTML = enrichRows.join('') || '<tr><td colspan="4" class="muted">No enrichment data.</td></tr>';

    const chat = Array.isArray(data.chatHistory) ? data.chatHistory : [];
    const chatHost = document.getElementById('chat-log');
    chatHost.innerHTML = chat.length ? chat.map(c => {
      return '<div class="tag"><strong>' + esc(c.role === 'assistant' ? 'AI' : 'User') + ':</strong> ' + esc(c.content || '') + '</div>';
    }).join('') : '<div class="muted">No chat history.</div>';

    document.querySelectorAll('.toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const isHidden = target.style.display === 'none';
        target.style.display = isHidden ? '' : 'none';
      });
    });
  </script>
</body>
</html>`;

    try {
        const filePath = await save({
            title: 'Export Shareable HTML',
            defaultPath: defaultName,
            filters: [{ name: 'HTML', extensions: ['html'] }]
        });

        if (!filePath) {
            return false;
        }

        await writeTextFile(filePath, html);
        return true;
    } catch (error) {
        console.error('[Export] Failed to export HTML:', error);
        alert('Failed to export HTML: ' + error);
        return false;
    }
}
