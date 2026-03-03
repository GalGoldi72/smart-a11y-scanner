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

## 2026-02-24: LEARN → INVENT Pipeline Tests

- Created 3 new test files for the LEARN → INVENT pipeline (60 tests): `pattern-database.test.ts` (22 tests), `pattern-extractor.test.ts` (18 tests), `test-plan-generator.test.ts` (20 tests). Total suite: 103 tests, all passing.
- **PatternDatabase** tests use real `os.tmpdir()` temp directories, not fs mocks. Clean up in `afterEach`. The `siteDir()` method is private — tested indirectly through `save()` path output. `loadLatest` returns `null` gracefully when directory is missing.
- **PatternExtractor** is stateless — instantiate once, feed mock data. Key mock types: `PageSnapshot` (with `accessibilityTree`, `interactiveElements`, `landmarks`, `headings`), `GuidedStepResult` (from scanner/types.ts), `ImportedTestScenario` (from ado/types.ts), `GuidedExplorationResult`. The extractor groups snapshots by URL, builds heading trees, and classifies tested vs untested elements via label-text matching against step results.
- **TestPlanGenerator** has 4 heuristic strategies: coverage-completion, depth-completion, cross-page-transfer, element-type-coverage. Strategy 5 (edge-case-generation) is an LLM stub returning `[]`. The `computeStructuralSimilarity()` method is public and directly testable. Confidence filtering applies after all strategies run. `maxPerStrategy` caps per-strategy output; `maxTotal` caps the final combined output.
- Cross-page transfer requires >0.7 structural similarity (Jaccard on landmarks 40% + headings 20% + element groups 40%). Two empty pages score 1.0 (both sets are empty, Jaccard returns 1). Completely disjoint roles score 0.
- The `GeneratedTestScenario` type extends `ImportedTestScenario` with `Omit` for ADO fields and adds `generatedFrom`, `confidence`, `rationale`, `sourceScenarioTitle`, `llmGenerated`. Fixed fields: `adoTestCaseId: -1`, `suiteName: 'ai-generated'`.
- No bugs discovered in the source modules. All 3 modules are well-structured for testing.

## 2026-02-25: DynamicAnalyzer Test Suite

- Created `src/__tests__/dynamic-analyzer.test.ts` with 21 tests across 6 describe blocks. All passing.
- **Test strategy:** Stub private check methods via `vi.spyOn(analyzer as any, methodName).mockResolvedValue([])` so each test isolates a single check, then mock `page.evaluate` with sequential `mockResolvedValueOnce` calls matching the exact evaluate call order of that check.
- Naomi's `DynamicAnalyzer` implementation was already present — tests align to actual rule IDs and Finding shapes.
- **Rule IDs tested:** `zoom-reflow-horizontal-scroll`, `zoom-reflow-text-clipped`, `text-spacing-overflow`, `keyboard-trap` (critical), `focus-visible-missing`, `focus-order-mismatch`, `label-in-name`, `target-size-minimum`, `landmark-main-missing`, `skip-link-missing`, `orientation-portrait-overflow`, `orientation-portrait-content-hidden`, `orientation-css-lock`.
- Each private check method (`checkZoomReflow`, `checkTextSpacing`, `checkKeyboardNavigation`, `checkFocusOrder`, `checkLabelInName`, `checkTargetSize`, `checkLandmarks`, `checkSkipLinks`, `checkLiveRegions`, `checkOrientation`) calls `page.evaluate()` a known number of times in a fixed sequence. Mock order matters.
- Integration tests verify: Finding[] type conformance, deadline enforcement (expired deadline → 0 findings, 0 evaluate calls), error isolation (one check throwing doesn't block others).
- `keyboard-trap` detection triggers when 3 consecutive Tab presses land on the same `selector` (not 'body'). Severity is `critical`.
- `focus-visible-missing` triggers when >20% of focused non-body elements lack `hasVisibleIndicator` (outlineStyle + boxShadow check).
- `focus-order-mismatch` requires ≥3 DOM-order focusable elements and ≥2 backward jumps of >200px vertically during Tab navigation.
- `checkOrientation` uses viewport sizes 768×1024 (portrait) and 1024×768 (landscape) with a 20px tolerance for scrollbar width.
- Total project test count: 124 tests (103 prior + 21 new).

📌 Team update (2026-03-03): Multiple dynamic and voice/screen-reader checks requiring QA validation. See decisions.md for scope. Decisions by Drummer/Naomi
