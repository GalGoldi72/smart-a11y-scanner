# Dynamic Accessibility Checks Plan

**Date:** 2026-02-24  
**Author:** Drummer (Accessibility Expert)  
**Status:** Analysis & Planning  
**Target:** Smart A11y Scanner – Phase 2 (Dynamic Checks via Playwright)

## Executive Summary

The current scanner relies on **static DOM analysis** (axe-core) and basic inline checks. To achieve production-grade WCAG 2.1 AA compliance, we need **dynamic checks that actively manipulate the browser** to verify:

- **Reflow at 200% zoom** (no horizontal scrolling, text readable)
- **Text spacing tolerance** (letter/word/line spacing at 200%)
- **Orientation support** (portrait ↔ landscape responsiveness)
- **Keyboard accessibility** (Tab navigation, focus management, keyboard traps)
- **Focus visibility** (visible indicator on all focusable elements)
- **Motion tolerance** (prefers-reduced-motion, flash rate detection)

**Key insight:** These checks require Playwright to:
1. Modify browser state (viewport size, zoom, media queries)
2. Simulate user input (Tab key presses, keyboard events)
3. Capture screenshots to detect visual changes
4. Monitor for timing/animation behaviors

**Current status:** Axe-core covers ~60% of required checks (static). We need ~40% more for full AA compliance.

---

## Analysis: What Axe-Core Already Covers

Axe-core (via `@axe-core/playwright`) provides automatic detection for:

| WCAG Criterion | Rule ID | Coverage | Status |
|---|---|---|---|
| 2.4.7 Focus Visible | `focus-visible` | CSS rules (`:focus { outline: none }`) | ✅ Static only |
| 2.1.1 Keyboard | `keyboard-operable` | Form inputs, native elements | ✅ Static only |
| 2.1.2 No Keyboard Trap | `keyboard-no-trap` | ARIA role validation | ⚠️ Partial |
| 2.4.3 Focus Order | `focus-order` | DOM tabindex analysis | ⚠️ Partial |
| 1.4.3 Contrast | `color-contrast` | Inline styles only (no composite backgrounds) | ⚠️ Partial |
| 1.4.4 Resize Text | Manual test required | None | ❌ Missing |
| 1.4.10 Reflow | Manual test required | None | ❌ Missing |
| 1.4.12 Text Spacing | Manual test required | None | ❌ Missing |
| 1.3.4 Orientation | Manual test required | None | ❌ Missing |
| 2.3.1 Three Flashes | Animation detection only | None | ❌ Missing |
| 2.5.4 Motion Actuation | Event listener detection only | None | ❌ Missing |

**Lesson:** Axe-core is excellent for static DOM issues but cannot validate **dynamic behavior changes**. It cannot:
- Simulate zoom or viewport changes
- Simulate keyboard input
- Capture before/after screenshots
- Detect runtime animations or layout shifts
- Monitor for focus traps during actual interaction

---

## Dynamic Checks by Category

### 1. Zoom & Reflow (WCAG 1.4.4, 1.4.10)

#### Check 1.1: Text Resizable to 200%
- **WCAG Criterion:** 1.4.4 Resize Text (Level AA)
- **What the check does:**
  - Set browser zoom to 200% via `page.evaluate('document.body.style.zoom = "200%"')`
  - Check for horizontal scrollbars (`window.innerWidth < document.documentElement.scrollWidth`)
  - Verify no text is clipped (`overflow: hidden` on text containers)
  - Ensure buttons and links remain clickable
  - Compare before/after pixel dimensions for content overflow

- **How to implement (Playwright):**
  ```typescript
  async checkTextResize200Percent(page: Page): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    // Capture baseline
    const baselineWidth = await page.evaluate(() => window.innerWidth);
    
    // Apply 200% zoom
    await page.evaluate(() => {
      document.body.style.zoom = '200%';
    });
    
    // Wait for layout to settle
    await page.waitForTimeout(500);
    
    // Check for horizontal scrollbar
    const hasHorizScroll = await page.evaluate(() => {
      return window.innerWidth < document.documentElement.scrollWidth;
    });
    
    if (hasHorizScroll) {
      findings.push({
        ruleId: 'text-resize-200',
        message: 'Content requires horizontal scrolling at 200% zoom',
        severity: 'serious',
        wcagCriterion: '1.4.4',
      });
    }
    
    // Check for clipped text
    const clippedElements = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      return Array.from(elements)
        .filter(el => {
          const style = window.getComputedStyle(el);
          return style.overflow === 'hidden' && el.scrollHeight > el.clientHeight;
        })
        .map(el => ({
          tag: el.tagName,
          text: el.textContent?.substring(0, 50),
        }));
    });
    
    if (clippedElements.length > 0) {
      findings.push({
        ruleId: 'text-resize-clipped',
        message: `Found ${clippedElements.length} elements with clipped text at 200% zoom`,
        severity: 'serious',
        wcagCriterion: '1.4.4',
        details: clippedElements,
      });
    }
    
    // Reset zoom
    await page.evaluate(() => {
      document.body.style.zoom = '100%';
    });
    
    return findings;
  }
  ```

