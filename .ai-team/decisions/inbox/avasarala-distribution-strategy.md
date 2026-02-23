# Decision Proposal: Distribution Strategy

**Author:** Avasarala (PM)  
**Date:** July 2025  
**Status:** Proposed  
**Impacts:** Holden (architecture), Naomi (backend), Alex (frontend), Amos (testing)

---

## Decision

Adopt a **CLI-first hybrid distribution strategy** with three phases:

1. **Phase 1 — npm CLI** (P0, Weeks 1-3): Publish `smart-a11y-scanner` to npm with structured output formats (`--output json|sarif|text|markdown`). This is the canonical interface all other channels wrap.

2. **Phase 2 — GitHub Action** (P0, Weeks 4-5): Publish a GitHub Action that wraps the CLI. Runs on PR/push/schedule. Posts PR comments with findings. Supports SARIF upload to GitHub Code Scanning.

3. **Phase 3 — MCP / Copilot Extension** (P1, Weeks 6-9): Publish an MCP server exposing scanner tools for Copilot Chat integration. Enables conversational a11y scanning during development.

**Deferred:** VS Code extension (redundant with MCP), ADO Marketplace extension (CLI covers this), SaaS (out of scope).

## Rationale

- CLI is 80% built — lowest time-to-market for first public release
- GitHub Action is a thin wrapper — high leverage, low effort
- MCP is strategically important for Microsoft ecosystem but needs stable core first
- VS Code extension is redundant with MCP/Copilot presence and high-effort
- SaaS contradicts our "in-your-workflow" value prop and enters a saturated market

## Architectural Implications

- CLI must support structured output formats for machine consumption (JSON, SARIF)
- Scanner core must be importable as a library (not just CLI entry point) to support MCP server
- ADO integration must remain opt-in across all distribution channels

## Asks

- **Holden:** Validate that scanner core can be cleanly separated from CLI entry point for reuse by MCP server and GitHub Action
- **Naomi:** Plan `--output json` and `--output sarif` support in CLI
- **Amos:** Test matrix must cover CLI output formats once implemented
- **All:** Review `docs/distribution-strategy.md` for full analysis
