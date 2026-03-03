# History — Drummer (Accessibility Expert)

## Project Context
- **Project:** Smart A11y Scanner — AI accessibility scanner for websites
- **Stack:** TypeScript, Node.js, Playwright, Azure DevOps API
- **User:** GalGoldi72 (ggoldshtein@microsoft.com)
- **Team:** Holden (Lead), Avasarala (PM), Naomi (Backend), Alex (Frontend), Amos (Tester), Drummer (A11y Expert), Bobbie (UI Expert)

## Learnings

### 2025-07 — Rules Catalog Created (Split Architecture)
- Created 153 accessibility rules across 16 category files in `src/rules/categories/`
- Categories: images (10), multimedia (11), adaptable (12), distinguishable (13), keyboard (8), timing (7), seizures (4), navigable (14), input-modalities (8), readable (7), predictable (7), input-assistance (10), compatible (6), aria (14), forms (10), screen-reader (12)
- Covers all ~86 WCAG 2.2 success criteria plus best-practice rules for ARIA, screen readers (NVDA/VoiceOver), voice access, and forms
- Includes WCAG 2.2 new criteria: Focus Not Obscured (2.4.11/12), Focus Appearance (2.4.13), Dragging Movements (2.5.7), Target Size Minimum (2.5.8), Consistent Help (3.2.6), Redundant Entry (3.3.7), Accessible Authentication (3.3.8/9)
- Updated types.ts: added `AutomationLevel`, `checkFunction` field, `manual` analysis mode, expanded `RuleCategory` to match file structure
- Changed Severity type to `'critical' | 'serious' | 'moderate' | 'minor'` — aligned with axe-core conventions and team's migration (Naomi/Alex already updated cli.ts, engine.ts)
- **Lesson learned:** Previous attempt to create a single monolithic rules file failed (503 timeout). Splitting into focused category files (4-14 rules each, 3-11KB per file) is the correct approach
- **Lesson learned:** Don't change shared types without checking all consumers first. The Severity change had ripple effects in ado/client.ts, html-reporter.ts, hybrid-scanner.ts, finding.ts (pre-existing files still using old 'major'/'advisory' values)
- Updated rule-runner.ts with `RuleFilterOptions` and `filterRules()` for category/level/tag-based filtering, `runFiltered()` method
- Barrel exports: `src/rules/categories/index.ts` re-exports all arrays, `src/rules/index.ts` combines into `allRules` with helper functions

### 2025-07 — Axe-core → Drummer Category Mapping
- Created `src/rules/axe-mapping.ts` to bridge axe-core's tagging system to our RuleCategory taxonomy
- Exports: `AXE_CATEGORY_MAP` (constant), `mapAxeCategoryToRuleCategory()`, `mapAxeWcagLevel()`, `mapAxeWcagCriterion()`, `mapAxeImpactToSeverity()`
- Key mapping decisions:
  - `cat.color` → `distinguishable` (not a separate category; color contrast is WCAG 1.4)
  - `cat.language` → `readable` (WCAG 3.1 Readable covers language of page/parts)
  - `cat.name-role-value` → `aria` (WCAG 4.1.2 is fundamentally about ARIA names/roles/states)
  - `cat.text-alternatives` → `images` (WCAG 1.1 non-text content is primarily about images)
  - `cat.semantics` → `compatible` (proper element usage aligns with WCAG 4.1 Compatible)
  - `cat.structure` → `adaptable` (info & relationships → WCAG 1.3 Adaptable)
  - `cat.tables` → `adaptable` (table structure is WCAG 1.3.1 Info & Relationships)
  - `cat.time-and-media` → `multimedia` (WCAG 1.2 Time-based Media)
  - `cat.sensory-and-visual-cues` → `distinguishable` (visual presentation → WCAG 1.4)
  - best-practice-only → `compatible` (fallback; AA default level)
- No new RuleCategory values needed — all 13 axe categories map cleanly to existing 16 categories
- Severity mapping is 1:1 since we previously aligned our Severity type with axe-core's impact scale
- WCAG criterion parser handles "wcag111"→"1.1.1" pattern: first digit=principle, second=guideline, rest=criterion
- Fallback strategy: if no "cat.*" tag, derive category from WCAG principle/guideline in criterion tags
- **Lesson learned:** Our RuleCategory taxonomy is well-aligned with axe-core; no gaps found. The earlier decision to align Severity with axe-core's impact scale pays off here — `mapAxeImpactToSeverity` is trivial

