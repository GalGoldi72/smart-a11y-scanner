# Voice Access & NVDA Screen Reader Compatibility Plan

**Date:** 2026-02-25  
**Author:** Drummer (Accessibility Expert)  
**Status:** Analysis & Planning  
**Target:** Smart A11y Scanner – Phase 3 (Assistive Technology Integration)

---

## Executive Summary

The Smart A11y Scanner currently focuses on **static DOM analysis** (axe-core) and **dynamic browser manipulation** (Playwright zoom, keyboard, focus). To achieve production-grade accessibility for Windows users, we must address **assistive technology compatibility**—specifically:

1. **Windows Voice Access** — Voice control for clicking, scrolling, dictating, and command execution
2. **NVDA Screen Reader** — Free, open-source screen reader; most widely used on Windows
3. **Narrator** (optional) — Windows built-in screen reader; lower priority but important for enterprise
4. **JAWS** (optional) — Premium screen reader; less common in healthcare but critical for WCAG certification

This document separates what can be detected **without running a screen reader** (DOM analysis + WCAG rules) from what **requires screen reader automation** (actual speech output, reading order, dynamic announcements).

---

## Part 1: Voice Access & Screen Reader Checks WITHOUT Running AT (DOM Analysis)

### 1.1 Voice Access Compatibility (WCAG 2.5.1, 2.5.3, 2.5.8)

Voice Access relies on visible labels and click targets. These can be verified statically:

#### Check 1.1.1: Label in Name (WCAG 2.5.3) — Voice Access Critical

**What it detects:**
- All interactive elements have visible labels matching their accessible names
- Voice users command "Click [visible-label]" → browser must target correct element
- Mismatch example: Button has `aria-label="Submit"` but visible text is "Go" → Voice Access clicks wrong element

**WCAG Criterion:** 2.5.3 Label in Name (Level A)  
**Priority:** P0 (Microsoft WCAG 2.1 AA)  
**Already covered by axe-core?** Partially — `label-in-name` rule exists but incomplete

**Implementation (Playwright DOM analysis):**
```typescript
async checkLabelInName(page: Page): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  const elements = await page.evaluate(() => {
    const results: {selector: string, visibleText: string, accessibleName: string, match: boolean}[] = [];
    
    // All interactive elements: button, input, a, [role="button"], [role="link"], etc.
    const selectors = [
      'button', 'a', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]',
      '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]'
    ];
    
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        // Extract visible text (what the user sees)
        const visibleText = el.textContent?.trim() || el.getAttribute('value') || '';
        
        // Extract accessible name (what screen reader says)
        const ariaLabel = el.getAttribute('aria-label') || '';
        const ariaLabelledBy = el.getAttribute('aria-labelledby') 
          ? Array.from(el.getAttribute('aria-labelledby')!.split(' '))
              .map(id => document.getElementById(id)?.textContent?.trim())
              .join(' ')
          : '';
        const accessibleName = ariaLabel || ariaLabelledBy || visibleText;
        
        const match = visibleText.toLowerCase().includes(accessibleName.toLowerCase()) ||
                      accessibleName.toLowerCase().includes(visibleText.toLowerCase());
        
        if (!match && accessibleName && visibleText) {
          results.push({
            selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
            visibleText,
            accessibleName,
            match: false
          });
        }
      });
    });
    
    return results;
  });
  
  if (elements.length > 0) {
    findings.push({
      ruleId: 'label-in-name',
      message: `${elements.length} interactive elements have mismatched visible labels and accessible names. Voice Access users may click the wrong element.`,
      severity: 'serious',
      wcagCriterion: '2.5.3',
      elements: elements.map(el => ({
        selector: el.selector,
        message: `Visible: "${el.visibleText}" | Accessible: "${el.accessibleName}"`
      }))
    });
  }
  
  return findings;
}
```

**Why it matters for Voice Access:**
- When a voice user says "Click Submit", Windows Voice Access searches for that text on screen
- If `<button aria-label="Send">Submit</button>`, the visible text matches the voice command
- But if `<button aria-label="Send">Go Now</button>`, Voice Access can't find "Submit" and fails

---

