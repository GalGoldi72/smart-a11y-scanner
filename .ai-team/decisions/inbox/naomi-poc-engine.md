# Decisions — Naomi POC Engine

## D-NAOMI-001: Scanner types live in `src/scanner/types.ts`

**Context:** Holden scaffolded shared types in `src/types/` (Finding, ScanResult, PageResult, ScanConfig). I need scanner-internal types for Playwright orchestration (browser config, crawl settings, page metadata, screenshot handling).

**Decision:** Scanner-internal types live in `src/scanner/types.ts`. They import from `src/rules/types.ts` (Drummer's rule types). The shared types in `src/types/` are the reporting/CLI boundary. My engine outputs `ScanResult` from `src/scanner/types.ts`; a mapping layer should convert to the shared `ScanResult` at the reporting boundary.

**Status:** Needs reconciliation with Holden's shared types.

---

## D-NAOMI-002: ADO client exports `IADOClient` interface for `bug-creator.ts`

**Context:** Holden's `bug-creator.ts` programs against `IADOClient`, `ADOWorkItem`, `ADOCreateResult`. My `AdoClient` class needs to satisfy that contract.

**Decision:** `src/ado/client.ts` exports both the `AdoClient` concrete class (implements `IADOClient`) and the interfaces `IADOClient`, `ADOWorkItem`, `ADOCreateResult`. The `bug-creator.ts` consumes the interface; the engine can use the class directly.

---

## D-NAOMI-003: `tsconfig.json` needs `DOM` and `DOM.Iterable` libs

**Context:** Playwright `page.evaluate()` callbacks execute in the browser and reference `document`, `window`, `NodeListOf`, etc. Without DOM libs, TypeScript can't type-check these.

**Decision:** Added `"DOM"` and `"DOM.Iterable"` to `tsconfig.json` `lib` array. This is safe since the Node.js-side code doesn't accidentally use DOM globals (they're only inside `page.evaluate()` callbacks).

---

## D-NAOMI-004: Crawler normalizes URLs before visiting

**Context:** The same page can appear as `https://site.com/about`, `https://site.com/about/`, `https://site.com/about#section`, etc.

**Decision:** The `Crawler` strips hashes, removes trailing slashes (except root `/`), and sorts query params before checking the visited set. This prevents duplicate visits without being overly aggressive.

---

## D-NAOMI-005: Page screenshots attached to first finding per page

**Context:** Element-level screenshots are expensive (one Playwright locator screenshot per finding). For the POC, we need screenshot evidence but can't afford the perf hit.

**Decision:** Capture one full-page screenshot per page and attach it to the first finding. Element-level screenshots can be added later as an opt-in feature.

---

## D-NAOMI-006: Color contrast computed inline via WCAG luminance formula

**Context:** Full contrast checking requires compositing background layers, handling transparency, gradients, and images. That's complex.

**Decision:** For the POC, compute contrast using `window.getComputedStyle()` on foreground color and background color. Flag elements where both are explicitly set and the ratio fails WCAG thresholds (4.5:1 for normal text, 3:1 for large text). Limit to 20 findings per page to avoid flooding. Improve later with layered background resolution.
