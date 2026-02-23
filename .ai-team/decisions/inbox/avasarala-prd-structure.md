# Decision: PRD Structure & WCAG 2.2 Coverage Model

**Date:** December 2024  
**By:** Avasarala (PM)  
**Status:** Proposed (awaiting Holden & Drummer review)

## What
Created a comprehensive Product Requirements Document (`docs/PRD.md`) organized into three feature tiers:
- **P0 (Must Have):** Core MVP features for v1.0 (URL scanning, crawling, UI flow detection, WCAG checks, ADO bug filing, reports)
- **P1 (Should Have):** Enhanced features for v1.1 (auth support, SPA handling, baselines, CI/CD integration)
- **P2 (Nice-to-Have):** Advanced features for v1.2+ (NVDA integration, browser profiles, dashboard, custom rules)

## Why

1. **Clear Prioritization:** Team can focus on v1.0 MVP without distraction; v1.1+ features documented but deprioritized
2. **WCAG 2.2 Completeness:** Decomposed all major accessibility categories (10 total) into specific checkpoints, not hand-wavy
3. **User-Centric:** 15 user stories with acceptance criteria match real workflows (QA engineer, PM, DevOps, executive)
4. **Risk-Managed:** Screen reader integration (NVDA) identified as high-complexity → deferred to P2; basic ARIA checks in P0
5. **ADO Integration as Core:** Not bolted-on; treated as first-class feature with duplicate detection, severity mapping, custom fields
6. **Success Metrics:** Defined across primary (coverage, accuracy, speed), secondary (adoption, actionability), operational (uptime) tiers
7. **Stakeholder-Ready:** Professional format suitable for executive sign-off and team alignment

## Implications

- **Timeline Impact:** v1.0 scoped to ~50 accessibility rules across 10 WCAG categories; 8-10 week estimate
- **Team Allocation:** Naomi (backend crawler/detectors), Alex (frontend/reports), Drummer (WCAG expertise), Amos (QA validation)
- **Technical Decisions:** TypeScript + Node.js + Playwright + Axe-core (confirmed in `.ai-team/team.md`)
- **ADO Integration:** Must support PAT tokens, batch filing, duplicate detection, custom fields (non-negotiable for v1.0)
- **Deferred Features:** NVDA integration, parallel crawling, multi-browser profiles, dashboard — deprioritized to v1.2+

## Next Steps
1. Holden review: Technical feasibility of 50-rule WCAG coverage in 8-10 weeks
2. Drummer review: WCAG 2.2 checklist accuracy (10 categories, ~50 rules)
3. Amos input: Test strategy for false positive validation (< 5% target)
4. Team sign-off: Roadmap alignment and resource commitment