#### Check 1.1.2: Interactive Element Size (WCAG 2.5.8) — Voice Access Critical

**What it detects:**
- All interactive elements are at least 24×24 pixels (or CSS-adjusted size)
- Voice Access users click with voice commands; small targets are hard to voice-target
- Also required for touch, so this overlaps with 2.5.5 Target Size

**WCAG Criterion:** 2.5.8 Target Size Minimum (Level AA) — **NEW in WCAG 2.2**  
**Priority:** P0 (Microsoft WCAG 2.1 AA; 2.5.8 is 2.2 but similar to 2.5.5 in 2.1)  
**Already covered by axe-core?** No — axe-core doesn't check 2.5.8 (newer criterion)

**Implementation (Playwright):**
```typescript
async checkTargetSize24x24(page: Page): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  const undersizedElements = await page.evaluate(() => {
    const results: {selector: string, width: number, height: number}[] = [];
    
    const interactiveSelectors = [
      'button', 'a', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]',
      'input[type="checkbox"]', 'input[type="radio"]', '[role="button"]', '[role="link"]',
      '[role="menuitem"]', '[role="tab"]', '[role="checkbox"]'
    ];
    
    interactiveSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const rect = el.getBoundingClientRect();
        
        // Must be at least 24×24 CSS pixels
        // Note: for buttons with text, 18px font is acceptable if padding adds size
        if (rect.width < 24 || rect.height < 24) {
          // Exclude elements that are intentionally tiny (icons with aria-hidden)
          if (!el.getAttribute('aria-hidden')) {
            results.push({
              selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            });
          }
        }
      });
    });
    
    return results;
  });
  
  if (undersizedElements.length > 0) {
    findings.push({
      ruleId: 'target-size-minimum',
      message: `${undersizedElements.length} interactive elements are smaller than 24×24 pixels. Voice Access and touch users may have difficulty targeting them.`,
      severity: 'serious',
      wcagCriterion: '2.5.8',
      elements: undersizedElements.map(el => ({
        selector: el.selector,
        message: `Size: ${el.width}×${el.height}px`
      }))
    });
  }
  
  return findings;
}
```

---

#### Check 1.1.3: Accessible Name Presence (Voice Access Essential)

**What it detects:**
- All interactive elements have a meaningful accessible name
- Voice users need something to say: "Click Login", "Click Search", etc.
- Empty buttons, icon-only buttons without `aria-label` fail this check

**WCAG Criterion:** 1.1.1 Non-Text Content + 2.5.3 Label in Name  
**Priority:** P0  
**Already covered by axe-core?** Yes — `button-name`, `link-name` rules

**Implementation:** Already covered by axe-core; no new check needed. Highlight in reporting.

---

#### Check 1.1.4: No Complex Gestures (WCAG 2.5.1) — Voice Access Limitation

**What it detects:**
- Custom controls that require multi-touch gestures (pinch, rotate, swipe)
- Voice Access cannot perform these; users are limited to point-and-click
- Examples: draggable sliders, swipe carousels, pinch-to-zoom

**WCAG Criterion:** 2.5.1 Pointer Gestures (Level A)  
**Priority:** P0 (Voice Access critical, but WCAG A so maybe P0 for full coverage)  
**Already covered by axe-core?** Partially — `drag-and-drop-interactions` hints at this

**Implementation (DOM analysis with limitations):**
```typescript
async checkNoComplexGestures(page: Page): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  const complexGestures = await page.evaluate(() => {
    const results: {selector: string, issue: string}[] = [];
    
    // Detect touch event listeners that suggest multi-touch
    const elements = document.querySelectorAll('[data-draggable], [draggable="true"], .carousel, [role="slider"]');
    
    elements.forEach(el => {
      const computedStyle = window.getComputedStyle(el);
      
      // Check for touch-action CSS (indicates gesture handling)
      if (computedStyle.touchAction && computedStyle.touchAction !== 'auto') {
        results.push({
          selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
          issue: `Element has touch-action: ${computedStyle.touchAction} (possible multi-touch gesture)`
        });
      }
      
      // Check for common gesture libraries (heuristic)
      if (el.classList.toString().includes('swipe') || el.classList.toString().includes('drag')) {
        results.push({
          selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
          issue: 'Element appears to use gesture interactions (CSS class suggests drag/swipe)'
        });
      }
    });
    
    return results;
  });
  
  if (complexGestures.length > 0) {
    findings.push({
      ruleId: 'no-complex-gestures',
      message: `${complexGestures.length} elements appear to use complex gestures. Verify keyboard/single-click alternatives exist for voice access.`,
      severity: 'moderate',
      wcagCriterion: '2.5.1',
      elements: complexGestures,
      notes: 'Requires manual testing — automated detection may have false positives/negatives'
    });
  }
  
  return findings;
}
```

