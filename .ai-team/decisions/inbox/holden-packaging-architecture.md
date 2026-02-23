# Decision Proposal — Packaging Architecture

**Proposed by:** Holden (Lead) · **Date:** 2025-07-14  
**Status:** Proposed

## Decision

Adopt a layered packaging architecture: **Core Engine → CLI → Distribution Wrappers**.

## Details

1. **Ship CLI first** as the foundational distribution channel. The codebase is already structured for this (Commander dependency, `bin` entry, clean `ScanEngine` API).

2. **All wrappers shell out to the CLI** and parse `--format json` output. Exception: MCP Server imports Core directly for structured `ScanResult` access.

3. **Shipping order:** CLI → ADO Pipeline Task + GitHub Action (parallel) → MCP Server → VS Code Extension (deferred).

4. **`ScanResult` JSON is the interchange contract** between Core and all wrappers.

5. **No business logic in wrappers.** Scanning, rule evaluation, ADO integration, and reporting all live in Core. Wrappers handle only: input parsing, credential injection, and output formatting for their host platform.

6. **Core must remain host-agnostic.** No `process.exit()`, no direct stdout writes, no runtime assumptions. Output goes through Reporter.

## Rationale

- Playwright's browser dependency makes CI the strongest deployment target (ADO Task, GitHub Action). Desktop/agent hosts face browser installation friction and 200+ MB bundle sizes.
- ADO Pipeline Task is our differentiator — enterprise customers want CI/CD integration, and our ADO features (bug filing, test case linking) shine in pipeline context.
- The layered approach lets us ship the CLI in days, not weeks, and add channels incrementally without refactoring Core.
- VS Code Extension is deferred due to high effort, .vsix size limits (200 MB cap vs. 400 MB Chromium), and lower ROI relative to CI/CD channels.

## Impact

- Naomi: Core engine must avoid host-specific code (no `process.exit()`, no raw `console.log` for output)
- Alex: Reporter `--format json` output becomes the public API contract — treat it as stable
- Bobbie: CLI UX design is the priority; all other UX flows derive from it
- Amos: Test the Core library independently of CLI; test CLI via integration tests
