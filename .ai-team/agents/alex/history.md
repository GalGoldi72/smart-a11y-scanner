# History — Alex (Frontend Dev)

## Project Context
- **Project:** Smart A11y Scanner — AI accessibility scanner for websites
- **Stack:** TypeScript, Node.js, Playwright, Azure DevOps API
- **User:** GalGoldi72 (ggoldshtein@microsoft.com)
- **Team:** Holden (Lead), Avasarala (PM), Naomi (Backend), Alex (Frontend), Amos (Tester), Drummer (A11y Expert), Bobbie (UI Expert)

## Learnings
- Holden scaffolded `package.json`, `tsconfig.json`, and skeleton files before I started. Always check existing structure first.
- Naomi's engine types live in `src/scanner/types.ts` — that's the canonical `ScanResult`, `Finding`, `PageResult`. Don't duplicate them.
- Holden's config schema is in `src/config/schema.ts` with defaults in `src/config/defaults.ts`. My config loader should use those, not invent its own types.
- `src/index.ts` is the barrel export for the library API. CLI entry point goes in `src/cli.ts` separately (bin points to `dist/cli.js`).
- Chalk v5 is ESM-only. Project uses `"type": "module"` in package.json, which aligns with `module: "Node16"` in tsconfig.
- Corporate npm registry (`msazure.pkgs.visualstudio.com`) needs auth tokens. Use `--registry https://registry.npmjs.org/` to install public packages when credentials expire.
- Reporter takes `ReportConfig` from schema.ts (formats array + outputDir + includeScreenshots), not individual format strings.
- Engine's `ScanResult.summary.bySeverity` is `Record<Severity, number>` and `byCategory` is `Record<string, number>` — used directly in HTML/JSON reporters.
- Finding has `selector` (CSS path), `message` (issue text), `htmlSnippet`, `screenshot` (base64 PNG) — different field names than I initially assumed.
- Build has pre-existing errors in Bobbie's detection code (`flow-analyzer.ts`, `interaction-simulator.ts`) — not my problem but noted.
- Drummer's `Severity` type is `'critical' | 'serious' | 'moderate' | 'minor'` (axe-core aligned), NOT `'major' | 'advisory'`. Fixed cli.ts SEVERITY_COLORS and sevOrder to match. All other files using the old names (html-reporter, ado/client, etc.) are other teams' responsibility.
- Naomi's engine `ScanConfig` (scanner/types.ts) already has `timeout: number` (overall scan limit in ms) and `auth?: AuthConfig` with `loginUrl`, `credentials`, `cookies`, `waitForSelector`. No need to invent new auth fields — just map CLI flags to `AuthConfig`.
- `AuthConfig.credentials` is `{ username, password }` nested inside AuthConfig, not a flat `auth` object. The engine uses `httpCredentials` from it.
- Added `"smart-a11y-scanner"` as a second bin alias so `npx smart-a11y-scanner scan <url>` works alongside the original `a11y-scan`.
- `--timeout` defaults to 600s (10 min), passed directly to engine's `timeout` field (in ms). Engine already supports it.
- `--auth-url` maps to `AuthConfig.loginUrl`, `--credentials` maps to `AuthConfig.credentials`. Credentials also readable from `A11Y_SCANNER_CREDENTIALS` env var.
- ADO bug filing is gated behind `--ado` flag and prints a POC placeholder warning. No code paths execute ADO integration without the flag.
- HTML report now uses card-based layout per finding (replaced the flat table). Cards are grouped by page with page-level screenshots at the top of each section.
- Repro steps rendered as a CSS counter-based numbered timeline (circles + connecting line). No JS needed for the numbering — pure CSS `counter-reset`/`counter-increment`.
- Screenshot lightbox is a simple overlay div toggled via JS `openLightbox()`/`closeLightbox()`. Escape key also closes it. No external libraries.
- Finding fields `reproSteps?: string[]` and `screenshot?: string` are optional — all rendering guarded with `?.length` / truthiness checks. Safe if engine doesn't populate them.
- `PageResult.screenshot?: string` added for page-state screenshots shown at the top of each page section. `ExplorationState.stateScreenshot` added by Naomi for the engine side.
- JSON reporter conditionally includes `reproSteps` and `screenshot` using spread syntax — omitted from output when not present, keeping JSON clean.
- All images are inline base64 — the HTML report remains fully self-contained with zero external dependencies.
- Test plan CLI flags follow the `--test-plan <id-or-url>`, `--test-plan-file <path>`, `--steps <steps...>` pattern. `parseTestPlanUrl()` already existed in Naomi's `test-plan-parser.ts` — no need to create a stub.
- `TestPlanConfig`, `GuidedStepResult`, `GuidedExplorationResult` types added to `scanner/types.ts`. `ScanResult.guidedResults` and `ScanConfig.testPlan` are the integration points between engine and reporters.
- HTML test plan section uses a vertical timeline with numbered circles (green=success, red=failed). Reuses the existing lightbox for step screenshots. CSS class prefix `tp-` avoids collision with existing repro-step classes.
- JSON guided results use spread syntax (`...(result.guidedResults ? { guidedResults: ... } : {})`) to keep the field absent entirely when no test plan was used — keeps output clean for non-guided scans.
- ADO PAT falls back to `ADO_PAT` env var, matching the same pattern as `A11Y_SCANNER_CREDENTIALS` for auth credentials.
- `--explore-depth` uses `parseInt` as the commander parse function — same pattern as `--depth` and `--timeout`.


