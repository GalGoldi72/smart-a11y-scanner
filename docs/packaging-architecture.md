# Packaging Architecture — Technical Assessment

**Author:** Holden (Lead) · **Date:** 2025-07-14  
**Status:** Recommendation for team review

---

## Current State

The codebase is structured as a TypeScript library with a clean barrel export (`src/index.ts`). Key architectural facts:

- **ScanEngine** is the core orchestrator: takes `Partial<ScanConfig>`, returns `Promise<ScanResult>`
- **Playwright chromium** is launched directly — requires a real browser binary (~150–400 MB)
- **AdoClient** handles bug filing via REST API with PAT auth
- **Commander** is already a dependency (CLI scaffolding in place)
- All modules are stateless and composable — no global state, no singletons

This is a strong foundation for a layered distribution strategy.

---

## Option Analysis

### 1. CLI Tool (npm package)

**Architecture Impact:** Minimal — this is what we already are.

| Aspect | Assessment |
|--------|-----------|
| Playwright | ✅ Works natively. Users run `npx playwright install chromium` or we auto-install. |
| Distribution | `npm publish` + `npx smart-a11y-scanner scan <url>` |
| ADO integration | Already built — pass `--ado-org`, `--ado-project`, `--ado-pat` |
| Browser bundling | User's responsibility via `playwright install`. Standard pattern. |
| Effort | **Low** — wire Commander commands to ScanEngine + Reporter |

**Verdict:** Ship this first. Zero architecture changes needed.

---

### 2. GitHub Action

**Architecture Impact:** Thin wrapper around CLI.

| Aspect | Assessment |
|--------|-----------|
| Playwright | ✅ Excellent CI support. `playwright install --with-deps chromium` in action setup. Well-tested pattern across thousands of repos. |
| Implementation | `action.yml` + shell script that calls our CLI. ~50 lines. |
| Output | PR annotations via `::warning` / `::error` workflow commands. Upload HTML report as artifact. |
| Config | YAML inputs map 1:1 to CLI flags. |
| Effort | **Low** — once CLI exists, this is a weekend task |

**Verdict:** Second priority. Natural fit for GitHub-centric users.

---

### 3. Azure DevOps Pipeline Task

**Architecture Impact:** Thin wrapper around CLI, mirroring the GitHub Action.

| Aspect | Assessment |
|--------|-----------|
| Playwright | ✅ Works on Microsoft-hosted agents (Ubuntu). Self-hosted agents need browser deps installed. |
| Implementation | `task.json` + Node handler that spawns CLI. ADO task SDK is straightforward. |
| Output | Publish test results via `##vso` commands. Attach HTML report to build. |
| ADO integration | **This is our differentiator.** Scan → file bugs → link to test cases, all within the same ADO org. Pipeline context gives us project/org automatically. |
| Effort | **Low-Medium** — similar to GitHub Action but ADO task packaging has more ceremony (tfx-cli, publisher setup) |

**Verdict:** High priority given our ADO focus. Ship alongside or shortly after the GitHub Action.

---

### 4. VS Code Extension

**Architecture Impact:** Significant constraints.

| Aspect | Assessment |
|--------|-----------|
| Playwright | ⚠️ **Problematic.** Extension host is a Node.js process but Playwright needs to spawn a browser. This works technically but: (a) bundling Chromium in a .vsix makes it 400+ MB — VS Code Marketplace has a 200 MB limit, (b) users must install browsers separately, adding friction. |
| Sandbox | Extensions run in the extension host process. Playwright spawning browsers is allowed but unusual. No file system sandboxing issues, but heavy CPU/memory use during scans may freeze the editor. |
| UI | WebView panel for HTML reports works well. Could show findings inline as diagnostics (squiggles on HTML files). Terminal output for scan progress. |
| Effort | **High** — new UI layer, WebView implementation, extension lifecycle management |

**Verdict:** Defer. The ROI is low compared to CI/CD wrappers. If we pursue it later, it should shell out to the CLI rather than embedding ScanEngine directly.

---

### 5. GitHub Copilot Agent / MCP Server

**Architecture Impact:** Requires careful design.

