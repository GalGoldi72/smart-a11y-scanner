/**
 * HTML report format — self-contained, professional accessibility scan report.
 * Inline CSS, no external dependencies. Looks good printed or in a browser.
 */

import type { ScanResult, Finding, PageResult } from '../../scanner/types.js';
import type { Severity } from '../../rules/types.js';

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#dc2626',
  major: '#ea580c',
  minor: '#ca8a04',
  advisory: '#2563eb',
};

const SEVERITY_BG: Record<Severity, string> = {
  critical: '#fef2f2',
  major: '#fff7ed',
  minor: '#fefce8',
  advisory: '#eff6ff',
};

const SEVERITY_ORDER: Severity[] = ['critical', 'major', 'minor', 'advisory'];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function severityBadge(severity: Severity): string {
  return `<span class="badge severity-${severity}">${severity.toUpperCase()}</span>`;
}

function buildSummaryCards(result: ScanResult): string {
  const s = result.summary;
  return `
    <div class="summary-cards">
      <div class="card">
        <div class="card-number">${s.totalPages}</div>
        <div class="card-label">Pages Scanned</div>
      </div>
      <div class="card">
        <div class="card-number">${s.totalFindings}</div>
        <div class="card-label">Total Findings</div>
      </div>
      <div class="card card-critical">
        <div class="card-number">${s.bySeverity.critical}</div>
        <div class="card-label">Critical</div>
      </div>
      <div class="card card-major">
        <div class="card-number">${s.bySeverity.major}</div>
        <div class="card-label">Major</div>
      </div>
      <div class="card card-minor">
        <div class="card-number">${s.bySeverity.minor}</div>
        <div class="card-label">Minor</div>
      </div>
      <div class="card card-advisory">
        <div class="card-number">${s.bySeverity.advisory}</div>
        <div class="card-label">Advisory</div>
      </div>
    </div>`;
}

function buildSeverityChart(result: ScanResult): string {
  const s = result.summary.bySeverity;
  const total = result.summary.totalFindings || 1;
  const segments = SEVERITY_ORDER
    .filter((sev) => s[sev] > 0)
    .map((sev) => {
      const pct = ((s[sev] / total) * 100).toFixed(1);
      return `<div class="bar-segment" style="width:${pct}%;background:${SEVERITY_COLORS[sev]}" title="${sev}: ${s[sev]} (${pct}%)">${s[sev] > 0 ? s[sev] : ''}</div>`;
    })
    .join('');

  return `
    <div class="chart-section">
      <h3>Findings by Severity</h3>
      <div class="bar-chart">${segments}</div>
      <div class="legend">
        ${SEVERITY_ORDER.map((sev) => `<span class="legend-item"><span class="legend-dot" style="background:${SEVERITY_COLORS[sev]}"></span>${sev} (${s[sev]})</span>`).join('')}
      </div>
    </div>`;
}

function buildCategoryChart(result: ScanResult): string {
  const cats = result.summary.byCategory;
  const entries = Object.entries(cats)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  if (entries.length === 0) return '';
  const max = entries[0][1];

  const bars = entries
    .map(([cat, count]) => {
      const pct = ((count / max) * 100).toFixed(1);
      return `
        <div class="h-bar-row">
          <span class="h-bar-label">${escapeHtml(cat)}</span>
          <div class="h-bar-track">
            <div class="h-bar-fill" style="width:${pct}%">${count}</div>
          </div>
        </div>`;
    })
    .join('');

  return `
    <div class="chart-section">
      <h3>Findings by Category</h3>
      ${bars}
    </div>`;
}

interface FlatFinding extends Finding {
  pageUrl: string;
  pageTitle: string;
}