- **Priority:** P0 (Microsoft requires WCAG 2.1 AA)
- **Estimated complexity:** Medium
- **Dependencies:** Page must be fully loaded, no async rendering
- **False positive risk:** Low (clear, observable)

---

#### Check 1.2: Reflow Without Horizontal Scrolling
- **WCAG Criterion:** 1.4.10 Reflow (Level AA) — *NEW in WCAG 2.1*
- **What the check does:**
  - Test viewport resizing to 320px width (mobile breakpoint)
  - Verify content reflows without horizontal scrolling
  - Check no content is lost or hidden unexpectedly
  - Validate all interactive elements remain accessible
  - Flag fixed-width containers or unresponsive layouts

- **How to implement (Playwright):**
  ```typescript
  async checkReflowMobile(page: Page): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    // Test narrow viewport (320px is minimum mobile width per WCAG)
    await page.setViewportSize({ width: 320, height: 768 });
    await page.waitForTimeout(500); // Let layout reflow
    
    // Check for horizontal scrollbar
    const hasHorizScroll = await page.evaluate(() => {
      const rootWidth = Math.max(
        document.documentElement.clientWidth,
        document.body.clientWidth
      );
      return window.innerWidth < rootWidth;
    });
    
    if (hasHorizScroll) {
      findings.push({
        ruleId: 'reflow-horizontal-scroll',
        message: 'Content requires horizontal scrolling at 320px width',
        severity: 'serious',
        wcagCriterion: '1.4.10',
      });
    }
    
    // Verify main content is visible
    const mainVisible = await page.evaluate(() => {
      const main = document.querySelector('main') || document.querySelector('[role="main"]');
      if (!main) return true; // No main, assume OK
      return main.offsetWidth > 0 && main.offsetHeight > 0;
    });
    
    if (!mainVisible) {
      findings.push({
        ruleId: 'reflow-main-hidden',
        message: 'Main content is not visible at 320px width',
        severity: 'critical',
        wcagCriterion: '1.4.10',
      });
    }
    
    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    
    return findings;
  }
  ```

- **Priority:** P0 (Microsoft requires WCAG 2.1 AA)
- **Estimated complexity:** Medium
- **Dependencies:** Requires full page load; may reveal dynamic issues in SPAs
- **False positive risk:** Medium (responsive design may intentionally stack content)

---

### 2. Text Spacing & Scaling (WCAG 1.4.12)

#### Check 2.1: Text Spacing Tolerance
- **WCAG Criterion:** 1.4.12 Text Spacing (Level AA) — *NEW in WCAG 2.1*
- **What the check does:**
  - Increase letter spacing to 0.12em
  - Increase word spacing to 0.16em
  - Increase line spacing to 1.5em
  - Increase paragraph spacing to 2em
  - Verify no text is clipped, overlapped, or truncated
  - Ensure all interactive elements remain accessible

- **How to implement (Playwright):**
  ```typescript
  async checkTextSpacingTolerance(page: Page): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    // Apply WCAG 1.4.12 text spacing requirements
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = `
        * {
          letter-spacing: 0.12em !important;
          word-spacing: 0.16em !important;
          line-height: 1.5em !important;
        }
        p, div, span {
          margin-bottom: 2em !important;
        }
      `;
      document.head.appendChild(style);
    });
    
    await page.waitForTimeout(500); // Let spacing reflow
    
    // Check for text overflow/clipping
    const overflowElements = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      return Array.from(elements)
        .filter(el => {
          const style = window.getComputedStyle(el);
          const hasText = el.textContent && el.textContent.trim().length > 0;
          const isClipped = el.scrollHeight > el.clientHeight || 
                           el.scrollWidth > el.clientWidth;
          const hasOverflow = style.overflow === 'hidden' || style.overflow === 'clip';
          return hasText && isClipped && hasOverflow;
        })
        .map(el => ({
          selector: el.className,
          text: el.textContent?.substring(0, 50),
        }))
        .slice(0, 10); // Limit results
    });
    
    if (overflowElements.length > 0) {
      findings.push({
        ruleId: 'text-spacing-overflow',
        message: `${overflowElements.length} elements have clipped text with increased spacing`,
        severity: 'serious',
        wcagCriterion: '1.4.12',
        details: overflowElements,
      });
    }
    
    // Check for horizontal scrollbar
    const hasHorizScroll = await page.evaluate(() => {
      return window.innerWidth < document.documentElement.scrollWidth;
    });
    
    if (hasHorizScroll) {
      findings.push({
        ruleId: 'text-spacing-horizontal-scroll',
        message: 'Content requires horizontal scrolling with increased text spacing',
        severity: 'serious',
        wcagCriterion: '1.4.12',
      });
    }
    
    // Clean up
    await page.evaluate(() => {
      const styles = document.querySelectorAll('style');
      styles[styles.length - 1]?.remove();
    });
    
    return findings;
  }
  ```