**Limitations:** This is a heuristic check. True gesture detection requires JavaScript event inspection, which can be unreliable without source code access.

---

### 1.2 Screen Reader Compatibility Checks (NVDA/Narrator/JAWS)

#### Check 1.2.1: ARIA Roles & States (WCAG 4.1.2) — Already by axe-core

**What it detects:**
- Custom components have correct `role` attributes (e.g., `role="tab"`, `role="menuitem"`)
- Required states are present (`aria-selected`, `aria-expanded`, `aria-pressed`)
- Screen reader announces element correctly

**WCAG Criterion:** 4.1.2 Name, Role, Value (Level A)  
**Priority:** P0  
**Already covered by axe-core?** Yes — `aria-roles`, `aria-allowed-attr` rules

**Action:** Ensure axe-core is running with full ARIA validation. Highlight these findings in reports as "Screen Reader Compatibility".

---

#### Check 1.2.2: Live Regions & Dynamic Content (WCAG 4.1.3) — Screen Reader Critical

**What it detects:**
- Dynamic content updates announced to screen readers via `aria-live`, `role="alert"`, `role="status"`
- Example: "3 items added to cart" — must be announced, not just visually updated
- Search results loading, form validation errors, alerts

**WCAG Criterion:** 4.1.3 Status Messages (Level AA)  
**Priority:** P0  
**Already covered by axe-core?** Partially — `aria-live-region` rule exists but incomplete

**Implementation (Playwright + DOM analysis):**
```typescript
async checkLiveRegions(page: Page): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  // First, static check: do live regions exist?
  const staticLiveRegions = await page.evaluate(() => {
    return document.querySelectorAll('[aria-live], [role="alert"], [role="status"]').length;
  });
  
  if (staticLiveRegions === 0) {
    findings.push({
      ruleId: 'live-regions',
      message: 'No live regions or alert regions detected. Dynamic content updates may not be announced to screen readers.',
      severity: 'moderate',
      wcagCriterion: '4.1.3'
    });
  }
  
  // Dynamic check: simulate content updates and verify announcements
  const liveRegionTests = await page.evaluate(() => {
    const results: {element: string, ariaLive: string, polite: boolean, relevant: boolean}[] = [];
    
    document.querySelectorAll('[aria-live], [role="alert"], [role="status"]').forEach(el => {
      const ariaLive = el.getAttribute('aria-live') || el.getAttribute('role');
      const ariaRelevant = el.getAttribute('aria-relevant') || 'additions text removals';
      
      results.push({
        element: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
        ariaLive,
        polite: ariaLive !== 'assertive', // assertive (rude) vs polite (gentle)
        relevant: ariaRelevant.includes('additions')
      });
    });
    
    return results;
  });
  
  // Warn if live regions are aggressive (assertive) without reason
  const aggressiveLiveRegions = liveRegionTests.filter(lr => !lr.polite);
  if (aggressiveLiveRegions.length > 0) {
    findings.push({
      ruleId: 'live-region-politeness',
      message: `${aggressiveLiveRegions.length} live regions use aria-live="assertive" (interrupts screen reader). Consider aria-live="polite" unless urgent.`,
      severity: 'minor',
      wcagCriterion: '4.1.3',
      elements: aggressiveLiveRegions
    });
  }
  
  return findings;
}
```

---

#### Check 1.2.3: Accessible Names & Descriptions (WCAG 2.4.6, 4.1.2)

**What it detects:**
- All elements have meaningful accessible names (not just "Button" or "Link")
- Descriptions provided where needed (e.g., complex charts need alt text + description)
- Screen readers can announce element purpose