function buildFindingsTable(result: ScanResult): string {
  const allFindings: FlatFinding[] = [];
  for (const page of result.pages) {
    for (const f of page.findings) {
      allFindings.push({ ...f, pageUrl: page.url, pageTitle: page.metadata.title });
    }
  }

  allFindings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  const rows = allFindings
    .map(
      (f, i) => `
      <tr class="finding-row severity-row-${f.severity}">
        <td>${i + 1}</td>
        <td>${severityBadge(f.severity)}</td>
        <td class="url-cell" title="${escapeHtml(f.pageUrl)}">${escapeHtml(f.pageTitle || f.pageUrl)}</td>
        <td>${escapeHtml(f.message)}</td>
        <td><code>${escapeHtml(f.selector)}</code></td>
        <td><a href="https://www.w3.org/WAI/WCAG22/Understanding/${f.wcagCriterion.replace(/\./g, '')}" target="_blank">${escapeHtml(f.wcagCriterion)} (${f.wcagLevel})</a></td>
        <td>${escapeHtml(f.category)}</td>
        <td class="remediation-cell">${escapeHtml(f.remediation)}</td>
        ${f.screenshot ? `<td><img src="data:image/png;base64,${f.screenshot}" class="screenshot-thumb" alt="Screenshot of issue"></td>` : '<td></td>'}
      </tr>`,
    )
    .join('');

  return `
    <table class="findings-table" id="findingsTable">
      <thead>
        <tr>
          <th>#</th>
          <th onclick="sortTable(1)">Severity ⇅</th>
          <th onclick="sortTable(2)">Page ⇅</th>
          <th onclick="sortTable(3)">Issue ⇅</th>
          <th>Element</th>
          <th onclick="sortTable(5)">WCAG ⇅</th>
          <th onclick="sortTable(6)">Category ⇅</th>
          <th>Remediation</th>
          <th>Screenshot</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function buildStyles(): string {
  return `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
      .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }
      header { background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); color: white; padding: 2rem; border-radius: 12px; margin-bottom: 2rem; }
      header h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
      header .meta { opacity: 0.8; font-size: 0.9rem; }
      header .meta span { margin-right: 2rem; }

      .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
      .card { background: white; border-radius: 10px; padding: 1.5rem; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-top: 4px solid #94a3b8; }
      .card-number { font-size: 2.5rem; font-weight: 700; }
      .card-label { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-top: 0.25rem; }
      .card-critical { border-top-color: ${SEVERITY_COLORS.critical}; }
      .card-critical .card-number { color: ${SEVERITY_COLORS.critical}; }
      .card-major { border-top-color: ${SEVERITY_COLORS.major}; }
      .card-major .card-number { color: ${SEVERITY_COLORS.major}; }
      .card-minor { border-top-color: ${SEVERITY_COLORS.minor}; }
      .card-minor .card-number { color: ${SEVERITY_COLORS.minor}; }
      .card-advisory { border-top-color: ${SEVERITY_COLORS.advisory}; }
      .card-advisory .card-number { color: ${SEVERITY_COLORS.advisory}; }

      .chart-section { background: white; border-radius: 10px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .chart-section h3 { margin-bottom: 1rem; font-size: 1.1rem; color: #334155; }
      .bar-chart { display: flex; height: 40px; border-radius: 6px; overflow: hidden; }
      .bar-segment { display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 0.85rem; min-width: 2rem; transition: width 0.3s; }
      .legend { display: flex; gap: 1.5rem; margin-top: 0.75rem; flex-wrap: wrap; }
      .legend-item { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; }
      .legend-dot { width: 12px; height: 12px; border-radius: 3px; }

      .h-bar-row { display: flex; align-items: center; margin-bottom: 0.5rem; }
      .h-bar-label { width: 160px; font-size: 0.85rem; text-align: right; padding-right: 1rem; color: #475569; }
      .h-bar-track { flex: 1; background: #e2e8f0; border-radius: 4px; height: 24px; }
      .h-bar-fill { background: #3b82f6; height: 100%; border-radius: 4px; display: flex; align-items: center; justify-content: flex-end; padding-right: 0.5rem; color: white; font-size: 0.75rem; font-weight: 600; min-width: 2rem; }

      .badge { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em; }
      .severity-critical { background: ${SEVERITY_BG.critical}; color: ${SEVERITY_COLORS.critical}; border: 1px solid ${SEVERITY_COLORS.critical}; }
      .severity-major { background: ${SEVERITY_BG.major}; color: ${SEVERITY_COLORS.major}; border: 1px solid ${SEVERITY_COLORS.major}; }
      .severity-minor { background: ${SEVERITY_BG.minor}; color: ${SEVERITY_COLORS.minor}; border: 1px solid ${SEVERITY_COLORS.minor}; }
      .severity-advisory { background: ${SEVERITY_BG.advisory}; color: ${SEVERITY_COLORS.advisory}; border: 1px solid ${SEVERITY_COLORS.advisory}; }

      h2 { font-size: 1.3rem; color: #1e293b; margin: 2rem 0 1rem; }
      .findings-table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .findings-table th { background: #f1f5f9; padding: 0.75rem 1rem; text-align: left; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; cursor: pointer; user-select: none; border-bottom: 2px solid #e2e8f0; }
      .findings-table td { padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem; vertical-align: top; }
      .findings-table tr:hover { background: #f8fafc; }
      .severity-row-critical { border-left: 3px solid ${SEVERITY_COLORS.critical}; }
      .severity-row-major { border-left: 3px solid ${SEVERITY_COLORS.major}; }
      .severity-row-minor { border-left: 3px solid ${SEVERITY_COLORS.minor}; }
      .severity-row-advisory { border-left: 3px solid ${SEVERITY_COLORS.advisory}; }
      .url-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .remediation-cell { max-width: 300px; }
      code { background: #f1f5f9; padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.8rem; }
      a { color: #2563eb; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .screenshot-thumb { max-width: 120px; max-height: 80px; border-radius: 4px; border: 1px solid #e2e8f0; }
      footer { text-align: center; margin-top: 3rem; padding: 1.5rem; color: #94a3b8; font-size: 0.8rem; }

      @media print {
        body { background: white; }
        .container { padding: 0; }
        header { border-radius: 0; }
        .card, .chart-section, .findings-table { box-shadow: none; border: 1px solid #e2e8f0; }
      }
    </style>`;
}

function buildScript(): string {
  return `
    <script>
      const severityRank = { CRITICAL: 0, MAJOR: 1, MINOR: 2, ADVISORY: 3 };
      function sortTable(colIdx) {
        const table = document.getElementById('findingsTable');
        const tbody = table.tBodies[0];
        const rows = Array.from(tbody.rows);
        const dir = table.dataset.sortDir === 'asc' ? 'desc' : 'asc';
        table.dataset.sortDir = dir;
        rows.sort((a, b) => {
          let aVal = a.cells[colIdx].textContent.trim();
          let bVal = b.cells[colIdx].textContent.trim();
          if (colIdx === 1) { aVal = severityRank[aVal] ?? 9; bVal = severityRank[bVal] ?? 9; }
          if (typeof aVal === 'number') return dir === 'asc' ? aVal - bVal : bVal - aVal;
          return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        });
        rows.forEach(r => tbody.appendChild(r));
      }
    </script>`;
}

/** Generate a self-contained HTML report */
export function generateHtmlReport(result: ScanResult): string {
  const duration = result.durationMs >= 1000
    ? `${(result.durationMs / 1000).toFixed(1)}s`
    : `${result.durationMs}ms`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessibility Scan Report — ${escapeHtml(result.config.url)}</title>
  ${buildStyles()}
</head>
<body>
  <div class="container">
    <header>
      <h1>♿ Smart A11y Scanner Report</h1>
      <div class="meta">
        <span>🔗 <strong>${escapeHtml(result.config.url)}</strong></span>
        <span>🕐 ${escapeHtml(result.startedAt)}</span>
        <span>⏱ ${duration}</span>
        <span>📄 ${result.summary.totalPages} pages</span>
        <span>🔍 Depth: ${result.config.maxDepth}</span>
      </div>
    </header>

    ${buildSummaryCards(result)}
    ${buildSeverityChart(result)}
    ${buildCategoryChart(result)}

    <h2>📋 Detailed Findings (${result.summary.totalFindings})</h2>
    ${buildFindingsTable(result)}

    <footer>
      Generated by Smart A11y Scanner v0.1.0
    </footer>
  </div>
  ${buildScript()}
</body>
</html>`;
}
