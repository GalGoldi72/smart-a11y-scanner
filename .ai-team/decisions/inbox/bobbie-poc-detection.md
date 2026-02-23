# Decision: Detection Module Architecture — Bobbie POC

**Date:** 2025-01-01
**Author:** Bobbie (UI Expert)
**Status:** Implemented

## Context
POC build of the UI detection and flow analysis subsystem. Needed to deliver working code that takes a Playwright Page and returns structured interactive element data + navigation flow graphs.

## Decisions

### 1. Own types in `detection/types.ts`
My `ElementInfo` is richer than Holden's `types/page.ts` version (includes category, ARIA attributes, computed styles, framework hints, shadow DOM flag, event listeners). Both can coexist — mine feeds detection logic, his feeds the scan pipeline. **Reconciliation is a follow-up task.**

### 2. `buildSelector()` duplicated across evaluate calls
Each `page.evaluate()` runs in an isolated browser sandbox. There's no way to share utility functions between them. The duplication is intentional and unavoidable without a build-time injection step.

### 3. CDP event listener detection is opt-in and Chromium-only
Using Chrome DevTools Protocol to query `DOMDebugger.getEventListeners`. Falls back gracefully on Firefox/WebKit. Controlled by `detectEventListeners` config flag.

### 4. Form purpose detection uses heuristics, not AI
For POC, form classification (login, search, registration, etc.) uses pattern matching on field names, ids, autocomplete values, and action URLs. Good enough for common patterns. AI-based classification is a v2 enhancement.

### 5. InteractionSimulator uses DOM snapshots, not MutationObserver
Taking before/after snapshots via `page.evaluate()` is simpler and more reliable across frameworks than injecting a MutationObserver. Trade-off: we miss transient DOM changes that appear and disappear within the interaction window.

### 6. SiteMapper crawl is breadth-first with configurable depth
Follows `maxCrawlDepth` and `maxPages` from `DetectionConfig`. Discovers JS-driven navigation by clicking buttons and tracking URL changes. Adds edges for both link-based and interaction-based transitions.

## Files Created/Modified
- `src/detection/types.ts` — All detection type definitions + `DEFAULT_CONFIG`
- `src/detection/ui-detector.ts` — Full implementation replacing Holden's skeleton
- `src/detection/flow-analyzer.ts` — Full implementation replacing Holden's skeleton
- `src/detection/interaction-simulator.ts` — New file
- `src/detection/site-mapper.ts` — New file
- `src/detection/index.ts` — Barrel export