## 2026-02-23: Team Decisions Merged
📌 **ADO Test Plan Integration Architecture** — Holden's design mentions decision points for you: Should chrome elements (P3) that ARE visited still get a11y analysis, or skip analysis entirely? Recommend: analyze if visited, but don't prioritize visiting. This affects rule runner behavior when elements are classified as chrome.

📌 **AI Test Generation Design** — Holden's post-phase design includes edge case generation. Future phases will use LLM to identify accessibility issues that aren't covered by manual test plans. Your rules catalog will be the target — the LLM learns patterns from rule violations and synthesizes scenarios to trigger gaps.

### 2026-02-24 — Microsoft Accessibility Standard Research

- **Microsoft targets WCAG 2.1 Level A + AA** for all products. Confirmed via:
  - Microsoft Conformance Reports page: "assesses products and services against WCAG levels A and AA criteria"
  - Fluent 2 Design System: "meet or surpass WCAG 2.1 AA standards"
  - Accessibility Insights for Web: assessment verifies "WCAG 2.1 Level AA"
- Microsoft reports against three standards: WCAG 2.1 A+AA, US Section 508, EN 301 549
- Microsoft uses DHS Trusted Tester v5 methodology for compliance testing
- **AAA is NOT required** — aspirational only, no major organization mandates it
- **Fluent 2 adds requirements beyond bare WCAG**: focus management (Z-pattern), 400% zoom reflow, High Contrast Mode support, customizable captions

- **Recommended axe-core default tags**: `['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']`
- **Optional presets**: `best-practice`, `wcag2aaa`, `section508`, `EN-301-549`, `TTv5`
- **Current config is too broad** — includes AAA and best-practice mixed with required standards

- **Critical finding: 93% of scan results are "incomplete" (needs-review), not violations**
  - security.microsoft.com scan: 1,081 total → only ~73 are confirmed violations
  - Our code treats incomplete the same as violations — this must change
  - Proposed three-tier system: Violation (bug) → Needs Review (task) → Suggestion (advisory)
  - Severity downgrade for incomplete: critical/serious → moderate, moderate/minor → minor
  - Proposed `reportingTier` and `needsReview` fields on Finding type

- **Deliverables created**:
  - `docs/microsoft-accessibility-standard.md` — Full research document
  - `docs/finding-severity-mapping.md` — Triage rules and severity matrix
  - `.ai-team/decisions/inbox/drummer-ms-a11y-standard.md` — Decision proposal for team review

### 2026-02-24 — Dynamic Accessibility Checks Analysis (Playwright-based)

**User request:** "I don't see in the live test a check for zoom, scale and other important checks. Is this because of the timeout?"

**Root cause identified:** Axe-core provides static DOM analysis (60% coverage). Cannot perform **dynamic checks** that require browser manipulation (zoom, viewport resize, keyboard input, screenshots, animation detection).

**Analysis performed:**

- **Audited existing rules** — All 153 rules across 16 categories:
  - Zoom/reflow: rule `resize-text-200` (1.4.4) and `reflow` (1.4.10) exist, but no automation
  - Keyboard: 8 keyboard rules exist (2.1.1-2.1.4); axe-core covers static detection (~60%), but Tab navigation and focus traps require dynamic testing
  - Focus visible: rule `focus-visible` (2.4.7) exists; axe-core detects `outline: none` via CSS, but dynamic screenshot comparison needed to verify actual visibility
  - Motion: rules `three-flashes-below-threshold` (2.3.1), `prefers-reduced-motion` (2.3.3) exist; no automation for luminance analysis or media query emulation
  - Orientation: rule `orientation` (1.3.4) exists; requires viewport resize testing
  - Text spacing: rule `text-spacing` (1.4.12); no automation; requires CSS injection + screenshot comparison

- **Axe-core coverage gap analysis:**
  - **Covered by axe:** color contrast (inline), form labels (static), heading hierarchy, link names, ARIA roles/states
  - **NOT covered by axe:** zoom behavior, reflow, text spacing, keyboard traps (runtime), focus visibility (screenshot-based), flashing, motion, orientation
  - **Lesson learned:** Axe-core excels at AST/DOM analysis but fundamentally cannot manipulate browser state

