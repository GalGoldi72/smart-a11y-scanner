/**
 * HTML report format — self-contained, professional accessibility scan report.
 * Inline CSS, no external dependencies. Looks good printed or in a browser.
 */

import type { ScanResult, Finding, PageResult, GuidedExplorationResult, GuidedStepResult } from '../../scanner/types.js';
import type { Severity } from '../../rules/types.js';

const STRATEGY_DISPLAY: Record<string, { icon: string; name: string }> = {
  'coverage-completion': { icon: '📋', name: 'Coverage Completion' },
  'depth-completion': { icon: '🔍', name: 'Depth Completion' },
  'cross-page-transfer': { icon: '🔄', name: 'Cross-Page Transfer' },
  'element-type-coverage': { icon: '🎯', name: 'Element Type Coverage' },
  'edge-case-generation': { icon: '🤖', name: 'Edge Cases (AI)' },
};

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#dc2626',
  serious: '#ea580c',
  moderate: '#ca8a04',
  minor: '#2563eb',
};

const SEVERITY_BG: Record<Severity, string> = {
  critical: '#fef2f2',
  serious: '#fff7ed',
  moderate: '#fefce8',
  minor: '#eff6ff',
};

const SEVERITY_ORDER: Severity[] = ['critical', 'serious', 'moderate', 'minor'];

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
      <div class="card card-serious">
        <div class="card-number">${s.bySeverity.serious}</div>
        <div class="card-label">Serious</div>
      </div>
      <div class="card card-moderate">
        <div class="card-number">${s.bySeverity.moderate}</div>
        <div class="card-label">Moderate</div>
      </div>
      <div class="card card-minor">
        <div class="card-number">${s.bySeverity.minor}</div>
        <div class="card-label">Minor</div>
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

function buildReproSteps(steps: string[]): string {
  let html = `
        <div class="repro-steps">
          <h4 class="repro-title">🔄 Reproduction Steps</h4>
          <ol class="steps-timeline">`;
  for (const step of steps) {
    html += `
            <li class="step-item">
              <span class="step-text">${escapeHtml(step)}</span>
            </li>`;
  }
  html += `
          </ol>
        </div>`;
  return html;
}

/** Map WCAG SC numbers to their W3C Understanding document slugs */
const WCAG_SC_SLUGS: Record<string, string> = {
  '1.1.1': 'non-text-content',
  '1.2.1': 'audio-only-and-video-only-prerecorded',
  '1.2.2': 'captions-prerecorded',
  '1.2.3': 'audio-description-or-media-alternative-prerecorded',
  '1.2.4': 'captions-live',
  '1.2.5': 'audio-description-prerecorded',
  '1.3.1': 'info-and-relationships',
  '1.3.2': 'meaningful-sequence',
  '1.3.3': 'sensory-characteristics',
  '1.3.4': 'orientation',
  '1.3.5': 'identify-input-purpose',
  '1.4.1': 'use-of-color',
  '1.4.2': 'audio-control',
  '1.4.3': 'contrast-minimum',
  '1.4.4': 'resize-text',
  '1.4.5': 'images-of-text',
  '1.4.10': 'reflow',
  '1.4.11': 'non-text-contrast',
  '1.4.12': 'text-spacing',
  '1.4.13': 'content-on-hover-or-focus',
  '2.1.1': 'keyboard',
  '2.1.2': 'no-keyboard-trap',
  '2.1.4': 'character-key-shortcuts',
  '2.2.1': 'timing-adjustable',
  '2.2.2': 'pause-stop-hide',
  '2.3.1': 'three-flashes-or-below-threshold',
  '2.4.1': 'bypass-blocks',
  '2.4.2': 'page-titled',
  '2.4.3': 'focus-order',
  '2.4.4': 'link-purpose-in-context',
  '2.4.5': 'multiple-ways',
  '2.4.6': 'headings-and-labels',
  '2.4.7': 'focus-visible',
  '2.4.11': 'focus-not-obscured-minimum',
  '2.5.1': 'pointer-gestures',
  '2.5.2': 'pointer-cancellation',
  '2.5.3': 'label-in-name',
  '2.5.4': 'motion-actuation',
  '2.5.7': 'dragging-movements',
  '2.5.8': 'target-size-minimum',
  '3.1.1': 'language-of-page',
  '3.1.2': 'language-of-parts',
  '3.2.1': 'on-focus',
  '3.2.2': 'on-input',
  '3.2.6': 'consistent-help',
  '3.3.1': 'error-identification',
  '3.3.2': 'labels-or-instructions',
  '3.3.3': 'error-suggestion',
  '3.3.4': 'error-prevention-legal-financial-data',
  '3.3.7': 'redundant-entry',
  '3.3.8': 'accessible-authentication-minimum',
  '4.1.1': 'parsing',
  '4.1.2': 'name-role-value',
  '4.1.3': 'status-messages',
};