- **Priority:** P0 (Microsoft requires WCAG 2.1 AA)
- **Estimated complexity:** Medium
- **Dependencies:** Requires CSS injection capability; must not affect actual page state
- **False positive risk:** Medium (some layouts may legitimately require adjustment)

---

### 3. Orientation (WCAG 1.3.4)

#### Check 3.1: Display Orientation Support
- **WCAG Criterion:** 1.3.4 Orientation (Level AA) — *NEW in WCAG 2.1*
- **What the check does:**
  - Test both portrait and landscape orientations
  - Verify content is readable and functional in both
  - Check for CSS/JS that locks orientation
  - Flag `@media (orientation: portrait-only)` or JS locks
  - Ensure touch targets and interactive elements remain accessible

- **How to implement (Playwright):**
  ```typescript
  async checkOrientationSupport(page: Page): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    // Test portrait orientation (9:16 aspect ratio)
    await page.setViewportSize({ width: 360, height: 640 });
    await page.waitForTimeout(500);
    
    const portraitScrollWidth = await page.evaluate(() => {
      return document.documentElement.scrollWidth;
    });
    
    if (portraitScrollWidth > 360) {
      findings.push({
        ruleId: 'orientation-portrait-scroll',
        message: 'Content is not readable in portrait orientation (horizontal scrolling required)',
        severity: 'serious',
        wcagCriterion: '1.3.4',
      });
    }
    
    // Test landscape orientation (16:9 aspect ratio)
    await page.setViewportSize({ width: 1024, height: 576 });
    await page.waitForTimeout(500);
    
    const landscapeScrollWidth = await page.evaluate(() => {
      return document.documentElement.scrollWidth;
    });
    
    if (landscapeScrollWidth > 1024) {
      findings.push({
        ruleId: 'orientation-landscape-scroll',
        message: 'Content is not readable in landscape orientation',
        severity: 'serious',
        wcagCriterion: '1.3.4',
      });
    }
    
    // Check for orientation lock in CSS
    const hasOrientationLock = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      const css = sheets
        .map(sheet => {
          try {
            return Array.from(sheet.cssRules)
              .map(rule => rule.cssText)
              .join('\n');
          } catch {
            return '';
          }
        })
        .join('\n');
      
      return css.includes('orientation: portrait') || 
             css.includes('orientation-lock') ||
             css.includes('orientation: landscape-only');
    });
    
    if (hasOrientationLock) {
      findings.push({
        ruleId: 'orientation-css-lock',
        message: 'CSS contains orientation-specific restrictions',
        severity: 'serious',
        wcagCriterion: '1.3.4',
      });
    }
    
    // Reset to default viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    
    return findings;
  }
  ```

- **Priority:** P0 (Microsoft requires WCAG 2.1 AA)
- **Estimated complexity:** Medium
- **Dependencies:** Viewport control; test both portrait and landscape
- **False positive risk:** Low (clear observable issue)

---

### 4. Keyboard & Focus (WCAG 2.1.1, 2.1.2, 2.4.7, 2.4.11)

#### Check 4.1: Keyboard Navigation via Tab
- **WCAG Criterion:** 2.1.1 Keyboard (Level A)
- **What the check does:**
  - Simulate pressing Tab key N times
  - Verify all interactive elements are reachable
  - Record focus path and compare to expected order
  - Flag unreachable buttons, links, inputs, etc.
  - Detect custom widgets (role=button, role=tab, etc.)

