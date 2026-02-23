# History — Naomi (Backend Dev)

## Project Context
- **Project:** Smart A11y Scanner — AI accessibility scanner for websites
- **Stack:** TypeScript, Node.js, Playwright, Azure DevOps API
- **User:** GalGoldi72 (ggoldshtein@microsoft.com)
- **Team:** Holden (Lead), Avasarala (PM), Naomi (Backend), Alex (Frontend), Amos (Tester), Drummer (A11y Expert), Bobbie (UI Expert)

## Learnings
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