function wcagUnderstandingUrl(criterion: string): string {
  const slug = WCAG_SC_SLUGS[criterion];
  if (slug) return `https://www.w3.org/WAI/WCAG22/Understanding/${slug}`;
  // Fallback: use the W3C quickref with the criterion number
  return `https://www.w3.org/WAI/WCAG22/quickref/#${criterion.replace(/\./g, '')}`;
}

function buildFindingCard(f: Finding, index: number, pageLabel?: string): string {
  const wcagUrl = wcagUnderstandingUrl(f.wcagCriterion);

  let card = `
      <div class="finding-card severity-border-${f.severity}" data-severity="${escapeHtml(f.severity)}" data-category="${escapeHtml(f.category)}">
        <div class="finding-header">
          <span class="finding-index">#${index}</span>
          ${severityBadge(f.severity)}
          <span class="finding-rule">${escapeHtml(f.ruleId)}</span>
          <a class="wcag-ref" href="${wcagUrl}" target="_blank">${escapeHtml(f.wcagCriterion)} (${f.wcagLevel})</a>${pageLabel ? `
          <span class="sv-page-origin">📄 ${escapeHtml(pageLabel)}</span>` : ''}
        </div>
        <div class="finding-body">
          <p class="finding-message">${escapeHtml(f.message)}</p>
          <div class="finding-element">
            <div class="element-label">Element</div>
            <code>${escapeHtml(f.selector)}</code>`;

  if (f.htmlSnippet) {
    card += `
            <pre class="html-snippet">${escapeHtml(f.htmlSnippet)}</pre>`;
  }

  card += `
          </div>`;

  if (f.reproSteps?.length) {
    card += buildReproSteps(f.reproSteps);
  }

  if (f.screenshot) {
    card += `
        <div class="finding-screenshot">
          <img src="data:image/png;base64,${f.screenshot}" alt="Screenshot of accessibility issue" class="screenshot-thumb" onclick="openLightbox(this)">
          <span class="screenshot-label">Click to enlarge</span>
        </div>`;
  }

  card += `
          <div class="finding-remediation">
            <span class="remediation-icon">💡</span>
            <div class="remediation-text">
              <strong>Remediation</strong>
              <p>${escapeHtml(f.remediation)}</p>
            </div>
          </div>
        </div>
      </div>`;

  return card;
}

