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
