# History — Naomi (Backend Dev)

## Project Context
- **Project:** Smart A11y Scanner — AI accessibility scanner for websites
- **Stack:** TypeScript, Node.js, Playwright, Azure DevOps API
- **User:** GalGoldi72 (ggoldshtein@microsoft.com)
- **Team:** Holden (Lead), Avasarala (PM), Naomi (Backend), Alex (Frontend), Amos (Tester), Drummer (A11y Expert), Bobbie (UI Expert)

## Learnings
- DFS exploration: `exploreState()` now immediately recurses into new states discovered via click before continuing with sibling elements at the same depth. The key is passing the breadcrumb stack through recursion — each `clickAndExplore` builds a `BreadcrumbEntry` from the state change type (url_change → "click", overlay_opened → "panel_opened", etc.) and appends it to the breadcrumb before recursing. This makes the traversal explicitly depth-first.
- Navigation breadcrumb is a `BreadcrumbEntry[]` stored on `ExplorationState.navigationPath` and formatted into `Finding.reproSteps` as human-readable strings. Format: "Navigate to {url}", "Click '{text}'", "Panel '{name}' opened", etc. Every finding from deep exploration gets repro steps automatically.
- Screenshots are taken at two levels: (1) full-page `stateScreenshot` on `ExplorationState` when a new state is first visited (`fullPage: true`), and (2) viewport-level screenshot on each `Finding` (`fullPage: false`). If analyzer's per-finding screenshot fails, the state screenshot is used as fallback. Base64 PNG, no disk writes.
- `BreadcrumbEntry` type lives in `src/scanner/types.ts` alongside `ExplorationState` and `Finding`. Fields: `action`, `elementText`, `url`.
- `PageAnalyzer.analyzeCurrentPage()` now accepts optional `reproSteps?: string[]` parameter. This is a non-breaking change — callers without repro steps still work (the parameter is optional). The method stamps repro steps onto every finding it produces.
- ADO Test Management REST API uses a separate base path (`_apis/testplan/`) from Work Items (`_apis/wit/`). Test case steps are stored as XML in the `Microsoft.VSTS.TCM.Steps` field — lightweight regex parsing is sufficient since the structure is predictable.
- The `x-ms-continuationtoken` header is how ADO paginates test plan/suite endpoints — different from the `$skip`/`$top` pattern used by Work Items batch API.
- Test case step text uses natural language, so action parsing is inherently heuristic. Navigate/click/type patterns cover ~80% of well-written test steps. Steps that don't match any pattern get tagged `unknown` — the hybrid scanner skips them gracefully rather than failing.
- The hybrid scanner's 5-phase pipeline (priority scan → guided nav → automated crawl → gap analysis → enriched bug filing) keeps each concern isolated. Phase ordering matters: manual URLs first gives them analysis priority before the crawler's page budget is consumed.
- Linking bugs to test cases uses ADO's `Microsoft.VSTS.Common.TestedBy-Forward` relation type. This appears in both the bug and test case UI, giving QA teams traceability without extra work.
- Gap analysis coverage score is `overlap / union` — simple but immediately useful for showing customers where their manual and automated testing diverge.
- Holden scaffolded `package.json`, `tsconfig.json`, and skeleton files across `src/types/`, `src/config/`, `src/detection/`, `src/reporting/`, `src/ado/bug-creator.ts` before I started. Many of those have import errors because the types they reference don't exist yet or were renamed — that's expected for scaffolding.
- Drummer's `src/rules/types.ts` defines `AccessibilityRule`, `Severity`, `WcagLevel`, `RuleCategory`, `AnalysisMode`, `WcagReference`, `RuleCatalog`. All my scanner types build on these.
- `tsconfig.json` uses `module: "Node16"` — all relative imports need `.js` extensions. Also needed to add `"DOM"` and `"DOM.Iterable"` to `lib` for Playwright `page.evaluate()` callbacks that run in browser context.
- Holden's `bug-creator.ts` expects `IADOClient`, `ADOWorkItem`, `ADOCreateResult` from my client. I exported those interfaces so it compiles.
- Holden's shared types (`src/types/scan-types.ts`, `src/types/finding.ts`, etc.) define a parallel type system for CLI/reporting. My scanner has its own internal types in `src/scanner/types.ts`. These will need reconciliation — my `ScanResult` should map to the shared `ScanResult` at the reporting boundary.
- Playwright `page.evaluate()` runs code in the browser. Color contrast can be computed inline using `window.getComputedStyle()` and the WCAG luminance formula. Works well for elements with explicit bg colors; inherited/layered backgrounds need a more sophisticated approach later.
- The scanner gracefully handles network failures — DNS resolution, timeouts, navigation errors all result in a `PageResult` with an `error` field, not a crash.
- POC verified: 6 rule checks fire correctly against a local test page (img-alt-text, form-input-label, heading-hierarchy, document-lang, link-name, button-name, color-contrast). 14 findings detected from a single test page.
- POC sprint: Added configurable scan timeout (default 600s/10min). `ScanConfig.timeout` sets the deadline; crawler checks it before each URL, engine checks before each page analysis. Partial results returned on timeout with `timedOut: true`.
- POC sprint: Replaced old `auth?: { username, password }` with rich `AuthConfig` supporting three flows: cookie injection (`context.addCookies`), form-based login (auto-detect username/email + password inputs, submit), and env-var credentials (`A11Y_SCANNER_CREDENTIALS=user:pass`). Customer creds, not service creds.
- POC sprint: `ScanResult` now includes `url`, `scanDate`, `duration`, `timedOut`, `pagesScanned`, and `summary.byWcagLevel`. Old fields (`durationMs`, `startedAt`) kept as `@deprecated` for backward compat.
- POC sprint: `Finding` now carries `pageUrl` and optional `screenshotPath` so each finding is self-contained for reporters. PageAnalyzer stamps `pageUrl` before returning.
- POC sprint: Added `scan(config)` as the primary public API on `ScanEngine` — accepts config at call time. `run()` kept as `@deprecated` wrapper so CLI and hybrid-scanner don't break.
- Login form detection uses a broad selector list (input[type=email], input[name*=user], etc.) and submit button heuristics (button[type=submit], button:has-text("Sign in"), etc.). Falls back to pressing Enter on the password field if no submit button found.
- `@axe-core/playwright` integrates cleanly via `new AxeBuilder({ page }).withTags([...]).analyze()`. The named export `{ AxeBuilder }` is required (not default import). Configuring `.withTags()` with WCAG 2.0/2.1/2.2 + best-practice gives 100+ rules automatically.
- Axe violations map to our Finding type via: `violation.id` → ruleId, `violation.impact` → severity (direct 1:1), tags containing `wcag###` patterns → wcagCriterion (parse digits into dotted notation like "1.1.1"), and `cat.*` tags → RuleCategory via a lookup table.
- Deduplication between hand-rolled and axe-core findings requires an equivalence map (e.g., our `document-lang` ↔ axe's `html-has-lang`, our `heading-hierarchy` ↔ axe's `heading-order`). Match on equivalent ruleId + exact selector match to avoid false positives.
- `page.accessibility.snapshot()` was removed in Playwright 1.42+. For ARIA role-based element discovery, query the DOM directly with `[role="..."]` selectors and check for accessible names via `aria-label`, `aria-labelledby`, or `textContent`.
- Axe-core works on `data:` URLs, which means deduplication actively replaces hand-rolled findings in tests. Tests must accept either the hand-rolled ruleId or the axe-core equivalent.
