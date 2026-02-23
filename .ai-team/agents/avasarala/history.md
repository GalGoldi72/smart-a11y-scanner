# History — Avasarala (PM)

## Project Context
- **Project:** Smart A11y Scanner — AI accessibility scanner for websites
- **Stack:** TypeScript, Node.js, Playwright, Azure DevOps API
- **User:** GalGoldi72 (ggoldshtein@microsoft.com)
- **Team:** Holden (Lead), Avasarala (PM), Naomi (Backend), Alex (Frontend), Amos (Tester), Drummer (A11y Expert), Bobbie (UI Expert)

## Learnings

### PRD Structure & WCAG Coverage (Dec 2024)
- Organized PRD into P0 (MVP), P1 (Enhanced), P2 (Nice-to-have) feature tiers for clear prioritization
- WCAG 2.2 checks broken into 10 major categories (ARIA, Contrast, Zoom, Keyboard, Screen Reader, Voice Access, Forms, Media, HTML Structure, Motion/Animation) with specific checkpoints per category
- User stories written with clear "As a / I want / So that" format + acceptance criteria (15 total covering all major workflows)
- ADO integration treated as core P0 feature with duplicate detection, custom fields, and severity mapping
- Success metrics defined across primary (coverage, accuracy, speed), secondary (adoption, actionability), and operational (uptime, error rate) tiers
- Risk assessment included for high-complexity features (NVDA integration, false positives, ADO rate limits) with mitigations
- Decision record filed to `.ai-team/decisions/inbox/avasarala-prd-structure.md` for team review and alignment

### Distribution Strategy Analysis (July 2025)
- Recommended **hybrid CLI-first** distribution: Phase 1 npm CLI → Phase 2 GitHub Action → Phase 3 MCP/Copilot tool
- CLI is nearly ready (`bin` entry in package.json, Commander wired up) — estimated 2-3 weeks to publish on npm
- GitHub Action is a thin wrapper around CLI — 1-2 weeks marginal effort after CLI ships
- MCP/Copilot tool is strategically important for Microsoft ecosystem positioning but requires stable core first (3-4 weeks after CLI)
- **Deferred:** VS Code extension (redundant with MCP), ADO Marketplace extension (CLI works in ADO Pipelines today), SaaS (out of scope)
- Key architectural decision: CLI must support `--output json/sarif/text/markdown` to serve all distribution channels
- ADO integration must remain opt-in across all channels — scanner is useful standalone
- Competitive moat: only tool combining ADO-native bug filing + smart crawling + AI-powered flow detection
- Decision record filed to `.ai-team/decisions/inbox/avasarala-distribution-strategy.md`

### Key File Paths
- **PRD:** `docs/PRD.md` — comprehensive product requirements (14 sections, 31KB)
- **Distribution Strategy:** `docs/distribution-strategy.md` — packaging and publishing analysis
- **Team Roster:** `.ai-team/team.md` — 9-member team including Drummer (A11y Expert) and Bobbie (UI Expert)
- **Tech Stack:** TypeScript, Node.js, Playwright, Axe-core, Azure DevOps REST API
