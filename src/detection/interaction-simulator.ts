/**
 * InteractionSimulator — Simulates user interactions on detected elements
 * and records DOM changes before/after each action.
 *
 * Uses Playwright to click, hover, fill, tab, and scroll, then captures
 * a DomDelta showing what changed. This feeds the scanner engine's
 * understanding of dynamic content.
 *
 * Owner: Bobbie (UI Expert)
 */

import type { Page } from 'playwright';
import type {
  ElementInfo,
  InteractionResult,
  DomDelta,
  DetectionConfig,
} from './types.js';
import { DEFAULT_CONFIG } from './types.js';

/** Snapshot of DOM state used to compute deltas */
interface DomSnapshot {
  url: string;
  /** Set of selectors present in the DOM */
  selectors: Set<string>;
  /** Map of selector → serialized key attributes */
  attributes: Map<string, string>;
  /** Whether a dialog/modal is visible */
  hasVisibleModal: boolean;
}

export class InteractionSimulator {
  private config: DetectionConfig;

  constructor(config: Partial<DetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Simulate a click on an element and record what changes.
   */
  async click(page: Page, element: ElementInfo): Promise<InteractionResult> {
    const before = await this.takeSnapshot(page);

    try {
      await page.click(element.selector, { timeout: this.config.timeout });
      // Allow DOM to settle after click
      await page.waitForTimeout(500);
    } catch (err) {
      return this.buildResult(element, 'click', false, this.errorMessage(err), before, before);
    }

    const after = await this.takeSnapshot(page);
    return this.buildResult(element, 'click', true, null, before, after);
  }

  /**
   * Simulate hovering over an element to detect hover-dependent content.
   */
  async hover(page: Page, element: ElementInfo): Promise<InteractionResult> {
    const before = await this.takeSnapshot(page);

    try {
      await page.hover(element.selector, { timeout: this.config.timeout });
      await page.waitForTimeout(300);
    } catch (err) {
      return this.buildResult(element, 'hover', false, this.errorMessage(err), before, before);
    }

    const after = await this.takeSnapshot(page);
    return this.buildResult(element, 'hover', true, null, before, after);
  }

  /**
   * Focus an element (without clicking) and detect what appears.
   */
  async focus(page: Page, element: ElementInfo): Promise<InteractionResult> {
    const before = await this.takeSnapshot(page);

    try {
      await page.focus(element.selector, { timeout: this.config.timeout } as any);
      await page.waitForTimeout(200);
    } catch (err) {
      return this.buildResult(element, 'focus', false, this.errorMessage(err), before, before);
    }

    const after = await this.takeSnapshot(page);
    return this.buildResult(element, 'focus', true, null, before, after);
  }

  /**
   * Fill a form field with test data appropriate to its type.
   */
  async fill(page: Page, element: ElementInfo): Promise<InteractionResult> {
    const before = await this.takeSnapshot(page);

    try {
      const inputType = element.ariaAttributes['type'] ?? this.guessInputType(element);
      const testValue = this.config.formTestData[inputType] ?? this.config.formTestData['text'];
      await page.fill(element.selector, testValue, { timeout: this.config.timeout });
      await page.waitForTimeout(200);
    } catch (err) {
      return this.buildResult(element, 'fill', false, this.errorMessage(err), before, before);
    }

    const after = await this.takeSnapshot(page);
    return this.buildResult(element, 'fill', true, null, before, after);
  }

  /**
   * Tab through the page to trace keyboard navigation.
   * Returns results for each Tab press until we cycle back to the start
   * or hit a maximum.
   */
  async tabThrough(page: Page, maxSteps: number = 100): Promise<InteractionResult[]> {
    const results: InteractionResult[] = [];
    let firstFocusedSelector: string | null = null;

    // Start from the top of the document
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      document.body.focus();
    });

    for (let i = 0; i < maxSteps; i++) {
      const before = await this.takeSnapshot(page);

      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);

      const focusedInfo = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;