| Aspect | Assessment |
|--------|-----------|
| Playwright | ⚠️ **Constrained.** MCP servers run as long-lived processes. Launching a browser per scan is possible but: (a) the MCP host environment may not have browser binaries, (b) in cloud-hosted agent scenarios (Copilot Extensions), you don't control the runtime, (c) scans take 10–60+ seconds — long for a chat interaction. |
| Trigger model | Chat command: `@a11y-scanner scan https://example.com`. Could also trigger on issue events (label-based). |
| MCP tool surface | `scan` (url, config) → returns ScanResult as structured data. `file-bugs` (scanResult, adoConfig) → creates work items. `get-rules` → returns rule catalog. |
| Implementation | MCP server wrapping our core library. JSON-RPC over stdio. Need to handle streaming progress for long scans. |
| Effort | **Medium** — MCP protocol is simple, but UX design for async scans in chat is non-trivial |

**Verdict:** Interesting for discoverability but not a primary channel. The "scan a website" workflow doesn't fit naturally into a chat UX. Consider after CI/CD channels are solid.

---

## Recommended Architecture: Layered Cake

```
┌─────────────────────────────────────────────────┐
│              Distribution Wrappers               │
│  ┌───────────┐ ┌──────────┐ ┌────────────────┐  │
│  │  GitHub    │ │   ADO    │ │  MCP Server /  │  │
│  │  Action    │ │  Task    │ │  VS Code Ext   │  │
│  └─────┬─────┘ └────┬─────┘ └───────┬────────┘  │
│        │             │               │            │
│        └─────────────┼───────────────┘            │
│                      ▼                            │
│  ┌──────────────────────────────────────────────┐ │
│  │              CLI (Commander)                  │ │
│  │   npx smart-a11y-scanner scan <url> [opts]   │ │
│  └──────────────────┬───────────────────────────┘ │
│                     ▼                             │
│  ┌──────────────────────────────────────────────┐ │
│  │           Core Engine (npm package)           │ │
│  │  ScanEngine · Crawler · PageAnalyzer          │ │
│  │  AdoClient · BugCreator · Reporter            │ │
│  │  Rules · Detection · Config                   │ │
│  └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Package | Exports | Depends On |
|-------|---------|---------|------------|
| **Core** | `smart-a11y-scanner` (npm) | `ScanEngine`, `AdoClient`, `Reporter`, types | Playwright, axios |
| **CLI** | Same package, `bin` entry | `a11y-scan` command | Core |
| **GitHub Action** | `action.yml` in repo or separate repo | Action inputs/outputs | CLI (via `npx`) |
| **ADO Task** | `task.json` + handler | Task inputs/outputs | CLI (via `npx` or bundled) |
| **MCP Server** | Separate package or entry point | MCP tools over JSON-RPC | Core (direct import) |
| **VS Code Ext** | `.vsix` | Extension commands | CLI (subprocess) |

### Key Design Principle

**Wrappers call the CLI. Only the MCP server imports Core directly** (because it needs structured `ScanResult` objects for tool responses). Everything else shells out to the CLI and parses its JSON output (`--format json`).

This means:
- Bug fixes in Core automatically propagate to all channels
- Each wrapper is thin (~50–200 lines) and independently testable
- No wrapper-specific business logic — all scanning logic lives in Core

---

## Shipping Order

| Phase | Deliverable | Effort | Value |
|-------|------------|--------|-------|
| **1** | CLI (`npx smart-a11y-scanner`) | Low | Foundation for everything else |
| **2a** | ADO Pipeline Task | Low-Med | Our differentiator, enterprise users |
| **2b** | GitHub Action | Low | Broader reach, OSS adoption |
| **3** | MCP Server | Medium | Agent ecosystem, discoverability |
| **4** | VS Code Extension | High | Nice-to-have, defer until demand |

Phases 2a and 2b can run in parallel.

---

## Architectural Constraints to Respect

1. **Playwright requires browser binaries.** Every distribution channel must account for browser installation. CI environments handle this well. Desktop environments (VS Code, MCP) are harder.

2. **Scans are slow (10–60s+).** Any interactive wrapper (MCP, VS Code) must handle async progress reporting. CLI and CI wrappers can just stream stdout.

3. **`ScanResult` is our interchange format.** All wrappers consume the same JSON structure. The CLI's `--format json` output IS the contract.

4. **ADO PAT handling must be secure.** CI wrappers use pipeline secrets. CLI uses env vars or flags. MCP/VS Code need credential management UX.

5. **Core must remain host-agnostic.** No `process.exit()`, no direct stdout writes, no assumptions about the runtime environment. All output goes through the Reporter interface.