**WCAG Criterion:** 2.4.6 Headings and Labels (Level A) + 4.1.2 Name, Role, Value  
**Priority:** P0  
**Already covered by axe-core?** Yes — `button-name`, `link-name`, `form-fieldtype` rules

**Action:** Highlight axe-core findings under "Screen Reader Compatibility" section.

---

#### Check 1.2.4: Focus Management (WCAG 2.4.3) — Screen Reader Essential

**What it detects:**
- Focus visible on all focusable elements (users know where they are)
- Focus moves logically (no tab order skipping or confusion)
- Modals trap focus (can't tab out)
- Skip links work (jump to main content)

**WCAG Criterion:** 2.4.3 Focus Order (Level A)  
**Priority:** P0  
**Already covered by axe-core?** Partially — `focus-order`, `focus-visible` rules

**Implementation:** Overlaps with dynamic checks in Part 2. Focus management requires:
1. **Static:** tabindex validation, skip link detection
2. **Dynamic:** Tab key simulation, focus trap detection (from `dynamic-checks-plan.md`)

---

#### Check 1.2.5: Reading Order vs. Visual Order (WCAG 1.3.2) — Screen Reader Critical

**What it detects:**
- DOM order matches visual order (especially important for screen readers)
- CSS `flex-direction: reverse` or `order: -1` can create mismatches
- Screen reader reads in DOM order, not visual order
- Example: Image on right visually, but first in DOM → screen reader reads image first

**WCAG Criterion:** 1.3.2 Meaningful Sequence (Level A)  
**Priority:** P0  
**Already covered by axe-core?** Partially — hints from semantic analysis but not direct detection

**Implementation (Playwright):**
```typescript
async checkReadingOrderVsVisualOrder(page: Page): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  // Detect CSS that might reorder elements visually
  const visualReorderingUsed = await page.evaluate(() => {
    const results: {selector: string, cssProperty: string, value: string}[] = [];
    
    const allElements = document.querySelectorAll('*');
    allElements.forEach(el => {
      const style = window.getComputedStyle(el);
      
      // Check for flex-direction: row-reverse
      if (style.flexDirection === 'row-reverse' || style.flexDirection === 'column-reverse') {
        results.push({
          selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
          cssProperty: 'flex-direction',
          value: style.flexDirection
        });
      }
      
      // Check for CSS order property on flex children
      if (style.order && style.order !== 'auto' && parseInt(style.order) !== 0) {
        results.push({
          selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
          cssProperty: 'order',
          value: style.order
        });
      }
      
      // Check for absolute positioning that might violate reading order
      if (style.position === 'absolute') {
        const rect = el.getBoundingClientRect();
        const parent = el.parentElement;
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          // If positioned far from natural flow, flag it
          if (Math.abs(rect.left - parentRect.left) > 100 || Math.abs(rect.top - parentRect.top) > 100) {
            results.push({
              selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
              cssProperty: 'position',
              value: 'absolute (far from natural flow)'
            });
          }
        }
      }
    });
    
    return results;
  });
  
  if (visualReorderingUsed.length > 0) {
    findings.push({
      ruleId: 'reading-order-visual-order',
      message: `${visualReorderingUsed.length} elements use CSS that may reorder them visually. Verify reading order matches visual order for screen reader users.`,
      severity: 'moderate',
      wcagCriterion: '1.3.2',
      elements: visualReorderingUsed.map(el => ({
        selector: el.selector,
        message: `${el.cssProperty}: ${el.value}`
      })),
      notes: 'Requires manual testing — screen reader reading order verification'
    });
  }
  
  return findings;
}
```

---

#### Check 1.2.6: Dialog & Modal Focus Management (WCAG 2.4.3) — Screen Reader Essential

**What it detects:**
- Modals properly marked with `aria-modal="true"`
- Focus trapped inside modal (can't tab out)
- Close button or Escape key works
- Focus returns to trigger when modal closes

**WCAG Criterion:** 2.4.3 Focus Order (Level A)  
**Priority:** P0  
**Already covered by axe-core?** Partially — `aria-modal` and `focus-trap` hinting

**Implementation:** Covered in dynamic checks (focus trap detection via Tab simulation).

---

#### Check 1.2.7: Landmark Regions (WCAG 1.3.1) — Screen Reader Navigation

**What it detects:**
- Page structure with landmarks: `<main>`, `<nav>`, `<aside>`, `<footer>`, or equivalent ARIA roles
- Screen readers navigate via landmarks (faster than reading line-by-line)
- Missing landmarks make page harder to navigate

**WCAG Criterion:** 1.3.1 Info and Relationships (Level A)  
**Priority:** P1 (best practice, not strictly required)  
**Already covered by axe-core?** No direct rule, but semantic structure analysis hints

**Implementation (Playwright):**
```typescript
async checkLandmarkRegions(page: Page): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  const landmarks = await page.evaluate(() => {
    const results: {landmark: string, present: boolean}[] = [
      { landmark: '<main> or [role="main"]', present: !!document.querySelector('main, [role="main"]') },
      { landmark: '<nav> or [role="navigation"]', present: !!document.querySelector('nav, [role="navigation"]') },
      { landmark: '<aside> or [role="complementary"]', present: !!document.querySelector('aside, [role="complementary"]') },
      { landmark: '<footer> or [role="contentinfo"]', present: !!document.querySelector('footer, [role="contentinfo"]') }
    ];
    
    return results;
  });
  
  const missingLandmarks = landmarks.filter(l => !l.present);
  
  if (missingLandmarks.length > 0) {
    findings.push({
      ruleId: 'landmark-regions',
      message: `Missing ${missingLandmarks.map(l => l.landmark).join(', ')}. Screen reader users rely on landmarks for page navigation.`,
      severity: 'minor',
      wcagCriterion: '1.3.1',
      notes: 'Best practice; at minimum include <main> or [role="main"]'
    });
  }
  
  return findings;
}
```

---

#### Check 1.2.8: Heading Hierarchy (WCAG 1.3.1, 2.4.10) — Screen Reader Navigation

**What it detects:**
- Headings exist and use proper hierarchy (h1 → h2 → h3, no skipping)
- Screen readers navigate by headings
- Missing or skipped heading levels confuse navigation

**WCAG Criterion:** 1.3.1 Info and Relationships + 2.4.10 Section Headings  
**Priority:** P0  
**Already covered by axe-core?** Yes — `heading-order` rule

**Action:** Highlight axe-core findings.

---

#### Check 1.2.9: Skip Navigation Links (WCAG 2.4.1) — Screen Reader Usability

**What it detects:**
- Skip links present (e.g., "Skip to main content")
- Skip links are first focusable element
- Skip links actually work (jump to correct location)

**WCAG Criterion:** 2.4.1 Bypass Blocks (Level A)  
**Priority:** P0  
**Already covered by axe-core?** Partially — `skip-link` hints

**Implementation (Playwright):**
```typescript
async checkSkipLinks(page: Page): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  // Check for skip links
  const skipLinks = await page.evaluate(() => {
    return {
      exists: !!document.querySelector('a[href="#main"], a[href="#content"], a[href*="skip"]'),
      count: document.querySelectorAll('a[href="#main"], a[href="#content"], a[href*="skip"]').length,
      firstElementFocusable: (document.querySelector('a[href="#main"], a[href="#content"], a[href*="skip"]') as HTMLElement)?.tabIndex === 0 ||
                             window.getComputedStyle(document.querySelector('a[href="#main"], a[href="#content"], a[href*="skip"]') as HTMLElement).visibility !== 'hidden'
    };
  });
  
  if (!skipLinks.exists) {
    findings.push({
      ruleId: 'skip-links',
      message: 'No skip navigation links found. Keyboard and screen reader users must tab through all navigation to reach main content.',
      severity: 'serious',
      wcagCriterion: '2.4.1'
    });
  }
  
  return findings;
}
```

---

#### Check 1.2.10: Image Alt Text (WCAG 1.1.1) — Screen Reader Essential

**What it detects:**
- All images have alt text (or are marked as decorative with `alt=""` or `aria-hidden`)
- Alt text is meaningful (not "image" or "photo")
- Linked images have alt text describing the link

**WCAG Criterion:** 1.1.1 Non-Text Content (Level A)  
**Priority:** P0  
**Already covered by axe-core?** Yes — `image-alt` rule

**Action:** Highlight axe-core findings.

---

#### Check 1.2.11: Form Labels (WCAG 1.3.1, 3.3.2) — Screen Reader Essential

**What it detects:**
- All form inputs have labels (`<label for="id">` or `aria-label`)
- Labels are visible (not just in code)
- Radio/checkbox groups are grouped with `<fieldset>` + `<legend>`

**WCAG Criterion:** 1.3.1 Info and Relationships + 3.3.2 Labels or Instructions  
**Priority:** P0  
**Already covered by axe-core?** Yes — `form-fieldtype`, `label-title-only` rules

**Action:** Highlight axe-core findings.

---

#### Check 1.2.12: Page Title & SPA Navigation (WCAG 2.4.2) — Screen Reader Navigation

**What it detects:**
- Page has a descriptive `<title>` tag
- SPA navigation updates `<title>` on route changes (so screen readers announce new page)
- Focus is moved to main content when page loads/changes

**WCAG Criterion:** 2.4.2 Page Titled (Level A)  
**Priority:** P0  
**Already covered by axe-core?** No direct check for SPA navigation

**Implementation (Playwright + Timeout for SPA):**
```typescript
async checkPageTitle(page: Page): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  const title = await page.title();
  
  if (!title || title.trim() === '') {
    findings.push({
      ruleId: 'page-title',
      message: 'Page has no title. Screen readers announce page title to users.',
      severity: 'serious',
      wcagCriterion: '2.4.2'
    });
  }
  
  // For SPA, check if title changes on navigation (requires test navigation)
  // This is optional and requires configuration of test routes
  
  return findings;
}
```

---

## Part 2: What REQUIRES Running an Actual Screen Reader

### 2.1 Screen Reader Automation State (2024-2026)

**The Hard Truth:** While much can be detected statically, some accessibility issues **require running a real screen reader**:

| Issue | Can Detect Statically? | Automation Tool |
|-------|------------------------|-----------------|
| Actual speech output for elements | ❌ No | NVDA + PyAutoGUI (Windows) |
| Reading order as experienced by user | ⚠️ Partial (DOM order) | NVDA + screen reader output capture |
| Virtual cursor navigation (`arrow` keys) | ❌ No | NVDA + PyAutoGUI |
| Custom widget announcements (e.g., "Slider, 50%") | ⚠️ Partial (ARIA) | NVDA + Narrator + JAWS (test each) |
| Dynamic content announcements (aria-live) | ⚠️ Partial (static check) | NVDA with live region monitoring |
| Screen reader mode-specific issues | ❌ No | NVDA in both browse + focus modes |

### 2.2 Available Automation Projects (2024-2026)

#### Option A: NVDA Automation + Python (aria-at / WebAIM)

**Project:** `aria-at` (Automated Accessibility Testing)  
**Repository:** https://github.com/w3c/aria-at  
**State:** Mature (W3C-maintained)  
**Approach:**
- NVDA controller via Python + PyAutoGUI
- Record expected announcements from NVDA
- Compare actual announcements vs. expected (test assertions)

**Pros:**
- W3C-maintained, production-used
- Free (NVDA is open-source)
- Cross-platform (Windows focus)
- Excellent for WCAG 2.2 testing

**Cons:**
- Requires NVDA installed
- No Node.js API (Python-only; would need bridge)
- Test setup is complex
- Can't test JAWS/Narrator without licensed copies

**Fit for Smart A11y Scanner:** ⭐⭐⭐ Good for Phase 3, but requires Python bridge

---

#### Option B: WebdriverIO + Screen Reader Extension

**Project:** `WebdriverIO` + `assistive-tech` extensions  
**State:** Emerging; not widely adopted in 2026  
**Approach:**
- WebdriverIO controls browser
- Custom bridge to NVDA via named pipes
- Capture screen reader output

**Pros:**
- Stays in Node.js/JavaScript ecosystem
- WebdriverIO is familiar to some teams

**Cons:**
- Immature; limited documentation
- No official NVDA integration
- Risk of bitrot

**Fit for Smart A11y Scanner:** ⭐ Not recommended yet

---

#### Option C: Manual Testing + Video Audit

**State:** Current best practice (2024-2026)  
**Approach:**
- Identify high-risk components (custom widgets, modals, carousels)
- Document test procedures
- Manual tester (QA) runs NVDA + records video
- Video uploaded to findings for review

**Pros:**
- Reliable; no false positives
- Tester catches edge cases automation misses
- Works for all screen readers (NVDA, JAWS, Narrator)

**Cons:**
- Time-consuming
- Not scalable to all elements
- Hard to CI/CD

**Fit for Smart A11y Scanner:** ⭐⭐⭐⭐ For MVP/Phase 1; revisit Phase 3+

---

#### Option D: Accessibility Insights (Microsoft's Tool)

**Product:** Accessibility Insights for Web  
**State:** Mature; Microsoft-maintained  
**Approach:**
- axe-core engine + human-guided testing
- Browser extension provides structured test prompts
- Tester follows prompts, confirms with screen reader

**Pros:**
- Microsoft-backed (our stakeholder!)
- Free
- Well-documented
- WCAG 2.1 AA aligned

**Cons:**
- Not automation; requires human
- Can't integrate into CI/CD

**Fit for Smart A11y Scanner:** ⭐⭐⭐ Complement, not replace

---

### 2.3 Realistic Phase 3 Scope (2026-2027)

**Recommendation:** A hybrid approach.

#### Phase 3a (Q2 2026): Enhanced DOM Analysis + Manual Testing Guidance
- Implement all Part 1 checks (12-16 new rules)
- Add "Manual Testing Required" markers to findings
- Provide test procedures for manual QA (via docs)
- Flag high-risk components (custom widgets, modals)
- Estimated effort: 3-4 weeks

#### Phase 3b (Q3 2026): NVDA Automation Bridge (if approved)
- Evaluate aria-at project integration
- Build Python ↔ Node.js bridge (if aria-at chosen)
- Automate 5-7 high-impact checks:
  - Dialog focus management
  - Live region announcements
  - Heading order announcements
  - Form label announcements
  - Link purpose announcements
- Estimated effort: 6-8 weeks (includes learning aria-at internals)

#### Phase 3c (2027): JAWS + Narrator Testing (Optional)
- If Phase 3b successful, extend to JAWS (requires licensing)
- Narrator testing (built-in Windows, minimal cost)
- Estimated effort: 4-6 weeks per screen reader

---

## Part 3: Implementation Plan

### 3.1 Voice Access Checks — NOW (Phase 2.5)

**Recommended priority order:**

1. **Label in Name (2.5.3)** — CRITICAL
   - Rule ID: `label-in-name` (already exists in axe-core, enhance)
   - Effort: 1 day
   - Category: `input-modalities`
   - Automation: Playwright DOM evaluation

2. **Target Size 24×24 (2.5.8)** — CRITICAL
   - Rule ID: `target-size-minimum`
   - Effort: 1 day
   - Category: `input-modalities`
   - Automation: Playwright getBoundingClientRect

3. **No Complex Gestures (2.5.1)** — MODERATE
   - Rule ID: `no-complex-gestures`
   - Effort: 2 days (requires heuristics; test-heavy)
   - Category: `input-modalities`
   - Automation: CSS class/property detection (may have false positives)

**Estimated total:** 4 days (parallel with dynamic checks in Phase 2)

---

### 3.2 Screen Reader Checks — NOW (Phase 2.5)

**Already covered by axe-core (highlight in reports):**
- ARIA roles/states/properties (2.4, 4.1.2)
- Accessible names (1.1.1, 2.4.6, 4.1.2)
- Form labels (1.3.1, 3.3.2)
- Image alt text (1.1.1)
- Heading hierarchy (1.3.1)

**New checks to implement:**

1. **Live Regions (4.1.3)** — HIGH VALUE
   - Rule ID: `live-regions`
   - Effort: 1.5 days
   - Category: `aria` + `screen-reader`
   - Automation: Playwright DOM evaluation + (optional) aria-live politeness detection

2. **Landmark Regions (1.3.1)** — MEDIUM VALUE
   - Rule ID: `landmark-regions`
   - Effort: 1 day
   - Category: `navigable`
   - Automation: Playwright querySelector

3. **Skip Links (2.4.1)** — HIGH VALUE
   - Rule ID: `skip-links`
   - Effort: 1 day
   - Category: `navigable`
   - Automation: Playwright DOM evaluation

4. **Reading Order vs. Visual Order (1.3.2)** — MEDIUM VALUE
   - Rule ID: `reading-order-visual-order`
   - Effort: 2 days (CSS detection heuristics)
   - Category: `screen-reader` + `adaptable`
   - Automation: Playwright CSS property inspection

5. **Page Title & SPA Navigation (2.4.2)** — HIGH VALUE
   - Rule ID: `page-title`
   - Effort: 1 day
   - Category: `navigable`
   - Automation: Playwright page.title() + (optional) monitor title changes on SPA navigation

**Estimated total:** 6.5 days

---

### 3.3 Manual Testing Guidance — NOW (Documentation)

**Create:** `.ai-team/testing/screen-reader-manual-procedures.md`

**Content:**
- How to install NVDA + configure for testing
- Test procedures for each rule (what to test, what to listen for)
- Video/screenshot examples
- Expected NVDA announcements (aria-label, role, state)
- Common issues and how to spot them

**Estimated effort:** 2 days (writing + testing procedures validation)

---

### 3.4 NVDA Automation Bridge — Phase 3b (Q3 2026)

**Decision point:** Approve aria-at integration?

**If YES:**
1. Evaluate aria-at on Smart A11y Scanner codebase (1 week)
2. Design Python ↔ Node.js IPC bridge (1 week)
3. Implement 5-7 high-impact checks (6 weeks)
4. Test coverage: dialog focus, live regions, form announcements (2 weeks)

**If NO:**
- Continue with manual testing guidance
- Revisit in 2027 if automation tools mature

---

### 3.5 Delivery Roadmap

**NOW (Week 1-3 of Phase 2.5):**
- ✅ Implement 3 voice access checks (1.5 days)
- ✅ Implement 5 screen reader checks (6.5 days)
- ✅ Create manual testing procedures (2 days)
- ✅ Update rule runner to include new checks
- ✅ Update reporting to highlight assistive tech findings
- ✅ Test on accessibility-focused websites (Microsoft, WebAIM, Deque)

**Phase 3b (Q3 2026, if approved):**
- Evaluate aria-at integration
- Build Python bridge (2-3 weeks)
- Implement NVDA automation checks (6 weeks)
- Full testing (2 weeks)

---

## Appendix: Tools & Dependencies

### New npm Dependencies (Phase 2.5)
- None! All checks use existing `page.evaluate()` and Playwright APIs

### Optional Dependencies (Phase 3b)
- `python-bridge` (Node ↔ Python subprocess communication)
- `aria-at-automation` (if cloning aria-at)

### Manual Testing Dependencies
- **NVDA** — Free, open-source screen reader (Windows)
- **Narrator** — Built-in Windows screen reader
- **JAWS** — Commercial screen reader (license cost ~$90/user)

---

## Summary: What to Present to the Team

**For GalGoldi72 (Product Owner):**
- Smart A11y Scanner can cover 80% of voice access + NVDA compatibility via DOM analysis
- Phase 2.5 adds 8 new checks (3 voice, 5 screen reader) with ~10 days of work
- Phase 3b (Q3 2026) can add NVDA automation if aria-at integration approved
- Manual testing guidance available now; automates as tools mature

**For Naomi (Backend) + Alex (Frontend):**
- 8 new rules follow existing pattern (category files, RuleFilterOptions)
- All use Playwright Page API; no new dependencies
- Can integrate into existing DynamicAnalyzer or create AssistiveTechAnalyzer
- Priority: Voice checks must complete before Phase 2 ships (breaks voice access otherwise)

**For Amos (Tester):**
- Manual testing procedures provided
- NVDA/Narrator testing recommended for high-risk components
- Video audit process documented

