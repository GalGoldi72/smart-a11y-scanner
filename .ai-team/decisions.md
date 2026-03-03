# Decisions

<!-- Append-only. Scribe merges from decisions/inbox/. Do not edit existing entries. -->

## 2026-02-23: DeepExplorer switched from BFS to DFS with breadcrumb tracking
**By:** Naomi
**What:** `deep-explorer.ts` now explores depth-first — when a click produces a state change, it immediately recurses into that state before continuing with sibling elements. Each exploration carries a `BreadcrumbEntry[]` stack that tracks the full navigation path. Every `Finding` gets `reproSteps: string[]` (human-readable breadcrumb) and a `screenshot: string` (base64 PNG). `ExplorationState` gets `stateScreenshot` (full-page) and `navigationPath` (structured breadcrumb).
**Why:** Users reported the scanner was "scanning horizontally" — visiting many elements at the same depth level before going deeper. DFS matches how a human tester would drill into navigation hierarchies, blade panels, and sub-pages. Repro steps are critical for ADO bug filing — QA needs to know exactly how to reproduce each finding. Screenshots at both state and finding level give visual evidence for bug reports without requiring the reviewer to reproduce the scan.

## 2026-02-23: analyzeCurrentPage() accepts optional reproSteps parameter
**By:** Naomi
**What:** `PageAnalyzer.analyzeCurrentPage(page, reproSteps?)` now takes an optional `reproSteps` array that gets stamped onto every finding it produces. Non-breaking — callers without repro steps are unaffected.
**Why:** The breadcrumb is built in `DeepExplorer` during DFS traversal, but the findings are produced by `PageAnalyzer`. Rather than coupling the analyzer to explorer internals, the repro steps are passed as a simple string array at the call boundary. This keeps the analyzer reusable for non-exploration contexts (e.g., direct `analyze()` calls from the engine).

## 2026-02-23: Finding-level screenshots use viewport, state-level use full-page
**By:** Naomi
**What:** `captureViolationScreenshots()` now takes viewport-only screenshots (`fullPage: false`) and attaches them to ALL findings (not just the first). State-level screenshots on `ExplorationState` use `fullPage: true`. DeepExplorer falls back to state screenshot if finding screenshot is missing.
**Why:** Viewport screenshots are smaller and capture what the user actually sees when the finding occurs. Full-page screenshots on states provide context for the overall page layout. Attaching to all findings (instead of just the first) ensures every ADO bug has visual evidence.

## 2025-07-17: HTML report switched from flat table to card-based layout with repro steps and screenshot lightbox
**By:** Alex
**What:** Replaced the single findings table in the HTML report with per-page sections containing finding cards. Each card shows severity, WCAG reference, element info, a numbered repro-steps timeline (CSS counters), a clickable screenshot thumbnail with lightbox overlay, and a remediation callout. Page-level screenshots appear at the top of each page section. JSON report now conditionally includes `reproSteps` and `screenshot` fields.
**Why:** The flat table couldn't accommodate multi-line repro steps or inline screenshots without becoming unreadable. Cards give each finding room to breathe and present evidence (steps + screenshot) in a natural narrative order: what's wrong → how to reproduce → visual proof → how to fix. The lightbox keeps the default view clean (thumbnails) while allowing full-resolution inspection on click. All content stays inline (base64) so the report is a single self-contained HTML file — no external assets to lose.

## 2026-02-23: POC scope definition
**By:** GalGoldi72 (via Copilot)
**What:** POC is strictly: (1) user provides URL, (2) scanner uses user's credentials, (3) scan time limited to 10 minutes, (4) output is a detailed findings file. No ADO bug filing, no UI flow detection wiring, no hybrid scanning in POC.
**Why:** User request — focused demo scope to ship fast.

## 2026-02-23: Use client credentials
**By:** GalGoldi72 (via Copilot)
**What:** The scanner must use the customer's own credentials (their ADO PAT, their browser auth) — not service/app-level credentials. Authentication flows through the client's identity.
**Why:** User request — enterprise customers need scans to run under their own identity for security, audit trail, and permissions alignment.

## 2026-02-23: User directive — use claude-opus-4.6 for all agents
**By:** GalGoldi72 (via Copilot)
**What:** Use claude-opus-4.6 as the model for all agent spawns, overriding default model selection.
**Why:** User request — captured for team memory.

## Scanner types live in `src/scanner/types.ts`
**By:** Naomi
**What:** Scanner-internal types live in `src/scanner/types.ts`. They import from `src/rules/types.ts` (Drummer's rule types). The shared types in `src/types/` are the reporting/CLI boundary. Engine outputs `ScanResult` from `src/scanner/types.ts`; a mapping layer should convert to the shared `ScanResult` at the reporting boundary.
**Why:** Holden scaffolded shared types in `src/types/` (Finding, ScanResult, PageResult, ScanConfig). Naomi needs scanner-internal types for Playwright orchestration (browser config, crawl settings, page metadata, screenshot handling). Each layer has different concerns.

## ADO client exports `IADOClient` interface for `bug-creator.ts`
**By:** Naomi
**What:** `src/ado/client.ts` exports both the `AdoClient` concrete class (implements `IADOClient`) and the interfaces `IADOClient`, `ADOWorkItem`, `ADOCreateResult`. The `bug-creator.ts` consumes the interface; the engine can use the class directly.
**Why:** Holden's `bug-creator.ts` programs against `IADOClient`, `ADOWorkItem`, `ADOCreateResult`. Interface contracts enable loose coupling.

## `tsconfig.json` needs `DOM` and `DOM.Iterable` libs
**By:** Naomi
**What:** Added `"DOM"` and `"DOM.Iterable"` to `tsconfig.json` `lib` array. This is safe since the Node.js-side code doesn't accidentally use DOM globals (they're only inside `page.evaluate()` callbacks).
**Why:** Playwright `page.evaluate()` callbacks execute in the browser and reference `document`, `window`, `NodeListOf`, etc. Without DOM libs, TypeScript can't type-check these.

## Crawler normalizes URLs before visiting
**By:** Naomi
**What:** The `Crawler` strips hashes, removes trailing slashes (except root `/`), and sorts query params before checking the visited set.
**Why:** The same page can appear as `https://site.com/about`, `https://site.com/about/`, `https://site.com/about#section`, etc. This prevents duplicate visits without being overly aggressive.

## Page screenshots attached to first finding per page
**By:** Naomi
**What:** Capture one full-page screenshot per page and attach it to the first finding. Element-level screenshots can be added later as an opt-in feature.
**Why:** Element-level screenshots are expensive (one Playwright locator screenshot per finding). For the POC, we need screenshot evidence but can't afford the perf hit.

## Color contrast computed inline via WCAG luminance formula
**By:** Naomi
**What:** For the POC, compute contrast using `window.getComputedStyle()` on foreground color and background color. Flag elements where both are explicitly set and the ratio fails WCAG thresholds (4.5:1 for normal text, 3:1 for large text). Limit to 20 findings per page to avoid flooding.
**Why:** Full contrast checking requires compositing background layers, handling transparency, gradients, and images. That's complex. This approach is good enough for POC; improve later with layered background resolution.

## ScanEngine public API is `scan(config)` for POC
**By:** Naomi
**What:** Added `scan(config)` as primary public method. `run()` kept as `@deprecated` so CLI and hybrid-scanner don't break. Constructor now accepts optional config.
**Why:** Alex needs `const engine = new ScanEngine(); const result = await engine.scan(config);`.

## AuthConfig replaces old simple auth for customer credentials
**By:** Naomi
**What:** New `AuthConfig` supports three flows: cookie injection, form-based login (auto-detect fields + submit), and env-var fallback (`A11Y_SCANNER_CREDENTIALS=user:pass`). The `waitForSelector` field lets callers confirm auth succeeded.
**Why:** POC requires scanning with the customer's own credentials. Old `auth` was just `{ username, password }` for HTTP basic auth — insufficient for form-based login.

## Scan timeout enforced via deadline pattern
**By:** Naomi
**What:** `ScanConfig.timeout` (default 600000ms) computes a `deadline = Date.now() + timeout`. Crawler receives deadline as parameter, checks before each URL. Engine checks before each page analysis. Current page completes; no new pages start. `ScanResult.timedOut` flag indicates truncation.
**Why:** POC has a 10-minute scan time limit. Need graceful degradation — return partial results, don't crash.

## ScanResult and Finding made self-contained for reporters
**By:** Naomi
**What:** `ScanResult` now includes `url`, `scanDate`, `duration`, `timedOut`, `pagesScanned`, `summary.byWcagLevel`. Each `Finding` carries `pageUrl` and optional `screenshotPath`. Old fields `durationMs`/`startedAt` kept as deprecated.
**Why:** Alex's reporters need comprehensive data without needing to cross-reference between objects.

## Axe-core Integration Strategy
**By:** Naomi
**Date:** 2025-02-23
**Status:** Implemented
**What:** Integrated `@axe-core/playwright` alongside hand-rolled checks. Axe-core findings are preferred for deduplication (richer metadata). Category mapping uses Drummer's RuleCategory type. ARIA role-based element discovery instead of deprecated `page.accessibility.snapshot()`.
**Why:** PageAnalyzer had 6 hand-rolled checks. To reach production-grade coverage (100+ rules), integrated axe-core — the same engine used by Lighthouse and Microsoft Accessibility Insights. Deduplication favors axe-core because it provides richer metadata (helpUrl, detailed failureSummary, precise node targeting).

## ADO Test Case Import & Hybrid Scanning Architecture
**By:** Naomi
**Date:** 2025-07-16
**Status:** Implemented
**What:** Created dedicated ADO types module (`src/ado/types.ts`). Test case importer (`src/ado/test-case-importer.ts`) uses ADO Test Plans API for suite/case enumeration and Work Items API for step XML. Hybrid scanner is a five-phase pipeline: priority scan → guided navigation → automated crawl → gap analysis → enriched bug filing.
**Why:** Customers have existing manual accessibility test cases in ADO Test Plans. They want to combine this manual test intelligence with the scanner's automated crawling for deeper coverage.

## POC CLI Wiring — Alex
**By:** Alex
**Date:** 2025-02-23
**Status:** Implemented
**What:** Dual bin entry for `"smart-a11y-scanner"` and `"a11y-scan"`. Fixed severity alignment to Drummer's canonical type. Auth flags design: `--auth-url`, `--credentials`, env var fallback. Timeout via engine config. ADO filing gated behind `--ado` flag. Changed start script to `node dist/cli.js`.
**Why:** POC demo sprint requires working end-to-end CLI.

## Decisions — Alex POC CLI & Reporting
**By:** Alex
**What:** CLI lives in `src/cli.ts` separate from barrel export. Config loader merges CLI flags > YAML file > defaults. Reporter class takes `ScanResult` and `ReportConfig`. Format generators are stateless functions. `--output` accepts comma-separated formats. Exit codes: 0=no findings, 1=findings, 2=error. Reports named `a11y-report-{ISO-timestamp}.{ext}`. HTML report is self-contained with inline CSS and vanilla JS.
**Why:** One config schema for the whole project. Format generators are stateless and easy to test. Report files should be portable.

## Detection Module Architecture — Bobbie POC
**By:** Bobbie
**Date:** 2025-01-01
**Status:** Implemented
**What:** Detection module own types in `detection/types.ts` (richer ElementInfo). `buildSelector()` duplicated across evaluate calls (unavoidable). CDP event listener detection opt-in and Chromium-only. Form purpose detection uses heuristics, not AI. InteractionSimulator uses DOM snapshots, not MutationObserver. SiteMapper crawl is breadth-first with configurable depth.
**Why:** POC build of the UI detection and flow analysis subsystem. Needed to deliver working code that takes a Playwright Page and returns structured interactive element data + navigation flow graphs.

## Rules Catalog Architecture
**By:** Drummer
**Date:** 2025-07
**Status:** Implemented
**What:** Rules split into 16 category files under `src/rules/categories/`. Severity changed to `critical | serious | moderate | minor` (axe-core alignment). Added RuleCategory (16 categories), AnalysisMode (including 'manual'), AutomationLevel (`full | partial | manual`), and checkFunction field.
**Why:** The accessibility rules catalog needs to cover all WCAG 2.2 success criteria plus best-practice rules. Production-grade coverage requires 100+ rules organized by category.

## Axe-core → Drummer Category Mapping
**By:** Drummer
**Date:** 2025-07
**Status:** Accepted
**What:** Created mapping module (`src/rules/axe-mapping.ts`) that converts axe-core tags → our RuleCategory taxonomy. Key mapping: `cat.color` → `distinguishable`, `cat.text-alternatives` → `images`, `cat.aria` → `aria`, etc.
**Why:** Integrated `@axe-core/playwright` into the scanner. Axe-core uses its own tagging system that needs translation to our `RuleCategory` taxonomy so findings from axe-core appear under the same categories as our custom rules.

## POC Architecture & Interface Contracts
**By:** Holden
**Date:** 2025-02-23
**Status:** Active
**What:** Three config layers are valid (user-facing, engine, detection). Interface contracts define boundaries: `IRuleRunner`, `IFlowAnalyzer`, `IReporter`, `IBugCreator`. `scanner/types.ts` is the canonical engine type system. Files in `src/types/` are barrel re-exports only.
**Why:** Each layer has different concerns. User config is broad. Engine config is focused. Detection config is specialized. Forcing them into one type creates unwanted coupling.

## Packaging Architecture
**By:** Holden
**Date:** 2025-07-14
**Status:** Proposed
**What:** Adopt layered packaging: Core Engine → CLI → Distribution Wrappers. Ship CLI first as foundational channel. All wrappers shell out to CLI and parse JSON output. `ScanResult` JSON is the interchange contract. No business logic in wrappers.
**Why:** Playwright's browser dependency makes CI the strongest deployment target. Layered approach ships CLI fast without refactoring Core.

## POC Readiness Assessment — Holden
**By:** Holden
**Date:** 2025-07-15
**Status:** Assessment complete
**What:** Demo target is `npx smart-a11y-scanner scan https://example.com --output html`. Bin name must be `smart-a11y-scanner`. Config type split (schema.ts vs scanner/types.ts) is acceptable. Drummer's rules catalog regeneration is P1. Detection module is standalone until post-demo.
**Why:** User request — focused demo scope to ship fast.

## Canonical Severity Values
**By:** Holden
**Date:** 2025-07-16
**Status:** Accepted
**What:** Align all code to Drummer's canonical Severity type: `critical | serious | moderate | minor`. Mapping: `major` → `serious`, `advisory` → `moderate`. All files import `Severity` from `rules/types.ts`.
**Why:** `rules/types.ts` is the single source of truth for accessibility terminology (owned by Drummer). Canonical values align with axe-core / WCAG industry conventions.

## POC Test Strategy
**By:** Amos
**Date:** 2025-07-16
**Status:** Proposed
**What:** Test framework is vitest. Three test tiers: engine smoke tests (full pipeline via data: URLs), PageAnalyzer unit tests (per-check rule validation), report unit tests (pure functions). Playwright dependency gracefully skipped if browsers aren't installed. Use `data:text/html,...` URLs. 60s test timeout, 15s scan timeout.
**Why:** POC needs smoke tests to validate the scan pipeline works end-to-end before demo.