- **How to implement (Playwright):**
  ```typescript
  async checkKeyboardNavigation(page: Page): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    // Get all focusable elements
    const focusableElements = await page.evaluate(() => {
      const elements = document.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      return Array.from(elements).map((el, idx) => ({
        index: idx,
        tag: el.tagName,
        text: el.textContent?.substring(0, 30),
        ariaLabel: (el as any).getAttribute('aria-label'),
      }));
    });
    
    if (focusableElements.length === 0) {
      return findings; // No focusable elements
    }
    
    // Simulate Tab navigation through all elements
    const focusedElements: any[] = [];
    for (let i = 0; i < focusableElements.length + 2; i++) {
      await page.keyboard.press('Tab');
      
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tag: el?.tagName,
          text: el?.textContent?.substring(0, 30),
          ariaLabel: (el as any)?.getAttribute('aria-label'),
        };
      });
      
      focusedElements.push(focused);
    }
    
    // Check if we reached all focusable elements
    const focusedCount = new Set(
      focusedElements.map(f => `${f.tag}:${f.text}`)
    ).size;
    
    const expectedCount = focusableElements.length;
    if (focusedCount < expectedCount * 0.8) {
      findings.push({
        ruleId: 'keyboard-unreachable',
        message: `Only ${focusedCount} of ${expectedCount} focusable elements are reachable via Tab`,
        severity: 'critical',
        wcagCriterion: '2.1.1',
      });
    }
    
    return findings;
  }
  ```

- **Priority:** P0 (Microsoft requires WCAG 2.1 A)
- **Estimated complexity:** Hard (requires state tracking, duplicate detection)
- **Dependencies:** Must handle dynamic focus changes, modal dialogs
- **False positive risk:** Medium (SPAs with dynamic content may confuse the check)

---

#### Check 4.2: No Keyboard Trap
- **WCAG Criterion:** 2.1.2 No Keyboard Trap (Level A)
- **What the check does:**
  - Simulate Tab navigation for 30+ presses
  - Detect if focus enters a loop (same elements repeating)
  - Flag dialogs without Escape key support
  - Verify Shift+Tab also works (reverse navigation)
  - Check for intentional traps (modal focus management)

- **How to implement (Playwright):**
  ```typescript
  async checkKeyboardTrap(page: Page): Promise<Finding[]> {
    const findings: Finding[] = [];
    const focusHistory: string[] = [];
    const MAX_TABS = 30;
    
    // Collect focus history
    for (let i = 0; i < MAX_TABS; i++) {
      await page.keyboard.press('Tab');
      
      const focusedId = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.id || (el as any)?.className || el?.tagName;
      });
      
      focusHistory.push(focusedId);
    }
    
    // Check for repeating pattern (trap)
    const uniqueFocused = new Set(focusHistory);
    
    if (uniqueFocused.size <= 2 && focusHistory.length >= 10) {
      findings.push({
        ruleId: 'keyboard-trap',
        message: 'Keyboard focus appears to be trapped (cycling between same elements)',
        severity: 'critical',
        wcagCriterion: '2.1.2',
        details: {
          focusedElements: Array.from(uniqueFocused),
          tapCount: MAX_TABS,
        },
      });
    }
    
    // Test Shift+Tab (reverse navigation)
    await page.keyboard.press('Home'); // Reset to start
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    
    const canReverseTab = await page.evaluate(() => {
      // If activeElement changed, Shift+Tab works
      return document.activeElement !== document.body;
    });
    
    if (!canReverseTab) {
      findings.push({
        ruleId: 'keyboard-shift-tab',
        message: 'Reverse Tab navigation (Shift+Tab) may not work',
        severity: 'serious',
        wcagCriterion: '2.1.2',
      });
    }
    
    // Check for modal dialogs (dialog role should trap focus)
    const hasModal = await page.evaluate(() => {
      return !!document.querySelector('[role="dialog"], dialog');
    });
    
    if (hasModal) {
      findings.push({
        ruleId: 'keyboard-modal-trap-allowed',
        message: 'Modal dialog found — focus trap is intentional (verify Escape closes)',
        severity: 'info',
        wcagCriterion: '2.1.2',
      });
    }
    
    return findings;
  }
  ```

- **Priority:** P0 (Microsoft requires WCAG 2.1 A)
- **Estimated complexity:** Hard (complex loop detection, modal handling)
- **Dependencies:** Must understand dialog semantics, handle focus management
- **False positive risk:** Medium (may incorrectly detect intentional modal focus traps)

---

#### Check 4.3: Focus Visible Indicator
- **WCAG Criterion:** 2.4.7 Focus Visible (Level AA)
- **What the check does:**
  - Tab through all focusable elements
  - Capture before/after screenshots for each focus state
  - Compare pixels to detect visual change
  - Measure focus indicator (outline, box-shadow, background)
  - Flag elements with no visible focus change
  - Verify minimum contrast for focus indicator

