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