        function buildSelector(el: Element): string {
          if (el.id) return `#${CSS.escape(el.id)}`;
          const parts: string[] = [];
          let current: Element | null = el;
          while (current && current !== document.documentElement) {
            let part = current.tagName.toLowerCase();
            if (current.id) {
              parts.unshift(`#${CSS.escape(current.id)} > ${part}`);
              break;
            }
            const cur = current;
            const parent: Element | null = current.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(
                (c) => c.tagName === cur.tagName,
              );
              if (siblings.length > 1) {
                const index = siblings.indexOf(cur) + 1;
                part += `:nth-of-type(${index})`;
              }
            }
            parts.unshift(part);
            current = parent;
          }
          return parts.join(' > ');
        }

        return {
          selector: buildSelector(el),
          tag: el.tagName.toLowerCase(),
          textContent: (el.textContent ?? '').trim().substring(0, 100),
        };
      });

      if (!focusedInfo) continue;

      // Detect cycle: we've tabbed back to the first element
      if (firstFocusedSelector === null) {
        firstFocusedSelector = focusedInfo.selector;
      } else if (focusedInfo.selector === firstFocusedSelector) {
        break;
      }

      const after = await this.takeSnapshot(page);
      const stubElement: ElementInfo = {
        selector: focusedInfo.selector,
        tag: focusedInfo.tag,
        category: 'focusable-other',
        role: null,
        ariaAttributes: {},
        textContent: focusedInfo.textContent,
        accessibleName: focusedInfo.textContent,
        isVisible: true,
        isFocusable: true,
        isDisabled: false,
        boundingBox: null,
        computedStyles: null,
        tabIndex: null,
        frameworkHints: {},
        inShadowDom: false,
        inIframe: false,
        frameId: 'main',
        eventListeners: [],
      };

      results.push(this.buildResult(stubElement, 'keyboard', true, null, before, after));
    }

    return results;
  }

  /**
   * Scroll the page and detect lazy-loaded content.
   * Scrolls in increments, recording new elements appearing after each scroll.
   */
  async scrollAndDetect(page: Page): Promise<InteractionResult[]> {
    const results: InteractionResult[] = [];
    const scrollIncrement = 800;
    const maxScrolls = 20;

    const stubElement: ElementInfo = {
      selector: 'window',
      tag: 'window',
      category: 'focusable-other',
      role: null,
      ariaAttributes: {},
      textContent: '',
      accessibleName: 'Page scroll',
      isVisible: true,
      isFocusable: false,
      isDisabled: false,
      boundingBox: null,
      computedStyles: null,
      tabIndex: null,
      frameworkHints: {},
      inShadowDom: false,
      inIframe: false,
      frameId: 'main',
      eventListeners: [],
    };

    for (let i = 0; i < maxScrolls; i++) {
      const before = await this.takeSnapshot(page);
      const prevScrollY = await page.evaluate(() => window.scrollY);

      await page.evaluate((inc) => window.scrollBy(0, inc), scrollIncrement);
      // Wait for lazy-loaded content
      await page.waitForTimeout(800);

      const newScrollY = await page.evaluate(() => window.scrollY);
      // If we didn't actually scroll, we've hit the bottom
      if (newScrollY === prevScrollY) break;

      const after = await this.takeSnapshot(page);
      results.push(this.buildResult(stubElement, 'scroll', true, null, before, after));

      // If no new content appeared in the last 2 scrolls, stop
      const delta = this.computeDelta(before, after);
      if (i > 2 && delta.nodesAdded === 0) break;
    }

    return results;
  }

  /**
   * Run a batch of interactions on a list of elements.
   * Clicks visible buttons, hovers on items with tooltips, fills form fields.
   */
  async interactWithAll(
    page: Page,
    elements: ElementInfo[],
  ): Promise<InteractionResult[]> {
    const results: InteractionResult[] = [];

    for (const el of elements) {
      if (!el.isVisible || el.isDisabled) continue;

      try {
        switch (el.category) {
          case 'button':
          case 'link':
          case 'tab':
          case 'accordion':
          case 'toggle':
          case 'menu-item':
            results.push(await this.click(page, el));
            break;
          case 'text-input':
          case 'textarea':
          case 'search':
            results.push(await this.fill(page, el));
            break;
          case 'select':
            results.push(await this.focus(page, el));
            break;
          case 'checkbox':
          case 'radio':
            results.push(await this.click(page, el));
            break;
          default:
            results.push(await this.hover(page, el));
            break;
        }
      } catch {
        // Skip elements that throw during interaction
      }
    }

    return results;
  }

  // ─── Internal Helpers ──────────────────────────────────────────────

  /**
   * Take a snapshot of the current DOM state.
   */
  private async takeSnapshot(page: Page): Promise<DomSnapshot> {
    const data = await page.evaluate(() => {
      const selectorSet: string[] = [];
      const attrMap: Array<[string, string]> = [];

      function buildSelector(el: Element): string {
        if (el.id) return `#${CSS.escape(el.id)}`;
        const tag = el.tagName.toLowerCase();
        const parent = el.parentElement;
        if (!parent) return tag;
        const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
        if (siblings.length > 1) return `${tag}:nth-of-type(${siblings.indexOf(el) + 1})`;
        return tag;
      }

      // Capture top-level significant elements (limit scope for performance)
      const significantElements = document.querySelectorAll(
        'a, button, input, select, textarea, [role], img, h1, h2, h3, h4, h5, h6, form, ' +
          'dialog, [aria-modal], .modal, [data-toggle], [data-bs-toggle], nav, main, aside, header, footer',
      );

      for (const el of significantElements) {
        const sel = buildSelector(el);
        selectorSet.push(sel);
        // Capture key attributes for change detection
        const attrs = [
          el.getAttribute('aria-expanded'),
          el.getAttribute('aria-hidden'),
          el.getAttribute('class'),
          el.getAttribute('style'),
          el.getAttribute('disabled'),
        ]
          .filter(Boolean)
          .join('|');
        attrMap.push([sel, attrs]);
      }

      // Detect visible modals
      const hasVisibleModal =
        document.querySelector('dialog[open]') !== null ||
        document.querySelector('[aria-modal="true"]') !== null ||
        document.querySelector('.modal.show, .modal[style*="display: block"]') !== null;

      return {
        url: window.location.href,
        selectors: selectorSet,
        attributes: attrMap,
        hasVisibleModal,
      };
    });

    return {
      url: data.url,
      selectors: new Set(data.selectors),
      attributes: new Map(data.attributes),
      hasVisibleModal: data.hasVisibleModal,
    };
  }

  /**
   * Compute the delta between two DOM snapshots.
   */
  private computeDelta(before: DomSnapshot, after: DomSnapshot): DomDelta {
    const addedSelectors: string[] = [];
    const removedSelectors: string[] = [];
    const changedSelectors: string[] = [];

    for (const sel of after.selectors) {
      if (!before.selectors.has(sel)) addedSelectors.push(sel);
    }
    for (const sel of before.selectors) {
      if (!after.selectors.has(sel)) removedSelectors.push(sel);
    }

    for (const [sel, attrs] of after.attributes) {
      const prevAttrs = before.attributes.get(sel);
      if (prevAttrs !== undefined && prevAttrs !== attrs) {
        changedSelectors.push(sel);
      }
    }

    return {
      addedSelectors: addedSelectors.slice(0, 50),
      removedSelectors: removedSelectors.slice(0, 50),
      changedSelectors: changedSelectors.slice(0, 50),
      urlChanged: before.url !== after.url,
      newUrl: before.url !== after.url ? after.url : null,
      modalAppeared: !before.hasVisibleModal && after.hasVisibleModal,
      nodesAdded: addedSelectors.length,
      nodesRemoved: removedSelectors.length,
    };
  }

  /**
   * Build an InteractionResult from before/after snapshots.
   */
  private buildResult(
    element: ElementInfo,
    type: InteractionResult['interactionType'],
    success: boolean,
    error: string | null,
    before: DomSnapshot,
    after: DomSnapshot,
  ): InteractionResult {
    return {
      element,
      interactionType: type,
      success,
      error,
      domDelta: this.computeDelta(before, after),
      timestamp: Date.now(),
    };
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private guessInputType(element: ElementInfo): string {
    const sel = element.selector.toLowerCase();
    const name = element.accessibleName.toLowerCase();
    const combined = sel + ' ' + name;

    if (combined.includes('email')) return 'email';
    if (combined.includes('password')) return 'password';
    if (combined.includes('search')) return 'search';
    if (combined.includes('phone') || combined.includes('tel')) return 'tel';
    if (combined.includes('url') || combined.includes('website')) return 'url';
    if (combined.includes('number') || combined.includes('quantity')) return 'number';
    return 'text';
  }
}
