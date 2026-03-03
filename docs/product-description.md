# Smart A11y Scanner — Product Description

## Executive Summary

The Smart A11y Scanner is an AI-powered accessibility testing tool that automatically crawls single-page applications (SPAs) to discover accessibility violations across complex, interactive interfaces. By combining intelligent browser automation with axe-core's WCAG 2.2 checks and custom accessibility rules, it delivers comprehensive accessibility reports in minutes—eliminating manual testing bottlenecks and catching issues before they reach production.

---

## Key Capabilities

### Intelligent Navigation & State Discovery
- **AI-powered SPA navigation:** Automatically detects and follows interactive elements (buttons, links, menus, tabs, expandable sections)
- **Deep state exploration:** Uses depth-first search to recursively navigate through page states, uncovering hidden UI flows that static analysis misses
- **Overlay & modal handling:** Intelligently analyzes panels, dialogs, drawers, and modals without getting trapped in UI layers
- **Cross-page navigation:** Follows links and automatically discovers multiple pages within a scan

### Comprehensive Accessibility Checking
- **axe-core integration:** Runs axe-core 4.11+ to detect WCAG 2.2 compliance violations with precise, actionable guidance
- **Custom accessibility rules:** Hand-rolled checks for issues that generic tools miss:
  - Visual heading structure and hierarchy
  - Color contrast validation (WCAG AA/AAA compliance)
  - Semantic HTML validation
  - ARIA attribute patterns and naming conventions
  - Focus management and keyboard navigation flows
  - Screen reader text alternatives
- **Smart deduplication:** Automatically merges duplicate findings across different UI states to reduce noise and focus on unique issues

### Professional Reporting & Integration
- **Rich HTML reports:** Self-contained, offline-friendly reports with:
  - Visual severity breakdown (Critical, Serious, Moderate, Minor)
  - Screenshots of each finding location
  - Direct links to WCAG Understanding documents for each rule
  - State navigation breadcrumbs (which pages/states the issue appears on)
  - Summary statistics and trend analysis
- **Multiple export formats:** JSON, SARIF (for CI/CD integration), plain text, and markdown
- **Azure DevOps integration:** Auto-file bugs with:
  - Severity mapping (WCAG critical → P1, serious → P2, etc.)
  - Screenshots and reproduction steps embedded
  - Custom fields and links to accessibility standards
  - Configurable duplicate detection to prevent spam

### Flexible & Developer-Friendly
- **Test plan support:** Run guided scans using YAML-defined user journeys for targeted, repeatable testing
- **Configurable scan depth & timeout:** Balance coverage vs. speed based on application complexity
- **CLI-first design:** Works seamlessly in local development, CI/CD pipelines, and npm scripts
- **Dry-run & analyze-only modes:** Preview behavior without actually opening your app

---

## Accessibility Standards Covered

The scanner validates compliance across all four WCAG 2.2 pillars:

### **Perceivable**
- Color contrast (WCAG AA/AAA levels)
- Text alternatives for images and media
- Adaptable content and readable typography
- Distinguishability (not relying on color alone)

### **Operable**
- Keyboard navigation (all interactive elements must be keyboard-accessible)
- Focus management and visible focus indicators
- Avoidance of keyboard traps
- Sufficient touch target sizes

### **Understandable**
- Form labels and instructions clearly associated with inputs
- Error identification and recovery guidance
- Consistent naming and navigation patterns
- Plain language and readable structure

### **Robust**
- Correct ARIA usage (no invalid combinations, proper naming)
- Valid HTML element semantics
- Name, role, and value properties correctly exposed to assistive technologies
- Compatibility with screen readers (NVDA, JAWS) and voice control tools

---

## Technical Stack

- **Language:** TypeScript (ES modules)
- **Browser Automation:** Playwright (Chrome/Firefox/Safari support)
- **Accessibility Testing:** axe-core 4.11+
- **Runtime:** Node.js 18+
- **Configuration:** YAML-based (with CLI flag overrides)
- **Reporting:** Self-contained HTML + JSON + SARIF formats

---

## Demo Results

**Latest Full-App Scan:**
- **Pages discovered:** 9+
- **UI states explored:** 15+
- **Total findings:** 65
- **Scan duration:** ~7 minutes

**Severity Breakdown:**
- 🔴 **Critical:** 16 issues (blocking assistive technology)
- 🟠 **Serious:** 27 issues (major accessibility barriers)
- 🟡 **Moderate:** 22 issues (impacts specific user groups)

**Key findings included:** Missing alt text, inadequate color contrast, missing form labels, invalid ARIA roles, keyboard navigation gaps, and focus management issues.

---

## Product Roadmap

### **Near Term (Q1 2025)**
- ✅ Core SPA discovery and axe-core integration (complete)
- ✅ HTML reporting with screenshots (complete)
- ✅ Test plan support for guided scans (complete)
- 🚧 Enhanced element prioritization (content → navigation → chrome)
- 📋 Azure DevOps bug-filing automation (in progress)

### **Medium Term (Q2 2025)**
- AI-synthesized test scenarios (auto-generate test cases from execution patterns)
- Dynamic interaction checks (detect JavaScript-driven state changes)
- Improved screen reader integration (NVDA playback in reports)
- Scan scope controls (allowlist/blocklist URLs and selectors)

### **Future Considerations**
- GitHub Action distribution
- Copilot tool / MCP integration
- Performance analytics dashboard
- False-positive learning and custom rule tuning

---

## Why It Matters

Manual accessibility testing is time-consuming, error-prone, and easy to deprioritize. Organizations often discover accessibility issues late—after launch or through user complaints—when fixes are expensive and disruptive.

The Smart A11y Scanner shifts left:

- **Catch issues early:** Automated, continuous scanning in CI/CD pipelines
- **Save engineering time:** Eliminate repetitive manual testing and guessing
- **Reduce risk:** Systematic coverage of complex SPAs that human testers miss
- **Enable compliance:** Built-in WCAG 2.2 mapping and audit-ready reporting
- **Empower teams:** Clear, actionable guidance for developers and designers

**Result:** Better accessibility, faster time-to-market, and a more inclusive product.

---

## Getting Started

```bash
npm install smart-a11y-scanner

# Basic scan
a11y-scan scan https://your-app.com

# With configuration
a11y-scan scan https://your-app.com --config a11y.yaml --output html --depth 3

# With test plan (guided, repeatable testing)
a11y-scan scan https://your-app.com --test-plan-file ./test-plans/user-journey.yaml

# With Azure DevOps integration
a11y-scan scan https://your-app.com --ado --ado-token ${{ secrets.ADO_TOKEN }}
```

Reports are saved to `a11y-reports/` by default.

---

**Questions or feedback?** Reach out to the Smart A11y Scanner team.