- **Designed 8-12 dynamic checks** with Playwright API calls:
  - Text resize 200% — `page.evaluate('document.body.style.zoom = "200%"')`, detect horizontal scrollbar
  - Reflow at 320px — `page.setViewportSize({width: 320, height: 768})`, check reflow without scroll
  - Text spacing tolerance — CSS injection + `overflow` property check
  - Orientation support — `setViewportSize()` for portrait/landscape, check CSS `@media (orientation: ...)`
  - Keyboard navigation — `page.keyboard.press('Tab')` loop, track focus history
  - Keyboard trap detection — Tab 30+ times, analyze focus pattern for loops
  - Focus visible indicator — Screenshot before/after focus, pixel diff via pixelmatch library
  - Focus not obscured — CSS rule analysis for `outline: none` without alternative
  - Flashing detection — Screenshot every 333ms, analyze luminance changes (requires sharp library)
  - Prefers-reduced-motion — `page.emulateMedia({reducedMotion: 'reduce'})`, reload, compare animation count
  - Target size (24×24) — `getBoundingClientRect()` on all interactive elements
  - Form labels — Enhanced static check for placeholder-only inputs

- **Prioritization matrix (P0=required, P1=should-have):**
  - **P0 (Microsoft WCAG 2.1 AA):** Zoom/reflow, keyboard, focus visible, orientation, text spacing, target size
  - **P1 (AAA or best-practice):** Flashing (critical for safety), reduced-motion (AAA)
  - **P2 (nice-to-have):** Custom shortcuts (2.1.4), motion actuation (2.5.4)

- **Estimated effort:** 8-10 weeks for Phase 2 (12 checks)
  - Simple (form labels): 1 check, 1 week
  - Medium (zoom, reflow, spacing, orientation): 4 checks, 4 weeks
  - Hard (keyboard, focus, flashing): 7 checks, 6 weeks
  - Total lines of code: ~2,500 (checks + tests)

- **Dependencies:** `pixelmatch` (focus/screenshot diff), `sharp` (luminance analysis)
  - Both optional; gracefully skip if not installed
  - Estimated size: +100KB after tree-shaking

- **Performance impact:**
  - Each check: 1-4 seconds
  - All 12 checks (parallelized): ~30 seconds per page
  - Proposed: opt-in via `ScanConfig.dynamicChecks: { enabled: true }`
  - Graceful degradation if scan timeout approaching (skip remaining checks)

- **Architecture proposal:**
  - New `DynamicAnalyzer` class (mirrors `PageAnalyzer`)
  - Each WCAG criterion → one async check method
  - Findings marked `dynamic: true` for filtering/reporting
  - Integrated into `PageAnalyzer.analyze()` after axe-core checks

**Deliverables created:**

1. `docs/dynamic-checks-plan.md` — Complete technical analysis
   - 12 detailed checks with WCAG references, Playwright pseudocode, complexity estimates
   - Implementation roadmap, dependency list, risk mitigation
   - 4,000+ words, ready for dev handoff

2. `.ai-team/decisions/inbox/drummer-dynamic-checks.md` — Decision proposal
   - Problem statement, solution architecture, trade-offs
   - Timeline, approval checklist, success criteria
   - Team questions for discussion (opt-in vs. default, screenshot storage, image lib choice)

**Key insights:**

- Axe-core is not to blame — it's working as designed (static analysis). Dynamic checks are a **separate capability**.
- Timeout concern (user question) is valid but incomplete — timeout alone doesn't explain the gap. **Axe-core architecture** is the limiting factor.
- WCAG 2.1 AA requires ~11 dynamic checks. Our rule catalog (153 rules) is comprehensive; now we need **execution engine** (Playwright-based DynamicAnalyzer).
- Microsoft Fluent design adds **400% zoom reflow** requirement beyond bare WCAG — more aggressive than 200% check we designed.
- Keyboard tests are **highest risk** for false positives (SPAs, modals, complex focus patterns) — need whitelist/exclusion logic.

**Next steps (for team):**

1. Holden reviews `drummer-dynamic-checks.md` decision
2. Team votes on: (a) opt-in vs. default? (b) which image libs? (c) Phase 2 scope (all 12 or priority subset)?
3. If approved, move to Phase 2 execution (Naomi leads implementation)

