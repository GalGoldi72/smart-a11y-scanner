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