## Distribution Strategy
**By:** Avasarala
**Date:** July 2025
**Status:** Proposed
**What:** CLI-first hybrid distribution: Phase 1 — npm CLI (structured output formats), Phase 2 — GitHub Action, Phase 3 — MCP / Copilot Extension. Deferred: VS Code extension, ADO Marketplace, SaaS.
**Why:** CLI is 80% built — lowest time-to-market. GitHub Action is thin wrapper. MCP is strategically important but needs stable core first. VS Code is redundant with MCP.

## PRD Structure & WCAG 2.2 Coverage Model
**By:** Avasarala
**Date:** December 2024
**Status:** Proposed
**What:** Comprehensive PRD organized into three feature tiers: P0 (must-have MVP), P1 (enhanced), P2 (advanced). WCAG 2.2 decomposed into specific checkpoints. 15 user stories with acceptance criteria. Screen reader integration (NVDA) deferred to P2. ADO integration as core feature.
**Why:** Clear prioritization. WCAG 2.2 completeness. User-centric. Risk-managed. Success metrics defined across primary, secondary, operational tiers.


# Decisions — Alex: Test Plan CLI & Report Integration

## 2025-07-17: Test plan CLI flags and report integration

**By:** Alex
**Date:** 2025-07-17
**Status:** Implemented

### What

Added CLI flags for guided test plan scanning:
- `--test-plan <id-or-url>` — ADO plan ID or full test management URL
- `--test-plan-file <path>` — YAML/JSON file input
- `--steps <steps...>` — Inline natural-language steps
- `--explore-depth <n>` — Auto-exploration depth per step
- `--ado-org`, `--ado-project`, `--ado-pat` — ADO connection settings

CLI builds a `TestPlanConfig` object and passes it to `ScanEngine` via `ScanConfig.testPlan`.

Added `guidedResults` section to both HTML and JSON reporters:
- **HTML:** Visual step-by-step timeline with numbered circles (green/red), step text, action, URL, finding counts, screenshot thumbnails with lightbox, and error display. Placed before the detailed findings section.
- **JSON:** Conditional `guidedResults` object with `testPlanSource`, `summary` (step/finding counts), and `stepResults` array. Omitted entirely when no test plan is active.

Added types to `scanner/types.ts`: `TestPlanConfig`, `GuidedStepResult`, `GuidedExplorationResult`, `ScanResult.guidedResults`, `ScanConfig.testPlan`.

### Why

Holden's design doc (holden-ado-test-plan-design.md) Phase 3 (CLI flags) and Phase 8 (report integration) assigned to Alex. Users need CLI access to guided scanning and reports that show per-step results mapped to findings.

### Design Decisions

1. **URL parsing reuse:** Naomi's `parseTestPlanUrl()` in `test-plan-parser.ts` already handles both `dev.azure.com` and `visualstudio.com` URL formats — no duplication needed.
2. **ADO PAT env var:** Falls back to `ADO_PAT` environment variable, consistent with how `A11Y_SCANNER_CREDENTIALS` works for auth.
3. **HTML section placement:** Test plan execution section appears after charts but before detailed findings — gives immediate pass/fail overview before diving into individual issues.
4. **CSS namespace:** Test plan styles use `tp-` prefix to avoid collision with existing `.step-item` / `.step-text` classes from repro steps.
5. **JSON conditional inclusion:** `guidedResults` key is completely absent from JSON when no test plan is used, keeping output backward-compatible for existing consumers.
6. **Input priority:** `--test-plan-file` > `--steps` > `--test-plan` — file takes precedence over inline, inline over ADO API.


### 2026-02-23: ADO Test Plan Integration Architecture + Smart Element Prioritization
**By:** Holden
**What:** Architecture for ADO test plan guided scanning and element priority system
**Why:** Scanner wastes time on chrome UI; user needs guided test plan execution for targeted scanning

---

## Part 1: Smart Element Prioritization

### Problem Statement

The `DeepExplorer` in `src/scanner/deep-explorer.ts` clicks every interactive element in DOM order using `INTERACTIVE_SELECTORS`. This flat list includes nav chrome, shell UI, and actual page content with no distinction. The result: the scanner spends its time budget clicking "Collapse Navigation", "Account Manager", "Settings", and breadcrumbs instead of the tabs, data rows, and action buttons that are the actual content under test.

The selectors explicitly include shell chrome:
```
'nav *', '[role="navigation"] *', '[class*="sidebar"] *',
'[class*="sidenav"] *', '[class*="CommandBar"] *', '[class*="ms-Nav"] *'
```

Combined with `MAX_ELEMENTS_PER_STATE = 50` and DFS, the first 50 elements are often all shell chrome. Content never gets explored.

### Design: Element Priority Tiers

#### Tier Definitions

| Priority | Tier | Description | Explore? |
|----------|------|-------------|----------|
| P1 | **Content** | Elements inside the main content area — tabs, data tables, action buttons, filters, detail panels, expandable rows | Always explore first |
| P2 | **Navigation** | Links/buttons that navigate to other pages/blades — sidebar nav links, breadcrumb links | Explore after P1 (discover new pages) |
| P3 | **Chrome** | Shell UI — account panel, settings gear, collapse nav, notification bell, help button, app switcher | Skip entirely (configurable) |

#### Classification Strategy

Classification uses a three-pass approach: **landmark detection → containment test → heuristic fallback**.

**Pass 1: Detect the content region**

Find the main content container using (in priority order):
1. ARIA landmark: `[role="main"]`, `<main>`
2. Fluent UI content: `.ms-Stack` that is a direct child of the shell, `.ms-Panel-content`
3. Layout heuristic: largest scrollable container that is NOT the nav sidebar
4. CSS class patterns: `[class*="content"]`, `[class*="blade"]`, `[class*="page-body"]`, `#main-content`
5. Fallback: `document.querySelector('main') ?? document.body`

```typescript
interface ContentRegion {
  element: Element;
  method: 'aria-landmark' | 'fluent-class' | 'layout-heuristic' | 'css-pattern' | 'fallback';
  confidence: 'high' | 'medium' | 'low';
}
```

**Pass 2: Classify each interactive element by containment**

For each element returned by `findInteractiveElements()`:
- If element is **inside** the content region → check if it's a content interaction or an embedded nav
- If element is **inside** `<nav>`, `[role="navigation"]`, or chrome selectors → P2 or P3
- If element is **outside** both → heuristic fallback

**Pass 3: Apply heuristic rules for edge cases**

Rules applied in order (first match wins):

```typescript
const CHROME_INDICATORS = [
  // Aria labels that indicate shell chrome
  /collapse\s*nav/i, /expand\s*nav/i, /account\s*manager/i,
  /settings/i, /notification/i, /help\s*(?:&|and)\s*support/i,
  /app\s*switcher/i, /waffle/i, /feedback/i, /sign\s*out/i,
  // Fluent UI chrome classes
  /ms-Nav-chevron/i, /ms-FocusZone.*header/i,
  /ms-ShimmeredDetailsList/i,  // loading skeleton — not interactive
];

const CONTENT_INDICATORS = [
  // Roles that strongly indicate page content
  { role: 'tab' },           // Pivot tabs within the page
  { role: 'row' },           // Data table rows
  { role: 'gridcell' },      // Data cells
  { role: 'treeitem', insideContent: true }, // Tree items inside content (not nav tree)
  // Fluent UI content patterns
  { class: /ms-Pivot/i },        // Tab bars
  { class: /ms-DetailsList/i },  // Data tables
  { class: /ms-CommandBar/i, insideContent: true }, // CommandBar INSIDE content (not shell)
  { class: /ms-Toggle/i },       // Toggle controls
  { class: /ms-Dropdown/i },     // Dropdowns
  { class: /ms-SearchBox/i, insideContent: true }, // Search within content
];

const NAV_INDICATORS = [
  // Links that navigate to different pages/routes
  { tag: 'a', hasHref: true, insideNav: true },
  { role: 'treeitem', insideNav: true },  // Nav tree items
  { class: /ms-Nav-link/i },
  { class: /ms-Breadcrumb-item/i },
];
```

#### Implementation: `ElementPrioritizer` class

New file: `src/scanner/element-prioritizer.ts`

```typescript
export enum ElementPriority {
  Content = 1,    // P1: explore first
  Navigation = 2, // P2: explore after content
  Chrome = 3,     // P3: skip
}

export interface PrioritizedElement extends InteractiveElement {
  priority: ElementPriority;
  reason: string;  // debug: why this classification
}

export interface PrioritizationConfig {
  /** Skip P3 (chrome) elements entirely. Default: true */
  skipChrome: boolean;
  /** Max P1 elements to explore per state. Default: 30 */
  maxContentElements: number;
  /** Max P2 elements to explore per state. Default: 15 */
  maxNavElements: number;
  /** Custom selectors to always treat as chrome (site-specific) */
  chromeSelectors?: string[];
  /** Custom selectors to always treat as content (site-specific) */
  contentSelectors?: string[];
}
```

The prioritizer runs **inside `page.evaluate()`** so it has full DOM access. It returns elements sorted by priority:

```typescript
export class ElementPrioritizer {
  /**
   * Classify and sort interactive elements by priority.
   * Runs as a single page.evaluate() call for performance.
   */
  async prioritize(
    page: Page,
    elements: InteractiveElement[],
    config: PrioritizationConfig,
  ): Promise<PrioritizedElement[]> {
    // Single evaluate call: detect content region + classify all elements
    const classified = await page.evaluate(
      (args) => classifyElements(args.elements, args.config),
      { elements, config },
    );

    // Sort: P1 first, then P2, then P3
    return classified.sort((a, b) => a.priority - b.priority);
  }
}
```

#### How This Changes the DFS Traversal

In `DeepExplorer.exploreState()`, after `findInteractiveElements()`:

```typescript
// BEFORE (current):
const limit = Math.min(elements.length, MAX_ELEMENTS_PER_STATE);
for (let i = 0; i < limit; i++) { ... }

// AFTER (with prioritization):
const prioritized = await this.prioritizer.prioritize(page, elements, this.priorityConfig);
const contentElements = prioritized.filter(e => e.priority === ElementPriority.Content);
const navElements = prioritized.filter(e => e.priority === ElementPriority.Navigation);

// Explore P1 (content) first — these are the actual page interactions
const contentLimit = Math.min(contentElements.length, this.priorityConfig.maxContentElements);
for (let i = 0; i < contentLimit; i++) {
  if (Date.now() >= deadline) return;
  await this.clickAndExplore(page, contentElements[i], ...);
}

// Then P2 (navigation) — discover new pages
const navLimit = Math.min(navElements.length, this.priorityConfig.maxNavElements);
for (let i = 0; i < navLimit; i++) {
  if (Date.now() >= deadline) return;
  await this.clickAndExplore(page, navElements[i], ...);
}

// P3 (chrome) — skip entirely unless config says otherwise
```

#### Microsoft Security Portal-Specific Patterns

These heuristics target the Fluent UI-based security portals (Defender, Sentinel, Exposure Management):

| Pattern | Classification | Selector |
|---------|---------------|----------|
| Pivot tabs | P1 Content | `[role="tab"]` inside `[role="tablist"]` within content |
| DetailsList rows | P1 Content | `[role="row"]` inside `.ms-DetailsList` |
| CommandBar (in content) | P1 Content | `.ms-CommandBar` descendant of `[role="main"]` |
| CommandBar (in shell header) | P3 Chrome | `.ms-CommandBar` NOT descendant of `[role="main"]` |
| Nav links | P2 Navigation | `.ms-Nav-link`, `[role="treeitem"]` inside `<nav>` |
| Collapse/expand chevron | P3 Chrome | `.ms-Nav-chevron`, `[aria-label*="collapse"]` |
| Account manager | P3 Chrome | `[aria-label*="account"]`, `#mectrl_*` |
| Settings gear | P3 Chrome | `[aria-label*="settings"]`, `[data-icon-name="Settings"]` |
| Notification bell | P3 Chrome | `[aria-label*="notification"]`, `[data-icon-name="Ringer"]` |
| Help button | P3 Chrome | `[aria-label*="help"]`, `[data-icon-name="Help"]` |
| Search (shell) | P3 Chrome | Global search in the top bar |
| Search (in-page filter) | P1 Content | `.ms-SearchBox` inside content region |
| Breadcrumbs | P2 Navigation | `.ms-Breadcrumb-item` (links to parent pages) |
| Blade close/expand | P1 Content | Close/expand buttons on blade panels inside content |

#### Configuration: User-Tunable

Add to `ScanConfig`:

```typescript
export interface ScanConfig {
  // ... existing fields ...

  /** Element prioritization settings for SPA exploration */
  elementPriority?: {
    /** Skip shell chrome elements. Default: true */
    skipChrome?: boolean;
    /** Max content elements to explore per state. Default: 30 */
    maxContentElements?: number;
    /** Max navigation elements to explore per state. Default: 15 */
    maxNavElements?: number;
    /** Additional selectors to treat as chrome (site-specific) */
    chromeSelectors?: string[];
    /** Additional selectors to treat as content (site-specific) */
    contentSelectors?: string[];
  };
}
```

CLI flags:
```
--no-chrome-skip         Explore chrome elements too (disabled by default)
--max-content <n>        Max content elements per state (default: 30)
--max-nav <n>            Max navigation elements per state (default: 15)
```

---

## Part 2: ADO Test Plan Integration

### Existing Code Assessment

The codebase already has substantial ADO integration:
- **`src/ado/types.ts`** — Complete type system: `ADOTestPlan`, `ADOTestSuite`, `ADOTestCase`, `ADOTestStep`, `TestAction`, `ImportedTestScenario`, `HybridScanConfig`, `HybridScanResult`, `GapAnalysisReport`
- **`src/ado/test-case-importer.ts`** — Working importer: fetches from ADO Test Plans API v7.0, parses step XML, extracts actions via regex NLP, filters by suite/tag/area/state/keyword
- **`src/scanner/hybrid-scanner.ts`** — Five-phase pipeline: priority scan → guided nav → automated crawl → gap analysis → bug filing with test case linking

**What's missing:**
1. CLI wiring — no `--test-plan` flags exist in `cli.ts`
2. LLM-based step interpretation — current `parseAction()` uses regex, which fails on natural language variations
3. Deep explorer integration — hybrid scanner uses `Crawler` + `PageAnalyzer`, not `DeepExplorer` (no SPA support)
4. Test plan file input — no offline/file-based test plan ingestion
5. Report integration — no mapping of findings back to test step IDs in the report output

### Design: What Needs to Be Built

#### 2.1 Input Formats

Three ways to provide a test plan:

| Method | Flag | Description |
|--------|------|-------------|
| ADO API | `--test-plan <id>` | Fetch live from ADO Test Plans API |
| File import | `--test-plan-file <path>` | Load from a JSON/YAML file (exported or hand-written) |
| Inline steps | `--steps "Navigate to X" "Click Y tab"` | Quick ad-hoc steps without a full test plan |

The file format matches the `ImportedTestScenario` shape so users can export once, edit, and replay without ADO access:

```yaml
# test-plan.yaml
scenarios:
  - title: "Verify Exposure Recommendations accessibility"
    steps:
      - action: "Navigate to https://security.microsoft.com/recommendations"
      - action: "Click the 'Cloud Assets' tab"
        expected: "Table loads with asset data"
      - action: "Click the first row to expand details"
        expected: "Detail panel opens with accessible content"
      - action: "Click 'Export' button"
        expected: "Export dialog appears with proper focus management"
```

#### 2.2 ADO API Integration

