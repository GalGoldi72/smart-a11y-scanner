# Decisions — Alex POC CLI & Reporting

## CLI Entry Point
- **Decision:** CLI lives in `src/cli.ts`, separate from the barrel export in `src/index.ts`.
- **Rationale:** `index.ts` is the library's public API (used when importing as a package). CLI is a consumer of that API, not part of it. `bin` in package.json points to `dist/cli.js`.

## Config Loader
- **Decision:** Config loader uses Holden's `ScanConfig` from `config/schema.ts` and `DEFAULT_CONFIG` from `config/defaults.ts`. Merges CLI flags > YAML file > defaults.
- **Rationale:** One config schema for the whole project. CLI flags map to `CliOverrides` interface which is a flat subset of `ScanConfig` for ergonomic command-line use.

## Reporter Architecture
- **Decision:** `Reporter` class takes `ScanResult` (from `scanner/types.ts`) and `ReportConfig` (from `config/schema.ts`). Each format has a pure function generator in `reporting/formats/`.
- **Rationale:** Format generators are stateless functions, easy to test. Reporter class handles file I/O and directory creation. Verbose flag controls JSON pretty-printing.

## Output Format: `--output` accepts comma-separated formats
- **Decision:** `--output html,json,csv` generates all three at once. Stored in `config.report.formats` array.
- **Rationale:** Users often want HTML for humans + JSON for CI pipelines in the same run.

## Exit Codes
- **Decision:** 0 = no findings, 1 = findings found, 2 = error (bad config, scan failure).
- **Rationale:** Standard CI-friendly pattern. Non-zero exit on findings allows `a11y-scan scan ... || echo "a11y issues found"` in pipelines.

## Report File Naming
- **Decision:** Reports named `a11y-report-{ISO-timestamp}.{ext}` in the configured outputDir.
- **Rationale:** Timestamp prevents overwrites; all formats in one directory keeps things tidy.

## HTML Report Design
- **Decision:** Self-contained HTML with inline CSS and vanilla JS table sorting. No external dependencies.
- **Rationale:** Report files should be portable — viewable by anyone with a browser, no build step needed. Color-coded severity (red/orange/yellow/blue) matches the severity semantic.

## ADO Integration (Stub)
- **Decision:** `--ado` flag sets `config.fileBugs = true`. Prints a warning in POC that bug filing is not yet implemented.
- **Rationale:** Plumbing is in place for the full feature; wiring to `BugCreator` is a follow-up task.