function buildTestPlanSection(guidedResults: GuidedExplorationResult): string {
  const { totalSteps, successfulSteps, failedSteps, totalFindings, stepResults } = guidedResults;

  let stepsHtml = '';
  for (const step of stepResults) {
    const statusClass = step.success ? 'step-success' : 'step-failed';
    const directCount = step.findings.length;
    const exploreCount = step.explorationFindings.length;

    stepsHtml += `
      <div class="tp-step-card ${statusClass}">
        <div class="tp-step-number">${step.stepIndex + 1}</div>
        <div class="tp-step-content">
          <div class="tp-step-text">${escapeHtml(step.stepText)}</div>
          <div class="tp-step-action">${escapeHtml(step.action)}</div>
          <div class="tp-step-url">${escapeHtml(step.urlAfterStep)}</div>
          <div class="tp-step-findings">${directCount} direct + ${exploreCount} explored finding${directCount + exploreCount !== 1 ? 's' : ''}</div>`;

    if (step.screenshot) {
      stepsHtml += `
          <div class="tp-step-screenshot">
            <img src="data:image/png;base64,${step.screenshot}" alt="Screenshot after step ${step.stepIndex + 1}" class="screenshot-thumb" onclick="openLightbox(this)">
          </div>`;
    }

    if (step.error) {
      stepsHtml += `
          <div class="tp-step-error">⚠️ ${escapeHtml(step.error)}</div>`;
    }

    stepsHtml += `
        </div>
      </div>`;
  }

  return `
    <div class="test-plan-section">
      <h2>📋 Test Plan Execution</h2>
      <div class="test-plan-summary">
        <span class="tp-stat">Steps: ${totalSteps}</span>
        <span class="tp-stat tp-success">✅ Passed: ${successfulSteps}</span>
        <span class="tp-stat tp-failed">❌ Failed: ${failedSteps}</span>
        <span class="tp-stat">Findings: ${totalFindings}</span>
      </div>
      <div class="tp-step-timeline">
        ${stepsHtml}
      </div>
    </div>`;
}

function buildLearningSummarySection(result: ScanResult): string {
  const ls = (result as any).learningSummary;
  if (!ls) return '';

  return `
    <div class="ai-learning-section">
      <h2>📚 Learning Summary</h2>
      <div class="ai-learning-stats">
        <span class="ai-stat">Page patterns: ${ls.pagePatterns}</span>
        <span class="ai-stat">Interaction patterns: ${ls.interactionPatterns}</span>
        <span class="ai-stat">Coverage gaps found: ${ls.coverageGaps}</span>
        <span class="ai-stat ai-stat-muted">Saved to: ${escapeHtml(ls.patternFile)}</span>
      </div>
    </div>`;
}

function buildGenerationSummarySection(result: ScanResult): string {
  const gs = (result as any).generationSummary;
  if (!gs) return '';

  const strategies = gs.strategies as Record<string, number> | undefined;
  let strategyHtml = '';
  if (strategies) {
    const badges = Object.entries(strategies)
      .filter(([, count]) => (count as number) > 0)
      .map(([key, count]) => {
        const display = STRATEGY_DISPLAY[key] ?? { icon: '⚙️', name: key };
        return `
        <div class="ai-strategy-badge ai-strategy-${escapeHtml(key)}">
          <span class="ai-strategy-icon">${display.icon}</span>
          <span class="ai-strategy-name">${escapeHtml(display.name)}</span>
          <span class="ai-strategy-count">${count}</span>
        </div>`;
      })
      .join('');

    if (badges) {
      strategyHtml = `
      <div class="ai-strategy-breakdown">
        ${badges}
      </div>`;
    }
  }

  return `
    <div class="ai-generated-section">
      <h2>🧪 AI-Generated Tests</h2>
      <div class="ai-generation-summary">
        <span class="ai-stat">Generated: ${gs.scenariosGenerated}</span>
        <span class="ai-stat">Executed: ${gs.scenariosExecuted}</span>
        <span class="ai-stat ai-stat-success">✅ Succeeded: ${gs.scenariosSucceeded}</span>
        <span class="ai-stat">Findings: ${gs.findingsFromGenerated}</span>
      </div>
      ${strategyHtml}
    </div>`;
}