Already implemented in `test-case-importer.ts`. Key endpoints used:

| API | Endpoint | Purpose |
|-----|----------|---------|
| List suites | `GET {org}/{project}/_apis/testplan/plans/{planId}/suites` | Enumerate test suites |
| List test cases | `GET {org}/{project}/_apis/testplan/plans/{planId}/suites/{suiteId}/testcase` | Get test case refs per suite |
| Get work items | `GET {org}/{project}/_apis/wit/workitems?ids=...&fields=...` | Fetch step XML + metadata |

Auth: PAT via `Authorization: Basic base64(:pat)`. PAT needs **Test Plan (Read)** and **Work Items (Read)** scopes.

**New: Test Plan URL parsing.** Users copy URLs from the ADO test management UI:
```
https://dev.azure.com/msazure/CESEC/_testManagement/runs?planId=12345&suiteId=67890
```

Add a URL parser that extracts `planId` and `suiteId` from these URLs:

```typescript
export function parseTestPlanUrl(url: string): { orgUrl: string; project: string; planId: number; suiteId?: number } {
  const parsed = new URL(url);
  // Extract org, project, planId, suiteId from ADO test management URLs
  // Support both old and new URL formats
}
```

This lets users do: `--test-plan "https://dev.azure.com/msazure/CESEC/_testManagement/runs?planId=12345"`

#### 2.3 AI-Powered Step Interpretation

**Problem:** The current `parseAction()` in `test-case-importer.ts` uses regex patterns. This works for structured steps ("Click the Submit button") but fails on natural language ("Ensure the Cloud Assets tab is selected and the data table shows results").

**Solution:** Add an `LLMStepInterpreter` that uses an LLM to translate natural language steps into Playwright actions.

New file: `src/scanner/step-interpreter.ts`

```typescript
export interface InterpretedStep {
  /** The Playwright action to execute */
  action: PlaywrightAction;
  /** Confidence score 0-1 */
  confidence: number;
  /** How the LLM found the element */
  elementStrategy: 'text' | 'role' | 'label' | 'selector' | 'ai-visual';
  /** Fallback strategies if primary fails */
  fallbacks: PlaywrightAction[];
}

export type PlaywrightAction =
  | { type: 'click'; locator: string; locatorType: 'text' | 'role' | 'label' | 'css' | 'testid' }
  | { type: 'fill'; locator: string; locatorType: string; value: string }
  | { type: 'navigate'; url: string }
  | { type: 'select'; locator: string; locatorType: string; value: string }
  | { type: 'press'; key: string }
  | { type: 'wait'; condition: string; timeout: number }
  | { type: 'assert'; description: string }
  | { type: 'scroll'; direction: 'up' | 'down'; amount?: number };

export class LLMStepInterpreter {
  /**
   * Given a natural language step and the current page state,
   * produce a concrete Playwright action.
   *
   * Uses a two-phase approach:
   * 1. Parse the step text → intent + target description
   * 2. Match against current page DOM → concrete locator
   */
  async interpret(
    step: string,
    page: Page,
    context?: { previousSteps: string[]; pageUrl: string },
  ): Promise<InterpretedStep> {
    // Phase 1: Get page accessibility snapshot for context
    const a11ySnapshot = await this.getPageSnapshot(page);

    // Phase 2: Ask LLM to map step → action + element
    const prompt = this.buildPrompt(step, a11ySnapshot, context);
    const response = await this.callLLM(prompt);

    // Phase 3: Validate the locator exists on the page
    return this.validateAndFallback(response, page);
  }
}
```

The LLM prompt includes:
1. The test step text
2. An accessibility tree snapshot of the current page (roles, names, states)
3. Previous steps for context continuity
4. A structured output schema (JSON) for the action

**Fallback chain:** LLM interpretation → regex parsing → text-based Playwright locator → skip with warning.

**Cost control:** LLM calls are optional and gated behind `--ai-steps` flag. Without it, the existing regex parser is used. Each step that fails regex parsing is queued for LLM interpretation in a single batched call.

#### 2.4 Hybrid Mode: Guided → Auto-Explore

The key innovation: **after executing each guided test step, use `DeepExplorer` to auto-explore from that state.**

This is the missing integration between `hybrid-scanner.ts` and `deep-explorer.ts`.

New class: `GuidedExplorer` (extends or composes `DeepExplorer`)

```typescript
export class GuidedExplorer {
  /**
   * Execute a test plan's steps, running deep exploration after each step
   * that produces a new state. This finds accessibility issues in the
   * neighborhoods around the test plan's path.
   *
   * Flow:
   * 1. Execute step 1 (e.g., "Navigate to Recommendations")
   * 2. Run a11y analysis on current state
   * 3. Auto-explore 1 level deep from this state (tabs, buttons, filters)
   * 4. Return to step 1's end state
   * 5. Execute step 2 (e.g., "Click Cloud Assets tab")
   * 6. Run a11y analysis
   * 7. Auto-explore 1 level deep (data rows, detail panels)
   * ... repeat
   */
  async executeWithExploration(
    context: BrowserContext,
    scenario: ImportedTestScenario,
    config: GuidedExplorationConfig,
    deadline: number,
  ): Promise<GuidedExplorationResult>;
}

export interface GuidedExplorationConfig {
  /** How many levels deep to auto-explore after each guided step. Default: 1 */
  explorationDepth: number;
  /** Use element prioritization during auto-explore. Default: true */
  usePrioritization: boolean;
  /** Max elements to explore at each step's end state. Default: 20 */
  maxElementsPerStep: number;
  /** Use LLM for step interpretation. Default: false */
  useAIInterpretation: boolean;
}
```

**Integration point in `ScanEngine`:**

```typescript
// In engine.ts execute():
if (this.config.testPlan) {
  // Guided mode: import test plan → guided exploration
  const guidedExplorer = new GuidedExplorer(this.config, analyzer, prioritizer);
  const guidedResult = await guidedExplorer.executeWithExploration(
    context, scenarios, guidedConfig, deadline
  );
  pages.push(...guidedResult.pages);

  // Then auto-explore from the last state (if time remains)
  if (this.config.spaDiscovery && Date.now() < deadline) {
    const explorer = new DeepExplorer(this.config, analyzer, prioritizer);
    const { pages: additionalPages } = await explorer.explore(context, deadline);
    pages.push(...additionalPages);
  }
}
```

#### 2.5 New Type Definitions

Add to `src/scanner/types.ts`:

```typescript
/** Test plan configuration — can come from ADO API, file, or CLI inline steps */
export interface TestPlanConfig {
  /** Source type */
  source: 'ado-api' | 'file' | 'inline';
  /** ADO API settings (when source = 'ado-api') */
  ado?: {
    planId: number;
    suiteIds?: number[];
    /** ADO org URL — falls back to AdoConfig.orgUrl */
    orgUrl?: string;
    project?: string;
    pat?: string;
  };
  /** File path to test plan YAML/JSON (when source = 'file') */
  filePath?: string;
  /** Inline steps (when source = 'inline') */
  inlineSteps?: string[];
  /** Auto-explore after each guided step. Default: true */
  autoExploreAfterSteps?: boolean;
  /** Exploration depth at each step. Default: 1 */
  explorationDepth?: number;
  /** Use LLM for step interpretation. Default: false */
  useAIInterpretation?: boolean;
}

/** Result of a guided step execution */
export interface GuidedStepResult {
  /** Step index (0-based) */
  stepIndex: number;
  /** Original step text */
  stepText: string;
  /** ADO test case ID (if from ADO) */
  adoTestCaseId?: number;
  /** Whether the step executed successfully */
  success: boolean;
  /** Error if step failed */
  error?: string;
  /** Playwright action that was executed */
  action: string;
  /** URL after step execution */
  urlAfterStep: string;
  /** A11y findings at this step's state */
  findings: Finding[];
  /** Additional findings from auto-exploration at this step */
  explorationFindings: Finding[];
  /** Screenshot after step */
  screenshot?: string;
  /** Time spent on this step (ms) */
  durationMs: number;
}

/** Result of the guided exploration session */
export interface GuidedExplorationResult {
  /** All page results from guided + exploration */
  pages: PageResult[];
  /** Per-step results for report mapping */
  stepResults: GuidedStepResult[];
  /** Total guided steps attempted */
  totalSteps: number;
  /** Steps that executed successfully */
  successfulSteps: number;
  /** Steps that failed */
  failedSteps: number;
  /** Total findings across all steps */
  totalFindings: number;
}
```

#### 2.6 CLI Changes

Add to the `scan` command in `cli.ts`:

```typescript
.option('--test-plan <id-or-url>', 'ADO test plan ID or full test management URL')
.option('--test-plan-file <path>', 'Path to test plan YAML/JSON file')
.option('--steps <steps...>', 'Inline test steps (natural language)')
.option('--ai-steps', 'Use LLM to interpret test step text (requires OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT)')
.option('--explore-depth <n>', 'Auto-exploration depth after each guided step (default: 1)', parseInt)
.option('--ado-org <url>', 'ADO organization URL (e.g., https://dev.azure.com/msazure)')
.option('--ado-project <name>', 'ADO project name')
.option('--ado-pat <token>', 'ADO Personal Access Token (or set ADO_PAT env var)')
```

Usage examples:
```bash
# From ADO API
a11y-scan scan https://security.microsoft.com \
  --test-plan 12345 \
  --ado-org https://dev.azure.com/msazure \
  --ado-project CESEC \
  --ado-pat $ADO_PAT \
  --interactive-auth

# From ADO URL (extracts plan ID automatically)
a11y-scan scan https://security.microsoft.com \
  --test-plan "https://dev.azure.com/msazure/CESEC/_testManagement/runs?planId=12345" \
  --ado-pat $ADO_PAT \
  --interactive-auth

# From file
a11y-scan scan https://security.microsoft.com \
  --test-plan-file ./test-plans/recommendations.yaml \
  --interactive-auth

# Inline steps
a11y-scan scan https://security.microsoft.com/recommendations \
  --steps "Click the Cloud Assets tab" "Click the first data row" "Click Export" \
  --interactive-auth

# With AI interpretation
a11y-scan scan https://security.microsoft.com \
  --test-plan-file ./test-plans/recommendations.yaml \
  --ai-steps \
  --interactive-auth
```

#### 2.7 Report Integration

Extend the report to show test-plan-aware results:

**JSON report:** Add `guidedResults` section:
```json
{
  "guidedResults": {
    "testPlanSource": "ado-api",
    "testPlanId": 12345,
    "stepResults": [
      {
        "stepIndex": 0,
        "stepText": "Navigate to Exposure Recommendations",
        "adoTestCaseId": 98765,
        "success": true,
        "urlAfterStep": "https://security.microsoft.com/recommendations",
        "findingsAtStep": 3,
        "explorationFindings": 7,
        "findings": [...]
      }
    ],
    "summary": {
      "totalSteps": 5,
      "successfulSteps": 4,
      "failedSteps": 1,
      "totalFindings": 22,
      "findingsFromSteps": 12,
      "findingsFromExploration": 10
    }
  }
}
```

**HTML report:** Add a "Test Plan Execution" section before the findings:
- Visual step-by-step timeline showing pass/fail per step
- Each step links to its findings
- Failed steps show error + screenshot
- Findings tagged with their originating test step ID + ADO test case link

**ADO bug filing:** When `--ado` is combined with `--test-plan`, filed bugs include:
- Repro steps that reference the test plan step ("Step 3 of Test Case #98765: Click Export button")
- A `TestedBy` work item link to the originating ADO test case
- Tags: `a11y-scanner`, `test-plan-{planId}`, `test-case-{caseId}`

---

## Implementation Order

| Phase | What | Owner | Depends On |
|-------|------|-------|------------|
| 1 | `ElementPrioritizer` class + unit tests | Bobbie (UI detection) | — |
| 2 | Integrate prioritizer into `DeepExplorer` | Naomi (engine) | Phase 1 |
| 3 | CLI flags for test plan (`--test-plan`, `--test-plan-file`, `--steps`) | Alex (CLI) | — |
| 4 | `GuidedExplorer` class (compose DeepExplorer + test plan execution) | Naomi (engine) | Phase 2 |
| 5 | Test plan file parser (YAML/JSON → `ImportedTestScenario[]`) | Naomi (engine) | Phase 3 |
| 6 | ADO URL parser (test management URL → planId + suiteId) | Naomi (engine) | — |
| 7 | `LLMStepInterpreter` (optional, behind `--ai-steps`) | Naomi (engine) | Phase 4 |
| 8 | Report integration (guided results in JSON + HTML) | Alex (reporting) | Phase 4 |
| 9 | Tests for all new code | Amos (tester) | Phases 1-8 |

**Phase 1-2 can ship independently** — element prioritization improves every scan immediately.

**Phase 3-6 are the core test plan feature** — ship as a unit.

**Phase 7-8 are enhancements** — ship after core is validated.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Content region detection fails on unusual layouts | Fallback to `document.body`; add `--content-selectors` override |
| LLM step interpretation is slow/expensive | Gate behind `--ai-steps`; batch calls; cache interpretations per step text |
| Test step execution fails mid-flow (element not found) | Log warning, skip step, continue with next; don't abort the whole plan |
| ADO PAT permissions insufficient | Clear error message listing required scopes; validate PAT on startup |
| Guided exploration + auto-explore exceeds timeout | Deadline check between every step; guided steps get 70% of time budget, auto-explore gets 30% |

---

## Decisions Required