- **How to implement (Playwright):**
  ```typescript
  async checkFocusVisible(page: Page): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    // Get all focusable elements
    const focusableSelectors = [
      'a[href]', 'button', 'input:not([type="hidden"])',
      'select', 'textarea', '[tabindex]:not([tabindex="-1"])',
      '[role="button"]', '[role="tab"]', '[role="link"]'
    ];
    
    const focusableCount = await page.evaluate((selectors) => {
      return selectors.reduce((sum, sel) => {
        return sum + document.querySelectorAll(sel).length;
      }, 0);
    }, focusableSelectors);
    
    if (focusableCount === 0) return findings;
    
    let elementsWithoutFocus = 0;
    
    for (let i = 0; i < Math.min(focusableCount, 20); i++) {
      // Capture unfocused state
      const beforeImg = await page.screenshot();
      
      // Focus element
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100); // Let focus style apply
      
      // Capture focused state
      const afterImg = await page.screenshot();
      
      // Simple pixel comparison: check if > 5% of viewport pixels changed
      const pixelChanges = await this.compareScreenshots(beforeImg, afterImg);
      
      if (pixelChanges < 0.05) { // Less than 5% change
        elementsWithoutFocus++;
      }
    }
    
    if (elementsWithoutFocus > focusableCount * 0.2) {
      findings.push({
        ruleId: 'focus-visible-missing',
        message: `${elementsWithoutFocus} of ${focusableCount} sampled elements lack visible focus indicator`,
        severity: 'critical',
        wcagCriterion: '2.4.7',
      });
    }
    
    return findings;
  }
  
  private async compareScreenshots(img1: Buffer, img2: Buffer): Promise<number> {
    // Placeholder: use pixel-diff library in actual implementation
    // Returns ratio of changed pixels (0.0 to 1.0)
    return 0;
  }
  ```

- **Priority:** P0 (Microsoft requires WCAG 2.1 AA)
- **Estimated complexity:** Hard (image comparison, pixel analysis)
- **Dependencies:** Screenshot capture library (sharp, pixelmatch, etc.)
- **False positive risk:** High (animations, dynamic styling can confuse pixel comparison)

---

#### Check 4.4: Focus Appearance (NEW in WCAG 2.2)
- **WCAG Criterion:** 2.4.11 Focus Not Obscured (Level AA) — *NEW in WCAG 2.2*
- **What the check does:**
  - Tab through focusable elements
  - Verify focus indicator is not obscured by overlays/headers
  - Check focus outline is visible (not display:none)
  - Ensure minimum contrast for focus indicator (3:1 with background)
  - Flag elements with `outline: none` without alternative

- **How to implement (Playwright):**
  ```typescript
  async checkFocusNotObscured(page: Page): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    // Check for outline:none without alternative in CSS
    const outlineNoneWithoutAlt = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      const violations: any[] = [];
      
      sheets.forEach(sheet => {
        try {
          Array.from(sheet.cssRules).forEach(rule => {
            const css = rule.cssText;
            if (css.includes(':focus') && css.includes('outline:none')) {
              // Check if rule includes alternative (box-shadow, border, etc.)
              const hasAlternative = 
                css.includes('box-shadow') || 
                css.includes('border') ||
                css.includes('background');
              
              if (!hasAlternative) {
                violations.push({
                  selector: rule.selectorText,
                  cssText: css,
                });
              }
            }
          });
        } catch (e) {
          // CORS-restricted stylesheets
        }
      });
      
      return violations;
    });
    
    if (outlineNoneWithoutAlt.length > 0) {
      findings.push({
        ruleId: 'focus-outline-removed',
        message: `${outlineNoneWithoutAlt.length} CSS rules remove focus outline without providing alternative`,
        severity: 'serious',
        wcagCriterion: '2.4.11',
        details: outlineNoneWithoutAlt,
      });
    }
    
    // Tab and check if focus is visible
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      
      const focusStyle = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const style = window.getComputedStyle(el, ':focus');
        return {
          outlineWidth: style.outlineWidth,
          boxShadow: style.boxShadow,
          backgroundColor: style.backgroundColor,
          display: style.display,
        };
      });
      
      const hasVisibleIndicator = 
        focusStyle.outlineWidth !== '0px' ||
        focusStyle.boxShadow !== 'none' ||
        focusStyle.display !== 'none';
      
      if (!hasVisibleIndicator) {
        findings.push({
          ruleId: 'focus-not-visible',
          message: 'Focused element has no visible focus indicator',
          severity: 'serious',
          wcagCriterion: '2.4.11',
        });
        break;
      }
    }
    
    return findings;
  }
  ```

