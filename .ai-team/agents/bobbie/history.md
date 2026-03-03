# History — Bobbie (UI Expert)

## Project Context
- **Project:** Smart A11y Scanner — AI accessibility scanner for websites
- **Stack:** TypeScript, Node.js, Playwright, Azure DevOps API
- **User:** GalGoldi72 (ggoldshtein@microsoft.com)
- **Team:** Holden (Lead), Avasarala (PM), Naomi (Backend), Alex (Frontend), Amos (Tester), Drummer (A11y Expert), Bobbie (UI Expert)

## Learnings

### POC — Detection Module Implementation (2025-01)
- Built 4 core detection modules: `UIDetector`, `FlowAnalyzer`, `InteractionSimulator`, `SiteMapper`
- All modules live in `src/detection/` with types in `src/detection/types.ts` and barrel export in `src/detection/index.ts`
- **UIDetector**: Detects all interactive elements via `page.evaluate()` running DOM queries inside the browser. Covers shadow DOM, iframes, ARIA roles, framework data-attributes (React/Angular/Vue), event listeners via CDP. Returns `ElementInfo[]`.
- **FlowAnalyzer**: Structural page analysis — navigation patterns (header/sidebar/footer/breadcrumb/tab-group/accordion/dropdown/pagination), form detection with purpose classification (login/search/registration/contact/newsletter/payment), trigger→target relationship mapping (aria-controls, aria-haspopup, Bootstrap toggles, summary/details), keyboard tab order tracing, ARIA landmark detection.
- **InteractionSimulator**: Simulates click/hover/focus/fill/tab/scroll on detected elements using Playwright. Records DOM snapshots before/after each action and computes `DomDelta` (added/removed/changed elements, URL changes, modal appearances). Includes `tabThrough()` for full keyboard nav tracing and `scrollAndDetect()` for lazy-load discovery.
- **SiteMapper**: Crawls from a seed URL using BrowserContext. Runs UIDetector + FlowAnalyzer on each page. Discovers JS-driven navigation by simulating clicks and tracking URL changes. Builds a `SiteGraph` with pages, edges, element counts.
- Holden scaffolded skeleton files before I arrived — I replaced the skeletons with real implementations while preserving the interface contracts (`IFlowAnalyzer`).
- My `ElementInfo` in `detection/types.ts` is more detailed than Holden's `ElementInfo` in `types/page.ts`. They serve different purposes: mine is for deep UI analysis, his is for generic page scanning. Can be reconciled later.
- `buildSelector()` is duplicated across `evaluate()` calls because each runs in an isolated browser context — no way to share code between them. TypeScript strict mode requires `const cur = current` pattern before filter callbacks that reference `current` in a loop, to avoid circular type inference with `parentElement`.
- CDP event listener detection is best-effort — only works on Chromium, fails gracefully on Firefox/WebKit.
- Form purpose detection uses heuristics on field names, ids, autocomplete attributes, and form action URLs. Works for common patterns; AI-based classification would be stronger for v2.

### Phase 3 — TestPlanGenerator Implementation (2025-07)
- Created `src/scanner/patterns/types.ts` with all LEARN→INVENT pipeline types (LearnedPatterns, GeneratedTestScenario, GenerationConfig, PageSnapshot, etc.) — canonical source, Naomi may merge/extend when PatternExtractor lands.
- Created `src/scanner/patterns/test-plan-generator.ts` — the INVENT engine with 4 heuristic strategies:
  1. **Coverage Completion** — clones tested scenario actions and swaps element labels for untested siblings in the same group. Confidence = `similarityToTested` from the untested element ref.
  2. **Depth Completion** — for table/grid/tree groups, detects when only top-level elements were tested and generates expand-and-verify scenarios for child rows/tree items. Fixed confidence 0.7 (expansion behavior less predictable).
  3. **Cross-Page Transfer** — computes structural similarity (Jaccard on landmarks 40% + headings 20% + element groups 40%) between all page patterns, clones scenarios from tested → untested pages when similarity > 0.7. Builds positional label mapping.
  4. **Element Type Coverage** — scans `coverageMap.elementTypeCoverage` for untested roles, generates basic click/type/toggle interactions using a `ROLE_INTERACTION_MAP` lookup. Confidence 0.6 (generic patterns).
- Edge case generation (Strategy 5) is stubbed — returns empty array until LLMClient lands in Phase 5.
- `GeneratedTestScenario` extends `ImportedTestScenario` shape so GuidedExplorer accepts them directly with no adapter.
- `computeStructuralSimilarity()` made public for testability.
- Build passes clean, all 43 existing tests pass.

## 2026-02-23: Team Decisions Merged
📌 **Smart Element Prioritization Deployed in DeepExplorer** — Design by Holden, implementation by Naomi. Your UIDetector in detection/ remains independent, but the new prioritizer in deep-explorer.ts now classifies interactive elements P1/P2/P3. This doesn't replace your detection work, but improves the DFS traversal order immediately. Future phases may wire detection into the prioritizer for even richer classification.

📌 **ADO Test Plan Integration Architecture** — Holden's design mentions you may implement Part 1 (ElementPrioritizer as a standalone module). Currently Naomi put it inline in deep-explorer.ts. Post-POC: consider whether to extract to a dedicated src/scanner/element-prioritizer.ts module.

📌 Team update (2026-03-03): TestPlanGenerator 4-strategy implementation with structural similarity, positional label mapping. Decision by Bobbie