### 2026-02-25 — Voice Access & NVDA Screen Reader Analysis

**User request:** "What about voice access, NVDA screen reader?" (GalGoldi72)

**Root cause identified:** Phase 1/2 focus on keyboard + focus + zoom. Assistive technology (voice control, screen reader announcements) not yet covered.

**Analysis scope:**
1. **Part 1:** What can be detected WITHOUT running a screen reader (DOM analysis, WCAG static rules)
2. **Part 2:** What REQUIRES screen reader automation (speech output, reading order, dynamic announcements)
3. **Part 3:** Concrete implementation roadmap (Phase 2.5 + Phase 3b)

**Key findings:**

- **Voice Access compatibility (3 checks):**
  - Label in Name (WCAG 2.5.3) — visible label matches accessible name
  - Target Size 24×24 (WCAG 2.5.8) — interactive elements big enough to voice-target
  - No Complex Gestures (WCAG 2.5.1) — heuristic detection of multi-touch interactions
  - All detectable via Playwright DOM analysis; no new dependencies

- **Screen Reader compatibility (5 checks):**
  - Live Regions (WCAG 4.1.3) — dynamic content announced via aria-live/role=alert
  - Landmark Regions (WCAG 1.3.1) — page structure (main, nav, aside, footer)
  - Skip Links (WCAG 2.4.1) — skip navigation to main content
  - Reading Order vs. Visual Order (WCAG 1.3.2) — DOM order matches visual order
  - Page Title & SPA Navigation (WCAG 2.4.2) — page title, title updates on route change
  - 4 already partially covered by axe-core; 1 live regions check new

- **Screen reader automation state (2024-2026):**
  - **aria-at** (W3C project) — Mature Python tool for NVDA automation, but no Node.js API
  - **NVDA automation** — Possible but requires Python ↔ Node.js bridge (non-trivial)
  - **Best practice for 2026:** Hybrid approach — DOM analysis NOW, manual testing guidance NOW, NVDA automation later (Phase 3b, Q3 2026)

- **Recommendation:** Approve Phase 2.5 (8 checks, 10-12 days) now; defer Phase 3b NVDA automation decision until Q2 2026.

**Deliverables created:**

1. `docs/voice-access-nvda-plan.md` — 34KB comprehensive analysis
   - 12 detailed DOM-based checks with Playwright pseudocode
   - Screen reader automation evaluation (aria-at, WebdriverIO, manual testing)
   - Phase 2.5/3b implementation roadmap
   - Manual testing procedures guidance

2. `.ai-team/decisions/inbox/drummer-voice-nvda-checks.md` — Decision proposal
   - Phase 2.5 approval request (8 rules, 10-12 days, no new dependencies)
   - Phase 3b deferral (NVDA automation, Q3 2026 optional)
   - WCAG 2.1 AA coverage impact: 60% → 90%

**Key insights:**

- Voice Access is simpler than expected — mostly requires label/name matching + target size validation
- Screen reader compatibility = 40% axe-core (ARIA) + 40% DOM analysis (landmarks, skip links, live regions) + 20% automation (speech output)
- aria-at project is mature but Python-only; integrating with Node.js scanner would require architectural bridge
- Microsoft accessibility standard requires both voice + screen reader support; Phase 2.5 closes gap cost-effectively

**Lesson learned:** Assistive technology analysis differs fundamentally from keyboard/focus testing. Keyboard = user behavior (Tab keys, arrows). Assistive tech = platform integration (screen reader announcements, voice recognition matching labels). Need different check patterns.

**Next steps (for team):**

1. Holden/Avasarala review Phase 2.5 scope/timeline (fits in Phase 2 ship date?)
2. Team votes: Approve Phase 2.5? Defer Phase 3b?
3. If approved, prioritize voice checks (2.5.3, 2.5.8) first — blocks voice access compliance
4. Q3 2026: Reassess aria-at and NVDA automation feasibility for Phase 3b

📌 Team update (2026-03-03): Dynamic checks architecture approved (zoom, reflow, keyboard, focus, motion). MS A11y standard alignment: WCAG 2.1 AA default. Voice/NVDA checks proposed (Phase 2.5). Decisions by Drummer
