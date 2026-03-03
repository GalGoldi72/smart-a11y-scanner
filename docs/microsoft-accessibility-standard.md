# Microsoft Accessibility Standard — Research Summary

**Author:** Drummer (Accessibility Expert)
**Date:** 2026-02-24
**Purpose:** Document Microsoft's accessibility requirements to calibrate our scanner's default configuration

---

## 1. Microsoft's Accessibility Compliance Target

### Official Standard: WCAG 2.1 Level AA

Microsoft assesses its products and services against **WCAG 2.1 Level A and AA** criteria. This is confirmed by multiple authoritative sources:

| Source | Statement | Reference |
|--------|-----------|-----------|
| **Microsoft Conformance Reports** | "Microsoft assesses products and services against WCAG levels A and AA criteria" | [microsoft.com/accessibility/conformance-reports](https://www.microsoft.com/en-us/accessibility/conformance-reports) |
| **Fluent 2 Design System** | "Fluent's components meet or surpass WCAG 2.1 AA standards" | [fluent2.microsoft.design/accessibility](https://fluent2.microsoft.design/accessibility) |
| **Accessibility Insights for Web** | Assessment feature "verifies that a web app or web site is compliant with WCAG 2.1 Level AA" | [accessibilityinsights.io](https://accessibilityinsights.io/docs/web/overview/) |
| **Section 508 VPATs** | Published for Azure, M365, Dynamics 365, Windows Server, Intune | [learn.microsoft.com](https://learn.microsoft.com/en-us/compliance/regulatory/offering-Section-508-VPATS) |

### Three Standards Microsoft Reports Against

Microsoft publishes Accessibility Conformance Reports (ACRs) using the VPAT template against:

1. **WCAG 2.1 Level A + AA** — The primary technical standard
2. **US Section 508** — Required for US federal government procurement
3. **EN 301 549** — European ICT accessibility standard (incorporates WCAG)

### What This Means for Our Scanner

When scanning Microsoft properties (like security.microsoft.com), the relevant compliance bar is:
- **WCAG 2.1 Level A** — MUST pass (mandatory)
- **WCAG 2.1 Level AA** — MUST pass (mandatory)
- **WCAG 2.2 Level AA** — Should be included (WCAG 2.2 is backward-compatible; 2.2 AA is becoming the new floor)
- **WCAG AAA** — NOT required; aspirational only. Microsoft does not target AAA conformance.

---

## 2. Microsoft-Specific Accessibility Requirements (Beyond WCAG)

### Fluent 2 Design System Requirements

The [Fluent 2 Accessibility Guidelines](https://fluent2.microsoft.design/accessibility) specify additional requirements that go beyond bare WCAG compliance:

| Requirement | Details | WCAG Reference |
|------------|---------|----------------|
| **Color contrast** | Standard text: 4.5:1 minimum. Large text (18.5px bold / 24px regular): 3:1. UI components and icons: 3:1 against adjacent colors | 1.4.3 (AA), 1.4.11 (AA) |
| **Zoom / Reflow** | Content must reflow without horizontal scrolling at 400% zoom (320px breakpoint). Text zoom up to 200% without clipping | 1.4.4 (AA), 1.4.10 (AA) |
| **Focus management** | Focus must follow Z-pattern (left-to-right, top-to-bottom). Focus must not be "lost" after closing temporary UI (dialogs, flyouts) | 2.4.3 (A), 2.4.7 (AA) |
| **Keyboard navigation** | All interactive elements must be keyboard-accessible | 2.1.1 (A), 2.1.2 (A) |
| **Heading hierarchy** | Consistent heading hierarchies; don't mix levels or overuse large headings | 1.3.1 (A) |
| **Alt text** | All visual media must have descriptive alt text accessible to screen readers | 1.1.1 (A) |
| **Captions** | Closed captions on video must be customizable for contrast preferences | 1.2.2 (A), 1.2.4 (AA) |
| **Semantic HTML** | Logical and semantic code; follow WAI-ARIA authoring practices | 4.1.1 (A), 4.1.2 (A) |

### Windows High Contrast Mode

Microsoft products must support Windows High Contrast Mode. This is tested via:
- **Forced Colors Mode** (CSS `@media (forced-colors: active)`)
- All information-carrying UI must remain visible and usable
- This is partially covered by WCAG 1.4.11 (Non-text Contrast) but is a Microsoft-specific emphasis

### Accessibility Insights for Web — Microsoft's Own Testing Tool

Microsoft uses [Accessibility Insights](https://accessibilityinsights.io) internally, which runs axe-core under the hood. Their methodology:
- **FastPass**: ~50 automated checks (high-impact, fast)
- **Assessment**: ~20 manual tests + automated checks for full WCAG 2.1 AA verification
- Uses the DHS Trusted Tester v5 methodology for Section 508 compliance

---

## 3. Axe-core Tag Reference

### Available Tags (from axe-core API documentation)

| Tag | Standard | Included in Default? |
|-----|----------|---------------------|
| `wcag2a` | WCAG 2.0 Level A | ✅ Yes |
| `wcag2aa` | WCAG 2.0 Level AA | ✅ Yes |
| `wcag2aaa` | WCAG 2.0 Level AAA | ❌ No — aspirational |
| `wcag21a` | WCAG 2.1 Level A | ✅ Yes |
| `wcag21aa` | WCAG 2.1 Level AA | ✅ Yes |
| `wcag22aa` | WCAG 2.2 Level AA | ✅ Yes |
| `best-practice` | Common best practices | ⚠️ Separate tier |
| `section508` | US Section 508 | Optional add-on |
| `TTv5` | Trusted Tester v5 | Optional add-on |
| `EN-301-549` | European EN 301 549 | Optional add-on |
| `experimental` | Cutting-edge rules | ❌ Off by default |

### Our Current Configuration (TOO BROAD)

```typescript
// Current — includes AAA and best-practice mixed with required standards
.withTags(['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
```

**Problems:**
1. `wcag2aaa` — AAA is aspirational, not required by Microsoft or any major standard. Generates noise.
2. `best-practice` — Not WCAG requirements. Useful but should be reported separately, not as violations.
3. No `section508` or `EN-301-549` — Missing standards Microsoft actually reports against.

### Recommended Default Configuration

```typescript
// DEFAULT: Microsoft Accessibility Standard (WCAG 2.1 AA equivalent)
const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// OPTIONAL PRESETS (user-selectable):
const BEST_PRACTICE_TAGS = ['best-practice'];
const AAA_TAGS = ['wcag2aaa'];
const SECTION_508_TAGS = ['section508'];
const EN_301_549_TAGS = ['EN-301-549'];
const TRUSTED_TESTER_TAGS = ['TTv5'];
```

---

## 4. Impact on Our Scan Results

### The security.microsoft.com Scan (1,081 findings)

| Category | Count | Assessment |
|----------|-------|------------|
| **True violations** (axe "violations") | ~73 | These are confirmed WCAG failures — must be reported |
| **Incomplete/needs-review** (axe "incomplete") | ~1,008 | Axe cannot determine pass/fail — requires manual review |
| **From AAA rules** | Unknown subset | Should be filtered out of default results |
| **From best-practice rules** | Unknown subset | Should be separated into advisory findings |

### Why "Incomplete" Dominates

Axe-core's `incomplete` results (93% of our findings!) are elements where axe **cannot automatically determine** if there's a violation. Common causes:
- **Color contrast on complex backgrounds** — axe can't compute contrast against gradients, images, or semi-transparent overlays
- **ARIA attribute usage** — axe can see the attributes but can't verify they describe the actual UI behavior
- **Focus management** — axe can detect focus indicators but can't verify the visual design meets contrast requirements

These are NOT bugs — they are review candidates. Treating them as violations massively inflates the bug count and destroys scanner credibility.

---

## 5. Recommendations

1. **Default tag set**: `['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']` — covers Microsoft's compliance target
2. **Separate incomplete from violations** — different severity, different reporting section
3. **Best-practice as opt-in suggestions** — not mixed with WCAG violations
4. **AAA as opt-in** — off by default, available for teams targeting enhanced accessibility
5. **Add `section508` and `EN-301-549`** as optional presets for government/EU customers
6. **Add Windows High Contrast Mode check** — custom rule, not covered by axe-core
