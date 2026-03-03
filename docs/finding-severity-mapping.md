# Finding Severity Mapping — Triage Rules

**Author:** Drummer (Accessibility Expert)
**Date:** 2026-02-24
**Purpose:** Define how axe-core results map to our scanner's severity levels and reporting tiers

---

## 1. Axe-core Result Types → Our Reporting Tiers

Axe-core returns four result types. Each maps to a different reporting tier in our scanner:

| Axe-core Result Type | Description | Our Reporting Tier | Report As |
|---------------------|-------------|-------------------|-----------|
| **violations** | Confirmed accessibility failures | **Bugs** | Always report; file as ADO bugs |
| **incomplete** | Cannot determine pass/fail; needs human review | **Needs Manual Review** | Report separately; lower priority |
| **passes** | Elements that passed the check | **Not reported** | Suppress (use for coverage metrics only) |
| **inapplicable** | Rules that don't apply to the page | **Not reported** | Suppress |

### Critical Insight

In our security.microsoft.com scan, **93% of findings (1,008 of 1,081) were "incomplete"** — axe flagged them for manual review, NOT as confirmed violations. Our current code treats them identically to violations, which is incorrect and destroys signal-to-noise ratio.

---

## 2. Violation Severity Mapping (Confirmed Bugs)

For findings from `results.violations`, map axe-core's `impact` directly to our severity:

| Axe-core Impact | Our Severity | ADO Priority | Description |
|-----------------|-------------|-------------|-------------|
| `critical` | **critical** | P1 | Blocks access entirely (e.g., no keyboard access, missing form labels that prevent input) |
| `serious` | **serious** | P2 | Significant barrier (e.g., missing alt text on informational images, empty interactive elements) |
| `moderate` | **moderate** | P3 | Noticeable issue (e.g., heading hierarchy skips, missing landmark regions) |
| `minor` | **minor** | P4 | Minor issue (e.g., redundant ARIA roles, suboptimal but functional markup) |

This mapping is 1:1 because we previously aligned our `Severity` type with axe-core's impact scale.

---

## 3. Incomplete Finding Severity (Needs Manual Review)

For findings from `results.incomplete`, severity should be **downgraded** since these are unconfirmed:

| Axe-core Impact | Our Severity (for incomplete) | Rationale |
|-----------------|------------------------------|-----------|
| `critical` | **moderate** | High-impact if confirmed, but needs human verification |
| `serious` | **moderate** | Same — could be a real issue, but unconfirmed |
| `moderate` | **minor** | Moderate-impact possibility needing review |
| `minor` | **minor** | Low-impact possibility |

### Incomplete Finding Labeling

All incomplete findings MUST be clearly labeled:
- **Message prefix**: `[Needs Review]` (already in current code — keep this)
- **Finding property**: Add `needsReview: true` flag
- **Report section**: Separate "Manual Review Required" section, distinct from confirmed violations
- **ADO work item type**: "Task" (not "Bug") — these are review tasks, not confirmed bugs

---

## 4. WCAG Level → Severity Modifier

Findings should also consider the WCAG conformance level:

| WCAG Level | Default Behavior | Rationale |
|------------|-----------------|-----------|
| **A** | Report at full severity | Level A is the minimum bar; failures are serious |
| **AA** | Report at full severity | AA is Microsoft's compliance target |
| **AAA** | Downgrade one level OR report as "advisory" | AAA is aspirational; not a compliance requirement |
| **best-practice** | Report as "suggestion" | Not a WCAG requirement at all |

### Severity Matrix (Level × Impact)

| | critical impact | serious impact | moderate impact | minor impact |
|---|---|---|---|---|
| **Level A violation** | critical | serious | moderate | minor |
| **Level AA violation** | critical | serious | moderate | minor |
| **Level AAA violation** | serious | moderate | minor | minor |
| **best-practice** | moderate | minor | minor | minor |
| **Level A incomplete** | moderate | moderate | minor | minor |
| **Level AA incomplete** | moderate | moderate | minor | minor |

---

## 5. Category-Based Priority Boosting

Certain categories should get priority boosts because they have outsized impact on users:

| Category | Boost | Rationale |
|----------|-------|-----------|
| **keyboard** | +1 severity | Keyboard failures block entire user groups (mobility impairments) |
| **aria** (name-role-value) | No boost | Important but often has false positives |
| **distinguishable** (color/contrast) | No boost | High volume; many are legitimate design choices |
| **forms** | +1 severity for critical/serious | Form inaccessibility blocks task completion |

"Boost" means: if the base severity is `moderate`, boost to `serious`. If `minor`, boost to `moderate`. Never boost past `critical`.

---

## 6. Recommended Triage Workflow

### Step 1: Separate by Result Type

```
axe results
├── violations[]     → Tier 1: Confirmed Bugs
├── incomplete[]     → Tier 2: Needs Manual Review
├── passes[]         → (suppress — coverage metrics only)
└── inapplicable[]   → (suppress)
```

### Step 2: Filter by WCAG Level

```
Tier 1 (violations)
├── Level A + AA     → DEFAULT: Always report
├── Level AAA        → OPTIONAL: Only if user enables AAA preset
└── best-practice    → OPTIONAL: Only if user enables best-practice preset

Tier 2 (incomplete)
├── Level A + AA     → DEFAULT: Report in "Manual Review" section
├── Level AAA        → OPTIONAL: Suppress by default
└── best-practice    → OPTIONAL: Suppress by default
```

### Step 3: Assign Severity

Apply the severity matrix from Section 4, then apply category boosts from Section 5.

### Step 4: Deduplicate

Same element + same rule + same page = single finding (keep the one with highest severity).

---

## 7. Expected Impact on Scan Results

Applying these triage rules to the security.microsoft.com scan (1,081 raw findings):

| Current (untriaged) | After triage |
|---------------------|-------------|
| 51 critical | ~51 critical (from violations only) |
| 14 serious | ~14 serious (from violations only) |
| 1,008 moderate | ~1,008 moved to "Needs Manual Review" (downgraded severity) |
| 8 minor | ~8 minor |
| **1,081 total "bugs"** | **~73 confirmed bugs + ~1,008 review items** |

This immediately reduces the "bugs that need fixing" count from 1,081 to ~73 — a **93% noise reduction** while losing zero real violations.

---

## 8. Implementation Checklist

- [ ] Separate `results.violations` from `results.incomplete` in `runAxeChecks()`
- [ ] Add `needsReview: boolean` field to `Finding` type
- [ ] Downgrade severity for incomplete findings per Section 3 mapping
- [ ] Add WCAG level filtering (default: A+AA only for violations and incomplete)
- [ ] Move best-practice findings to separate "suggestions" tier
- [ ] Add `reportingTier: 'violation' | 'needs-review' | 'suggestion'` to Finding
- [ ] Update HTML reporter to show tiers in separate sections
- [ ] Update ADO bug creator to file violations as Bugs, incomplete as Tasks
- [ ] Make AAA and best-practice opt-in via scanner config