- **Priority:** P0 (Microsoft requires WCAG 2.1 AA; 2.4.11 is in 2.2)
- **Estimated complexity:** Hard (CSS parsing, screenshot comparison)
- **Dependencies:** Access to computed styles via page.evaluate
- **False positive risk:** Medium (pseudo-element styles may not be fully accessible)

---

### 5. Motion & Animation (WCAG 2.3.1, 2.3.3)

#### Check 5.1: Three Flashes Below Threshold
- **WCAG Criterion:** 2.3.1 Three Flashes or Below Threshold (Level A)
- **What the check does:**
  - Capture screenshots at 1/3-second intervals (≈3x per second)
  - Analyze pixel luminance changes to detect flashing
  - Flag content flashing > 3 times per second
  - Check flashing area (> 21,824 sq px triggers threshold)
  - Measure flash intensity (red flash special rules)

- **How to implement (Playwright):**
  ```typescript
  async checkFlashingContent(page: Page): Promise<Finding[]> {
    const findings: Finding[] = [];
    const SAMPLE_DURATION = 2000; // 2 seconds
    const SCREENSHOT_INTERVAL = 333; // ~3 per second
    const FLASH_THRESHOLD = 3; // flashes per second
    const LUMINANCE_DELTA = 0.1; // 10% luminance change = flash
    
    const screenshots: Buffer[] = [];
    const startTime = Date.now();
    
    // Capture screenshots over 2 seconds
    while (Date.now() - startTime < SAMPLE_DURATION) {
      const screenshot = await page.screenshot();
      screenshots.push(screenshot);
      await page.waitForTimeout(SCREENSHOT_INTERVAL);
    }
    
    // Analyze for flashing
    const luminanceHistory: number[] = [];
    
    for (const screenshot of screenshots) {
      const luminance = await this.calculateMeanLuminance(screenshot);
      luminanceHistory.push(luminance);
    }
    
    // Detect flash transitions
    let flashCount = 0;
    for (let i = 1; i < luminanceHistory.length; i++) {
      const delta = Math.abs(luminanceHistory[i] - luminanceHistory[i - 1]);
      if (delta > LUMINANCE_DELTA) {
        flashCount++;
      }
    }
    
    const flashesPerSecond = (flashCount / SAMPLE_DURATION) * 1000;
    
    if (flashesPerSecond > FLASH_THRESHOLD) {
      findings.push({
        ruleId: 'three-flashes-exceeded',
        message: `Content flashes ${flashesPerSecond.toFixed(1)} times per second (exceeds 3/sec limit)`,
        severity: 'critical',
        wcagCriterion: '2.3.1',
        details: {
          flashesPerSecond: flashesPerSecond.toFixed(1),
          threshold: FLASH_THRESHOLD,
        },
      });
    }
    
    return findings;
  }
  
  private async calculateMeanLuminance(screenshot: Buffer): Promise<number> {
    // Placeholder: use sharp/jimp to parse image and calculate mean luminance
    // Formula: 0.299 * R + 0.587 * G + 0.114 * B
    return 0.5;
  }
  ```

- **Priority:** P0 (Microsoft requires WCAG 2.1 A; critical for seizure safety)
- **Estimated complexity:** Hard (image analysis, statistical)
- **Dependencies:** Image processing library (sharp, jimp)
- **False positive risk:** Low (measurable, scientific)

---

#### Check 5.2: Prefers-Reduced-Motion Support
- **WCAG Criterion:** 2.3.3 Animation from Interactions (Level AAA)
- **What the check does:**
  - Set media query `prefers-reduced-motion: reduce` via Playwright emulation
  - Reload page with this preference
  - Compare animation behavior to default
  - Verify animations are disabled or significantly reduced
  - Flag pages that ignore the preference

- **How to implement (Playwright):**
  ```typescript
  async checkPrefersReducedMotion(page: Page): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    // Get baseline animation count (normal motion preference)
    const normalAnimations = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('*'))
        .filter(el => {
          const style = window.getComputedStyle(el);
          return style.animation !== 'none' || style.transition !== 'none';
        }).length;
    });
    
    // Set reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForTimeout(1000); // Let new styles load
    
    // Get animation count with reduced motion
    const reducedAnimations = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('*'))
        .filter(el => {
          const style = window.getComputedStyle(el);
          return style.animation !== 'none' || style.transition !== 'none';
        }).length;
    });
    
    // If animations unchanged, the preference was ignored
    if (reducedAnimations >= normalAnimations * 0.8) {
      findings.push({
        ruleId: 'prefers-reduced-motion-ignored',
        message: `Page does not respect prefers-reduced-motion: ${reducedAnimations} animations remain (was ${normalAnimations})`,
        severity: 'serious',
        wcagCriterion: '2.3.3',
      });
    }
    
    // Reset to normal
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    
    return findings;
  }
  ```

