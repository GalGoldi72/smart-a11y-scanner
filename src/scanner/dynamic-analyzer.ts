/**
 * DynamicAnalyzer — accessibility checks requiring active browser manipulation.
 *
 * Complements PageAnalyzer (static axe-core checks) by using Playwright to:
 *   - Modify zoom / text spacing / viewport
 *   - Simulate keyboard navigation (Tab)
 *   - Inspect focus indicators, target sizes, landmarks, skip links, live regions
 *
 * Each check is independent and wrapped in try/catch — one failure does not block others.
 * A deadline parameter allows graceful time-budget enforcement.
 */

import { Page } from 'playwright';
import { ScanConfig, Finding } from './types.js';
import { RuleCategory, Severity, WcagLevel } from '../rules/types.js';

export class DynamicAnalyzer {
  constructor(private config: ScanConfig) {}

  /**
   * Run all dynamic checks against the given page.
   * @param page  Playwright Page (already navigated)
   * @param deadline  Unix timestamp — skip remaining checks if exceeded
   */
  async analyze(page: Page, deadline: number = Date.now() + 120_000): Promise<Finding[]> {
    const findings: Finding[] = [];
    const pageUrl = page.url();

    const checks: Array<{ name: string; fn: () => Promise<Finding[]> }> = [
      { name: 'zoom reflow', fn: () => this.checkZoomReflow(page, pageUrl) },
      { name: 'text spacing', fn: () => this.checkTextSpacing(page, pageUrl) },
      { name: 'keyboard navigation', fn: () => this.checkKeyboardNavigation(page, pageUrl) },
      { name: 'focus order', fn: () => this.checkFocusOrder(page, pageUrl) },
      { name: 'label in name', fn: () => this.checkLabelInName(page, pageUrl) },
      { name: 'target size', fn: () => this.checkTargetSize(page, pageUrl) },
      { name: 'landmarks', fn: () => this.checkLandmarks(page, pageUrl) },
      { name: 'skip links', fn: () => this.checkSkipLinks(page, pageUrl) },
      { name: 'live regions', fn: () => this.checkLiveRegions(page, pageUrl) },
      { name: 'orientation', fn: () => this.checkOrientation(page, pageUrl) },
    ];

    for (const check of checks) {
      if (Date.now() >= deadline) {
        console.log(`  ⏱ Dynamic: deadline reached, skipping remaining checks`);
        break;
      }
      console.log(`  🔬 Dynamic: checking ${check.name}...`);
      try {
        const result = await check.fn();
        findings.push(...result);
      } catch (err) {
        console.warn(`  ⚠ Dynamic check "${check.name}" failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return findings;
  }

  // ---------------------------------------------------------------------------
  // Category 1: Zoom & Reflow
  // ---------------------------------------------------------------------------

  /** WCAG 1.4.4, 1.4.10 — Set zoom to 200%, detect horizontal scrollbar and text clipping */
  private async checkZoomReflow(page: Page, pageUrl: string): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      // Apply 200% zoom
      await page.evaluate(() => {
        (document.body.style as any).zoom = '200%';
      });
      await page.waitForTimeout(500);

      // Check for horizontal scrollbar
      const hasHorizScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      if (hasHorizScroll) {
        findings.push(this.makeFinding({
          ruleId: 'zoom-reflow-horizontal-scroll',
          category: 'distinguishable',
          severity: 'serious',
          wcagLevel: 'AA',
          wcagCriterion: '1.4.10',
          message: 'Content requires horizontal scrolling at 200% zoom. Users who zoom in should be able to read all content without scrolling horizontally.',
          selector: 'html',
          pageUrl,
          htmlSnippet: '',
          remediation: 'Use responsive layout (flexbox/grid) that reflows content at 200% zoom without horizontal scrolling.',
        }));
      }

      // Check for clipped text
      const clippedElements = await page.evaluate(() => {
        const results: Array<{ selector: string; snippet: string }> = [];
        const all = document.querySelectorAll('*');
        for (const el of all) {
          const style = window.getComputedStyle(el);
          if (
            (style.overflow === 'hidden' || style.overflow === 'clip') &&
            el.scrollHeight > el.clientHeight + 2 &&
            (el.textContent?.trim().length ?? 0) > 0
          ) {
            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            results.push({
              selector: `${tag}${id}`,
              snippet: el.outerHTML.substring(0, 200),
            });
            if (results.length >= 10) break;
          }
        }
        return results;
      });

      for (const el of clippedElements) {
        findings.push(this.makeFinding({
          ruleId: 'zoom-reflow-text-clipped',
          category: 'distinguishable',
          severity: 'serious',
          wcagLevel: 'AA',
          wcagCriterion: '1.4.4',
          message: `Text is clipped (overflow: hidden) at 200% zoom in element "${el.selector}".`,
          selector: el.selector,
          pageUrl,
          htmlSnippet: el.snippet,
          remediation: 'Allow content to reflow or expand its container at higher zoom levels. Avoid overflow: hidden on text containers.',
        }));
      }
    } finally {
      // Reset zoom
      await page.evaluate(() => {
        (document.body.style as any).zoom = '100%';
      }).catch(() => {});
      await page.waitForTimeout(200);
    }

    return findings;
  }

  /** WCAG 1.4.12 — Increase text spacing and check for clipping/overflow */
  private async checkTextSpacing(page: Page, pageUrl: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    const STYLE_ID = '__a11y_text_spacing_test__';

    try {
      // Inject text spacing override
      await page.evaluate((id) => {
        const style = document.createElement('style');
        style.id = id;
        style.textContent = `
          * {
            letter-spacing: 0.12em !important;
            word-spacing: 0.16em !important;
            line-height: 1.5 !important;
          }
          p, div, li, td, th, span, label {
            margin-bottom: 2em !important;
          }
        `;
        document.head.appendChild(style);
      }, STYLE_ID);
      await page.waitForTimeout(500);

      // Detect overflow/clipping
      const overflowElements = await page.evaluate(() => {
        const results: Array<{ selector: string; snippet: string }> = [];
        const all = document.querySelectorAll('*');
        for (const el of all) {
          const style = window.getComputedStyle(el);
          const hasText = (el.textContent?.trim().length ?? 0) > 0;
          const isClipped =
            (el.scrollHeight > el.clientHeight + 2) ||
            (el.scrollWidth > el.clientWidth + 2);
          const hasOverflow =
            style.overflow === 'hidden' || style.overflow === 'clip' ||
            style.overflowX === 'hidden' || style.overflowY === 'hidden';

          if (hasText && isClipped && hasOverflow) {
            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            results.push({
              selector: `${tag}${id}`,
              snippet: el.outerHTML.substring(0, 200),
            });
            if (results.length >= 10) break;
          }
        }
        return results;
      });

      for (const el of overflowElements) {
        findings.push(this.makeFinding({
          ruleId: 'text-spacing-overflow',
          category: 'distinguishable',
          severity: 'serious',
          wcagLevel: 'AA',
          wcagCriterion: '1.4.12',
          message: `Text is clipped or overflows when WCAG text spacing is applied in element "${el.selector}".`,
          selector: el.selector,
          pageUrl,
          htmlSnippet: el.snippet,
          remediation: 'Ensure containers can accommodate increased letter-spacing (0.12em), word-spacing (0.16em), and line-height (1.5). Avoid fixed heights on text containers.',
        }));
      }

      // Check for horizontal scrollbar
      const hasHorizScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      if (hasHorizScroll) {
        findings.push(this.makeFinding({
          ruleId: 'text-spacing-horizontal-scroll',
          category: 'distinguishable',
          severity: 'serious',
          wcagLevel: 'AA',
          wcagCriterion: '1.4.12',
          message: 'Content requires horizontal scrolling when WCAG text spacing overrides are applied.',
          selector: 'html',
          pageUrl,
          htmlSnippet: '',
          remediation: 'Allow layout to accommodate increased text spacing without introducing horizontal scroll.',
        }));
      }
    } finally {
      // Remove injected style
      await page.evaluate((id) => {
        document.getElementById(id)?.remove();
      }, STYLE_ID).catch(() => {});
      await page.waitForTimeout(200);
    }

    return findings;
  }

  // ---------------------------------------------------------------------------
  // Category 2: Keyboard & Focus
  // ---------------------------------------------------------------------------

  /** WCAG 2.1.1, 2.1.2, 2.4.7 — Tab through page, check focus visibility and keyboard traps */
  private async checkKeyboardNavigation(page: Page, pageUrl: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    const MAX_TABS = 30;

    // Click body to ensure focus starts from top of page
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur?.();
      document.body.focus();
    });

    const focusHistory: Array<{ tag: string; selector: string; hasVisibleIndicator: boolean }> = [];

    for (let i = 0; i < MAX_TABS; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);

      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) {
          return { tag: 'BODY', selector: 'body', hasVisibleIndicator: false };
        }

        const tag = el.tagName;
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '';
        const selector = `${tag.toLowerCase()}${id || cls}`;

        // Check for visible focus indicator
        const style = window.getComputedStyle(el);
        const outlineVisible = style.outlineStyle !== 'none' && style.outlineWidth !== '0px';
        const boxShadowVisible = style.boxShadow !== 'none' && style.boxShadow !== '';
        const hasVisibleIndicator = outlineVisible || boxShadowVisible;

        return { tag, selector, hasVisibleIndicator };
      });

      focusHistory.push(info);
    }

    // Detect keyboard trap: same element focused 3+ consecutive times
    for (let i = 2; i < focusHistory.length; i++) {
      const a = focusHistory[i - 2].selector;
      const b = focusHistory[i - 1].selector;
      const c = focusHistory[i].selector;
      if (a === b && b === c && a !== 'body') {
        findings.push(this.makeFinding({
          ruleId: 'keyboard-trap',
          category: 'keyboard',
          severity: 'critical',
          wcagLevel: 'A',
          wcagCriterion: '2.1.2',
          message: `Keyboard trap detected: focus stuck on "${a}" for 3+ consecutive Tab presses.`,
          selector: a,
          pageUrl,
          htmlSnippet: '',
          remediation: 'Ensure users can move focus away from every element using standard keyboard keys (Tab, Shift+Tab, Escape).',
        }));
        break; // One trap finding is enough
      }
    }

    // Check for elements without visible focus indicator
    const realFocused = focusHistory.filter(f => f.tag !== 'BODY');
    const missingIndicator = realFocused.filter(f => !f.hasVisibleIndicator);

    if (missingIndicator.length > 0 && realFocused.length > 0) {
      const ratio = missingIndicator.length / realFocused.length;
      if (ratio > 0.2) {
        // Build unique list of selectors missing focus indicator
        const uniqueMissing = [...new Set(missingIndicator.map(f => f.selector))].slice(0, 5);
        findings.push(this.makeFinding({
          ruleId: 'focus-visible-missing',
          category: 'navigable',
          severity: 'serious',
          wcagLevel: 'AA',
          wcagCriterion: '2.4.7',
          message: `${missingIndicator.length} of ${realFocused.length} focused elements lack a visible focus indicator (outline or box-shadow). Examples: ${uniqueMissing.join(', ')}`,
          selector: uniqueMissing[0] || 'body',
          pageUrl,
          htmlSnippet: '',
          remediation: 'Ensure all focusable elements have a visible focus indicator (e.g., outline, box-shadow) that meets WCAG 2.4.7.',
        }));
      }
    }

    return findings;
  }

  /** WCAG 2.4.3 — Tab through elements, verify focus order roughly matches DOM order */
  private async checkFocusOrder(page: Page, pageUrl: string): Promise<Finding[]> {
    const findings: Finding[] = [];

    // Get DOM-order list of focusable elements with their bounding rects
    const domOrder = await page.evaluate(() => {
      const focusable = document.querySelectorAll(
        'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      return Array.from(focusable).map((el, idx) => {
        const rect = el.getBoundingClientRect();
        return {
          idx,
          tag: el.tagName.toLowerCase(),
          top: rect.top,
          left: rect.left,
        };
      });
    });

    if (domOrder.length < 3) return findings;

    // Tab through and record visual positions
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur?.();
      document.body.focus();
    });

    const tabOrder: Array<{ top: number; left: number }> = [];
    const tabCount = Math.min(domOrder.length, 25);

    for (let i = 0; i < tabCount; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(50);

      const pos = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { top: -1, left: -1 };
        const rect = el.getBoundingClientRect();
        return { top: rect.top, left: rect.left };
      });
      tabOrder.push(pos);
    }

    // Compare: count major out-of-order jumps (focus jumps up the page significantly)
    let outOfOrderCount = 0;
    for (let i = 1; i < tabOrder.length; i++) {
      const prev = tabOrder[i - 1];
      const curr = tabOrder[i];
      if (prev.top < 0 || curr.top < 0) continue;
      // A jump backward of more than 200px vertically suggests out-of-order focus
      if (curr.top < prev.top - 200) {
        outOfOrderCount++;
      }
    }

    if (outOfOrderCount >= 2) {
      findings.push(this.makeFinding({
        ruleId: 'focus-order-mismatch',
        category: 'navigable',
        severity: 'serious',
        wcagLevel: 'A',
        wcagCriterion: '2.4.3',
        message: `Focus order jumps backward ${outOfOrderCount} time(s) during Tab navigation, suggesting visual order does not match DOM/tab order.`,
        selector: 'body',
        pageUrl,
        htmlSnippet: '',
        remediation: 'Ensure DOM source order matches visual layout so Tab key follows a logical top-to-bottom, left-to-right path. Avoid positive tabindex values.',
      }));
    }

    return findings;
  }

  // ---------------------------------------------------------------------------
  // Category 3: Voice Access
  // ---------------------------------------------------------------------------

  /** WCAG 2.5.3 — Verify visible text is contained within accessible name for interactive elements */
  private async checkLabelInName(page: Page, pageUrl: string): Promise<Finding[]> {
    const findings: Finding[] = [];

    const mismatches = await page.evaluate(() => {
      const results: Array<{ selector: string; visibleText: string; accessibleName: string; snippet: string }> = [];
      const selectors = [
        'button', 'a[href]', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]',
        '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]',
      ];

      for (const sel of selectors) {
        const elements = document.querySelectorAll(sel);
        for (const el of elements) {
          const visibleText = (el.textContent?.trim() || (el as HTMLInputElement).value || '').substring(0, 80);
          if (!visibleText) continue;

          const ariaLabel = el.getAttribute('aria-label') || '';
          const ariaLabelledBy = el.getAttribute('aria-labelledby');
          let labelledByText = '';
          if (ariaLabelledBy) {
            labelledByText = ariaLabelledBy.split(/\s+/)
              .map(id => document.getElementById(id)?.textContent?.trim() ?? '')
              .join(' ');
          }
          const accessibleName = ariaLabel || labelledByText;

          // Only flag when there IS an explicit accessible name that doesn't contain the visible text
          if (accessibleName && !accessibleName.toLowerCase().includes(visibleText.toLowerCase())) {
            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            results.push({
              selector: `${tag}${id}`,
              visibleText,
              accessibleName,
              snippet: el.outerHTML.substring(0, 200),
            });
            if (results.length >= 15) break;
          }
        }
        if (results.length >= 15) break;
      }
      return results;
    });

    for (const m of mismatches) {
      findings.push(this.makeFinding({
        ruleId: 'label-in-name',
        category: 'input-modalities',
        severity: 'moderate',
        wcagLevel: 'A',
        wcagCriterion: '2.5.3',
        message: `Visible text "${m.visibleText}" is not contained in accessible name "${m.accessibleName}". Voice Access users saying "Click ${m.visibleText}" will fail.`,
        selector: m.selector,
        pageUrl,
        htmlSnippet: m.snippet,
        remediation: 'Ensure the accessible name (aria-label / aria-labelledby) starts with or contains the visible text.',
      }));
    }

    return findings;
  }

  /** WCAG 2.5.8 — Verify interactive elements are at least 24×24px */
  private async checkTargetSize(page: Page, pageUrl: string): Promise<Finding[]> {
    const findings: Finding[] = [];

    const undersized = await page.evaluate(() => {
      const results: Array<{ selector: string; width: number; height: number; snippet: string }> = [];
      const selectors = [
        'button', 'a[href]', 'input:not([type="hidden"])',
        'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="menuitem"]',
        '[role="tab"]', '[role="checkbox"]', '[role="radio"]',
        'input[type="checkbox"]', 'input[type="radio"]',
      ];

      for (const sel of selectors) {
        const elements = document.querySelectorAll(sel);
        for (const el of elements) {
          if (el.getAttribute('aria-hidden') === 'true') continue;
          const rect = el.getBoundingClientRect();
          // Skip invisible elements
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.width < 24 || rect.height < 24) {
            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            results.push({
              selector: `${tag}${id}`,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              snippet: el.outerHTML.substring(0, 200),
            });
            if (results.length >= 20) break;
          }
        }
        if (results.length >= 20) break;
      }
      return results;
    });

    for (const el of undersized) {
      findings.push(this.makeFinding({
        ruleId: 'target-size-minimum',
        category: 'input-modalities',
        severity: 'moderate',
        wcagLevel: 'AA',
        wcagCriterion: '2.5.8',
        message: `Interactive element "${el.selector}" is ${el.width}×${el.height}px (minimum 24×24px). Small targets are difficult for voice control and touch users.`,
        selector: el.selector,
        pageUrl,
        htmlSnippet: el.snippet,
        remediation: 'Increase the element size to at least 24×24 CSS pixels, or add padding to enlarge the clickable area.',
      }));
    }

    return findings;
  }

  // ---------------------------------------------------------------------------
  // Category 4: Screen Reader Basics
  // ---------------------------------------------------------------------------

  /** WCAG 1.3.1 — Verify page has main, nav, and at least one landmark */
  private async checkLandmarks(page: Page, pageUrl: string): Promise<Finding[]> {
    const findings: Finding[] = [];

    const landmarkInfo = await page.evaluate(() => {
      return {
        hasMain: !!document.querySelector('main, [role="main"]'),
        hasNav: !!document.querySelector('nav, [role="navigation"]'),
        totalLandmarks: document.querySelectorAll(
          'main, [role="main"], nav, [role="navigation"], aside, [role="complementary"], ' +
          'header, [role="banner"], footer, [role="contentinfo"], [role="search"], [role="form"]'
        ).length,
      };
    });

    if (!landmarkInfo.hasMain) {
      findings.push(this.makeFinding({
        ruleId: 'landmark-main-missing',
        category: 'screen-reader',
        severity: 'serious',
        wcagLevel: 'A',
        wcagCriterion: '1.3.1',
        message: 'Page is missing a <main> or [role="main"] landmark. Screen reader users cannot quickly jump to the primary content.',
        selector: 'html',
        pageUrl,
        htmlSnippet: '',
        remediation: 'Wrap the primary page content in a <main> element.',
      }));
    }

    if (!landmarkInfo.hasNav) {
      findings.push(this.makeFinding({
        ruleId: 'landmark-nav-missing',
        category: 'screen-reader',
        severity: 'moderate',
        wcagLevel: 'A',
        wcagCriterion: '1.3.1',
        message: 'Page is missing a <nav> or [role="navigation"] landmark. Screen reader users cannot quickly find navigation.',
        selector: 'html',
        pageUrl,
        htmlSnippet: '',
        remediation: 'Wrap site navigation in a <nav> element.',
      }));
    }

    if (landmarkInfo.totalLandmarks === 0) {
      findings.push(this.makeFinding({
        ruleId: 'landmark-none',
        category: 'screen-reader',
        severity: 'serious',
        wcagLevel: 'A',
        wcagCriterion: '1.3.1',
        message: 'Page has no landmark regions at all. Screen reader users rely on landmarks for page navigation.',
        selector: 'html',
        pageUrl,
        htmlSnippet: '',
        remediation: 'Add semantic landmarks: <main>, <nav>, <header>, <footer>, or equivalent ARIA roles.',
      }));
    }

    return findings;
  }

  /** WCAG 2.4.1 — Verify a skip-to-content link exists as the first focusable element */
  private async checkSkipLinks(page: Page, pageUrl: string): Promise<Finding[]> {
    const findings: Finding[] = [];

    const skipLinkInfo = await page.evaluate(() => {
      // Get first focusable element
      const focusable = document.querySelectorAll(
        'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return { hasSkipLink: true, firstTag: '', firstText: '' }; // nothing to skip

      const first = focusable[0];
      const tag = first.tagName.toLowerCase();
      const text = (first.textContent?.trim() || '').toLowerCase();
      const href = first.getAttribute('href') || '';

      // A skip link typically: is an <a>, targets an anchor (#...), and has text like "skip"
      const isSkipLink =
        tag === 'a' &&
        href.startsWith('#') &&
        (text.includes('skip') || text.includes('jump') || text.includes('main content'));

      return {
        hasSkipLink: isSkipLink,
        firstTag: tag,
        firstText: first.textContent?.trim().substring(0, 60) || '',
      };
    });

    if (!skipLinkInfo.hasSkipLink) {
      findings.push(this.makeFinding({
        ruleId: 'skip-link-missing',
        category: 'navigable',
        severity: 'moderate',
        wcagLevel: 'A',
        wcagCriterion: '2.4.1',
        message: 'No skip-to-content link found as the first focusable element. Keyboard and screen reader users must Tab through all navigation before reaching main content.',
        selector: 'body',
        pageUrl,
        htmlSnippet: '',
        remediation: 'Add a "Skip to main content" link as the first focusable element, pointing to the <main> region (e.g., <a href="#main">Skip to main content</a>).',
      }));
    }

    return findings;
  }

  /** WCAG 4.1.3 — Detect dynamic content containers that should have aria-live but don't */
  private async checkLiveRegions(page: Page, pageUrl: string): Promise<Finding[]> {
    const findings: Finding[] = [];

    const liveRegionInfo = await page.evaluate(() => {
      const existingLiveRegions = document.querySelectorAll(
        '[aria-live], [role="alert"], [role="status"], [role="log"], [role="marquee"], [role="timer"]'
      ).length;

      // Heuristic: look for containers commonly used for dynamic updates that lack aria-live
      const dynamicCandidateSelectors = [
        '.toast', '.notification', '.alert', '.snackbar',
        '.error-message', '.success-message', '.warning-message',
        '.loading', '.spinner', '.progress',
        '[class*="toast"]', '[class*="notif"]', '[class*="alert"]',
        '[class*="status"]', '[class*="message"]',
      ];

      const missingLive: Array<{ selector: string; snippet: string }> = [];
      for (const sel of dynamicCandidateSelectors) {
        try {
          const elements = document.querySelectorAll(sel);
          for (const el of elements) {
            // Skip if already has aria-live or is an alert/status role
            if (
              el.getAttribute('aria-live') ||
              el.getAttribute('role') === 'alert' ||
              el.getAttribute('role') === 'status'
            ) continue;

            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            missingLive.push({
              selector: `${tag}${id}`,
              snippet: el.outerHTML.substring(0, 200),
            });
            if (missingLive.length >= 10) break;
          }
        } catch { /* invalid selector — skip */ }
        if (missingLive.length >= 10) break;
      }

      return { existingLiveRegions, missingLive };
    });

    for (const el of liveRegionInfo.missingLive) {
      findings.push(this.makeFinding({
        ruleId: 'live-region-missing',
        category: 'screen-reader',
        severity: 'moderate',
        wcagLevel: 'AA',
        wcagCriterion: '4.1.3',
        message: `Dynamic content container "${el.selector}" appears to show status/notification content but lacks aria-live. Screen readers will not announce updates.`,
        selector: el.selector,
        pageUrl,
        htmlSnippet: el.snippet,
        remediation: 'Add aria-live="polite" (or "assertive" for urgent messages) to containers whose content updates dynamically.',
      }));
    }

    return findings;
  }

  // ---------------------------------------------------------------------------
  // Category 5: Orientation
  // ---------------------------------------------------------------------------

  /** WCAG 1.3.4 — Switch viewport to portrait and landscape, verify no content is broken */
  private async checkOrientation(page: Page, pageUrl: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    const originalViewport = page.viewportSize();

    try {
      // Portrait (768×1024)
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(500);

      const portraitScroll = await page.evaluate(() => document.documentElement.scrollWidth);
      if (portraitScroll > 768 + 20) { // small tolerance for scrollbar
        findings.push(this.makeFinding({
          ruleId: 'orientation-portrait-overflow',
          category: 'adaptable',
          severity: 'moderate',
          wcagLevel: 'AA',
          wcagCriterion: '1.3.4',
          message: 'Content overflows horizontally in portrait orientation (768×1024). Content should not be restricted to a single display orientation.',
          selector: 'html',
          pageUrl,
          htmlSnippet: '',
          remediation: 'Ensure content reflows correctly in both portrait and landscape orientations. Avoid CSS or JS that locks orientation.',
        }));
      }

      const portraitMainVisible = await page.evaluate(() => {
        const main = document.querySelector('main') || document.querySelector('[role="main"]');
        if (!main) return true;
        return (main as HTMLElement).offsetWidth > 0 && (main as HTMLElement).offsetHeight > 0;
      });

      if (!portraitMainVisible) {
        findings.push(this.makeFinding({
          ruleId: 'orientation-portrait-content-hidden',
          category: 'adaptable',
          severity: 'serious',
          wcagLevel: 'AA',
          wcagCriterion: '1.3.4',
          message: 'Main content area is not visible in portrait orientation.',
          selector: 'main',
          pageUrl,
          htmlSnippet: '',
          remediation: 'Ensure main content remains visible in both portrait and landscape modes.',
        }));
      }

      // Landscape (1024×768)
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.waitForTimeout(500);

      const landscapeScroll = await page.evaluate(() => document.documentElement.scrollWidth);
      if (landscapeScroll > 1024 + 20) {
        findings.push(this.makeFinding({
          ruleId: 'orientation-landscape-overflow',
          category: 'adaptable',
          severity: 'moderate',
          wcagLevel: 'AA',
          wcagCriterion: '1.3.4',
          message: 'Content overflows horizontally in landscape orientation (1024×768).',
          selector: 'html',
          pageUrl,
          htmlSnippet: '',
          remediation: 'Ensure content reflows correctly in both portrait and landscape orientations.',
        }));
      }

      // Check for CSS orientation lock
      const hasOrientationLock = await page.evaluate(() => {
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
          try {
            for (const rule of Array.from(sheet.cssRules)) {
              const css = rule.cssText;
              if (
                css.includes('orientation: portrait') ||
                css.includes('orientation-lock') ||
                css.includes('orientation: landscape-only')
              ) {
                return true;
              }
            }
          } catch { /* CORS-restricted stylesheet */ }
        }
        return false;
      });

      if (hasOrientationLock) {
        findings.push(this.makeFinding({
          ruleId: 'orientation-css-lock',
          category: 'adaptable',
          severity: 'serious',
          wcagLevel: 'AA',
          wcagCriterion: '1.3.4',
          message: 'CSS contains orientation-specific restrictions that may lock the page to a single orientation.',
          selector: 'html',
          pageUrl,
          htmlSnippet: '',
          remediation: 'Remove CSS that restricts content to a single orientation unless essential for the content (e.g., a piano app).',
        }));
      }
    } finally {
      // Restore original viewport
      if (originalViewport) {
        await page.setViewportSize(originalViewport).catch(() => {});
      } else {
        await page.setViewportSize({
          width: this.config.viewportWidth,
          height: this.config.viewportHeight,
        }).catch(() => {});
      }
      await page.waitForTimeout(200);
    }

    return findings;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private makeFinding(f: {
    ruleId: string;
    category: RuleCategory;
    severity: Severity;
    wcagLevel: WcagLevel;
    wcagCriterion: string;
    message: string;
    selector: string;
    pageUrl: string;
    htmlSnippet: string;
    remediation: string;
  }): Finding {
    return {
      ruleId: f.ruleId,
      category: f.category,
      severity: f.severity,
      wcagLevel: f.wcagLevel,
      wcagCriterion: f.wcagCriterion,
      message: f.message,
      selector: f.selector,
      pageUrl: f.pageUrl,
      htmlSnippet: f.htmlSnippet,
      remediation: f.remediation,
    };
  }
}
