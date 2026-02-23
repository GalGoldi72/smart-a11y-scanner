# Distribution Strategy — Smart A11y Scanner

**Author:** Avasarala (PM)  
**Date:** July 2025  
**Status:** Recommendation  

---

## Executive Summary

**Recommendation: Hybrid — CLI-first, then GitHub Action, then MCP tool.**

Ship the CLI (npm package) as the foundation. Layer a GitHub Action on top for CI/CD. Add an MCP server for Copilot integration. Skip VS Code extension and standalone SaaS for now — they're high-effort distractions from our core value prop: *scan a site, file ADO bugs automatically*.

---

## Option Analysis

### 1. CLI Tool (npm package) — ✅ RECOMMENDED (Phase 1)

**Target audience fit:** Perfect. Developers and QA engineers live in the terminal. Enterprise teams script everything. A CLI is the universal interface.

**User journey:**
- **Discover:** npm search, GitHub README, word-of-mouth in accessibility communities
- **Install:** `npm install -g smart-a11y-scanner` or `npx smart-a11y-scanner`
- **Use:** `a11y-scan https://myapp.com --ado-org myorg --ado-project myproj`
- **Value:** Bugs appear in ADO within seconds. Zero configuration friction.

**ADO integration story:** Excellent. CLI can accept ADO PAT via env var or config file. The user controls when scans run and where bugs land. This is exactly how enterprise teams want to operate — explicit, auditable, scriptable.

**Competitive landscape:**
- **axe-cli:** npm package, widely adopted, but no ADO integration and no smart crawling
- **pa11y:** npm CLI, good adoption, no bug-filing capability
- **Lighthouse CI:** Google's CLI, focuses on performance + a11y scores, no work item creation
- **Our edge:** We're the only CLI that goes from URL → ADO work items in one command

**Enterprise adoption:** Strong. Enterprise teams can wrap our CLI in their own scripts, add it to pipelines, run it on-prem. No SaaS dependency = no procurement blocklists.

**Time to market:** We're already here. `package.json` has `bin: { "a11y-scan" }`. Commander is wired up. We need to polish the CLI UX, add `--output json` and `--output sarif`, and publish to npm. **2-3 weeks to public npm package.**

**Verdict:** Ship this first. It's the foundation everything else builds on.

---

### 2. GitHub Action — ✅ RECOMMENDED (Phase 2)

**Target audience fit:** Strong. Dev teams want a11y checks on every PR, just like linting and tests. QA teams want scheduled scans. This is where shift-left actually happens.

**User journey:**
- **Discover:** GitHub Marketplace, "accessibility github action" search
- **Install:** Add a YAML file to `.github/workflows/`
- **Use:** Runs automatically on PR/push/schedule
- **Value:** A11y violations block merges. Bugs auto-filed in ADO. No human in the loop.

**ADO integration story:** Excellent. GitHub Actions can store ADO PAT as a secret. The action wraps our CLI, so all ADO integration works identically. PR comments can summarize findings with links to filed ADO bugs.

**Competitive landscape:**
- **axe-linter-action:** Basic static analysis, no crawling, no ADO integration
- **pa11y-ci:** CI wrapper for pa11y, no ADO integration, limited flow detection
- **Lighthouse CI Action:** Google-backed, but scores-focused, no work item creation
- **Our edge:** Only action that auto-files ADO work items with full WCAG mapping and repro steps

**Enterprise adoption:** Very strong. GitHub Actions is the default CI for GitHub-hosted enterprise repos. Scheduled scans on staging environments is a common enterprise pattern.

**Time to market:** A GitHub Action is a thin wrapper around our CLI — a `Dockerfile` or `action.yml` that calls `npx smart-a11y-scanner`. **1-2 weeks after CLI ships.**

**Verdict:** Ship this second. It's high leverage with low marginal effort.

---

### 3. MCP Tool / Copilot Extension — ✅ RECOMMENDED (Phase 3)

**Target audience fit:** Good for developers using Copilot. This is the "check a11y while I'm coding" use case — conversational, on-demand, integrated into the IDE flow via Copilot Chat.

**User journey:**
- **Discover:** Copilot extension marketplace, Microsoft recommendations
- **Install:** One-click from Copilot Chat or VS Code Copilot panel
- **Use:** `@a11y-scan check https://localhost:3000` in Copilot Chat
- **Value:** Inline results during development. Fix issues before they reach PR.

**ADO integration story:** Good. MCP tools can expose ADO filing as an explicit action: "File these 3 violations as ADO bugs." The conversational interface lets users triage before filing — useful for reducing noise.

**Competitive landscape:** Emerging space. No established a11y MCP tools yet. axe has a VS Code extension but not an MCP/Copilot integration. **First-mover advantage is real here.**

**Enterprise adoption:** Strong potential. Microsoft is pushing Copilot hard in enterprise. Being a Copilot-native a11y tool positions us well in the Microsoft ecosystem — which is exactly where our ADO integration shines.

**Time to market:** MCP server protocol is straightforward — expose our scanner as tool calls. But we need the core scanner stable first. **3-4 weeks after CLI ships.**

**Verdict:** Ship this third. It's strategically important for Microsoft ecosystem positioning but requires a stable core first.

---

### 4. VS Code Extension — ⛔ NOT RECOMMENDED (for now)

**Target audience fit:** Developers, but overlaps heavily with MCP/Copilot approach.

**User journey:** Install from marketplace → configure ADO settings → run from command palette or sidebar → view results in Problems panel.

**ADO integration story:** Fine, but requires building a full settings UI for ADO credentials, project selection, etc.