function buildFilterToolbar(result: ScanResult): string {
  const categories = new Set<string>();
  for (const page of result.pages) {
    for (const f of page.findings) {
      categories.add(f.category);
    }
  }
  const sortedCategories = [...categories].sort();
  const total = result.summary.totalFindings;

  const severityButtons = SEVERITY_ORDER.map(sev =>
    `<button class="filter-btn filter-sev-btn active" data-filter-severity="${sev}" style="--filter-color:${SEVERITY_COLORS[sev]};--filter-bg:${SEVERITY_BG[sev]}">${sev.charAt(0).toUpperCase() + sev.slice(1)}</button>`
  ).join('');

  const categoryButtons = sortedCategories.map(cat =>
    `<button class="filter-btn filter-cat-btn active" data-filter-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`
  ).join('');

  return `
    <div class="filter-toolbar" id="filter-toolbar">
      <div class="filter-row">
        <div class="filter-group">
          <span class="filter-label">Severity:</span>
          <div class="filter-buttons" id="severity-filters">${severityButtons}</div>
        </div>
        <div class="filter-group">
          <span class="filter-label">Category:</span>
          <div class="filter-buttons" id="category-filters">${categoryButtons}</div>
        </div>
      </div>
      <div class="filter-row filter-bottom-row">
        <div class="filter-counter" id="filter-counter">Showing ${total} of ${total} findings</div>
        <div class="view-toggle">
          <button class="view-btn active" data-view="page" id="view-page-btn">By Page</button>
          <button class="view-btn" data-view="severity" id="view-severity-btn">By Severity</button>
        </div>
      </div>
    </div>`;
}

function buildSeverityView(result: ScanResult): string {
  const allFindings: { finding: Finding; pageTitle: string }[] = [];
  for (const page of result.pages) {
    for (const f of page.findings) {
      allFindings.push({ finding: f, pageTitle: page.metadata.title || page.url });
    }
  }
  allFindings.sort((a, b) => SEVERITY_ORDER.indexOf(a.finding.severity) - SEVERITY_ORDER.indexOf(b.finding.severity));

  let html = '';
  for (const [i, item] of allFindings.entries()) {
    html += buildFindingCard(item.finding, i + 1, item.pageTitle);
  }
  return html;
}

