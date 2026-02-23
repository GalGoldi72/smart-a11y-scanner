# History — Holden (Lead)

## Project Context
- **Project:** Smart A11y Scanner — AI accessibility scanner for websites
- **Stack:** TypeScript, Node.js, Playwright, Azure DevOps API
- **User:** GalGoldi72 (ggoldshtein@microsoft.com)
- **Team:** Holden (Lead), Avasarala (PM), Naomi (Backend), Alex (Frontend), Amos (Tester), Drummer (A11y Expert), Bobbie (UI Expert)

## Learnings
- **2025-07-14 — Packaging architecture assessment.** Evaluated five distribution channels (CLI, GitHub Action, ADO Pipeline Task, VS Code Extension, MCP Server). The codebase is already well-structured for a layered approach: Core engine (npm) → CLI (Commander) → thin wrappers for each channel. Playwright's browser dependency is the primary constraint — works great in CI, problematic in desktop/agent hosts. Recommended shipping order: CLI first, then ADO Task + GitHub Action in parallel, MCP Server later, VS Code Extension deferred. Key architectural principle: wrappers call the CLI (or import Core for MCP), no business logic in wrappers. `ScanResult` JSON is the interchange contract.
- **2025-02-23 — POC scaffolding and type system reconciliation.** Discovered the team had already built substantial code in parallel: Naomi (engine, crawler, page-analyzer, ADO client), Alex (CLI types, config loader, JSON/CSV/HTML reporters), Drummer (rule types + catalog), Bobbie (UI detector, flow analyzer, interaction simulator, detection types). Multiple type systems exist: scanner/types.ts (engine), types/scan-types.ts (CLI/reporting), config/schema.ts (user-facing config). Rather than creating a fourth, I aligned new interfaces (IRuleRunner, IFlowAnalyzer, IReporter, IBugCreator) with existing types. Barrel re-exports in types/ provide convenience imports without duplication. The three config layers (user-facing, engine, detection) are a valid separation of concerns — don't force-unify them.
- **2025-02-23 — Pre-existing build errors in detection/.** Bobbie's page.evaluate() callbacks have TypeScript strict-mode issues (implicit any in recursive buildSelector, unknown type on Array.from filter callbacks). These are cosmetic — the runtime code works. Bobbie should fix these before we ship, but they don't block POC.