- **Priority:** P1 (Microsoft requires WCAG 2.1 AA; this is AAA)
- **Estimated complexity:** Medium
- **Dependencies:** Playwright media emulation
- **False positive risk:** Medium (some animations may be essential; need whitelist)

---

### 6. Other Dynamic Checks

#### Check 6.1: Form Input Placeholder vs Label
- **WCAG Criterion:** 3.3.2 Labels or Instructions (Level A)
- **What the check does:**
  - Detect input fields with placeholder but no label
  - Flag if placeholder text disappears when user types
  - Verify visible labels are present for all inputs
  - Check labels are associated via `<label for>` or aria-labelledby

- **How to implement (Playwright):**
  ```typescript
  async checkFormLabels(page: Page): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, textarea, select'))
        .filter(el => el.offsetParent !== null) // Visible
        .map(el => {
          const id = (el as any).id;
          const name = (el as any).name;
          const placeholder = (el as any).placeholder;
          const label = id ? document.querySelector(`label[for="${id}"]`) : null;
          
          return {
            tag: el.tagName,
            type: (el as any).type,
            id,
            name,
            hasPlaceholder: !!placeholder,
            placeholderText: placeholder,
            hasLabel: !!label,
            labelText: label?.textContent,
            ariaLabel: (el as any).getAttribute('aria-label'),
            ariaLabelledBy: (el as any).getAttribute('aria-labelledby'),
          };
        });
    });
    
    for (const input of inputs) {
      if (!input.hasLabel && !input.ariaLabel && !input.ariaLabelledBy) {
        if (input.hasPlaceholder) {
          findings.push({
            ruleId: 'form-placeholder-only',
            message: `${input.tag} (${input.type}) relies on placeholder text instead of label`,
            severity: 'serious',
            wcagCriterion: '3.3.2',
            details: input,
          });
        } else {
          findings.push({
            ruleId: 'form-no-label',
            message: `${input.tag} (${input.type}) has no associated label`,
            severity: 'critical',
            wcagCriterion: '1.3.1',
            details: input,
          });
        }
      }
    }
    
    return findings;
  }
  ```

- **Priority:** P0 (Microsoft requires WCAG 2.1 A)
- **Estimated complexity:** Simple
- **Dependencies:** DOM analysis only
- **False positive risk:** Low

---

#### Check 6.2: Target Size Minimum (24×24 CSS px)
- **WCAG Criterion:** 2.5.8 Target Size (Minimum) (Level AA) — *NEW in WCAG 2.2*
- **What the check does:**
  - Measure all interactive elements (buttons, links, inputs)
  - Flag targets smaller than 24×24 CSS pixels
  - Check spacing (24px gap between adjacent targets counts as sufficient)
  - Exclude inline links within text
  - Report touch target size violations

- **How to implement (Playwright):**
  ```typescript
  async checkTargetSize(page: Page): Promise<Finding[]> {
    const findings: Finding[] = [];
    const MIN_SIZE = 24;
    const MIN_SPACING = 24;
    
    const targets = await page.evaluate(() => {
      const selectors = [
        'button', 'a[href]', 'input:not([type="hidden"])',
        '[role="button"]', '[role="link"]', '[role="tab"]',
        'select', 'textarea'
      ];
      
      const elements: any[] = [];
      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach(el => {
          if (el.offsetParent === null) return; // Skip hidden
          
          const rect = el.getBoundingClientRect();
          
          // Skip inline links in text (small is acceptable)
          if (el.tagName === 'A' && rect.width < 50) {
            const style = window.getComputedStyle(el);
            if (style.display === 'inline' || style.display === 'inline-block') {
              return;
            }
          }
          
          elements.push({
            tag: el.tagName,
            role: (el as any).getAttribute('role'),
            text: el.textContent?.substring(0, 30),
            width: rect.width,
            height: rect.height,
            x: rect.x,
            y: rect.y,
          });
        });
      }
      
      return elements;
    });
    
    for (const target of targets) {
      if (target.width < MIN_SIZE || target.height < MIN_SIZE) {
        // Check for adjacent targets (spacing exemption)
        const tooClose = targets.some(other => {
          if (other === target) return false;
          const distance = Math.hypot(
            target.x - other.x,
            target.y - other.y
          );
          return distance < MIN_SPACING;
        });
        
        if (tooClose) {
          findings.push({
            ruleId: 'target-size-small',
            message: `Touch target is ${target.width}×${target.height}px (minimum 24×24px required)`,
            severity: 'serious',
            wcagCriterion: '2.5.8',
            details: target,
          });
        }
      }
    }
    
    return findings;
  }
  ```

