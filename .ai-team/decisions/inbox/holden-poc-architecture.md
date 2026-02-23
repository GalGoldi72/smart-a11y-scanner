# Decision: POC Architecture & Interface Contracts

**Author:** Holden (Lead)  
**Date:** 2025-02-23  
**Status:** Active  

## Context

The team was asked to start a POC. Multiple agents had already begun building code in parallel before formal scaffolding was in place. This created overlapping type systems and some duplication.

## Decisions

### 1. Three Config Layers Are Valid

The project has three separate config type systems. This is intentional:

| Layer | File | Purpose | Owner |
|-------|------|---------|-------|
| User-facing | `config/schema.ts` | YAML/CLI config shape | Holden |
| Engine | `scanner/types.ts` | Internal engine config | Naomi |
| Detection | `detection/types.ts` | UI detection config | Bobbie |

**Rationale:** Each layer has different concerns. User config is broad (ADO, reporting, crawl rules). Engine config is focused (browser, viewport, timeouts). Detection config is specialized (shadow DOM, event listeners, element limits). Forcing them into one type creates coupling we don't want.

### 2. Interface Contracts for Cross-Cutting Modules

The following interfaces define the contracts between modules:

- **`IRuleRunner`** (`rules/rule-runner.ts`) — Consumes Drummer's `AccessibilityRule` catalog, produces Naomi's `Finding` type
- **`IFlowAnalyzer`** (`detection/flow-analyzer.ts`) — Produces Bobbie's `PageFlowAnalysis` and `InteractionResult` types
- **`IReporter`** (`reporting/reporter.ts`) — Consumes `ScanResult` from `scanner/types.ts`
- **`IBugCreator`** (`ado/bug-creator.ts`) — Facades over `AdoClient`, consumes `ScanResult`

### 3. scanner/types.ts Is the Canonical Engine Type System

Naomi's `scanner/types.ts` defines `ScanResult`, `Finding`, `PageResult`, `PageLink`, `PageMetadata`. These are the **canonical engine types**. All modules that consume scan output should reference these types. The `types/scan-types.ts` (Alex's) exists for CLI/reporting but should eventually be reconciled or deprecated.

### 4. Barrel Re-Exports in types/

Files in `src/types/` (page.ts, finding.ts, scan-result.ts) are barrel re-exports for convenience. They own no types — they point to canonical sources. Don't define new types here.

### 5. Pre-Existing Build Errors Are Non-Blocking

Bobbie's detection code has TypeScript strict-mode errors in `page.evaluate()` callbacks (implicit any, unknown casts). These don't affect runtime behavior. Bobbie should fix before shipping but they don't block POC work.

## Open Items

- [ ] Reconcile `types/scan-types.ts` (Alex) with `scanner/types.ts` (Naomi) — two `Finding` and `ScanResult` shapes exist
- [ ] Bobbie: Fix TypeScript strict-mode errors in detection/flow-analyzer.ts, detection/interaction-simulator.ts, detection/ui-detector.ts
- [ ] CLI entry point needs Commander wiring (current index.ts is barrel export only)
