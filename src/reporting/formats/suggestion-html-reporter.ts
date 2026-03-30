/**
 * HTML report generator for A11Y test case suggestions.
 * Self-contained dark-themed report following SuperchargeAI template style.
 * Includes collapsible categories and priority filtering.
 */

import type { TestCaseSuggestionResult, SuggestedTestCase, CategorySummary } from '../../types/suggestion-test-case.js';
import type { RuleCategory } from '../../rules/types.js';

const CATEGORY_EMOJI: Record<string, string> = {
  'images': '🖼️',
  'multimedia': '🎬',
  'adaptable': '📐',
  'distinguishable': '🎨',
  'keyboard': '⌨️',
  'timing': '⏱️',
  'seizures': '⚡',
  'navigable': '🧭',
  'input-modalities': '👆',
  'readable': '📖',
  'predictable': '🔄',
  'input-assistance': '💬',
  'compatible': '🔧',
  'aria': '🏷️',
  'forms': '📝',
  'screen-reader': '🔊',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getCategoryEmoji(category: RuleCategory): string {
  return CATEGORY_EMOJI[category] ?? '📋';
}

function buildTestCaseCards(result: TestCaseSuggestionResult): string {
  // Group by category
  const byCategory = new Map<RuleCategory, SuggestedTestCase[]>();
  for (const suggestion of result.suggestions) {
    const existing = byCategory.get(suggestion.category) ?? [];
    existing.push(suggestion);
    byCategory.set(suggestion.category, existing);
  }

  const cards: string[] = [];

  for (const [category, suggestions] of byCategory) {
    const emoji = getCategoryEmoji(category);
    const categoryName = category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');
    const categoryId = category.replace(/\s+/g, '-').toLowerCase();

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    cards.push(`
      <div class="category-section" id="cat-${escapeHtml(categoryId)}">
        <div class="category-header" onclick="toggleCategory('${escapeHtml(categoryId)}')">
          <h3>${emoji} ${escapeHtml(categoryName)} <span class="count-badge">${suggestions.length}</span></h3>
          <span class="toggle-icon">▼</span>
        </div>
        <div class="category-body" id="body-${escapeHtml(categoryId)}">
    `);

    for (const tc of sorted) {
      cards.push(`
        <div class="dim-card test-case-card" data-priority="${tc.priority}">
          <div class="test-case-header">
            <h4>
              TC-${escapeHtml(tc.id)}: ${escapeHtml(tc.title)}
              <span class="badge badge-${tc.priority}">${tc.priority.toUpperCase()}</span>
            </h4>
          </div>
          <div class="test-case-meta">
            <div class="meta-row">
              <strong>WCAG Criterion:</strong> ${escapeHtml(tc.wcagCriteria)} — ${escapeHtml(tc.wcagCriterionName)} (Level ${escapeHtml(tc.wcagLevel)})
            </div>
            <div class="meta-row">
              <strong>Source:</strong> ${escapeHtml(tc.sourceType)}
              ${tc.element ? `<strong>Element:</strong> <code>${escapeHtml(tc.element)}</code>` : ''}
            </div>
          </div>
          <div class="test-case-body">
            <p><strong>Description:</strong> ${escapeHtml(tc.description)}</p>
            <div class="steps-section">
              <strong>Test Steps:</strong>
              <table class="steps-table">
                <thead>
                  <tr><th>#</th><th>Action</th><th>Expected Result</th></tr>
                </thead>
                <tbody>
                  ${tc.steps.map((step, idx) => `<tr><td>${idx + 1}</td><td>${escapeHtml(step.action)}</td><td>${escapeHtml(step.expectedResult)}</td></tr>`).join('\n                  ')}
                </tbody>
              </table>
            </div>
            <div class="rationale-box">
              <strong>💡 Rationale:</strong> ${escapeHtml(tc.rationale)}
            </div>
            ${tc.relatedRuleId ? `<div class="related-rule"><em>Related Rule: ${escapeHtml(tc.relatedRuleId)}</em></div>` : ''}
          </div>
        </div>
      `);
    }

    cards.push(`
        </div>
      </div>
    `);
  }

  return cards.join('\n');
}



export function generateSuggestionHtmlReport(result: TestCaseSuggestionResult): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>A11Y Test Case Suggestions: ${escapeHtml(result.pageTitle)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            padding: 20px;
            color: #e2e8f0;
        }

        /* ── Header ───────────────────────────────────────────── */
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        .header h1 {
            font-size: 2.5em;
            background: linear-gradient(90deg, #00d4ff, #7b2cbf);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
        }
        .header .subtitle {
            color: #8892b0;
            font-size: 1.1em;
            margin-bottom: 16px;
        }
        .header .scan-meta {
            display: flex;
            justify-content: center;
            gap: 32px;
            flex-wrap: wrap;
            color: #8892b0;
            font-size: 0.95em;
        }
        .header .scan-meta span { display: flex; align-items: center; gap: 6px; }

        /* Inline badge */
        .badge { 
            padding: 4px 10px; 
            border-radius: 12px; 
            font-weight: 700; 
            font-size: 0.75em; 
            display: inline-block; 
            margin-left: 8px;
        }
        .badge-high   { background: #dc2626; color: #fff; }
        .badge-medium { background: #eab308; color: #000; }
        .badge-low    { background: #22c55e; color: #000; }

        /* ── Cards ────────────────────────────────────────────── */
        .card {
            background: #0d1117;
            border-radius: 16px;
            padding: 28px 32px;
            margin-bottom: 24px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        }
        .section-title {
            font-size: 1.35em;
            color: #58a6ff;
            margin-bottom: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        /* ── Summary Grid ─────────────────────────────────────── */
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        .summary-item {
            background: #161b22;
            padding: 20px;
            border-radius: 12px;
            text-align: center;
        }
        .summary-number {
            font-size: 2.5em;
            font-weight: 800;
            margin-bottom: 8px;
        }
        .summary-label {
            color: #8892b0;
            font-size: 0.95em;
        }



        /* ── Category Sections────────────────────────────────── */
        .category-section {
            margin-bottom: 20px;
        }
        .category-header {
            background: #161b22;
            padding: 16px 20px;
            border-radius: 12px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: background 0.2s;
        }
        .category-header:hover {
            background: #1c2128;
        }
        .category-header h3 {
            font-size: 1.15em;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .count-badge {
            background: #30363d;
            padding: 2px 10px;
            border-radius: 10px;
            font-size: 0.8em;
            font-weight: 600;
        }
        .toggle-icon {
            font-size: 0.9em;
            transition: transform 0.3s;
        }
        .category-header.collapsed .toggle-icon {
            transform: rotate(-90deg);
        }
        .category-body {
            padding: 16px 0;
            max-height: 10000px;
            overflow: hidden;
            transition: max-height 0.3s ease;
        }
        .category-body.collapsed {
            max-height: 0;
            padding: 0;
        }

        /* ── Test Case Cards ──────────────────────────────────── */
        .dim-card {
            background: #161b22;
            border-radius: 12px;
            padding: 22px 24px;
            margin-bottom: 14px;
            border-left: 4px solid #30363d;
        }
        .test-case-header h4 {
            font-size: 1.05em;
            display: flex;
            align-items: center;
            margin-bottom: 12px;
        }
        .test-case-meta {
            font-size: 0.9em;
            color: #8892b0;
            margin-bottom: 14px;
        }
        .meta-row {
            margin-bottom: 6px;
        }
        .meta-row code {
            background: #0d1117;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Cascadia Code', Consolas, monospace;
            font-size: 0.9em;
            color: #58a6ff;
        }
        .test-case-body {
            font-size: 0.95em;
            line-height: 1.6;
        }
        .test-case-body p {
            margin-bottom: 12px;
        }
        .steps-section {
            margin-bottom: 12px;
        }
        .steps-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
            font-size: 0.92em;
        }
        .steps-table th {
            background: #0d1117;
            text-align: left;
            padding: 10px 12px;
            border-bottom: 2px solid #30363d;
            color: #58a6ff;
            font-weight: 600;
        }
        .steps-table th:first-child {
            width: 36px;
            text-align: center;
        }
        .steps-table td {
            padding: 10px 12px;
            border-bottom: 1px solid #21262d;
            vertical-align: top;
        }
        .steps-table td:first-child {
            text-align: center;
            font-weight: 700;
            color: #8b949e;
        }
        .steps-table tr:hover td {
            background: rgba(88,166,255,0.04);
        }
        .rationale-box {
            margin-top: 12px;
            padding: 12px 16px;
            background: rgba(88,166,255,0.08);
            border-radius: 8px;
            border-left: 3px solid #58a6ff;
            font-size: 0.95em;
        }
        .related-rule {
            margin-top: 10px;
            font-size: 0.85em;
            color: #8892b0;
        }

        /* ── Filter Controls ──────────────────────────────────── */
        .filter-controls {
            display: flex;
            gap: 12px;
            margin-bottom: 20px;
            justify-content: center;
            flex-wrap: wrap;
        }
        .filter-btn {
            background: #161b22;
            color: #e2e8f0;
            border: 1px solid #30363d;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9em;
            transition: all 0.2s;
        }
        .filter-btn:hover {
            background: #1c2128;
            border-color: #58a6ff;
        }
        .filter-btn.active {
            background: #58a6ff;
            color: #000;
            border-color: #58a6ff;
        }

        /* ── Footer ───────────────────────────────────────────── */
        .footer {
            text-align: center;
            margin-top: 40px;
            color: #8892b0;
            font-size: 0.88em;
        }

        /* ── Responsive ───────────────────────────────────────── */
        @media (max-width: 640px) {
            .header h1 { font-size: 1.8em; }
            .summary-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>

    <!-- ═══════════════════════ HEADER ═══════════════════════ -->
    <div class="header">
        <h1>♿ A11Y Test Case Suggestions</h1>
        <div class="subtitle">${escapeHtml(result.pageTitle)}</div>
        <div class="scan-meta">
            <span>🌐 ${escapeHtml(result.url)}</span>
            <span>📅 ${escapeHtml(result.scanDate)}</span>
            <span>⏱️ ${result.duration}s</span>
            <span>🤖 Smart A11y Scanner v0.1.0</span>
        </div>
    </div>

    <!-- ═══════════════════ SUMMARY═══════════════════════ -->
    <div class="card">
        <div class="section-title">📊 Summary</div>
        <div class="summary-grid">
            <div class="summary-item">
                <div class="summary-number">${result.totalSuggestions}</div>
                <div class="summary-label">Total Suggestions</div>
            </div>
            <div class="summary-item">
                <div class="summary-number" style="color:#dc2626;">🔴 ${result.prioritySummary.high}</div>
                <div class="summary-label">High Priority</div>
            </div>
            <div class="summary-item">
                <div class="summary-number" style="color:#eab308;">🟡 ${result.prioritySummary.medium}</div>
                <div class="summary-label">Medium Priority</div>
            </div>
            <div class="summary-item">
                <div class="summary-number" style="color:#22c55e;">🟢 ${result.prioritySummary.low}</div>
                <div class="summary-label">Low Priority</div>
            </div>
        </div>
    </div>

    <!-- ══════════════ DETAILED TEST CASES ═══════════════════ -->
    <div class="card">
        <div class="section-title">🔍 Suggested Test Cases</div>
        
        <div class="filter-controls">
            <button class="filter-btn active" onclick="filterByPriority('all')">All</button>
            <button class="filter-btn" onclick="filterByPriority('high')">🔴 High Priority</button>
            <button class="filter-btn" onclick="filterByPriority('medium')">🟡 Medium Priority</button>
            <button class="filter-btn" onclick="filterByPriority('low')">🟢 Low Priority</button>
        </div>

        ${buildTestCaseCards(result)}
    </div>

    <!-- ══════════════════ FOOTER ═══════════════════════════ -->
    <div class="footer">
        <p>📅 Generated: ${escapeHtml(result.scanDate)} &nbsp;|&nbsp; ♿ Smart A11y Scanner v0.1.0</p>
    </div>

    <script>
        // Toggle category expand/collapse
        function toggleCategory(categoryId) {
            const header = document.querySelector(\`#cat-\${categoryId} .category-header\`);
            const body = document.getElementById(\`body-\${categoryId}\`);
            
            header.classList.toggle('collapsed');
            body.classList.toggle('collapsed');
        }

        // Filter test cases by priority
        let currentFilter = 'all';
        function filterByPriority(priority) {
            currentFilter = priority;
            
            // Update active button
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');

            // Show/hide test cases
            document.querySelectorAll('.test-case-card').forEach(card => {
                if (priority === 'all' || card.dataset.priority === priority) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });

            // Update category counts
            document.querySelectorAll('.category-section').forEach(section => {
                const visibleCards = section.querySelectorAll(\`.test-case-card[style*="display: block"], .test-case-card:not([style*="display: none"])\`);
                const countBadge = section.querySelector('.count-badge');
                if (countBadge) {
                    const visibleCount = Array.from(section.querySelectorAll('.test-case-card')).filter(card => {
                        return priority === 'all' || card.dataset.priority === priority;
                    }).length;
                    countBadge.textContent = visibleCount;
                }
            });
        }
    </script>
</body>
</html>`;
}