- **Priority:** P0 (Microsoft requires WCAG 2.1 AA; 2.5.8 in 2.2)
- **Estimated complexity:** Medium
- **Dependencies:** getBoundingClientRect, spacing calculations
- **False positive risk:** Medium (spacing logic may be complex)

---

## Implementation Roadmap

### Phase 2A: Core Zoom & Reflow (Weeks 1-2)
- [ ] `checkTextResize200Percent`
- [ ] `checkReflowMobile`
- [ ] Unit tests + integration tests
- [ ] Add to `PageAnalyzer` or new `DynamicAnalyzer` class

### Phase 2B: Keyboard & Focus (Weeks 3-4)
- [ ] `checkKeyboardNavigation`
- [ ] `checkKeyboardTrap`
- [ ] `checkFocusVisible` (requires image comparison library)
- [ ] Modal dialog handling

### Phase 2C: Motion & Special Cases (Weeks 5-6)
- [ ] `checkFlashingContent` (requires image analysis)
- [ ] `checkPrefersReducedMotion`
- [ ] `checkTargetSize`
- [ ] `checkFormLabels` (enhance existing)

### Phase 2D: Polish & Reporting (Week 7)
- [ ] Aggregate findings into report
- [ ] Update HTML/JSON reporters
- [ ] Add screenshots/reproSteps for dynamic findings
- [ ] Performance optimization (skip slow checks on timeout)

---

## Dependencies & Libraries

| Capability | Library | Usage | Est. Size |
|---|---|---|---|
| Image comparison | `pixelmatch` or `jimp` | Focus visibility, flash detection | 50KB |
| Image analysis | `sharp` | Luminance calculation, pixel stats | 100KB |
| CSS parsing | `cssparser` or native `CSSRuleList` | Media query detection | N/A |
| Timing utilities | Node.js `performance` | Benchmark checks | N/A |

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| **Timeout during checks** | Slow scan, incomplete results | Add timeout per check (2sec); skip if overall timeout near | 
| **Screenshot memory overhead** | High memory usage | Capture to disk, cleanup after analysis |
| **Modal dialog handling** | False positives in focus tests | Detect modal role, allow intentional focus traps |
| **CSS from CDN (CORS)** | Can't read external stylesheets | Gracefully skip unavailable sheets; flag as warning |
| **SPA dynamic rendering** | Checks run before JS settles | Increase waitForTimeout; use waitForNavigation for routing |
| **Flashing detection false positives** | Video content, GIFs | Whitelist video/canvas tags; limit to first 2 seconds |

---

## Acceptance Criteria

✅ **Each dynamic check must:**
- Run in < 2 seconds (unless noted)
- Produce at least one real violation in test suite
- Have < 10% false positive rate (manual review required)
- Include clear reproSteps for manual verification
- Not interfere with page functionality

✅ **Reporting:**
- Findings include WCAG criterion, severity, remediation
- Dynamic findings marked with `dynamic: true` flag
- Screenshots attached where applicable

✅ **Performance:**
- Dynamic checks optional (opt-in via config)
- Gracefully degrade if timeout approaching
- Report `timedOut` flag on `ScanResult`

---

## Appendix: Not Covered by This Plan

The following checks are beyond current scope (Phase 3+):

| Check | Reason | Effort |
|---|---|---|
| Screen reader testing (NVDA, JAWS) | Requires accessible automation APIs | Very hard |
| Voice control (Windows Narrator) | Requires voice input simulation | Very hard |
| High Contrast Mode support | Requires Windows-specific emulation | Hard |
| Customizable fonts/colors | Requires bookmarklet or browser extension | Medium |
| PDF accessibility | Requires PDF-specific tools | Hard |
| Multi-page flows (login, checkout) | Requires test plan data | Medium |
| Real user session replay | Requires analytics integration | Hard |

---

## Summary

This plan adds **8-12 dynamic checks** to reach WCAG 2.1 AA compliance:

- **Zoom & Reflow:** 2 checks (200% text, 320px viewport)
- **Keyboard:** 4 checks (Tab nav, traps, focus visible, focus not obscured)
- **Motion:** 2 checks (flashing, reduced-motion)
- **Forms:** 1 check (labels)
- **Touch:** 1 check (target size)

**Total effort:** ~8-10 weeks for full Phase 2  
**Estimated code:** ~2,500 lines (checks + tests)  
**Dependencies:** 2-3 npm packages (pixelmatch, sharp, optional)

---

*Document version: 1.0*  
*Last updated: 2026-02-24*  
*Review status: Ready for team discussion*
