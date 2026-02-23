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
