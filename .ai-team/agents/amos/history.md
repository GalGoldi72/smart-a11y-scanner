# History — Amos (Tester)

## Project Context
- **Project:** Smart A11y Scanner — AI accessibility scanner for websites
- **Stack:** TypeScript, Node.js, Playwright, Azure DevOps API
- **User:** GalGoldi72 (ggoldshtein@microsoft.com)
- **Team:** Holden (Lead), Avasarala (PM), Naomi (Backend), Alex (Frontend), Amos (Tester), Drummer (A11y Expert), Bobbie (UI Expert)

## Learnings
- vitest already configured in package.json (`vitest run`); no extra setup needed beyond a `vitest.config.ts` for timeout tuning.
- `PageAnalyzer.analyze()` navigates via `page.goto(url)` — tests must pass data: URLs, not use `page.setContent()`.
- The analyzer uses severity values (`major`, `advisory`) that don't match the `Severity` type (`critical`/`serious`/`moderate`/`minor`). Tests should filter by ruleId rather than relying on severity enum alignment.
- Engine gracefully handles 1ms timeout — returns a valid ScanResult without crashing. Good resilience.
- Report format functions (`generateJsonReport`, `generateCsvReport`) are pure and easy to unit test with mock ScanResult objects.
- Created 3 test files (18 tests total): `engine.smoke.test.ts`, `page-analyzer.test.ts`, `report.test.ts`. All passing.
- `test-plan-parser.ts` exports three pure/async functions (`parseTestPlanUrl`, `parseInlineSteps`, `parseTestPlanFile`) — no Playwright dependency, so tests run fast without browser mocks.
- `parseTestPlanFile` needs real temp files on disk; use `os.tmpdir()` + `beforeAll`/`afterAll` for cleanup. YAML parsing requires the `yaml` npm package already in deps.
- `GuidedExplorer` can be tested with lightweight mocks — mock `Page` (url/goto/close/screenshot/waitForLoadState/click), mock `BrowserContext` (newPage), and mock `PageAnalyzer` (analyzeCurrentPage). Mock `DeepExplorer` via `vi.mock()` to avoid real exploration.
- GuidedExplorer's `click` action cascades through getByRole → getByText → CSS selector. Mock each to throw so the chain reaches the fallback `page.click()`.
- GuidedExplorer respects deadline: if `Date.now() >= deadline` at the top of the scenario loop, it skips all steps — useful for testing timeout behavior.
- Created 2 new test files (25 tests): `test-plan-parser.test.ts` (19 tests), `guided-explorer.test.ts` (6 tests). Total suite: 43 tests, all passing.

## 2026-02-23: Team Decisions Merged
📌 **ADO Test Plan Integration Feature Complete (Core Phases)** — Holden designed, Naomi implemented GuidedExplorer, Alex implemented CLI flags + reports. Test phases can now be directly wired into the scanner via --test-plan, --test-plan-file, or --steps flags. Phase 9 (all-new testing) assigned to you: create test suite for GuidedExplorer, test-plan-parser, and integration scenarios.

📌 **Smart Element Prioritization Deployed** — Naomi's element classifier now sorts elements P1/P2/P3. This improves deep-explorer's behavior immediately. Update test expectations: DFS now favors content over chrome. May affect test assertions that relied on old element order.

📌 **AI Test Generation Post-Phase Design** — Holden designed pattern learning and test synthesis pipeline. Post-POC feature. Relevant for future test creation strategies.