1. **Drummer:** Should chrome elements (P3) still get a11y analysis when they ARE visited, or skip entirely? (I recommend: analyze if visited, but don't prioritize visiting them.)
2. **Bobbie:** Should the content region detection be part of the existing `UIDetector` in `detection/`, or a new standalone `ElementPrioritizer`? (I lean toward standalone — keeps it simple and avoids coupling to the unintegrated detection module.)
3. **Alex:** Does the HTML report need a dedicated "Test Plan" view, or can we embed step results into the existing card layout? (I recommend dedicated section — it's a fundamentally different data shape.)


### 2026-02-23: AI Test Plan Learning & Generation Architecture
**By:** Holden
**What:** Architecture for learning patterns from guided tests and generating new test plans
**Why:** Users write a few test plans, scanner learns the patterns, then automatically generates comprehensive test coverage

---

## Overview

This design adds two AI capabilities to the scanner:

1. **LEARN** — After executing human-written test plans via `GuidedExplorer`, extract structural, interaction, navigation, and coverage patterns into a `LearnedPatterns` model.
2. **INVENT** — Using learned patterns plus the current page's accessibility tree, generate new `ImportedTestScenario[]` that fill coverage gaps — untested tabs, unexplored element types, similar pages, deeper interactions.

The system produces the same `ImportedTestScenario` type as human-written plans. Generated scenarios are indistinguishable from imported ones at the execution layer. This is the key design constraint: **generated plans feed back into `GuidedExplorer` with zero integration cost.**

---

## Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         LEARN → INVENT Pipeline                         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Human Test Plans                                                        │
│  (ADO / YAML / inline)                                                   │
│        │                                                                 │
│        ▼                                                                 │
│  ┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐  │
│  │ GuidedExplorer   │────▶│ PatternExtractor  │────▶│ PatternDatabase  │  │
│  │ (execute plans)  │     │ (analyze results) │     │ (.a11y-patterns/)│  │
│  └─────────────────┘     └──────────────────┘     └────────┬─────────┘  │
│        │                                                    │            │
│        │  Execution traces:                                 │ Persisted  │
│        │  - Pages visited                                   │ patterns   │
│        │  - Elements interacted                             │            │
│        │  - A11y tree snapshots                             ▼            │
│        │  - Navigation flow graph          ┌──────────────────────────┐  │
│        │  - Step success/failure           │ TestPlanGenerator        │  │
│        │                                   │                          │  │
│        │                                   │ Strategies:              │  │
│        │                                   │ 1. Coverage completion   │  │
│        │                                   │ 2. Depth completion      │  │
│        │                                   │ 3. Cross-page transfer   │  │
│        │                                   │ 4. Element type coverage │  │
│        │                                   │ 5. Edge case generation  │  │
│        │                                   └───────────┬──────────────┘  │
│        │                                               │                 │
│        │                                               ▼                 │
│        │                                   ┌──────────────────────────┐  │
│        │                                   │ ImportedTestScenario[]   │  │
│        │                                   │ (generated plans)        │  │
│        │                                   └───────────┬──────────────┘  │
│        │                                               │                 │
│        ▼                                               ▼                 │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    GuidedExplorer (round 2)                         │ │
│  │              Execute generated plans — same pipeline                 │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                                    ▼                                     │
│                          ScanResult (combined)                           │
│                          - Human plan findings                           │
│                          - Generated plan findings                       │
│                          - Source attribution per finding                 │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Type Definitions

### Core Pattern Types

```typescript
// src/scanner/patterns/types.ts

/**
 * A learned page structure: what elements exist, how they're organized,
 * and what landmarks/regions the page has.
 */
export interface LearnedPagePattern {
  /** URL pattern (regex or glob) that matches pages with this structure */
  urlPattern: string;
  /** Concrete URLs where this pattern was observed */
  observedUrls: string[];
  /** Page landmarks discovered via a11y tree */
  landmarks: LandmarkPattern[];
  /** Interactive element groups (e.g., "tab bar with 7 tabs") */
  elementGroups: ElementGroupPattern[];
  /** Heading structure (h1 → h2 → h3 hierarchy) */
  headingStructure: HeadingNode[];
  /** Content regions identified by the ElementPrioritizer */
  contentRegions: ContentRegionPattern[];
  /** Fingerprint of the page structure (for similarity matching) */
  structureFingerprint: string;
  /** When this pattern was last observed */
  lastObserved: string; // ISO timestamp
}

export interface LandmarkPattern {
  role: string;           // 'main', 'navigation', 'banner', 'complementary', etc.
  label: string | null;
  childElementTypes: string[];  // roles of interactive children
  childCount: number;
}

export interface ElementGroupPattern {
  /** Group type: 'tablist', 'toolbar', 'table', 'list', 'form', 'tree' */
  groupRole: string;
  /** Selector or landmark that contains this group */
  containerSelector: string;
  /** Total elements in group */
  totalElements: number;
  /** Elements that were tested by human plan */
  testedElements: TestedElementRef[];
  /** Elements that were NOT tested */
  untestedElements: UntestedElementRef[];
  /** Labels/names of all elements (for generating targeted test steps) */
  elementLabels: string[];
}

export interface TestedElementRef {
  label: string;
  role: string;
  selector: string;
  /** Which test scenario tested this element */
  testedByScenario: string;
  /** Which step index */
  testedAtStep: number;
}

export interface UntestedElementRef {
  label: string;
  role: string;
  selector: string;
  /** Similarity to a tested element (0-1) */
  similarityToTested: number;
  /** Which tested element is it most similar to */
  mostSimilarTestedElement: string;
}

export interface HeadingNode {
  level: number;
  text: string;
  children: HeadingNode[];
}

export interface ContentRegionPattern {
  method: 'aria-landmark' | 'fluent-class' | 'layout-heuristic' | 'css-pattern' | 'fallback';
  selector: string;
  interactiveChildCount: number;
}

/**
 * A learned interaction pattern: how the human navigated through UI.
 */
export interface LearnedInteractionPattern {
  /** Pattern name (auto-generated or from test scenario title) */
  name: string;
  /** Sequence of action types the human performed */
  actionSequence: TestAction['type'][];
  /** Element roles targeted in sequence */
  targetRoleSequence: string[];
  /** What state changes occurred (URL change, overlay, expansion) */
  stateChangeSequence: StateChangeType[];
  /** Average step count for this pattern */
  averageStepCount: number;
  /** How many scenarios followed this pattern */
  observationCount: number;
  /** Concrete examples (scenario IDs) */
  exampleScenarios: string[];
}

export type StateChangeType =
  | 'url-change'
  | 'overlay-opened'
  | 'panel-expanded'
  | 'content-loaded'
  | 'dom-mutation'
  | 'no-change';

/**
 * A learned navigation flow: the graph of pages/states the human traversed.
 */
export interface LearnedNavigationFlow {
  /** Starting URL */
  entryUrl: string;
  /** Ordered list of navigation transitions */
  transitions: NavigationTransition[];
  /** Total unique URLs visited */
  uniqueUrlCount: number;
  /** Pages that were visited but not deeply explored */
  shallowPages: string[];
  /** Pages that were explored in depth */
  deepPages: string[];
}

export interface NavigationTransition {
  fromUrl: string;
  toUrl: string;
  trigger: string;  // "click on tab 'Cloud Assets'", "navigate to URL"
  triggerRole: string;
  triggerLabel: string;
}

/**
 * A11y coverage map: what was checked vs. what could be checked.
 */
export interface LearnedCoverageMap {
  /** Element types found on tested pages, with tested/untested counts */
  elementTypeCoverage: ElementTypeCoverage[];
  /** WCAG criteria that findings were found for */
  wcagCriteriaHit: string[];
  /** A11y check categories that had findings */
  categoriesWithFindings: string[];
  /** Interaction types tested (keyboard, mouse, screen reader) */
  interactionTypesTested: string[];
  /** Pages with findings vs. pages clean */
  pagesCoverage: {
    tested: string[];
    withFindings: string[];
    clean: string[];
  };
}

export interface ElementTypeCoverage {
  role: string;           // 'tab', 'button', 'link', 'row', 'gridcell', etc.
  totalFound: number;     // across all visited pages
  totalTested: number;    // interacted with during guided steps
  totalUntested: number;
  exampleUntested: string[];  // labels of untested elements (for generation)
}

/**
 * Top-level container: everything the scanner learned from a guided run.
 */
export interface LearnedPatterns {
  /** Schema version for forward compatibility */
  version: '1.0';
  /** When these patterns were extracted */
  extractedAt: string;
  /** Source URL that was scanned */
  siteUrl: string;
  /** Test plan source (ADO plan ID, file path, or 'inline') */
  testPlanSource: string;
  /** Number of human scenarios that were executed */
  scenarioCount: number;
  /** Page structure patterns */
  pagePatterns: LearnedPagePattern[];
  /** Interaction patterns (sequences of actions) */
  interactionPatterns: LearnedInteractionPattern[];
  /** Navigation flow graph */
  navigationFlow: LearnedNavigationFlow;
  /** A11y coverage map */
  coverageMap: LearnedCoverageMap;
  /** Raw execution data (for LLM context) */
  executionSummary: ExecutionSummary;
}

export interface ExecutionSummary {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  totalFindings: number;
  pagesVisited: string[];
  uniqueElementsInteracted: number;
  scanDurationMs: number;
}
```

### Generated Test Scenario Type

```typescript
// src/scanner/patterns/types.ts (continued)

/**
 * A generated test scenario. Extends the same shape as ImportedTestScenario
 * so it feeds directly into GuidedExplorer with no adapter needed.
 *
 * The extra fields provide provenance and confidence metadata.
 */
export interface GeneratedTestScenario extends Omit<ImportedTestScenario, 'adoTestCaseId' | 'adoTestCaseUrl' | 'suiteId' | 'suiteName'> {
  /** Always -1 for generated scenarios (no ADO backing) */
  adoTestCaseId: -1;
  adoTestCaseUrl: '';
  suiteId: -1;
  suiteName: 'ai-generated';
  /** Which generation strategy produced this scenario */
  generatedFrom: GenerationStrategy;
  /** Confidence that this scenario will execute successfully (0-1) */
  confidence: number;
  /** Human-readable explanation of why this was generated */
  rationale: string;
  /** Reference to the human scenario that inspired this one */
  sourceScenarioTitle: string;
  /** Whether an LLM was used to generate this (vs. heuristic) */
  llmGenerated: boolean;
}

export type GenerationStrategy =
  | 'coverage-completion'     // "Tab A tested → generate for Tabs B-E"
  | 'depth-completion'        // "Headers tested → generate for row expansion"
  | 'cross-page-transfer'     // "/recommendations tested → generate for /incidents"
  | 'element-type-coverage'   // "Buttons tested → generate for dropdowns, toggles"
  | 'edge-case-generation';   // "Normal flow → generate error/empty/loading states"
```

### Pattern Database

```typescript
// src/scanner/patterns/pattern-database.ts

/**
 * Persists and retrieves learned patterns per-site.
 * Stored in .a11y-patterns/ directory alongside scan results.
 *
 * File structure:
 *   .a11y-patterns/
 *     security.microsoft.com/
 *       patterns-2026-02-23T10-30-00.json    (timestamped snapshots)
 *       patterns-latest.json                  (symlink/copy of latest)
 *       generated-plans/
 *         generated-2026-02-23T10-30-00.json  (generated scenarios)
 *     another-site.com/
 *       ...
 */
export class PatternDatabase {
  constructor(private baseDir: string = '.a11y-patterns') {}

  /** Save learned patterns after a guided run */
  async save(patterns: LearnedPatterns): Promise<string>

  /** Load the latest patterns for a site URL */
  async loadLatest(siteUrl: string): Promise<LearnedPatterns | null>

  /** Load all historical patterns for a site (for trend analysis) */
  async loadHistory(siteUrl: string): Promise<LearnedPatterns[]>

  /** Merge new patterns with existing ones (accumulative learning) */
  async merge(existing: LearnedPatterns, incoming: LearnedPatterns): Promise<LearnedPatterns>

  /** Save generated test plans for replay */
  async saveGeneratedPlans(
    siteUrl: string,
    plans: GeneratedTestScenario[],
  ): Promise<string>

  /** Load previously generated plans */
  async loadGeneratedPlans(siteUrl: string): Promise<GeneratedTestScenario[]>

  /** Get site-normalized directory name from URL */
  private siteDir(siteUrl: string): string
}
```

---

## Module Responsibilities

### Module 1: `PatternExtractor` — The LEARN Engine

**File:** `src/scanner/patterns/pattern-extractor.ts`

Runs immediately after `GuidedExplorer.execute()` completes. Receives the full execution trace and produces a `LearnedPatterns` object.

```typescript
export class PatternExtractor {
  /**
   * Extract patterns from a completed guided exploration.
   *
   * @param result    - The GuidedExplorationResult from GuidedExplorer
   * @param scenarios - The original ImportedTestScenario[] that were executed
   * @param snapshots - A11y tree snapshots captured at each step
   * @param config    - Extraction configuration
   */
  async extract(
    result: GuidedExplorationResult,
    scenarios: ImportedTestScenario[],
    snapshots: PageSnapshot[],
    config: ExtractionConfig,
  ): Promise<LearnedPatterns>

  /** Extract page structure patterns from a11y tree snapshots */
  private extractPagePatterns(
    snapshots: PageSnapshot[],
    stepResults: GuidedStepResult[],
  ): LearnedPagePattern[]

  /** Identify element groups (tab bars, tables, toolbars) and coverage */
  private extractElementGroups(
    snapshot: PageSnapshot,
    testedElements: Set<string>,
  ): ElementGroupPattern[]

  /** Detect interaction patterns across scenarios */
  private extractInteractionPatterns(
    scenarios: ImportedTestScenario[],
    stepResults: GuidedStepResult[],
  ): LearnedInteractionPattern[]

  /** Build navigation flow graph from step URLs */
  private extractNavigationFlow(
    stepResults: GuidedStepResult[],
  ): LearnedNavigationFlow

  /** Build coverage map: what was tested vs. what exists */
  private extractCoverageMap(
    snapshots: PageSnapshot[],
    stepResults: GuidedStepResult[],
    scenarios: ImportedTestScenario[],
  ): LearnedCoverageMap
}

/** A11y tree snapshot captured at a specific step */
export interface PageSnapshot {
  url: string;
  stepIndex: number;
  /** Serialized accessibility tree (roles, names, states) */
  accessibilityTree: A11yTreeNode[];
  /** Interactive elements found on the page */
  interactiveElements: InteractiveElement[];
  /** Page landmarks */
  landmarks: { role: string; label: string | null; selector: string }[];
  /** Heading structure */
  headings: { level: number; text: string }[];
}

export interface A11yTreeNode {
  role: string;
  name: string;
  value?: string;
  description?: string;
  focused?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  selected?: boolean;
  children?: A11yTreeNode[];
}

export interface ExtractionConfig {
  /** Minimum similarity threshold for grouping elements (0-1). Default: 0.7 */
  similarityThreshold: number;
  /** Include raw a11y trees in output (verbose). Default: false */
  includeRawTrees: boolean;
  /** Maximum URL patterns to extract. Default: 50 */
  maxUrlPatterns: number;
}
```

**How snapshots are captured:** The `GuidedExplorer` is extended with a snapshot capture hook. After each step executes and before a11y analysis, the explorer calls:

```typescript
// Inside GuidedExplorer.executeStep(), after the action succeeds:
const snapshot = await this.captureSnapshot(page, stepIndex);
this.snapshots.push(snapshot);
```

The snapshot uses Playwright's ARIA role-based element discovery (not the deprecated `page.accessibility.snapshot()`):

```typescript
private async captureSnapshot(page: Page, stepIndex: number): Promise<PageSnapshot> {
  return page.evaluate(() => {
    // Walk the DOM building an a11y tree using ARIA roles
    // Collect all interactive elements, landmarks, headings
    // Return serializable snapshot
  });
}
```

### Module 2: `TestPlanGenerator` — The INVENT Engine

**File:** `src/scanner/patterns/test-plan-generator.ts`

Takes `LearnedPatterns` plus the current page's state and produces new `GeneratedTestScenario[]`.

```typescript
export class TestPlanGenerator {
  constructor(
    private llmClient?: LLMClient,  // optional — only for LLM strategies
  ) {}

  /**
   * Generate new test scenarios from learned patterns.
   *
   * @param patterns     - Learned patterns from PatternExtractor
   * @param currentPage  - Current page snapshot (if available)
   * @param config       - Generation configuration
   */
  async generate(
    patterns: LearnedPatterns,
    currentPage?: PageSnapshot,
    config?: GenerationConfig,
  ): Promise<GeneratedTestScenario[]>

  // ── Strategy Methods ──────────────────────────────────────────────

  /**
   * Strategy 1: Coverage Completion
   * "Human tested Tab A and Tab B — generate for Tabs C, D, E"
   *
   * HEURISTIC — no LLM needed.
   * For each ElementGroupPattern with untested elements,
   * clone the tested scenario and swap the element target.
   */
  private generateCoverageCompletion(
    patterns: LearnedPatterns,
  ): GeneratedTestScenario[]

  /**
   * Strategy 2: Depth Completion
   * "Human tested table headers — generate for row expansion"
   *
   * HEURISTIC with optional LLM enhancement.
   * Find tested element groups where only the top level was exercised.
   * Generate deeper interaction sequences (click row → check detail panel).
   */
  private generateDepthCompletion(
    patterns: LearnedPatterns,
  ): GeneratedTestScenario[]

  /**
   * Strategy 3: Cross-Page Transfer
   * "Human tested /recommendations — generate for /incidents"
   *
   * HEURISTIC — compare page structure fingerprints.
   * When two pages have similar structure (>70% landmark/heading match),
   * clone the test scenarios from the tested page to the untested page.
   */
  private generateCrossPageTransfer(
    patterns: LearnedPatterns,
  ): GeneratedTestScenario[]

  /**
   * Strategy 4: Element Type Coverage
   * "Human tested buttons — generate for dropdowns, toggles, checkboxes"
   *
   * HEURISTIC — check coverageMap.elementTypeCoverage.
   * For untested element types, generate basic interaction tests:
   * click/toggle for buttons, expand for dropdowns, etc.
   */
  private generateElementTypeCoverage(
    patterns: LearnedPatterns,
  ): GeneratedTestScenario[]

  /**
   * Strategy 5: Edge Case Generation
   * "Human tested normal flow — generate for error, empty, loading states"
   *
   * LLM-POWERED — requires --ai-generate flag.
   * Sends the learned patterns + page context to an LLM and asks it
   * to generate edge case scenarios.
   */
  private async generateEdgeCases(
    patterns: LearnedPatterns,
  ): Promise<GeneratedTestScenario[]>
}

export interface GenerationConfig {
  /** Which strategies to run. Default: all heuristic strategies */
  strategies: GenerationStrategy[];
  /** Max scenarios to generate per strategy. Default: 10 */
  maxPerStrategy: number;
  /** Total max generated scenarios. Default: 30 */
  maxTotal: number;
  /** Minimum confidence to include a scenario. Default: 0.5 */
  minConfidence: number;
  /** Use LLM for edge case generation. Default: false */
  useLLM: boolean;
  /** Deduplicate against previously generated plans. Default: true */
  deduplicateAgainstHistory: boolean;
}
```

### Module 3: `LLMClient` — AI Integration Layer

**File:** `src/scanner/patterns/llm-client.ts`

Thin abstraction over LLM APIs. Used by `TestPlanGenerator` (edge cases) and optionally by `PatternExtractor` (pattern summarization).

```typescript
export interface LLMClient {
  /** Send a structured prompt and get a structured response */
  complete<T>(prompt: LLMPrompt): Promise<LLMResponse<T>>;
}

export interface LLMPrompt {
  system: string;
  user: string;
  /** JSON schema for structured output */
  responseSchema?: object;
  /** Temperature (0 = deterministic, 1 = creative). Default: 0.3 */
  temperature?: number;
}

export interface LLMResponse<T> {
  content: T;
  tokensUsed: { prompt: number; completion: number };
  model: string;
}

/** Factory: create appropriate client from environment */
export function createLLMClient(): LLMClient | null {
  // Priority order:
  // 1. AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY → Azure OpenAI
  // 2. OPENAI_API_KEY → OpenAI direct
  // 3. ANTHROPIC_API_KEY → Anthropic Claude
  // 4. null (no LLM available)
}
```

---

## LLM Prompt Design

### Edge Case Generation Prompt

```
SYSTEM:
You are an accessibility testing expert. Given patterns learned from human-written
test plans, generate additional test scenarios that cover edge cases, error states,
and unusual interactions that humans typically miss.

Output format: JSON array of test scenarios, each with:
- title: descriptive test name
- steps: array of { action: string, expected?: string }
- rationale: why this test matters for accessibility
- confidence: 0-1 how likely this test will execute successfully

USER:
## Learned Patterns

Site: {siteUrl}
Pages tested: {pageList}

### Page Structure
{for each page: landmarks, element groups, heading structure}

### Human Test Patterns
The human wrote {N} test scenarios covering:
- Elements tested: {element summary}
- Interaction types: {action types}
- Pages visited: {url list}

### Coverage Gaps Identified
- Untested element types: {list}
- Untested pages with similar structure: {list}
- Shallow-tested areas: {list}

### Navigation Flow
{transition graph}

## Task
Generate {maxPerStrategy} additional test scenarios focusing on:
1. Error states: what happens when expected elements are missing, disabled, or loading?
2. Empty states: pages with no data, tables with zero rows, search with no results
3. Loading states: skeleton screens, spinners, progressive content loading
4. Keyboard-only navigation for all untested interactive elements
5. Screen reader announcement verification for dynamic content changes
6. Focus management after overlay/panel/dialog interactions

Each generated step MUST use natural language that the GuidedExplorer can interpret
(e.g., "Click the 'Export' button", "Press Tab to move focus to the next element").
```

### Pattern Summarization Prompt (Optional)

```
SYSTEM:
You are analyzing accessibility test execution data. Summarize the key patterns
into a concise structural description of the tested application.

USER:
## Execution Data
- {N} test scenarios executed across {M} pages
- Page snapshots: {serialized a11y trees}
- Navigation flow: {transitions}
- Element coverage: {coverage map}

## Task
Identify:
1. The application's page template pattern (do multiple pages share structure?)
2. Common interaction patterns (tab → table → detail is a pattern?)
3. Navigation hierarchy (landing → category → detail)
4. Which WCAG guidelines are most relevant given the UI patterns found
```

---

## Heuristic Generation Examples

### Example: Coverage Completion (No LLM)

**Input:** Human wrote 3 scenarios testing tabs in a 7-tab interface.

```
Human scenario: "Test Cloud Assets tab"
  Steps: Navigate to /recommendations → Click 'Cloud Assets' tab → Verify table loads
  Tested tabs: ['Cloud Assets', 'Devices', 'Identities']
  All tabs found: ['Cloud Assets', 'Devices', 'Identities', 'Software', 'Firmware',
                    'Browsers/Extensions', 'Certificates']
```

**Generated scenarios (4):**

```typescript
[
  {
    title: "AI: Test 'Software' tab (coverage completion)",
    actions: [
      { type: 'navigate', url: 'https://security.microsoft.com/recommendations' },
      { type: 'click', target: 'Software' },
      { type: 'verify', description: 'Table loads with data' },
    ],
    generatedFrom: 'coverage-completion',
    confidence: 0.9,
    rationale: "Tab 'Software' in tablist has same role as tested tab 'Cloud Assets' but was not covered",
    sourceScenarioTitle: "Test Cloud Assets tab",
    llmGenerated: false,
    // ... remaining ImportedTestScenario fields
  },
  {
    title: "AI: Test 'Firmware' tab (coverage completion)",
    // Same pattern, different tab target
    confidence: 0.9,
  },
  {
    title: "AI: Test 'Browsers/Extensions' tab (coverage completion)",
    confidence: 0.85, // slightly lower — longer label might need different locator
  },
  {
    title: "AI: Test 'Certificates' tab (coverage completion)",
    confidence: 0.9,
  },
]
```

**Algorithm:**
```
FOR each ElementGroupPattern where untestedElements.length > 0:
  sourceScenario = find scenario that tested an element in this group
  FOR each untested element in the group:
    clone sourceScenario
    replace the step that targets the tested element with the untested element's label
    set confidence based on similarity score
    emit GeneratedTestScenario
```

### Example: Depth Completion

**Input:** Human tested clicking a tab but not expanding rows in the table.

```
Human scenario steps: Navigate → Click tab → (stop)
Page snapshot shows: table with 15 rows, each has [aria-expanded="false"]
```

**Generated:**
```typescript
{
  title: "AI: Expand first data row in Cloud Assets table",
  actions: [
    { type: 'navigate', url: 'https://security.microsoft.com/recommendations' },
    { type: 'click', target: 'Cloud Assets' },
    { type: 'click', target: 'first row' },      // targets [role="row"][aria-expanded]
    { type: 'verify', description: 'Detail panel opens with accessible content' },
  ],
  generatedFrom: 'depth-completion',
  confidence: 0.75,
  rationale: "Table rows have aria-expanded='false' indicating expandable content that was not tested",
}
```

### Example: Cross-Page Transfer

**Input:** Human tested `/recommendations`. Scanner found `/incidents` has the same landmark/heading structure.

```
/recommendations structure: main > h1 > tablist(7 tabs) > table
/incidents structure:       main > h1 > tablist(5 tabs) > table
Structure similarity: 0.85
```

**Generated:** Clone all `/recommendations` scenarios with URL replaced to `/incidents` and tab targets adjusted to `/incidents` tab labels.

---

## Integration Points with Existing Code

### 1. GuidedExplorer Extension

The `GuidedExplorer` in `src/scanner/guided-explorer.ts` needs a snapshot capture hook. This is a minimal, non-breaking change:

```typescript
// Add to GuidedExplorer class:
private snapshots: PageSnapshot[] = [];

// In executeStep(), after action succeeds:
if (this.config.captureSnapshots) {
  const snapshot = await this.captureSnapshot(page, stepIndex);
  this.snapshots.push(snapshot);
}

// New method:
getSnapshots(): PageSnapshot[] { return this.snapshots; }
```

### 2. ScanEngine Orchestration

In `src/scanner/engine.ts`, the learn → generate → execute pipeline is added after the guided exploration phase:

```typescript
// In ScanEngine.execute():
if (this.config.testPlan) {
  const guidedExplorer = new GuidedExplorer(this.config, analyzer);
  const guidedResult = await guidedExplorer.execute(context, scenarios, deadline);
  pages.push(...guidedResult.pages);

  // ── NEW: LEARN phase ──
  if (this.config.learn) {
    const extractor = new PatternExtractor();
    const patterns = await extractor.extract(
      guidedResult, scenarios, guidedExplorer.getSnapshots(), extractionConfig
    );
    const db = new PatternDatabase(this.config.patternDir);
    await db.save(patterns);
    logger.info(`Learned ${patterns.pagePatterns.length} page patterns, `
      + `${patterns.interactionPatterns.length} interaction patterns`);

    // ── NEW: GENERATE phase ──
    if (this.config.generate && Date.now() < deadline) {
      const llmClient = this.config.aiGenerate ? createLLMClient() : undefined;
      const generator = new TestPlanGenerator(llmClient);
      const generated = await generator.generate(patterns, null, generationConfig);
      logger.info(`Generated ${generated.length} new test scenarios`);

      // Save generated plans for future reference
      await db.saveGeneratedPlans(this.config.url, generated);

      // Execute generated plans through the SAME GuidedExplorer
      const generatedResult = await guidedExplorer.execute(
        context,
        generated as ImportedTestScenario[],  // compatible shape
        deadline,
      );
      pages.push(...generatedResult.pages);

      // Tag findings from generated plans
      for (const page of generatedResult.pages) {
        for (const finding of page.findings) {
          finding.reproSteps = ['[AI-Generated Test]', ...(finding.reproSteps || [])];
        }
      }
    }
  }
}
```

### 3. CLI Flags

Add to `src/cli.ts`:

```typescript
.option('--learn', 'Extract patterns from guided test execution for future generation')
.option('--generate', 'Generate new test plans from learned patterns and execute them')
.option('--ai-generate', 'Use LLM for edge case generation (requires API key)')
.option('--pattern-dir <path>', 'Directory for pattern storage (default: .a11y-patterns)')
.option('--max-generated <n>', 'Maximum number of generated scenarios (default: 30)', parseInt)
.option('--generation-strategies <strategies...>',
  'Which strategies to use: coverage-completion, depth-completion, cross-page-transfer, element-type-coverage, edge-case-generation')
```

Usage:
```bash
# Learn patterns from a test plan (no generation)
a11y-scan scan https://security.microsoft.com \
  --test-plan-file ./recommendations.yaml \
  --learn \
  --interactive-auth

# Learn + generate + execute (full loop)
a11y-scan scan https://security.microsoft.com \
  --test-plan-file ./recommendations.yaml \
  --learn --generate \
  --interactive-auth

# Learn + generate with LLM edge cases
a11y-scan scan https://security.microsoft.com \
  --test-plan-file ./recommendations.yaml \
  --learn --generate --ai-generate \
  --interactive-auth

# Re-run generation from previously learned patterns (no test plan needed)
a11y-scan scan https://security.microsoft.com \
  --generate \
  --pattern-dir ./.a11y-patterns \
  --interactive-auth
```

### 4. Report Integration

Extend the report output to distinguish human vs. generated findings:

```typescript
// In ScanResult, add:
export interface ScanResult {
  // ... existing fields ...

  /** Pattern learning results (when --learn is used) */
  learningSummary?: {
    patternsExtracted: number;
    pagePatterns: number;
    interactionPatterns: number;
    coverageGaps: number;
    patternFile: string;
  };

  /** Generation results (when --generate is used) */
  generationSummary?: {
    scenariosGenerated: number;
    scenariosExecuted: number;
    scenariosSucceeded: number;
    findingsFromGenerated: number;
    strategies: Record<GenerationStrategy, number>;
    llmTokensUsed?: number;
  };
}
```

HTML report: Add a "AI-Generated Tests" section showing which tests were auto-generated, their rationale, confidence scores, and which human test they were derived from.

---

## Feedback Loop: Learning Over Time

The `.a11y-patterns/` directory accumulates knowledge across scan runs:

```
.a11y-patterns/
  security.microsoft.com/
    patterns-2026-02-23T10-30-00.json     ← run 1: 3 human scenarios
    patterns-2026-02-23T14-00-00.json     ← run 2: 5 human scenarios + generated
    patterns-latest.json                   ← merged: all patterns
    generated-plans/
      generated-2026-02-23T10-30-00.json  ← run 1 generated plans
      generated-2026-02-23T14-00-00.json  ← run 2 generated plans
```

**Merge strategy:** When saving new patterns, `PatternDatabase.merge()`:
1. Union of `pagePatterns` (deduplicated by `structureFingerprint`)
2. Update `elementGroups` — tested elements accumulate; untested shrinks
3. Extend `interactionPatterns` with new observations
4. Merge `coverageMap` — union of tested elements, intersection of untested
5. Append to `navigationFlow.transitions`

This means each successive run learns MORE about the site:
- Run 1: "Tested 3 of 7 tabs" → generates 4 tab tests
- Run 2: "Tested 7 of 7 tabs, 0 row expansions" → generates row expansion tests
- Run 3: "Tested tabs + rows on /recommendations" → generates /incidents tests
- Run 4: "Tested /recommendations + /incidents" → generates edge cases

The scanner converges toward comprehensive coverage through iterative human + AI collaboration.

---

## Implementation Phases

| Phase | Scope | Effort | Dependencies |
|-------|-------|--------|-------------|
| **Phase 1: Types + Database** | Define all types in `patterns/types.ts`. Implement `PatternDatabase` with save/load/merge. | S | None |
| **Phase 2: Pattern Extractor** | Implement `PatternExtractor`. Add snapshot capture hook to `GuidedExplorer`. | M | Phase 1 |
| **Phase 3: Heuristic Generator** | Implement `TestPlanGenerator` strategies 1-4 (coverage, depth, cross-page, element type). No LLM. | M | Phase 1 |
| **Phase 4: Engine Integration** | Wire learn → generate → execute pipeline in `ScanEngine`. Add CLI flags. | M | Phases 2, 3 |
| **Phase 5: LLM Integration** | Implement `LLMClient` + edge case generation (strategy 5). Gate behind `--ai-generate`. | S | Phase 3 |
| **Phase 6: Report Integration** | Extend HTML/JSON reports with learning/generation sections. | S | Phase 4 |
| **Phase 7: Tests** | Unit tests for extractor, generator, database. Integration test for full loop. | M | All above |

**Sizing:** S = 1-2 days, M = 3-5 days. Total: ~4 weeks of specialist work.

**Phase 1-3 can be developed in parallel.** Phase 4 is the integration point. Phases 5-6 are enhancements.

---

## Decisions Required

1. **Drummer:** What a11y checks should be prioritized for generated scenarios? Should generated tests focus on keyboard nav, screen reader, or visual checks? (I recommend: keyboard + ARIA for heuristic; LLM decides for edge cases.)
2. **Naomi:** Should `GuidedExplorer` capture snapshots by default or only when `--learn` is active? (I recommend: only with `--learn` — snapshots add overhead.)
3. **Amos:** What's the test strategy for generated scenarios? We can't assert exact outputs since generation is non-deterministic. (I recommend: test each strategy in isolation with fixture patterns, assert shape + coverage properties.)
4. **Alex:** How should generated findings be distinguished in the HTML report? Separate section vs. inline badge? (I recommend: inline badge + filter toggle, plus a summary section.)
5. **All:** Should `--generate` require `--learn` in the same run, or can it use previously stored patterns? (I recommend: both — `--learn --generate` for full loop, `--generate` alone loads from `.a11y-patterns/`.)


# Decision: Smart Element Prioritization in DeepExplorer

**By:** Naomi
**Date:** 2025-07-18
**Status:** Implemented

## What
`findInteractiveElements()` in `deep-explorer.ts` now classifies every discovered element into three priority tiers and sorts them so the DFS explores content first:

- **P1 — CONTENT_AREA (scanned first):** Elements inside `[role="main"]`/`main`, `[role="tab"]`, `.ms-Pivot-link`, `.ms-DetailsRow`, `.ms-CommandBar` buttons, `[role="row"]`/`[role="gridcell"]`, and anything inside the main content landmark.
- **P2 — NAVIGATION (scanned second):** Nav links (`.ms-Nav-link`, elements inside `nav`/`[role="navigation"]`), menu items in navigation context.
- **P3 — CHROME (skipped entirely):** Account/profile buttons, collapse/expand navigation, O365 header elements, panel/dialog close buttons, app launcher, help/feedback, theme/language toggles. Matched via text regex, aria-label regex, CSS class patterns, and header containment.

A new `classifyElement()` method applies heuristics in order: chrome detection first (to reject early), then content detection, then navigation detection, with a fallback that uses landmark containment.

The `InteractiveElement` interface was extended with `ariaLabel`, `isInsideMain`, `isInsideNav`, `isInsideHeader`, `className`, and `priority` fields. All context is gathered in a single `page.evaluate()` call for efficiency.

Classification is logged per state: `📊 Elements: P1={n} content, P2={n} nav, P3={n} chrome (skipped)`.

## Why
The scanner was clicking "Collapse Navigation", "Account Manager", "Expand Navigation" — nav chrome that appears earlier in DOM order — instead of tabs, data rows, and action buttons inside the blade content. The entire scan budget was consumed on infrastructure UI. Priority sorting ensures the DFS spends its budget on actual content, with navigation elements explored only if time remains, and chrome never clicked at all.

## Impact
- `src/scanner/deep-explorer.ts` — modified `InteractiveElement` interface, added `ElementPriority` enum, chrome/content/nav pattern constants, `classifyElement()` method, rewrote `findInteractiveElements()` to classify and sort.
- No changes to `types.ts` or any other files.
- All 18 existing tests pass.


## GuidedExplorer & Test Plan Parser Implementation
**By:** Naomi
**Date:** 2025-07-18
**Status:** Implemented

### New Types in `src/scanner/types.ts`
- `TestPlanConfig` — configures test plan source (ado-api, file, inline), ADO connection settings, and exploration behavior.
- `GuidedStepResult` — per-step execution result with a11y findings, exploration findings, screenshot, timing.
- `GuidedExplorationResult` — aggregated result of all guided steps with page results and summary counts.
- `ScanConfig.testPlan?: TestPlanConfig` — opt-in field that activates guided scanning in the engine.
- `ScanResult.guidedResults?: GuidedExplorationResult` — carried on scan output for reporters.

### New File: `src/scanner/test-plan-parser.ts`
- `parseTestPlanFile(filePath)` — reads YAML or JSON files with `scenarios[].steps[].action/expected` shape.
- `parseInlineSteps(steps)` — converts CLI string array into a single ImportedTestScenario.
- `parseTestPlanUrl(url)` — extracts orgUrl, project, planId, suiteId from ADO test management URLs.
- Uses the `yaml` package (already in dependencies).
- Action parsing mirrors `test-case-importer.ts` regex patterns (intentionally duplicated to avoid coupling).

### New File: `src/scanner/guided-explorer.ts`
- `GuidedExplorer.execute(context, scenarios, deadline)` — main entry point.
- Executes scenarios sequentially; each scenario's steps run in order on one page.
- After each successful step: screenshot → a11y analysis via PageAnalyzer → optional DeepExplorer auto-exploration.
- Click strategy: getByRole → getByText → CSS selector (improvement over hybrid-scanner).
- Type strategy: getByLabel → getByPlaceholder → CSS selector.
- Waits for network idle after navigation/click actions.
- Step failures are non-fatal: logged and continued.
- Auto-exploration capped at 30s per step to protect the overall deadline.

### Engine Integration (`src/scanner/engine.ts`)
- New branch in `execute()`: if `this.config.testPlan` is set, loads scenarios via `loadTestPlanScenarios()` and runs GuidedExplorer before any SPA discovery.
- `loadTestPlanScenarios()` dispatches to file parser, inline parser, or ADO TestCaseImporter based on `testPlan.source`.
- If SPA discovery is also enabled and time remains, DeepExplorer runs after guided scanning.
- `guidedResults` propagated to `ScanResult` for Alex's reporters.

### Why This Design
- Three input formats (ADO API, file, inline) all converge to `ImportedTestScenario[]` — one consumer interface.
- Guided scanning runs BEFORE auto-discovery to give test plan URLs analysis priority (mirrors hybrid-scanner's priority phase).
- Per-step exploration depth is configurable via `TestPlanConfig.explorationDepth` (default 1).
- Step-level granularity in results enables ADO test case traceability in bug filing and reports.



# Decision — Alex: LEARN → INVENT CLI Flags & Report Integration

## 2025-07-18: Learn/Generate CLI flags and report sections

**Author:** Alex (Frontend Dev)
**Phase:** Phase 4 (CLI flags) + Phase 6 (Report Integration) of LEARN → INVENT pipeline

### CLI Flags Added

Added 5 new CLI flags to `src/cli.ts` scan command:

| Flag | Purpose |
|------|---------|
| `--learn` | Extract patterns from guided test execution |
| `--generate` | Generate new test plans from learned patterns and execute |
| `--ai-generate` | Use LLM for edge case generation (requires OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT) |
| `--pattern-dir <path>` | Directory for pattern storage (default: .a11y-patterns) |
| `--max-generated <n>` | Maximum generated scenarios (default: 30) |

Flags are parsed in `runScan()` and passed to `ScanEngine` config. Banner output shows active learn/generate modes in cyan.

### Engine Config Passthrough

Since `ScanConfig` doesn't yet have learn/generate fields (Naomi adding concurrently), we pass them via `as Record<string, unknown>` spread to avoid TS errors:

```typescript
...(learn || generate || aiGenerate ? {
  learn, generate, aiGenerate,
  ...(patternDir ? { patternDir } : {}),
  ...(maxGenerated !== undefined ? { maxGenerated } : {}),
  captureScreenshots: learn || undefined,
} as Record<string, unknown> : {}),
```

**TODO:** Once Naomi's types land on `ScanConfig`, remove the `as Record<string, unknown>` cast and use proper typed fields.

### HTML Report Additions

Two new sections in `src/reporting/formats/html-reporter.ts`:

1. **📚 Learning Summary** — shown when `result.learningSummary` exists. Displays page patterns, interaction patterns, coverage gaps, and output file path.

2. **🧪 AI-Generated Tests** — shown when `result.generationSummary` exists. Displays generated/executed/succeeded counts and a strategy breakdown with icons.

Strategy display map:
- coverage-completion → "📋 Coverage Completion"
- depth-completion → "🔍 Depth Completion"
- cross-page-transfer → "🔄 Cross-Page Transfer"
- element-type-coverage → "🎯 Element Type Coverage"
- edge-case-generation → "🤖 Edge Cases (AI)"

CSS class prefix: `ai-` (avoids collision with existing `tp-` test plan classes).

### JSON Report Additions

`src/reporting/formats/json-reporter.ts` conditionally includes `learningSummary` and `generationSummary` in output using spread syntax — absent when not present.

### Type Safety Notes

Both reporters use `(result as any).learningSummary` / `(result as any).generationSummary` because the types aren't on `ScanResult` yet. Once Naomi merges the interface extensions, we should:
1. Remove `as any` casts
2. Remove `as Record<string, unknown>` from CLI engine config
3. Add proper imports for `LearningSummary` and `GenerationSummary` types

### Build & Test

- ✅ `npm run build` passes
- ✅ All 43 tests pass
- No new tests added (these are display-only sections; data flows from engine)



---

## Finding Deduplication (engine-level)

**Decision by:** Naomi (Backend Dev)
**Date:** 2026-02-24

### Problem
Scanner visits the same page state multiple times (popups, navigation back) and re-discovers identical violations. A scan producing 90 findings had only ~15 unique ones.

### Solution
Added `deduplicateFindings()` to `ScanEngine` in `src/scanner/engine.ts`. Runs after all pages are collected, before `buildResult()`.

- **Dedup key:** `ruleId + '|' + selector` (falls back to `ruleId + '|' + htmlSnippet` when selector is empty)
- **First-wins:** Keeps the first occurrence per key
- **Scope:** Cross-page global dedup via a `Set<string>`
- **Logging:** Deduplicated: original to unique findings (removed duplicates removed)

### Files Changed
- `src/scanner/engine.ts` - Added `deduplicateFindings()` private method


# HTML Report Filter Toolbar & Severity View

**By:** Alex
**Date:** 2026-02-24

## What
Added client-side filter toolbar and view toggle to the HTML report's Detailed Findings section:
- **Severity filter:** toggle buttons for critical/serious/moderate/minor — all ON by default, clicking toggles visibility
- **Category filter:** toggle buttons for each unique category found in findings — all ON by default
- **Live counter:** "Showing X of Y findings" updates on every filter change
- **View toggle:** "By Page" (grouped by page, existing layout) vs "By Severity" (flat list, all findings sorted globally critical→minor). Severity view shows page-origin label on each card.
- Empty page sections auto-hide when all their findings are filtered out.
- Filter toolbar is sticky (`position: sticky; top: 0; z-index: 100`).
- Hidden in `@media print`.

## Why
User requested category and severity filters, plus global severity ordering. The report can have hundreds of findings — filters let users focus on what matters (e.g. "show me only critical color-contrast issues"). The "By Severity" view provides a triage-friendly flat list regardless of which page findings came from.

## Impact
- **html-reporter.ts:** New functions `buildFilterToolbar()`, `buildSeverityView()`. `buildFindingCard()` gained optional `pageLabel?: string` parameter. New CSS classes with `filter-`, `sv-`, `view-` prefixes. New client-side JS in `buildScript()`.
- **No impact on other reporters** (JSON, CSV) or scanner engine.
- **No new dependencies** — pure vanilla JS, self-contained HTML.

# Decision: TestPlanGenerator — 4 Heuristic Strategies

**Author:** Bobbie (UI Expert)
**Date:** 2025-07-25
**Status:** Implemented

## Context

Phase 3 of the LEARN → INVENT pipeline needs a TestPlanGenerator that takes `LearnedPatterns` from PatternExtractor and produces `GeneratedTestScenario[]` that feed back into GuidedExplorer for a second autonomous round.

## Decisions

### 1. Types Placement
Created `src/scanner/patterns/types.ts` as the canonical type source for the patterns module. Naomi's PatternExtractor will import from the same file. Types match the architecture in `decisions.md` exactly.

### 2. Strategy Architecture
Each strategy is a private method returning `GeneratedTestScenario[]`. The `generate()` method runs them in sequence, caps per-strategy at `maxPerStrategy`, filters by `minConfidence`, and caps total at `maxTotal`. Strategies are stateless — no shared mutable state between them.

### 3. Structural Similarity Algorithm
Cross-page transfer uses Jaccard similarity (intersection/union) on:
- Landmark roles (40% weight)
- Heading depth levels (20% weight)
- Element group roles (40% weight)

Threshold: 0.7 for transfer. This is deliberately conservative — false positives (generating broken tests for dissimilar pages) are worse than false negatives (missing a transferable page).

### 4. Label Mapping Strategy
Cross-page transfer maps element labels by *positional index* within matched element groups. This works well for pages built from the same template (e.g., /recommendations and /incidents with the same tab bar layout). Semantic label matching (e.g., NLP similarity) deferred to Phase 5 LLM integration.

### 5. Role Interaction Map
`ROLE_INTERACTION_MAP` maps ARIA roles to default interaction types. This is the single source of truth for "how do you interact with a checkbox?" → click/toggle. Extensible for new roles.

### 6. Edge Cases Stubbed
Strategy 5 (`edge-case-generation`) returns `[]`. It requires LLMClient which is Phase 5 scope.

## Files Changed
- `src/scanner/patterns/types.ts` (new)
- `src/scanner/patterns/test-plan-generator.ts` (new)

## Risks
- Positional label mapping may break for pages with different element counts in matched groups — will need fuzzy matching later.
- `getSetupActions()` only extracts navigate/wait steps before the first interaction — complex multi-step setups (click A, then click B, then test C) won't be fully reconstructed from interaction patterns alone.

### 2026-02-24: User directive — evidence-backed findings only
**By:** GalGoldi72 (via Copilot)
**What:** Every finding must be backed up with evidence (code snippet or screenshot). No assumptions — only report what the scanner can prove.
**Why:** User request — captured for team memory

### 2026-02-24: User directive — suppress unconfirmed contrast findings
**By:** GalGoldi72 (via Copilot)
**What:** Do not report color-contrast findings unless the scanner can confirm the issue with certainty. Axe-core "incomplete" (needs-review) contrast checks should be excluded from results entirely.
**Why:** User request — too many false positives on contrast checks where axe-core cannot determine actual colors (gradients, transparent backgrounds, CSS variables). Only confirmed violations should appear.

# Decision: Dynamic Accessibility Checks Architecture

**Date:** 2026-02-24  
**Author:** Drummer (Accessibility Expert)  
**Status:** Proposal (Awaiting Team Review)  
**Requested by:** GalGoldi72 — "I don't see in the live test a check for zoom, scale and other important checks. Is this because of the timeout?"

## Problem Statement

User observed that the live accessibility scanner does not test:
- Zoom at 200% (text readability, no horizontal scrolling)
- Text reflow at 320px (mobile responsiveness)
- Text spacing tolerance (letter/word/line/paragraph spacing)
- Display orientation (portrait ↔ landscape)
- Keyboard navigation (Tab, focus traps, focus visibility)
- Motion/animation tolerance (prefers-reduced-motion, flashing)
- Touch target sizes

These are **required checks** under WCAG 2.1 AA (Microsoft's stated compliance target) but cannot be performed by axe-core's static DOM analysis alone.

**Root cause:** Axe-core is excellent for static issues (missing alt text, heading hierarchy, etc.) but **cannot simulate browser manipulation** (viewport resize, zoom, keyboard input, screenshots for comparison).

## Solution: Dynamic Check Architecture

Add a new **DynamicAnalyzer** module that runs Playwright-based checks **after** axe-core's static analysis:

```
PageAnalyzer (current)
├─ axe-core checks (static DOM)
└─ hand-rolled color contrast, form labels, etc.

NEW: DynamicAnalyzer (proposed)
├─ Zoom & Reflow (1.4.4, 1.4.10)
├─ Text Spacing (1.4.12)
├─ Orientation (1.3.4)
├─ Keyboard & Focus (2.1.1, 2.1.2, 2.4.7, 2.4.11)
├─ Motion & Animation (2.3.1, 2.3.3)
└─ Touch Targets (2.5.8)
```

### Implementation Strategy

1. **Create `src/scanner/dynamic-analyzer.ts`**
   - New class with async `analyze(page, url)` method
   - Each WCAG criterion → one check method
   - Reuses `PageResult` and `Finding` types

2. **Integrate into `PageAnalyzer`**
   - Call `DynamicAnalyzer` after axe-core checks
   - Mark findings with `dynamic: true` for filtering/reporting
   - Gracefully degrade if timeout approaching

3. **Config flag: `enableDynamicChecks`**
   - Default: `false` (opt-in, slower scans)
   - Can be enabled via `ScanConfig.dynamicChecks: true`

4. **Performance gates:**
   - Each check has 2-second timeout
   - Skip remaining checks if global scan timeout within 10 seconds
   - Report `timedOut: true` on `ScanResult`

### Scope: 8 Dynamic Checks (Phase 2)

| Check | WCAG | Priority | Complexity | Est. Time |
|---|---|---|---|---|
| Text resize 200% | 1.4.4 | P0 | Medium | 2 sec |
| Reflow at 320px | 1.4.10 | P0 | Medium | 2 sec |
| Text spacing tolerance | 1.4.12 | P0 | Medium | 2 sec |
| Orientation support | 1.3.4 | P0 | Medium | 2 sec |
| Keyboard navigation (Tab) | 2.1.1 | P0 | Hard | 3 sec |
| No keyboard trap | 2.1.2 | P0 | Hard | 3 sec |
| Focus visible indicator | 2.4.7 | P0 | Hard | 4 sec |
| Focus not obscured (CSS) | 2.4.11 | P0 | Hard | 2 sec |
| Flashing content | 2.3.1 | P0 | Hard | 2 sec |
| Prefers-reduced-motion | 2.3.3 | P1 | Medium | 2 sec |
| Target size minimum 24×24 | 2.5.8 | P0 | Medium | 2 sec |
| Form labels | 3.3.2 | P0 | Simple | 1 sec |

**Estimated total for all 12 checks (parallelized):** ~30 seconds per page  
**Recommended subset (P0 only, critical):** ~20 seconds per page

## Trade-offs

### ✅ Benefits
- **Comprehensive:** Covers 11 of 13 WCAG 2.1 AA criteria (85% coverage)
- **Accurate:** Simulates real browser behavior (not static analysis)
- **Evidence-based:** Captures screenshots + reproSteps for manual verification
- **Microsoft-aligned:** Directly addresses WCAG 2.1 AA compliance
- **Phased:** Can opt-in; doesn't break existing scans

### ⚠️ Costs
| Cost | Impact | Mitigation |
|---|---|---|
| **Scan time +30 sec** | Longer waits for users | Make optional; document as "detailed scan" |
| **Image lib size** | +50-100KB dependencies | Lazy-load only if dynamic checks enabled |
| **Screenshot memory** | High RAM if many findings | Write to disk, cleanup after analysis |
| **False positives** | May flag responsive design | Whitelist common patterns; document exceptions |
| **Timeout risk** | Partial results if slow network | Degrade gracefully; report `timedOut` flag |

## Implementation Timeline

| Phase | Duration | Deliverables |
|---|---|---|
| **2A: Core zoom/reflow** | Week 1-2 | `checkTextResize200Percent`, `checkReflowMobile`, unit tests |
| **2B: Keyboard** | Week 3-4 | Tab nav, trap detection, focus visibility (with screenshot lib) |
| **2C: Motion** | Week 5-6 | Flashing detection, reduced-motion, target size |
| **2D: Polish** | Week 7 | Reporting, screenshots, reproSteps, perf optimization |
| **2E: Testing** | Week 8 | Integration tests, real-world sites, false positive reduction |

## Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "@axe-core/playwright": "^4.x",
    "playwright": "^1.x"
  },
  "optionalDependencies": {
    "pixelmatch": "^5.3.0",
    "sharp": "^0.33.0"
  }
}
```

- `pixelmatch`: For focus visibility (image diff)
- `sharp`: For flash detection (luminance analysis)
- Both optional; gracefully skip if not installed

## Config Changes

Add to `ScanConfig` type (in `src/scanner/types.ts`):

```typescript
interface ScanConfig {
  // ... existing fields
  
  dynamicChecks?: {
    enabled: boolean;          // Default: false
    includeFlashing?: boolean; // Default: true
    includeMotion?: boolean;   // Default: true
    timeoutPerCheck?: number;  // ms, default: 2000
  };
}
```

## API Contract

```typescript
// In PageAnalyzer.analyze()
if (this.config.dynamicChecks?.enabled) {
  const dynamicAnalyzer = new DynamicAnalyzer(this.config);
  const dynamicFindings = await dynamicAnalyzer.analyze(page, url);
  
  // Mark findings as dynamic for filtering
  dynamicFindings.forEach(f => f.dynamic = true);
  findings.push(...dynamicFindings);
}
```

## Testing Strategy

1. **Unit tests:** Mock page object, verify check logic
2. **Integration tests:** Real pages (W3C, Microsoft, internal test sites)
3. **Regression tests:** Ensure axe-core findings unchanged
4. **Performance tests:** Measure check duration, memory usage
5. **False positive audit:** Manual review of N=50 findings, target <10% error rate

## Approval Checklist

- [ ] Team reviews timing impact (is +30 sec acceptable for opt-in?)
- [ ] Naomi approves dependencies (pixelmatch, sharp)
- [ ] Alex confirms reporters can display `dynamic: true` findings
- [ ] Holden aligns with Phase 2 roadmap (vs. other priorities)
- [ ] GalGoldi72 confirms this addresses user request

## Success Criteria

✅ **Functional:**
- All 12 checks run successfully on test sites
- < 10% false positive rate (peer review)
- Findings include reproSteps and optional screenshots

✅ **Performance:**
- Dynamic checks optional (opt-in)
- Each check completes in < 2 sec (except focus visibility, ~4 sec)
- Graceful degradation if scan timeout approaching

✅ **Reporting:**
- HTML/JSON reports show dynamic findings
- Mark dynamic findings separately (color coding, badge)
- Include remediation guidance per WCAG criterion

---

## Questions for Team

1. **Should dynamic checks be ON by default, or opt-in only?**
   - Current proposal: opt-in (safety, avoid long scans)
   - Alternative: on for AA mode, off for quick scan

2. **Screenshot storage: inline (base64) or external?**
   - Current proposal: base64 (self-contained report)
   - Risk: Large HTML files; mitigation: compress, lazy-load

3. **Which image libraries?** (pixelmatch vs. OpenCV vs. custom?)
   - pixelmatch: lightweight, simple
   - sharp: production-grade, but heavier
   - Proposal: use both; pixelmatch for focus (small diffs), sharp for flashing (full page)

4. **Flash detection scope:**
   - Should we test full 2 seconds, or sample first 1 second?
   - Proposal: 2 seconds (safer for seizure risk)

---

*Document status: Ready for team discussion*  
*Next step: Holden schedules sync with team to approve Phase 2 scope*

# Decision Proposal: Microsoft Accessibility Standard Alignment

**Proposed by:** Drummer (Accessibility Expert)
**Date:** 2026-02-24
**Status:** Proposed
**Affects:** page-analyzer.ts, Finding type, HTML reporter, ADO bug creator, scanner config

---

## Context

We scanned security.microsoft.com and got 1,081 findings. Analysis revealed that **93% (1,008) are axe-core "incomplete" checks** (needs manual review), not confirmed violations. Our scanner currently treats all of these as equivalent bugs, which floods results with noise and destroys credibility.

Additionally, our axe-core tag configuration includes AAA-level and best-practice rules mixed in with required standards, making it impossible to distinguish compliance failures from aspirational improvements.

---

## Decisions Proposed

### Decision 1: Default axe-core tags — WCAG 2.1 AA Only

**Change the default tag set from:**
```typescript
['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
```

**To:**
```typescript
['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
```

**Rationale:** Microsoft targets WCAG 2.1 Level AA (confirmed via Microsoft Conformance Reports, Fluent 2 Design System, and Accessibility Insights). AAA is aspirational — no major organization requires it. Best-practice rules are not WCAG requirements.

**Optional presets** (user-selectable, off by default):
- `best-practice` — Advisory suggestions
- `wcag2aaa` — Enhanced accessibility (aspirational)
- `section508` — US federal government compliance
- `EN-301-549` — European standard compliance
- `TTv5` — Trusted Tester v5 (DHS methodology, used by Microsoft)

### Decision 2: Three-Tier Finding Classification

Findings must be classified into three tiers based on axe-core result type:

| Tier | Source | Report As | ADO Work Item |
|------|--------|-----------|---------------|
| **Violation** | `results.violations` | Bug (confirmed failure) | Bug |
| **Needs Review** | `results.incomplete` | Manual review item | Task |
| **Suggestion** | best-practice rules | Advisory | Task (low priority) |

**Implementation:** Add `reportingTier: 'violation' | 'needs-review' | 'suggestion'` and `needsReview: boolean` to the `Finding` type.

### Decision 3: Severity Downgrade for Incomplete Findings

Incomplete findings (needs-review) should have their severity downgraded because they are unconfirmed:

- critical/serious impact → **moderate** severity
- moderate/minor impact → **minor** severity

This prevents unconfirmed findings from competing with real violations for attention.

### Decision 4: AAA Findings Off By Default

AAA-level rules should be:
- **Off by default** in scanner configuration
- Available as an opt-in preset: `{ enableAAA: true }`
- When enabled, AAA violations are downgraded one severity level (they're aspirational, not required)

### Decision 5: Best-Practice Findings as Separate Tier

Best-practice findings should be:
- **Off by default** in scanner configuration
- Available as opt-in: `{ enableBestPractice: true }`
- When enabled, reported in a separate "Suggestions" section
- Never filed as ADO Bugs — always Tasks
- Maximum severity: moderate (regardless of axe-core impact)

---

## Impact Analysis

### On security.microsoft.com scan (1,081 findings → ~73 actionable bugs):

| Metric | Before | After |
|--------|--------|-------|
| Confirmed bugs | 1,081 (all treated equally) | ~73 (violations only) |
| Review items | 0 (mixed in with bugs) | ~1,008 (separate section) |
| Signal-to-noise ratio | ~7% real violations | ~100% real violations in bug tier |
| AAA noise | Included | Excluded by default |
| Best-practice noise | Included | Excluded by default |

### Files requiring changes:
- `src/scanner/page-analyzer.ts` — Separate violation/incomplete processing, add tier classification
- `src/scanner/types.ts` — Add `reportingTier`, `needsReview` to Finding type
- `src/rules/types.ts` — May need `ReportingTier` type
- HTML reporter — Separate sections per tier
- ADO bug creator — Bug vs Task based on tier
- Scanner config — Add `enableAAA`, `enableBestPractice`, `tagPresets` options

---

## Who needs to weigh in:
- **Holden** (Lead) — Architecture approval for tier system
- **Naomi** (Backend) — page-analyzer.ts changes
- **Alex** (Frontend) — HTML reporter changes
- **Avasarala** (PM) — Default behavior affects user experience

# Decision: Voice Access & NVDA Screen Reader Integration

**Date:** 2026-02-25  
**Author:** Drummer (Accessibility Expert)  
**Stakeholder:** GalGoldi72 (Product Owner)  
**Status:** PROPOSED — Awaiting team review

---

## Problem Statement

The Smart A11y Scanner currently covers **static DOM analysis** (axe-core) and is planning **dynamic browser checks** (Phase 2, Playwright zoom/keyboard/focus). However, **assistive technology compatibility**—specifically Windows Voice Access and NVDA screen reader—is not addressed.

### Why This Matters

- **Windows Voice Access** users rely on visible labels and click targets. Mismatched labels cause voice commands to fail silently.
- **NVDA screen reader** users (free, most popular on Windows) need proper ARIA, landmark regions, and live regions.
- **Microsoft accessibility standard** (WCAG 2.1 AA) requires both voice and screen reader support.
- **Market data:** 19% of US population has a disability (CDC); screen readers are mainstream, not niche.

### Current Gap

- Axe-core covers ~40% of screen reader compatibility (ARIA roles, names, forms)
- **Missing:** Voice access label matching, target size validation, live region content updates, reading order verification, skip links
- **Not attempted:** Screen reader automation (NVDA speech output verification)

---

## Proposed Solution

### Phase 2.5: Enhanced Voice Access & Screen Reader Checks (10 days)

**Add 8 new rules** to Smart A11y Scanner:

#### Voice Access (3 rules, 4 days)
1. **Label in Name (WCAG 2.5.3)** — Visible label matches accessible name
2. **Target Size Minimum (WCAG 2.5.8)** — Interactive elements ≥24×24 CSS pixels
3. **No Complex Gestures (WCAG 2.5.1)** — Heuristic detection of multi-touch interactions

#### Screen Reader (5 rules, 6.5 days)
1. **Live Regions (WCAG 4.1.3)** — Dynamic content announced via aria-live/role=alert
2. **Landmark Regions (WCAG 1.3.1)** — Page structure: main, nav, aside, footer
3. **Skip Links (WCAG 2.4.1)** — Skip navigation to main content
4. **Reading Order vs. Visual Order (WCAG 1.3.2)** — DOM order matches visual order
5. **Page Title & SPA Navigation (WCAG 2.4.2)** — Page has descriptive title; title updates on route change

**Implementation:**
- All checks use Playwright DOM analysis (`page.evaluate()`, `getBoundingClientRect()`, CSS property inspection)
- No new npm dependencies
- Rules follow existing category structure (add to `src/rules/categories/input-modalities.ts`, `aria.ts`, `screen-reader.ts`)
- Integrate into existing `DynamicAnalyzer` or create `AssistiveTechAnalyzer`

**Manual Testing Guidance:**
- Create `.ai-team/testing/screen-reader-manual-procedures.md`
- Document NVDA/Narrator test procedures
- Provide checklists for high-risk components (custom widgets, modals, carousels)

---

### Phase 3b: NVDA Automation Bridge (Q3 2026, optional)

**If aria-at integration approved:**
- Evaluate NVDA automation via aria-at project (W3C-maintained)
- Build Python ↔ Node.js IPC bridge
- Automate 5-7 checks: dialog focus, live region announcements, heading announcements, form labels, link purpose
- Estimated effort: 12-14 weeks

**Decision:** Defer decision until Phase 2.5 complete. Approve now only if team commits to Phase 3b timeline.

---

## Decision Points for Team

1. **Scope:** Approve all 8 Phase 2.5 checks, or subset?
   - **Recommended:** All 8 (covers WCAG 2.1 AA voice + screen reader requirements)
   - **Minimum viable:** Voice checks (1, 2) + Live Regions (1) = 2-3 weeks

2. **NVDA Automation (Phase 3b):**
   - Option A: Approve aria-at integration path (commit to Q3 2026)
   - Option B: Continue manual testing guidance only (lowest cost)
   - Option C: Revisit 2027 if automation tools mature (defer decision)
   - **Recommended:** Option C (no commitment risk; reassess in 2027)

3. **Priority:** Phase 2.5 checks must complete **before Phase 2 ships** (Playwright dynamic checks).
   - Reason: Voice access checks are WCAG 2.1 AA required; shipping without them blocks compliance.
   - Timeline: Phase 2 = 8-10 weeks; Phase 2.5 = 2 additional weeks → ship together Week 10.

---

## Impact Analysis

### Accessibility Coverage Improvement

| Criterion | Before | After | Status |
|-----------|--------|-------|--------|
| 2.5.1 Pointer Gestures | ❌ No | ✅ Heuristic | Green |
| 2.5.3 Label in Name | ⚠️ Axe-core partial | ✅ Enhanced | Green |
| 2.5.8 Target Size | ❌ No | ✅ Yes | Green |
| 4.1.3 Status Messages | ⚠️ Static only | ✅ Live regions | Green |
| 2.4.1 Bypass Blocks | ❌ No | ✅ Yes | Green |
| 2.4.2 Page Title | ❌ No | ✅ Yes | Green |
| 1.3.2 Meaningful Sequence | ⚠️ Static only | ✅ CSS reordering | Green |
| 1.3.1 Info & Relationships | ✅ Axe-core | ✅ + landmarks | Green |

**Result:** WCAG 2.1 AA voice + screen reader coverage increases from 60% → 90%.

### Resource Impact

- **Engineering effort:** 10-12 days (Naomi/Alex, can parallelize with Phase 2)
- **QA effort:** 3-5 days (Amos, manual testing validation)
- **Documentation:** 2 days (Drummer)
- **No infrastructure cost** (no new services, existing Playwright)

### Risk Assessment

**Low risk:**
- All checks use existing Playwright API
- Follow proven pattern from dynamic checks
- No new dependencies

**Medium risk:**
- Gesture detection heuristics may have false positives (requires test refinement)
- Reading order detection requires CSS property inspection (may miss edge cases)
- Mitigation: Flag as "manual testing recommended" in findings

**Deferred:**
- NVDA automation (Phase 3b) carries higher risk if aria-at integration needed

---

## Recommendation

**✅ APPROVE Phase 2.5: Voice Access & NVDA Checks**
- Solves GalGoldi72's request ("what about voice access, NVDA?")
- Closes WCAG 2.1 AA gap
- Enables Microsoft accessibility certification
- Minimal resource impact
- Pairs naturally with Phase 2 (dynamic checks)

**⏸ DEFER Phase 3b decision** until Phase 2.5 complete (Q2 2026). Reassess aria-at maturity and team bandwidth in Q3.

---

## Success Criteria

Phase 2.5 is complete when:
- [ ] 8 new rules implemented and tested
- [ ] Findings integrated into reports (mark as "Voice Access" / "Screen Reader" tags)
- [ ] Manual testing procedures documented
- [ ] Tested on 3+ accessibility-focused sites (Microsoft, WebAIM, Deque)
- [ ] WCAG 2.1 AA voice + screen reader coverage ≥85%
- [ ] No new regressions in Phase 1/2 checks

---

## Questions for Team Discussion

1. **Holden (Lead):** Should Phase 2.5 integrate into Phase 2 codebase or be separate release?
2. **Naomi (Backend):** Preferred location for new rules — DynamicAnalyzer or new AssistiveTechAnalyzer class?
3. **Alex (Frontend):** Any UI considerations for reporting assistive tech findings separately?
4. **Amos (Tester):** Resources available for NVDA manual testing in Q2 2026?
5. **Avasarala (PM):** Should Marketing highlight "Voice Access + NVDA support" in Phase 2.5 messaging?

---

## Appendix: Detailed Analysis

See `docs/voice-access-nvda-plan.md` for:
- Part 1: 12 detailed checks (voice + screen reader) with WCAG references
- Part 2: Screen reader automation state in 2024-2026
- Part 3: Implementation roadmap and delivery timeline

### 2026-02-24: .gitignore and sensitive data scrubbing required before public push
**By:** Holden
**What:** Created `.gitignore` excluding `node_modules/`, `dist/`, `a11y-reports/`, `.a11y-patterns/`, `.env*`, IDE files, OS files, logs, and coverage output. Removed `node_modules/` (5,829 files) and `dist/` (116 files) from git tracking. Replaced real Azure tenant/resource GUIDs in test files with obviously-fake placeholders. Removed corporate email from `.ai-team/team.md`. Replaced hardcoded form test password in `detection/types.ts`.
**Why:** Repository had no `.gitignore` — pushing to GitHub would have published all of `node_modules`, compiled output, scan reports containing internal Microsoft portal URLs/tenant IDs/OAuth tokens/screenshots, and personal corporate email. These are not credentials per se, but they expose internal infrastructure details and personally identifiable information that should never be in a public repo.

# Decision: DynamicAnalyzer Module

**Date:** 2026-02-25  
**Author:** Naomi (Backend Dev)  
**Status:** Implemented  
**File:** `src/scanner/dynamic-analyzer.ts`

## What

New `DynamicAnalyzer` class that performs 10 Playwright-driven accessibility checks requiring active browser manipulation. Complements the existing `PageAnalyzer` (static axe-core + hand-rolled DOM checks).

## Checks Implemented

| # | Check | WCAG | Severity | Category |
|---|-------|------|----------|----------|
| 1 | `checkZoomReflow()` — 200% zoom, horizontal scroll, text clipping | 1.4.4, 1.4.10 | serious | distinguishable |
| 2 | `checkTextSpacing()` — WCAG spacing overrides, overflow detection | 1.4.12 | serious | distinguishable |
| 3 | `checkKeyboardNavigation()` — Tab 30x, focus indicators, keyboard traps | 2.1.1, 2.1.2, 2.4.7 | critical/serious | keyboard/navigable |
| 4 | `checkFocusOrder()` — Tab order vs visual order | 2.4.3 | serious | navigable |
| 5 | `checkLabelInName()` — Visible text in accessible name | 2.5.3 | moderate | input-modalities |
| 6 | `checkTargetSize()` — 24×24px minimum | 2.5.8 | moderate | input-modalities |
| 7 | `checkLandmarks()` — main, nav, any landmarks | 1.3.1 | serious/moderate | screen-reader |
| 8 | `checkSkipLinks()` — First focusable = skip link | 2.4.1 | moderate | navigable |
| 9 | `checkLiveRegions()` — Missing aria-live on dynamic containers | 4.1.3 | moderate | screen-reader |
| 10 | `checkOrientation()` — Portrait/landscape viewport test | 1.3.4 | moderate/serious | adaptable |

## Design Decisions

1. **Independent try/catch per check** — one failing check does not block others
2. **Deadline parameter** — `analyze(page, deadline)` skips remaining checks when time runs out
3. **State reset in finally blocks** — zoom, injected styles, and viewport restored after each check
4. **No engine.ts changes yet** — module is standalone; integration is a separate step
5. **`dynamicChecks?: boolean` added to ScanConfig** — opt-in flag, default false

## Integration Plan

Engine will call `dynamicAnalyzer.analyze(page)` after `pageAnalyzer.analyze(page)` when `config.dynamicChecks` is true. This is a future step — not wired yet.

## What This Does NOT Cover

- Screenshot-based pixel comparison for focus visibility (deferred — needs image processing library)
- Animation/flash detection (WCAG 2.3.1) — requires frame capture over time
- MutationObserver-based live region detection — current approach is heuristic/static
- These are P1/P2 items for a future sprint

# LEARN → INVENT Pipeline Implementation

**By:** Naomi
**Date:** 2026-02-24

## What

Implemented Phases 1, 2, and 4 of the AI Test Plan Learning & Generation architecture from Holden's design doc.

### Phase 1 — Pattern Types & Database
- `src/scanner/patterns/types.ts`: Full type definitions for the LEARN → INVENT pipeline (LearnedPatterns, PageSnapshot, ExtractionConfig, GenerationConfig, etc.)
- `src/scanner/patterns/pattern-database.ts`: File-based persistence layer. Saves/loads/merges patterns per-site in `.a11y-patterns/{hostname}/`. Timestamped files with latest copy.

### Phase 2 — Pattern Extraction & Snapshot Capture
- `src/scanner/patterns/pattern-extractor.ts`: Extracts page patterns, interaction patterns, navigation flow, and coverage map from guided execution traces. All heuristic — no LLM.
- `src/scanner/guided-explorer.ts`: Added `captureSnapshot()` using `page.evaluate()` to walk DOM for interactive elements, landmarks, headings, and a11y tree. Gated behind `config.learn || config.captureSnapshots`.

### Phase 4 — Engine Wiring
- `src/scanner/engine.ts`: LEARN phase calls PatternExtractor → PatternDatabase after guided exploration. GENERATE phase dynamically imports TestPlanGenerator, generates scenarios, executes them via GuidedExplorer round 2, and tags findings.
- `src/scanner/types.ts`: Added `learn`, `generate`, `aiGenerate`, `patternDir`, `maxGenerated`, `generationStrategies`, `captureSnapshots` to ScanConfig. Added `learningSummary` and `generationSummary` to ScanResult.

## Why

Users write a few test plans, the scanner learns structural and interaction patterns from the execution trace, then generates additional test scenarios to fill coverage gaps. Generated scenarios use the same `ImportedTestScenario` shape so they feed into GuidedExplorer with zero integration cost.

## Key Design Decisions

1. **Snapshot capture is gated** — only runs when `config.learn` or `config.captureSnapshots` is true. Zero perf cost when not learning.
2. **Dynamic import for TestPlanGenerator** — `await import('./patterns/test-plan-generator.js')` inside a try/catch so the generate phase degrades gracefully if the module isn't available.
3. **Pattern merge is additive** — patterns accumulate across runs. Page patterns union by fingerprint, element groups by role+selector, interaction patterns by name.
4. **Element similarity is label-based** — Jaccard similarity on word sets plus role matching. No LLM needed for extraction.
5. **`generationStrategies` is `string[]` on ScanConfig** — cast to `GenerationStrategy[]` at the call boundary to keep config JSON-friendly.

## Verification

- `npm run build` — clean compile
- `npm test` — all 43 existing tests pass

# Decision: Overlay Analyze-Only Mode

**Author:** Naomi (Backend Dev)
**Date:** 2025-07-25
**Status:** Implemented
**Commit:** b9b6abb

## Context

During deep exploration, when a panel/overlay opens (e.g., a settings flyout), the scanner was attempting to click through all interactive elements inside the overlay AND the elements behind it. Elements behind the overlay are blocked by the panel's backdrop, causing Playwright clicks to fail or time out. In scan #15 this caused the scanner to hang for 5+ minutes trying to explore 173 blocked elements.

## Decision

When an overlay is detected during `exploreState()`, the scanner now enters **analyze-only mode**: it runs accessibility analysis (axe-core + hand-rolled checks) on the current page state but skips element exploration entirely. The overlay is then closed via `closeOverlay()` before continuing normal exploration.

Additionally, `closeOverlay()` was rewritten with 6 ordered strategies and diagnostic logging:
1. Press Escape
2. Click close button (visible overlays only)
3. Click dismiss buttons by text (Got it, Close, Dismiss, etc.)
4. Click Cancel/Close text buttons (Cancel prioritized over Close)
5. Case-insensitive aria-label matching for close buttons
6. Click outside the overlay

## Rationale

- Clicking blocked elements is wasted time — the overlay prevents interaction with underlying content
- Accessibility analysis still captures findings from the overlay's content, which is valuable
- The 6-strategy close approach handles the variety of overlay implementations seen in Microsoft portals
- Diagnostic logging makes it easy to debug overlay issues in future scans

## Impact

- Scan #16 completed in 93s (down from 5+ min hang)
- Panel closed successfully via Escape (Strategy 1)
- 8 findings across 2 states — no loss of coverage
- File: `src/scanner/deep-explorer.ts`

# Decision: SIP URL Normalization & Popup Dismissal Hardening
**Author:** Naomi (Backend Dev)
**Date:** 2026-02-25

## SIP URL Normalization
- Exported `normalizePageUrl(rawUrl, targetUrl)` from `src/scanner/page-analyzer.ts`.
- If the page URL hostname has a `sip.` prefix relative to the target (e.g. `sip.security.microsoft.com` → `security.microsoft.com`), the target hostname is used instead.
- Applied at every point where `finding.pageUrl` is stamped — both in PageAnalyzer and DeepExplorer.
- Other team members: if you set `pageUrl` on findings, use `normalizePageUrl()` to keep URLs consistent.

## Popup Dismissal Improvements
- `closeOverlay()` now verifies overlay count decreased after each dismiss strategy (was fire-and-forget).
- Strategy order changed: Escape → close buttons → text-based dismiss buttons → click outside.
- New `tryTextBasedDismiss()` method clicks buttons with common dismiss text ("Got it", "Close", "Dismiss", "OK", "Skip", etc.) inside dialog containers.
- `dismissInitialPopups()` has a fallback path: if overlay persists after `closeOverlay()`, it tries `tryTextBasedDismiss()` again.

# Decision: `.env.example` File Creation

**Date:** 2025 (current session)  
**Owner:** Naomi (Backend Dev)  
**Status:** Complete

## Summary

Created `.env.example` file at the project root documenting all environment variables used by the smart-a11y-scanner.

## What Was Done

Scanned the entire codebase for `process.env` references and compiled a comprehensive list of all environment variables:

1. **ADO_PAT** (required for ADO integration)
   - Azure DevOps Personal Access Token
   - Used in: `src/cli.ts`, `src/config/loader.ts`
   - Required for bug filing and test plan API access

2. **A11Y_SCANNER_CREDENTIALS** (optional)
   - Scanner authentication in `user:pass` format
   - Used in: `src/cli.ts`, `src/scanner/engine.ts`
   - Falls back to `--credentials` CLI option

3. **OPENAI_API_KEY** (optional)
   - OpenAI API key for LLM-based edge case generation
   - Referenced in: CLI help text and decisions.md
   - Required only when using `--ai-generate` flag

4. **AZURE_OPENAI_ENDPOINT** (optional)
   - Azure OpenAI service endpoint
   - Alternative to standard OpenAI
   - Referenced in: CLI help text and decisions.md

5. **AZURE_OPENAI_API_KEY** (optional)
   - API key for Azure OpenAI service
   - Used alongside `AZURE_OPENAI_ENDPOINT`
   - Referenced in: CLI help text and decisions.md

## File Location

`.env.example` at project root

## Format Chosen

- Simple `KEY=` format (no quotes) for easy copy-paste
- Comments above each variable explaining purpose and requirement level
- Grouped logically: ADO, Auth, AI

## Rationale

- **Required vs Optional:** Clearly marked based on codebase usage patterns
- **User:pass format:** Documented the expected format for credentials
- **Comment clarity:** Each comment explains what the variable does and when it's needed
- **Comprehensive:** Covered not just explicitly used vars but also referenced in CLI help (OpenAI keys)
