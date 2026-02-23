# Decision: ADO Test Case Import & Hybrid Scanning Architecture

**Date:** 2025-07-16
**Author:** Naomi (Backend Dev)
**Status:** Implemented
**Requested by:** GalGoldi72

## Context

Customers have existing manual accessibility test cases in ADO Test Plans. They want to combine this manual test intelligence with the scanner's automated crawling for deeper coverage.

## Decision

### 1. New ADO types module (`src/ado/types.ts`)

Introduced dedicated type definitions for ADO Test Plan API responses (`ADOTestPlan`, `ADOTestSuite`, `ADOTestCase`, `ADOTestStep`) and scanner-internal representations (`ImportedTestScenario`, `TestAction`, `ExpectedA11yBehavior`). Kept separate from `scanner/types.ts` to avoid coupling the engine to ADO-specific structures.

### 2. Test case importer (`src/ado/test-case-importer.ts`)

- Uses ADO Test Plans API (`_apis/testplan/`) for suite/case enumeration and Work Items API (`_apis/wit/`) for step XML and fields
- Parses step XML with regex (no DOM parser dependency needed)
- Extracts navigation URLs, UI interactions, and expected a11y behaviors from step text using pattern matching
- Supports filtering by suite ID, tags, area path, state, and keyword
- Handles pagination via `x-ms-continuationtoken` headers

### 3. Hybrid scanner (`src/scanner/hybrid-scanner.ts`)

Five-phase pipeline:
1. **Priority scan** — ADO test case URLs first (they're known-important)
2. **Guided navigation** — Replays test case step flows via Playwright
3. **Automated crawl** — Discovers pages beyond manual test coverage
4. **Gap analysis** — Compares manual vs automated URL coverage
5. **Enriched bug filing** — Links bugs to related test cases via ADO relations

Composes with existing `Crawler`, `PageAnalyzer`, and `AdoClient` — no changes to those classes.

### 4. Config schema extension

Extended `AdoConfig` in `scanner/types.ts` with `testPlan` and `linkTestCases` fields. Added re-exports from `config/schema.ts`. No breaking changes to existing config consumers.

### 5. Customer docs (`docs/ado-integration.md`)

Full documentation covering PAT setup, YAML config, hybrid scanning phases, gap analysis interpretation, programmatic API usage, and troubleshooting.

## Constraints Respected

- Did NOT modify Drummer's rule definitions or Bobbie's detection modules
- Did NOT modify Alex's CLI or reporting layer
- All new code composes with Holden's existing interfaces
- Zero new build errors introduced (17 pre-existing errors in other modules remain unchanged)

## Trade-offs

- **Step parsing is heuristic:** Natural language action parsing covers common patterns (navigate, click, type, select, verify) but won't handle every creative phrasing. Unknown actions are safely skipped.
- **Suite-to-test-case mapping is approximate:** The ADO API doesn't return suite membership when fetching work item details, so we track the first suite encountered. Good enough for linking; could be made precise with extra API calls if needed.
- **Gap analysis is URL-level:** Compares URLs, not individual WCAG criteria. A deeper criterion-level gap analysis would require mapping manual expected results to specific rule IDs — possible future enhancement.