function buildPageSections(result: ScanResult): string {
  let html = '';

  for (const [pageIdx, page] of result.pages.entries()) {
    const sortedFindings = [...page.findings].sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    );

    html += `
    <div class="page-section" data-page-id="${pageIdx}">
      <div class="page-header">
        <h3 class="page-title">${escapeHtml(page.metadata.title || page.url)}</h3>
        <div class="page-meta">
          <span class="page-url">${escapeHtml(page.url)}</span>
          <span class="page-stats">${page.findings.length} finding${page.findings.length !== 1 ? 's' : ''} · ${page.analysisTimeMs}ms</span>
        </div>
      </div>`;

    if (page.screenshot) {
      html += `
      <div class="state-screenshot-container">
        <img src="data:image/png;base64,${page.screenshot}" alt="Page state screenshot" class="state-screenshot" onclick="openLightbox(this)">
        <span class="state-screenshot-label">Page State</span>
      </div>`;
    }

    if (page.error) {
      html += `<div class="page-error">⚠️ ${escapeHtml(page.error)}</div>`;
    }

    if (sortedFindings.length === 0) {
      html += `<div class="no-findings">✅ No accessibility issues found on this page.</div>`;
    }

    for (const [i, f] of sortedFindings.entries()) {
      html += buildFindingCard(f, i + 1);
    }

    html += `
    </div>`;
  }

  return html;
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
      .card-serious { border-top-color: ${SEVERITY_COLORS.serious}; }
      .card-serious .card-number { color: ${SEVERITY_COLORS.serious}; }
      .card-moderate { border-top-color: ${SEVERITY_COLORS.moderate}; }
      .card-moderate .card-number { color: ${SEVERITY_COLORS.moderate}; }
      .card-minor { border-top-color: ${SEVERITY_COLORS.minor}; }
      .card-minor .card-number { color: ${SEVERITY_COLORS.minor}; }

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
      .severity-serious { background: ${SEVERITY_BG.serious}; color: ${SEVERITY_COLORS.serious}; border: 1px solid ${SEVERITY_COLORS.serious}; }
      .severity-moderate { background: ${SEVERITY_BG.moderate}; color: ${SEVERITY_COLORS.moderate}; border: 1px solid ${SEVERITY_COLORS.moderate}; }
      .severity-minor { background: ${SEVERITY_BG.minor}; color: ${SEVERITY_COLORS.minor}; border: 1px solid ${SEVERITY_COLORS.minor}; }

      h2 { font-size: 1.3rem; color: #1e293b; margin: 2rem 0 1rem; }
      .findings-table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .findings-table th { background: #f1f5f9; padding: 0.75rem 1rem; text-align: left; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; cursor: pointer; user-select: none; border-bottom: 2px solid #e2e8f0; }
      .findings-table td { padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem; vertical-align: top; }
      .findings-table tr:hover { background: #f8fafc; }
      .severity-row-critical { border-left: 3px solid ${SEVERITY_COLORS.critical}; }
      .severity-row-serious { border-left: 3px solid ${SEVERITY_COLORS.serious}; }
      .severity-row-moderate { border-left: 3px solid ${SEVERITY_COLORS.moderate}; }
      .severity-row-minor { border-left: 3px solid ${SEVERITY_COLORS.minor}; }
      .url-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .remediation-cell { max-width: 300px; }
      code { background: #f1f5f9; padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.8rem; }
      a { color: #2563eb; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .screenshot-thumb { max-width: 120px; max-height: 80px; border-radius: 4px; border: 1px solid #e2e8f0; }
      footer { text-align: center; margin-top: 3rem; padding: 1.5rem; color: #94a3b8; font-size: 0.8rem; }

      /* Page sections */
      .page-section { margin-bottom: 2.5rem; }
      .page-header { background: white; border-radius: 10px 10px 0 0; padding: 1.25rem 1.5rem; border-bottom: 2px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .page-title { font-size: 1.1rem; color: #1e293b; margin-bottom: 0.25rem; }
      .page-meta { display: flex; gap: 1.5rem; font-size: 0.8rem; color: #64748b; flex-wrap: wrap; }
      .page-url { word-break: break-all; }
      .page-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 0.75rem 1rem; margin: 0.75rem 0; color: #991b1b; font-size: 0.85rem; }
      .no-findings { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 0.75rem 1rem; margin: 0.75rem 0; color: #166534; font-size: 0.85rem; }

      /* State screenshots */
      .state-screenshot-container { margin: 1rem 0; text-align: center; }
      .state-screenshot { max-width: 100%; max-height: 300px; border-radius: 8px; border: 1px solid #e2e8f0; cursor: pointer; transition: transform 0.2s; }
      .state-screenshot:hover { transform: scale(1.02); }
      .state-screenshot-label { display: block; font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem; }

      /* Finding cards */
      .finding-card { background: white; border-radius: 8px; margin: 0.75rem 0; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden; border-left: 4px solid #94a3b8; }
      .severity-border-critical { border-left-color: ${SEVERITY_COLORS.critical}; }
      .severity-border-serious { border-left-color: ${SEVERITY_COLORS.serious}; }
      .severity-border-moderate { border-left-color: ${SEVERITY_COLORS.moderate}; }
      .severity-border-minor { border-left-color: ${SEVERITY_COLORS.minor}; }
      .finding-header { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1.25rem; background: #f8fafc; border-bottom: 1px solid #f1f5f9; flex-wrap: wrap; }
      .finding-index { font-weight: 700; color: #64748b; font-size: 0.85rem; }
      .finding-rule { font-family: monospace; font-size: 0.8rem; color: #475569; background: #e2e8f0; padding: 0.1rem 0.5rem; border-radius: 3px; }
      .wcag-ref { font-size: 0.8rem; margin-left: auto; }
      .finding-body { padding: 1rem 1.25rem; }
      .finding-message { font-size: 0.95rem; color: #1e293b; margin-bottom: 0.75rem; line-height: 1.5; }
      .finding-element { background: #f8fafc; border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 0.75rem; }
      .element-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 0.25rem; }
      .html-snippet { background: #1e293b; color: #e2e8f0; padding: 0.75rem 1rem; border-radius: 4px; font-size: 0.8rem; overflow-x: auto; margin-top: 0.5rem; white-space: pre-wrap; word-break: break-all; }

      /* Repro steps timeline */
      .repro-steps { margin: 1rem 0; }
      .repro-title { font-size: 0.9rem; color: #334155; margin-bottom: 0.75rem; }
      .steps-timeline { counter-reset: step-counter; list-style: none; padding: 0; margin: 0; position: relative; padding-left: 42px; }
      .steps-timeline::before { content: ''; position: absolute; left: 15px; top: 18px; bottom: 18px; width: 2px; background: #cbd5e1; }
      .step-item { position: relative; padding: 0.4rem 0; }
      .step-item::before { content: counter(step-counter); counter-increment: step-counter; position: absolute; left: -42px; width: 30px; height: 30px; border-radius: 50%; background: #3b82f6; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; z-index: 1; }
      .step-text { font-size: 0.85rem; color: #334155; line-height: 1.4; display: block; padding-top: 0.3rem; }

      /* Test plan execution section */
      .test-plan-section { background: white; border-radius: 10px; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .test-plan-section h2 { margin: 0 0 1rem; }
      .test-plan-summary { display: flex; gap: 1.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
      .tp-stat { font-size: 0.95rem; font-weight: 600; color: #475569; padding: 0.4rem 0.8rem; background: #f1f5f9; border-radius: 6px; }
      .tp-success { color: #166534; background: #f0fdf4; }
      .tp-failed { color: #991b1b; background: #fef2f2; }
      .tp-step-timeline { position: relative; padding-left: 48px; }
      .tp-step-timeline::before { content: ''; position: absolute; left: 20px; top: 24px; bottom: 24px; width: 3px; background: #cbd5e1; border-radius: 2px; }
      .tp-step-card { position: relative; display: flex; gap: 1rem; margin-bottom: 1.25rem; }
      .tp-step-number { position: absolute; left: -48px; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; font-weight: 700; color: white; z-index: 1; flex-shrink: 0; }
      .tp-step-card.step-success .tp-step-number { background: #16a34a; }
      .tp-step-card.step-failed .tp-step-number { background: #dc2626; }
      .tp-step-content { flex: 1; background: #f8fafc; border-radius: 8px; padding: 1rem 1.25rem; border: 1px solid #e2e8f0; }
      .tp-step-card.step-success .tp-step-content { border-left: 3px solid #16a34a; }
      .tp-step-card.step-failed .tp-step-content { border-left: 3px solid #dc2626; }
      .tp-step-text { font-size: 0.95rem; font-weight: 600; color: #1e293b; margin-bottom: 0.35rem; }
      .tp-step-action { font-size: 0.8rem; color: #64748b; font-family: monospace; margin-bottom: 0.25rem; }
      .tp-step-url { font-size: 0.8rem; color: #2563eb; word-break: break-all; margin-bottom: 0.25rem; }
      .tp-step-findings { font-size: 0.8rem; color: #475569; }
      .tp-step-screenshot { margin-top: 0.5rem; }
      .tp-step-screenshot img { max-width: 200px; max-height: 140px; border-radius: 4px; border: 1px solid #e2e8f0; cursor: pointer; transition: transform 0.2s; }
      .tp-step-screenshot img:hover { transform: scale(1.03); }
      .tp-step-error { margin-top: 0.5rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 0.5rem 0.75rem; color: #991b1b; font-size: 0.8rem; }

      /* AI Learning & Generation sections */
      .ai-learning-section, .ai-generated-section { background: white; border-radius: 10px; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .ai-learning-section h2, .ai-generated-section h2 { margin: 0 0 1rem; }
      .ai-learning-stats, .ai-generation-summary { display: flex; gap: 1.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
      .ai-stat { font-size: 0.95rem; font-weight: 600; color: #475569; padding: 0.4rem 0.8rem; background: #f1f5f9; border-radius: 6px; }
      .ai-stat-success { color: #166534; background: #f0fdf4; }
      .ai-stat-muted { color: #64748b; font-weight: 400; font-size: 0.85rem; }
      .ai-strategy-breakdown { display: flex; gap: 0.75rem; flex-wrap: wrap; }
      .ai-strategy-badge { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
      .ai-strategy-icon { font-size: 1.1rem; }
      .ai-strategy-name { font-size: 0.85rem; color: #334155; font-weight: 500; }
      .ai-strategy-count { font-size: 0.85rem; font-weight: 700; color: #1e293b; background: #e2e8f0; padding: 0.1rem 0.5rem; border-radius: 4px; }

      /* Finding screenshots */
      .finding-screenshot { margin: 1rem 0; }
      .screenshot-thumb { max-width: 280px; max-height: 200px; border-radius: 6px; border: 1px solid #e2e8f0; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
      .screenshot-thumb:hover { transform: scale(1.03); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
      .screenshot-label { display: block; font-size: 0.7rem; color: #94a3b8; margin-top: 0.25rem; }

      /* Remediation */
      .finding-remediation { display: flex; gap: 0.75rem; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 0.75rem 1rem; margin-top: 0.75rem; }
      .remediation-icon { font-size: 1.2rem; flex-shrink: 0; }
      .remediation-text { font-size: 0.85rem; color: #166534; }
      .remediation-text strong { display: block; margin-bottom: 0.15rem; }
      .remediation-text p { margin: 0; line-height: 1.4; }

      /* Lightbox overlay */
      .lightbox-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 9999; cursor: pointer; align-items: center; justify-content: center; }
      .lightbox-overlay.active { display: flex; }
      .lightbox-overlay img { max-width: 90vw; max-height: 90vh; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }

      /* Filter toolbar */
      .filter-toolbar { background: white; border-radius: 10px; padding: 1rem 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); position: sticky; top: 0; z-index: 100; border: 1px solid #e2e8f0; }
      .filter-row { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; }
      .filter-row + .filter-row { margin-top: 0.75rem; }
      .filter-group { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .filter-label { font-size: 0.8rem; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
      .filter-buttons { display: flex; gap: 0.35rem; flex-wrap: wrap; }
      .filter-btn { padding: 0.3rem 0.75rem; border-radius: 6px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 0.8rem; font-weight: 500; cursor: pointer; transition: all 0.15s; color: #94a3b8; }
      .filter-btn:hover { border-color: #94a3b8; }
      .filter-sev-btn.active { background: var(--filter-bg); border-color: var(--filter-color); color: var(--filter-color); font-weight: 600; box-shadow: 0 0 0 1px var(--filter-color); }
      .filter-cat-btn.active { background: #eff6ff; border-color: #3b82f6; color: #2563eb; font-weight: 600; }
      .filter-bottom-row { justify-content: space-between; }
      .filter-counter { font-size: 0.85rem; color: #64748b; font-weight: 500; }
      .view-toggle { display: flex; border-radius: 6px; overflow: hidden; border: 1px solid #e2e8f0; }
      .view-btn { padding: 0.3rem 0.85rem; border: none; background: #f8fafc; font-size: 0.8rem; font-weight: 500; cursor: pointer; transition: all 0.15s; color: #475569; }
      .view-btn:not(:last-child) { border-right: 1px solid #e2e8f0; }
      .view-btn.active { background: #1e3a5f; color: white; }
      .view-btn:hover:not(.active) { background: #e2e8f0; }
      .finding-card-hidden { display: none !important; }
      .page-section-hidden { display: none !important; }
      #severity-view { display: none; }
      .sv-page-origin { font-size: 0.75rem; color: #64748b; background: #f1f5f9; padding: 0.15rem 0.5rem; border-radius: 3px; white-space: nowrap; }

      @media print {
        body { background: white; }
        .container { padding: 0; }
        header { border-radius: 0; }
        .card, .chart-section, .finding-card { box-shadow: none; border: 1px solid #e2e8f0; }
        .lightbox-overlay { display: none !important; }
        .filter-toolbar { display: none !important; }
        #severity-view { display: none !important; }
        .screenshot-thumb { max-width: 200px; }
        .state-screenshot { max-height: 200px; }
      }
    </style>`;
}

function buildScript(): string {
  return `
    <script>
      function openLightbox(img) {
        var overlay = document.getElementById('lightbox');
        var lbImg = document.getElementById('lightbox-img');
        lbImg.src = img.src;
        lbImg.alt = img.alt || 'Enlarged screenshot';
        overlay.classList.add('active');
      }
      function closeLightbox() {
        document.getElementById('lightbox').classList.remove('active');
      }
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeLightbox();
      });

      /* Filter & view toggle */
      (function() {
        var sevBtns = document.querySelectorAll('.filter-sev-btn');
        var catBtns = document.querySelectorAll('.filter-cat-btn');
        var counter = document.getElementById('filter-counter');
        var pageView = document.getElementById('page-view');
        var sevView = document.getElementById('severity-view');
        var viewPageBtn = document.getElementById('view-page-btn');
        var viewSevBtn = document.getElementById('view-severity-btn');
        var currentView = 'page';

        function getActive(btns, attr) {
          var result = [];
          btns.forEach(function(btn) {
            if (btn.classList.contains('active')) result.push(btn.getAttribute(attr));
          });
          return result;
        }

        function applyFilters() {
          var activeSevs = getActive(sevBtns, 'data-filter-severity');
          var activeCats = getActive(catBtns, 'data-filter-category');
          var container = currentView === 'page' ? pageView : sevView;
          var cards = container.querySelectorAll('.finding-card');
          var visible = 0;
          var total = cards.length;

          cards.forEach(function(card) {
            var sev = card.getAttribute('data-severity');
            var cat = card.getAttribute('data-category');
            if (activeSevs.indexOf(sev) !== -1 && activeCats.indexOf(cat) !== -1) {
              card.classList.remove('finding-card-hidden');
              visible++;
            } else {
              card.classList.add('finding-card-hidden');
            }
          });

          if (currentView === 'page') {
            pageView.querySelectorAll('.page-section').forEach(function(section) {
              var vis = section.querySelectorAll('.finding-card:not(.finding-card-hidden)');
              if (vis.length === 0) {
                section.classList.add('page-section-hidden');
              } else {
                section.classList.remove('page-section-hidden');
              }
            });
          }

          counter.textContent = 'Showing ' + visible + ' of ' + total + ' findings';
        }

        sevBtns.forEach(function(btn) {
          btn.addEventListener('click', function() {
            btn.classList.toggle('active');
            applyFilters();
          });
        });

        catBtns.forEach(function(btn) {
          btn.addEventListener('click', function() {
            btn.classList.toggle('active');
            applyFilters();
          });
        });

        viewPageBtn.addEventListener('click', function() {
          if (currentView === 'page') return;
          currentView = 'page';
          pageView.style.display = '';
          sevView.style.display = 'none';
          viewPageBtn.classList.add('active');
          viewSevBtn.classList.remove('active');
          applyFilters();
        });

        viewSevBtn.addEventListener('click', function() {
          if (currentView === 'severity') return;
          currentView = 'severity';
          pageView.style.display = 'none';
          sevView.style.display = 'block';
          viewPageBtn.classList.remove('active');
          viewSevBtn.classList.add('active');
          applyFilters();
        });
      })();
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

    ${result.guidedResults ? buildTestPlanSection(result.guidedResults) : ''}

    ${buildLearningSummarySection(result)}
    ${buildGenerationSummarySection(result)}

    <h2>📋 Detailed Findings (${result.summary.totalFindings})</h2>
    ${buildFilterToolbar(result)}
    <div id="page-view">
    ${buildPageSections(result)}
    </div>
    <div id="severity-view">
    ${buildSeverityView(result)}
    </div>

    <div class="lightbox-overlay" id="lightbox" onclick="closeLightbox()">
      <img id="lightbox-img" src="" alt="Enlarged screenshot">
    </div>

    <footer>
      Generated by Smart A11y Scanner v0.1.0
    </footer>
  </div>
  ${buildScript()}
</body>
</html>`;
}