## 2026-02-23: Team Decisions Merged
📌 **Test Plan CLI Flags & Report Integration** — New decision by Alex: Added 7 CLI flags (--test-plan, --test-plan-file, --steps, --explore-depth, --ado-org, --ado-project, --ado-pat). HTML report now has "Test Plan Execution" timeline section. JSON report includes guidedResults with per-step findings. Types added to scanner/types.ts.

📌 **Smart Element Prioritization** — Decision by Naomi, relevant for future reporting: Elements now classified P1/P2/P3. Affects which elements get explored in deep-explorer, indirectly impacts breadth/depth of findings in reports.

📌 **ADO Test Plan Integration Architecture** — Design by Holden, Phase 8 assigned to Alex: Report integration now ready for implementation. HTML/JSON reporters will display test-plan-aware results with step-by-step timeline, pass/fail status, screenshot galleries per step.

- `learningSummary` and `generationSummary` types on `ScanResult` are being added concurrently by Naomi. Used `(result as any)` casts in reporters and `as Record<string, unknown>` spread in CLI to avoid build failures until her types land. Once merged, replace with proper typed access.
- CLI learn/generate flags (`--learn`, `--generate`, `--ai-generate`, `--pattern-dir`, `--max-generated`) follow same pattern as `--test-plan` flags: parsed in `runScan()`, passed to engine config via spread.
- `ScanConfig` doesn't have `learn`/`generate`/`aiGenerate`/`patternDir`/`maxGenerated` fields yet. Cast to `Record<string, unknown>` in the spread to pass them through without TS errors.
- `captureScreenshots` (not `captureSnapshots`) is the correct field name on `ScanConfig` for enabling screenshot capture. Auto-enabled when `--learn` is used.
- HTML report new sections use `ai-` CSS class prefix to avoid collision with existing `tp-` (test plan) and repro-step classes.
- Strategy display names and icons are hardcoded in `STRATEGY_DISPLAY` map in html-reporter.ts. If new strategies are added to the generation engine, this map needs updating.
- JSON reporter uses `(result as any)` + spread to conditionally include `learningSummary` and `generationSummary` — fields are absent from output when not present, keeping JSON clean for non-learn scans.

## 2026-02-23 (continued): LEARN → INVENT CLI Flags
📌 **Learn/Generate CLI Flags** — New decision by Alex: Added 5 flags (--learn, --generate, --ai-generate, --pattern-dir, --max-generated) to wire Holden's LEARN → INVENT pipeline into the CLI. HTML report shows Learning Summary and AI-Generated Tests sections. Reporters use temporary s any casts pending Naomi's type extensions on ScanConfig and ScanResult.