**Why not now:**
- **High effort:** VS Code extensions require a full UI: webview panels, tree views, settings pages, output channels. This is weeks of frontend work with no reuse from our CLI.
- **Redundant with MCP:** If we ship an MCP tool, Copilot Chat in VS Code already provides the in-editor experience. The MCP tool gives us VS Code presence *without* building a VS Code extension.
- **Maintenance burden:** VS Code API changes frequently. Extension reviews and marketplace publishing add overhead.
- **Competitive saturation:** axe DevTools, Webhint, and Accessibility Insights already own this space.

**Verdict:** Defer to Phase 4+. Revisit if MCP adoption is lower than expected or if enterprise customers specifically request it.

---

### 5. Azure DevOps Extension — ⚠️ CONSIDER (Phase 4)

**Target audience fit:** Enterprise teams that live entirely in ADO (not GitHub). Some Microsoft customers use ADO Pipelines, not GitHub Actions.

**User journey:** Install from ADO Marketplace → add task to pipeline YAML → runs on build → results appear as pipeline test results + ADO bugs.

**ADO integration story:** Maximum integration. Results could appear as native ADO test results, link to builds, and auto-create bugs in the same project.

**Why defer:**
- **Smaller audience than GitHub Actions.** GitHub dominates OSS and is growing fast in enterprise. ADO Pipelines is stable but not growing.
- **ADO extension development is painful.** The SDK is outdated, documentation is sparse, and marketplace review is slow.
- **Our CLI already works in ADO Pipelines.** Teams can add `npx smart-a11y-scanner` as a script task today.

**Verdict:** Defer. If enterprise ADO-only customers emerge, build it. Until then, the CLI covers this use case.

---

### 6. Standalone Web App / SaaS — ⛔ NOT RECOMMENDED

**Target audience fit:** Non-technical stakeholders (compliance officers, PMs). But these aren't our primary users.

**Why not:**
- **Massive scope increase.** Auth, hosting, billing, multi-tenancy, dashboard UI — this is a different product.
- **Playwright dependency.** Our scanner uses Playwright for real browser rendering. Hosting Playwright at scale requires headless browser infrastructure (expensive, complex).
- **Competitive graveyard.** WAVE, Siteimprove, Level Access, and Deque already offer SaaS dashboards. We can't compete on features; we compete on developer workflow integration.
- **Contradicts our value prop.** We're "accessibility scanning in your workflow." SaaS is the opposite — it pulls users out of their workflow into a separate tool.

**Verdict:** Not on the roadmap. If we ever need a dashboard, it's a reporting layer over CLI/CI data — not a standalone product.

---

## Recommended Phasing

| Phase | Channel | Effort | Timeline | Audience |
|-------|---------|--------|----------|----------|
| **1** | **npm CLI** | Low | Weeks 1-3 | Developers, QA engineers |
| **2** | **GitHub Action** | Low | Weeks 4-5 | DevOps teams, CI/CD pipelines |
| **3** | **MCP / Copilot Extension** | Medium | Weeks 6-9 | Copilot users, Microsoft ecosystem |
| **4** | ADO Extension | Medium | Backlog | ADO-only enterprise teams |
| — | VS Code Extension | High | Deferred | Revisit based on MCP adoption |
| — | SaaS / Web App | Very High | Not planned | Out of scope |

---

## Key Decisions

### CLI as the core
Every distribution channel wraps the same core: our TypeScript scanner. The CLI is the canonical interface. GitHub Action calls the CLI. MCP server calls the CLI. This means:
- One codebase, multiple entry points
- Bug fixes propagate to all channels automatically
- Testing is centralized

### Output formats matter
To support multiple channels, the CLI must support structured output:
- `--output json` — machine-readable for GitHub Action annotations and MCP responses
- `--output sarif` — industry standard for static analysis results (GitHub Code Scanning, ADO)
- `--output text` — human-readable terminal output (default)
- `--output markdown` — for PR comments

### ADO integration is always opt-in
Regardless of channel, ADO bug filing must be explicit. Users configure ADO credentials and opt in to auto-filing. The scanner should always be useful *without* ADO — the reports themselves have value.

---

## Competitive Positioning

| Tool | CLI | CI/CD | IDE | ADO Integration | Smart Crawling | AI-Powered |
|------|-----|-------|-----|-----------------|----------------|------------|
| **Smart A11y Scanner** | ✅ | ✅ (Phase 2) | ✅ via MCP (Phase 3) | ✅ Native | ✅ | ✅ |
| axe-core / axe-cli | ✅ | ✅ | ✅ (VS Code ext) | ❌ | ❌ | ❌ |
| pa11y | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Lighthouse | ✅ | ✅ | ✅ (DevTools) | ❌ | ❌ | ❌ |
| WAVE | ❌ | ❌ | ✅ (browser ext) | ❌ | ❌ | ❌ |
| Accessibility Insights | ❌ | ❌ | ✅ (browser ext) | ❌ | ❌ | ❌ |

**Our moat:** ADO-native bug filing + smart crawling + AI-powered flow detection. No competitor combines all three. The CLI-first strategy lets us ship fast and expand surface area incrementally.

---

## Risks

| Risk | Mitigation |
|------|------------|
| npm CLI has low discoverability | Pair with GitHub Action for marketplace visibility; write "awesome-a11y" list entries |
| MCP/Copilot ecosystem is immature | CLI and GitHub Action provide value independent of MCP adoption |
| Enterprise customers demand VS Code extension | MCP tool provides VS Code presence via Copilot; evaluate extension only with concrete customer signal |
| Playwright dependency complicates GitHub Action | Use Docker-based action with Playwright pre-installed; document system requirements |

---

## Bottom Line

Ship the CLI. It's 80% done. Then wrap it in a GitHub Action — that's a weekend of work. Then build the MCP server for Copilot — that's where the strategic differentiation lives. Everything else is noise until we have paying users telling us otherwise.
