/**
 * Page analyzer — runs accessibility checks against a single Playwright page.
 *
 * POC checks:
 *   1. Images missing alt text (WCAG 1.1.1)
 *   2. Form inputs missing labels (WCAG 1.3.1)
 *   3. Heading hierarchy violations (WCAG 1.3.1)
 *   4. Color contrast placeholder (WCAG 1.4.3) — flags elements for review
 *   5. Missing document language (WCAG 3.1.1)
 *   6. Empty links / buttons (WCAG 2.4.4)
 */

import { Page, ElementHandle } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { PageMetadata, PageResult, Finding, DiscoveredElement } from './types.js';
import { ScanConfig } from './types.js';
import { RuleCategory, Severity, WcagLevel } from '../rules/types.js';
import { UIDetector } from '../detection/ui-detector.js';

/** Map axe-core category tags to our RuleCategory */
const AXE_CATEGORY_MAP: Record<string, RuleCategory> = {
  'cat.color': 'distinguishable',
  'cat.forms': 'forms',
  'cat.aria': 'aria',
  'cat.text-alternatives': 'images',
  'cat.name-role-value': 'aria',
  'cat.semantics': 'adaptable',
  'cat.structure': 'adaptable',
  'cat.keyboard': 'keyboard',
  'cat.time-and-media': 'multimedia',
  'cat.tables': 'adaptable',
  'cat.language': 'readable',
  'cat.sensory-and-visual-cues': 'distinguishable',
  'cat.parsing': 'compatible',
};

/** Map hand-rolled ruleIds to equivalent axe-core ruleIds for deduplication */
const HANDROLLED_TO_AXE_EQUIV: Record<string, string[]> = {
  'img-alt-text': ['image-alt', 'input-image-alt'],
  'form-input-label': ['label', 'select-name'],
  'document-lang': ['html-has-lang', 'html-lang-valid'],
  'link-name': ['link-name'],
  'button-name': ['button-name'],
  'color-contrast': ['color-contrast'],
  'heading-hierarchy': ['heading-order'],
  'visual-heading-no-semantic': ['p-as-heading'],
};

/**
 * Normalize a page URL: if the hostname differs from the scan target only by a
 * `sip.` prefix (e.g. sip.security.microsoft.com vs security.microsoft.com),
 * replace the hostname with the target hostname so findings show the user-facing URL.
 */
export function normalizePageUrl(rawUrl: string, targetUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const targetHostname = new URL(targetUrl).hostname;
    if (parsed.hostname === `sip.${targetHostname}`) {
      parsed.hostname = targetHostname;
      return parsed.toString();
    }
  } catch { /* ignore parse errors */ }
  return rawUrl;
}

export class PageAnalyzer {
  constructor(private config: ScanConfig) {}

  /**
   * Inject esbuild's __name polyfill into the browser context.
   * tsx/esbuild decorates function declarations with __name() calls, but
   * page.evaluate() runs in the browser where __name doesn't exist.
   */
  private async injectEsbuildPolyfill(page: Page): Promise<void> {
    await page.evaluate(() => {
      if (typeof (globalThis as any).__name === 'undefined') {
        (globalThis as any).__name = (fn: any) => fn;
      }
    });
  }

  async analyze(page: Page, url: string): Promise<PageResult> {
    const start = Date.now();
    const findings: Finding[] = [];

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.pageTimeoutMs,
      });

      // Give JS-rendered pages time to settle
      await page.waitForTimeout(1500);

      const metadata = await this.extractMetadata(page, url);

      // Inject esbuild polyfill before running hand-rolled checks
      await this.injectEsbuildPolyfill(page);

      // Run all checks in parallel
      const checkResults = await Promise.all([
        this.checkImagesAltText(page),
        this.checkFormLabels(page),
        this.checkHeadingHierarchy(page),
        this.checkDocumentLanguage(page),
        this.checkEmptyLinksAndButtons(page),
        this.checkColorContrastCandidates(page),
        this.checkVisualHeadingsWithoutSemantics(page),
      ]);

      for (const result of checkResults) {
        findings.push(...result);
      }

      // Run axe-core checks and merge with hand-rolled findings
      const axeFindings = await this.runAxeChecks(page);
      const merged = this.deduplicateFindings(findings, axeFindings);

      // Debug logging
      if (merged.length > 0) {
        console.log(`  📋 ${merged.length} finding(s) on ${new URL(url).pathname}`);
      }

      // Capture screenshots of violations if configured
      if (this.config.captureScreenshots && merged.length > 0) {
        await this.captureViolationScreenshots(page, merged);
      }

      // Stamp page URL on each finding so they're self-contained
      for (const f of merged) {
        f.pageUrl = normalizePageUrl(f.pageUrl || url, this.config.url);
      }

      // Discover interactive UI elements for test case generation.
      // SPAs often load content lazily — wait for main content area to populate.
      await this.waitForMainContent(page);
      const discoveredElements = await this.discoverPageElements(page);

      return {
        url,
        metadata,
        findings: merged,
        analysisTimeMs: Date.now() - start,
        discoveredElements,
      };
    } catch (err) {
      return {
        url,
        metadata: {
          url,
          title: '',
          lang: null,
          metaDescription: null,
          metaViewport: null,
          h1Count: 0,
        },
        findings,
        analysisTimeMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async extractMetadata(page: Page, url: string): Promise<PageMetadata> {
    return page.evaluate((pageUrl) => {
      const html = document.documentElement;
      return {
        url: pageUrl,
        title: document.title || '',
        lang: html.getAttribute('lang'),
        metaDescription:
          document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
        metaViewport:
          document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null,
        h1Count: document.querySelectorAll('h1').length,
      };
    }, url);
  }

  /**
   * Discover interactive UI elements on the page for navigation-flow test case generation.
   * Uses UIDetector when available, falls back to a lightweight in-page extraction.
   */
  /**
   * Wait for content-level interactive elements to appear inside [role=main].
   * Specifically waits for buttons/inputs/links (excluding tabs and menuitems
   * which are navigation chrome, not page content).
   */
  private async waitForMainContent(page: Page): Promise<void> {
    const maxWaitMs = 25_000;
    const interval = 2500;
    let prevCount = 0;
    let stableChecks = 0;
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      await page.waitForTimeout(interval);
      const count = await page.evaluate(() => {
        const main = document.querySelector('[role=main], main');
        if (!main) return 0;
        // Count only content-level controls, not tabs or menu items
        const all = main.querySelectorAll('button, [role=button], a[href], input, select, textarea, [role=combobox], [role=checkbox], [role=switch], [aria-expanded], table, [role=table]');
        let contentCount = 0;
        for (const el of all) {
          const role = el.getAttribute('role');
          if (role === 'tab' || role === 'menuitem') continue;
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) contentCount++;
        }
        return contentCount;
      }).catch(() => 0);

      if (count > 0 && count === prevCount) {
        stableChecks++;
        if (stableChecks >= 2) return;
      } else {
        stableChecks = 0;
      }
      prevCount = count;
    }
  }

  private async discoverPageElements(page: Page): Promise<DiscoveredElement[]> {
    try {
      // Extract elements scoped to the main content area (not shell chrome).
      const contentElements = await this.extractMainContentElements(page);
      if (contentElements.length > 0) return contentElements;

      // Check if [role=main] exists — if it does, return empty rather than
      // falling back to whole-page extraction (which picks up shell chrome).
      const hasMain = await page.evaluate(() => !!document.querySelector('[role=main], main')).catch(() => false);
      if (hasMain) return [];

      // Fallback: use UIDetector for the whole page (when no [role=main] exists)
      const allElements = await this.extractAllPageElements(page);
      return allElements;
    } catch {
      return [];
    }
  }

  /**
   * Extract interactive elements scoped to the main content area only.
   * Excludes shell chrome (app bar, left navigation, global search).
   */
  private async extractMainContentElements(page: Page): Promise<DiscoveredElement[]> {
    const raw = await page.evaluate(() => {
      const mainEl = document.querySelector('[role=main], main');
      if (!mainEl) return [];

      const results: Array<{
        label: string; kind: string; selector: string;
        role: string | null; ariaExpanded: string | null; tag: string;
      }> = [];

      // Build a simple selector for an element
      const buildSelector = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        const tag = el.tagName.toLowerCase();
        const cls = Array.from(el.classList).slice(0, 2).join('.');
        return cls ? `${tag}.${cls}` : tag;
      };

      // Query interactive elements inside main content area.
      // Excludes [role=tab] and [role=menuitem] — those are page navigation, not content.
      const selectors = [
        'button', '[role=button]',
        'a[href]', 'input', 'select', 'textarea',
        '[role=combobox]', '[role=listbox]', '[role=checkbox]', '[role=switch]',
        'h1', 'h2', 'h3', 'h4', '[role=heading]',
        'table', '[role=table]', '[role=grid]', '[role=treegrid]',
        '[role=row][data-is-focusable=true]', '[data-selection-index]',
        '[aria-expanded]',
        '[role=dialog]', '[role=complementary]',
      ].join(', ');

      const els = mainEl.querySelectorAll(selectors);
      for (const el of els) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        const label = (
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          // Use only direct text content, not concatenated child text
          Array.from(el.childNodes)
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent?.trim())
            .filter(Boolean)
            .join(' ')
            .substring(0, 120) ||
          // Last resort: first text child element
          el.querySelector(':scope > span, :scope > *:first-child')?.textContent?.trim().substring(0, 80) ||
          el.textContent?.trim().substring(0, 40) ||
          ''
        ).trim().substring(0, 120);
        if (!label || label.length < 2) continue;

        const role = el.getAttribute('role');
        const tag = el.tagName.toLowerCase();

        // Skip page-navigation elements — tabs and menu items are out of scope
        if (role === 'tab' || role === 'menuitem') continue;

        // Classify the element — only content-level controls
        let kind = 'unknown';
        if (tag === 'button' || role === 'button') {
          kind = el.getAttribute('aria-expanded') !== null ? 'accordion' : 'button';
        }
        else if (tag === 'a' || role === 'link') kind = 'link';
        else if (tag === 'input' || tag === 'select' || tag === 'textarea' ||
                 role === 'combobox' || role === 'listbox' || role === 'checkbox' || role === 'switch')
          kind = 'form-control';
        else if (tag === 'table' || role === 'table' || role === 'grid' || role === 'treegrid') kind = 'table';
        else if (role === 'row' && (el.getAttribute('data-is-focusable') === 'true' || el.getAttribute('data-selection-index'))) kind = 'table-row';
        else if (el.getAttribute('data-selection-index') && rect.width > 200) kind = 'table-row';
        else if (tag.match(/^h[1-4]$/) || role === 'heading') kind = 'heading';
        else if (role === 'dialog' || role === 'complementary') kind = 'dialog';
        else if (el.getAttribute('aria-expanded') !== null) kind = 'accordion';

        if (kind === 'unknown') continue;

        results.push({
          label, kind, selector: buildSelector(el),
          role, ariaExpanded: el.getAttribute('aria-expanded'), tag,
        });
      }
      return results;
    });

    // Map raw results to DiscoveredElement, deduplicating
    const elements: DiscoveredElement[] = [];
    const seenLabels = new Set<string>();

    for (const el of raw) {
      // Clean label
      let label = el.label.replace(/\bundefined\b/gi, '').trim();
      if (!label || label.length < 2) continue;
      // For long labels, take just the first clause (before comma/period) as the action name
      if (label.length > 50) {
        const shortLabel = label.split(/[,.]/)[0]?.trim();
        if (shortLabel && shortLabel.length >= 3) {
          label = shortLabel;
        } else {
          label = label.substring(0, 50);
        }
      }

      const kind: DiscoveredElement['kind'] = el.kind === 'accordion' ? 'button' : el.kind as DiscoveredElement['kind'];

      // Deduplicate: same label across link+button counts as one (keep button)
      const labelKey = label.toLowerCase();
      if (seenLabels.has(labelKey)) continue;
      seenLabels.add(labelKey);

      // For table rows, only keep one representative row
      if (kind === 'table-row') {
        if (elements.some(e => e.kind === 'table-row')) continue;
      }

      let section: string | undefined;
      if (el.kind === 'accordion') section = 'accordion section';

      elements.push({ label, kind, selector: el.selector, role: el.role, section });
    }

    return elements;
  }

  /**
   * Fallback: extract elements from the whole page using UIDetector.
   */
  private async extractAllPageElements(page: Page): Promise<DiscoveredElement[]> {
    const detector = new UIDetector({ includeIframes: false, detectEventListeners: false });
    const raw = await detector.detectAll(page);

    const KIND_MAP: Record<string, DiscoveredElement['kind']> = {
      'link': 'link', 'button': 'button', 'tab': 'tab',
      'navigation': 'navigation', 'modal': 'dialog',
      'accordion': 'button', 'menu': 'menu', 'menu-item': 'menu',
      'text-input': 'form-control', 'select': 'form-control',
      'textarea': 'form-control', 'checkbox': 'form-control',
      'radio': 'form-control', 'slider': 'form-control',
      'toggle': 'button', 'dialog-trigger': 'button', 'search': 'form-control',
      'custom-component': 'button', 'carousel': 'button',
      'dialog': 'dialog', 'menuitem': 'menu',
      'textbox': 'form-control', 'combobox': 'form-control',
      'listbox': 'form-control', 'spinbutton': 'form-control',
      'heading': 'heading', 'table': 'table', 'grid': 'table',
    };

    const elements: DiscoveredElement[] = [];

    for (const el of raw) {
      if (!el.isVisible) continue;
      const label = (el.accessibleName || el.textContent || '').trim()
        .replace(/\bundefined\b/gi, '').trim();
      if (!label || label.length < 2 || label.length > 120) continue;

      const kind = KIND_MAP[el.category] ?? KIND_MAP[el.role ?? ''] ?? null;
      if (!kind) continue;

      if (elements.some(e => e.label === label && e.kind === kind)) continue;

      let section: string | undefined;
      if (el.category === 'tab' || el.role === 'tab') section = 'tab bar';
      if (el.category === 'navigation' || el.role === 'navigation') section = 'left navigation';
      if (el.category === 'menu-item' || el.role === 'menuitem') section = 'navigation';

      elements.push({ label, kind, selector: el.selector, role: el.role, section });
    }

    return elements;
  }

  /** WCAG 1.1.1 — Images must have alt text */
  private async checkImagesAltText(page: Page): Promise<Finding[]> {
    return page.evaluate(() => {
      const buildSelector = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        const tag = el.tagName.toLowerCase();
        const classes = Array.from(el.classList).join('.');
        const parent = el.parentElement;
        const index = parent
          ? Array.from(parent.children).filter(c => c.tagName === el.tagName).indexOf(el)
          : 0;
        return `${tag}${classes ? '.' + classes : ''}:nth-of-type(${index + 1})`;
      };

      const findings: any[] = [];
      const images = document.querySelectorAll('img');

      for (const img of images) {
        const alt = img.getAttribute('alt');
        // Missing alt is a violation; empty alt="" is acceptable (decorative)
        if (alt === null) {
          findings.push({
            ruleId: 'img-alt-text',
            category: 'semantic-html',
            severity: 'critical',
            wcagLevel: 'A',
            wcagCriterion: '1.1.1',
            message: `Image missing alt attribute: ${img.src?.substring(0, 100) || 'unknown src'}`,
            selector: buildSelector(img),
            htmlSnippet: img.outerHTML.substring(0, 300),
            remediation: 'Add an alt attribute describing the image content. Use alt="" for decorative images.',
          });
        }
      }

      // Also check inputs of type image
      const imageInputs = document.querySelectorAll('input[type="image"]');
      for (const input of imageInputs) {
        if (!input.getAttribute('alt')) {
          findings.push({
            ruleId: 'img-alt-text',
            category: 'semantic-html',
            severity: 'critical',
            wcagLevel: 'A',
            wcagCriterion: '1.1.1',
            message: 'Image input missing alt attribute',
            selector: buildSelector(input),
            htmlSnippet: input.outerHTML.substring(0, 300),
            remediation: 'Add an alt attribute to <input type="image"> describing the button action.',
          });
        }
      }

      return findings;
    }) as Promise<Finding[]>;
  }

  /** WCAG 1.3.1 / 4.1.2 — Form inputs must have associated labels */
  private async checkFormLabels(page: Page): Promise<Finding[]> {
    return page.evaluate(() => {
      const buildSelector = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        const tag = el.tagName.toLowerCase();
        const type = el.getAttribute('type') || '';
        const name = el.getAttribute('name') || '';
        return `${tag}${type ? `[type="${type}"]` : ''}${name ? `[name="${name}"]` : ''}`;
      };

      const findings: any[] = [];
      const inputs = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea'
      );

      for (const input of inputs) {
        const hasLabel = !!input.getAttribute('aria-label')
          || !!input.getAttribute('aria-labelledby')
          || !!input.getAttribute('title')
          || !!input.getAttribute('placeholder');

        // Check for an associated <label>
        const id = input.getAttribute('id');
        const hasAssociatedLabel = id
          ? !!document.querySelector(`label[for="${id}"]`)
          : false;

        // Check if input is wrapped in a <label>
        const hasWrappingLabel = !!input.closest('label');

        if (!hasLabel && !hasAssociatedLabel && !hasWrappingLabel) {
          findings.push({
            ruleId: 'form-input-label',
            category: 'forms',
            severity: 'critical',
            wcagLevel: 'A',
            wcagCriterion: '1.3.1',
            message: `Form input missing accessible label: <${input.tagName.toLowerCase()} type="${input.getAttribute('type') || 'text'}">`,
            selector: buildSelector(input),
            htmlSnippet: input.outerHTML.substring(0, 300),
            remediation: 'Associate a <label> element or add aria-label / aria-labelledby.',
          });
        }
      }

      return findings;
    }) as Promise<Finding[]>;
  }

  /** WCAG 1.3.1 — Heading levels should not skip */
  private async checkHeadingHierarchy(page: Page): Promise<Finding[]> {
    return page.evaluate(() => {
      const buildSelector = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        return `${el.tagName.toLowerCase()}`;
      };

      const findings: any[] = [];
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      let prevLevel = 0;

      for (const heading of headings) {
        const level = parseInt(heading.tagName.charAt(1), 10);

        if (prevLevel > 0 && level > prevLevel + 1) {
          findings.push({
            ruleId: 'heading-hierarchy',
            category: 'semantic-html',
            severity: 'minor',
            wcagLevel: 'A',
            wcagCriterion: '1.3.1',
            message: `Heading level skipped: <h${prevLevel}> followed by <h${level}>`,
            selector: buildSelector(heading),
            htmlSnippet: heading.outerHTML.substring(0, 300),
            remediation: `Use sequential heading levels. Expected <h${prevLevel + 1}> but found <h${level}>.`,
          });
        }

        prevLevel = level;
      }

      // Check for missing h1
      if (document.querySelectorAll('h1').length === 0) {
        findings.push({
          ruleId: 'heading-hierarchy',
          category: 'semantic-html',
          severity: 'minor',
          wcagLevel: 'A',
          wcagCriterion: '1.3.1',
          message: 'Page has no <h1> element',
          selector: 'html',
          htmlSnippet: '',
          remediation: 'Add a single <h1> element to identify the main page content.',
        });
      }

      // Multiple h1s
      if (document.querySelectorAll('h1').length > 1) {
        findings.push({
          ruleId: 'heading-hierarchy',
          category: 'semantic-html',
          severity: 'moderate',
          wcagLevel: 'A',
          wcagCriterion: '1.3.1',
          message: `Page has ${document.querySelectorAll('h1').length} <h1> elements (expected 1)`,
          selector: 'h1',
          htmlSnippet: '',
          remediation: 'Use a single <h1> for the main page heading.',
        });
      }

      return findings;
    }) as Promise<Finding[]>;
  }

  /** WCAG 3.1.1 — Document must have a lang attribute */
  private async checkDocumentLanguage(page: Page): Promise<Finding[]> {
    return page.evaluate(() => {
      const findings: any[] = [];
      const lang = document.documentElement.getAttribute('lang');

      if (!lang) {
        findings.push({
          ruleId: 'document-lang',
          category: 'language-text',
          severity: 'serious',
          wcagLevel: 'A',
          wcagCriterion: '3.1.1',
          message: 'Document missing lang attribute on <html> element',
          selector: 'html',
          htmlSnippet: `<html ${Array.from(document.documentElement.attributes).map(a => `${a.name}="${a.value}"`).join(' ')}>`.substring(0, 300),
          remediation: 'Add a lang attribute to the <html> element (e.g., lang="en").',
        });
      } else if (lang.trim() === '') {
        findings.push({
          ruleId: 'document-lang',
          category: 'language-text',
          severity: 'serious',
          wcagLevel: 'A',
          wcagCriterion: '3.1.1',
          message: 'Document has empty lang attribute',
          selector: 'html',
          htmlSnippet: `<html lang="">`,
          remediation: 'Set the lang attribute to a valid language code (e.g., lang="en").',
        });
      }

      return findings;
    }) as Promise<Finding[]>;
  }

  /** WCAG 2.4.4 — Links and buttons must have discernible text */
  private async checkEmptyLinksAndButtons(page: Page): Promise<Finding[]> {
    return page.evaluate(() => {
      const buildSelector = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        const tag = el.tagName.toLowerCase();
        const classes = Array.from(el.classList).slice(0, 2).join('.');
        return `${tag}${classes ? '.' + classes : ''}`;
      };

      const findings: any[] = [];

      // Check links
      const links = document.querySelectorAll('a[href]');
      for (const link of links) {
        const hasText = (link.textContent?.trim() || '').length > 0;
        const hasAriaLabel = !!link.getAttribute('aria-label');
        const hasAriaLabelledby = !!link.getAttribute('aria-labelledby');
        const hasTitle = !!link.getAttribute('title');
        const hasImg = !!link.querySelector('img[alt]:not([alt=""])');

        if (!hasText && !hasAriaLabel && !hasAriaLabelledby && !hasTitle && !hasImg) {
          findings.push({
            ruleId: 'link-name',
            category: 'navigation-structure',
            severity: 'serious',
            wcagLevel: 'A',
            wcagCriterion: '2.4.4',
            message: 'Link has no discernible text',
            selector: buildSelector(link),
            htmlSnippet: link.outerHTML.substring(0, 300),
            remediation: 'Add text content, aria-label, or a titled image inside the link.',
          });
        }
      }

      // Check buttons
      const buttons = document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]');
      for (const btn of buttons) {
        const hasText = (btn.textContent?.trim() || '').length > 0;
        const hasAriaLabel = !!btn.getAttribute('aria-label');
        const hasAriaLabelledby = !!btn.getAttribute('aria-labelledby');
        const hasTitle = !!btn.getAttribute('title');
        const hasValue = !!btn.getAttribute('value');

        if (!hasText && !hasAriaLabel && !hasAriaLabelledby && !hasTitle && !hasValue) {
          findings.push({
            ruleId: 'button-name',
            category: 'navigation-structure',
            severity: 'serious',
            wcagLevel: 'A',
            wcagCriterion: '2.4.4',
            message: 'Button has no discernible text',
            selector: buildSelector(btn),
            htmlSnippet: btn.outerHTML.substring(0, 300),
            remediation: 'Add text content, aria-label, or a value attribute to the button.',
          });
        }
      }

      return findings;
    }) as Promise<Finding[]>;
  }

  /**
   * WCAG 1.4.3 — Color contrast placeholder.
   * Full contrast computation needs a rendering engine; for the POC we flag
   * elements with small text and inline color styles as candidates for review.
   */
  private async checkColorContrastCandidates(page: Page): Promise<Finding[]> {
    return page.evaluate(() => {
      const parseRgb = (color: string): [number, number, number] | null => {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return null;
        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
      };

      const luminance = (r: number, g: number, b: number): number => {
        const [rs, gs, bs] = [r, g, b].map(c => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      };

      const contrastRatio = (fg: [number, number, number], bg: [number, number, number]): number => {
        const l1 = luminance(...fg);
        const l2 = luminance(...bg);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      };

      const buildSelector = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        const tag = el.tagName.toLowerCase();
        return tag;
      };

      const findings: any[] = [];
      const textElements = document.querySelectorAll(
        'p, span, a, li, td, th, label, h1, h2, h3, h4, h5, h6, button, div'
      );

      for (const el of textElements) {
        const text = el.textContent?.trim() || '';
        if (text.length === 0) continue;

        const style = window.getComputedStyle(el);
        const color = style.color;
        const bgColor = style.backgroundColor;

        // Only flag elements where both fg and bg are explicitly set to non-default values
        // and they look suspiciously similar (basic heuristic)
        if (color && bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
          const fgRgb = parseRgb(color);
          const bgRgb = parseRgb(bgColor);

          if (fgRgb && bgRgb) {
            const ratio = contrastRatio(fgRgb, bgRgb);
            const fontSize = parseFloat(style.fontSize);
            const isBold = parseInt(style.fontWeight, 10) >= 700 || style.fontWeight === 'bold';
            const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && isBold);
            const threshold = isLargeText ? 3.0 : 4.5;

            if (ratio < threshold) {
              findings.push({
                ruleId: 'color-contrast',
                category: 'color-contrast',
                severity: ratio < 3.0 ? 'critical' : 'serious',
                wcagLevel: 'AA',
                wcagCriterion: '1.4.3',
                message: `Insufficient color contrast: ratio ${ratio.toFixed(2)}:1 (needs ${threshold}:1). Color: ${color}, Background: ${bgColor}`,
                selector: buildSelector(el),
                htmlSnippet: el.outerHTML.substring(0, 200),
                remediation: `Increase contrast ratio to at least ${threshold}:1. Current ratio is ${ratio.toFixed(2)}:1.`,
              });
            }
          }
        }
      }

      // Limit to first 20 contrast findings to avoid flooding
      return findings.slice(0, 20);
    }) as Promise<Finding[]>;
  }

  /**
   * WCAG 1.3.1 — Detect elements that visually appear as headings but don't use
   * semantic heading tags (<h1>–<h6>) or role="heading".
   * Checks for text with large font-size (>= 1.5x body) and/or bold font-weight
   * that isn't inside a heading element.
   */
  private async checkVisualHeadingsWithoutSemantics(page: Page): Promise<Finding[]> {
    return page.evaluate(() => {
      const buildSelector = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        const tag = el.tagName.toLowerCase();
        const classes = Array.from(el.classList).slice(0, 2).join('.');
        return classes ? `${tag}.${classes}` : tag;
      };

      const findings: any[] = [];
      const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

      // Get the base body font size for comparison
      const bodyStyle = window.getComputedStyle(document.body);
      const baseFontSize = parseFloat(bodyStyle.fontSize) || 16;
      const headingThreshold = baseFontSize * 1.5; // 24px default — typical heading size

      // Selectors for non-heading text containers commonly misused as headings
      const candidates = document.querySelectorAll(
        'p, div, span, td, li, a, strong, b, em'
      );

      for (const el of candidates) {
        // Skip if already inside a semantic heading
        if (el.closest('h1, h2, h3, h4, h5, h6, [role="heading"]')) continue;
        // Skip elements with heading role themselves
        if (el.getAttribute('role') === 'heading') continue;
        // Skip hidden elements
        if (!(el as HTMLElement).offsetWidth && !(el as HTMLElement).offsetHeight) continue;

        const text = (el.textContent || '').trim();
        // Only check elements with meaningful text (3–200 chars — heading length range)
        if (text.length < 3 || text.length > 200) continue;

        const style = window.getComputedStyle(el);
        const fontSize = parseFloat(style.fontSize) || 0;
        const fontWeight = parseInt(style.fontWeight) || 400;
        const isBold = fontWeight >= 600;
        const isLargeText = fontSize >= headingThreshold;

        // Must be both large AND bold to look like a heading
        if (isLargeText && isBold) {
          // Skip if a child element is the one with the styles (avoid duplicate parent/child)
          const children = el.children;
          let childIsCandidate = false;
          for (let i = 0; i < children.length; i++) {
            const childStyle = window.getComputedStyle(children[i]);
            if (parseFloat(childStyle.fontSize) >= headingThreshold &&
                parseInt(childStyle.fontWeight) >= 600) {
              childIsCandidate = true;
              break;
            }
          }
          if (childIsCandidate) continue;

          findings.push({
            ruleId: 'visual-heading-no-semantic',
            category: 'adaptable',
            severity: 'serious',
            wcagLevel: 'A',
            wcagCriterion: '1.3.1',
            message: `Text "${text.substring(0, 80)}" is visually styled as a heading (font-size: ${fontSize.toFixed(0)}px, weight: ${fontWeight}) but does not use a heading tag (<h1>–<h6>) or role="heading".`,
            selector: buildSelector(el),
            htmlSnippet: el.outerHTML.substring(0, 300),
            remediation: 'Use an appropriate heading element (<h1>–<h6>) or add role="heading" with aria-level to convey the heading semantics to assistive technologies.',
          });
        }
      }

      // Limit to first 10 to avoid flooding
      return findings.slice(0, 10);
    }) as Promise<Finding[]>;
  }

  /**
   * Analyze the currently loaded page WITHOUT navigating.
   * Used by DeepExplorer to run checks on already-loaded SPA states.
   * Optionally attaches repro steps (navigation breadcrumb) to each finding.
   */
  async analyzeCurrentPage(page: Page, reproSteps?: string[]): Promise<PageResult> {
    const start = Date.now();
    const findings: Finding[] = [];
    const url = page.url();

    try {
      // Give JS-rendered pages time to settle (SPAs need more time)
      await page.waitForTimeout(2000);
    } catch { /* timeout failed — continue anyway */ }

    // Extract metadata (non-fatal)
    let metadata;
    try {
      metadata = await this.extractMetadata(page, url);
    } catch (err) {
      console.warn(`  ⚠ Metadata extraction failed: ${err instanceof Error ? err.message : String(err)}`);
      metadata = { url, title: '', lang: null, metaDescription: null, metaViewport: null, h1Count: 0 };
    }

    // Run hand-rolled checks (non-fatal)
    try {
      await this.injectEsbuildPolyfill(page);
      const checkResults = await Promise.all([
        this.checkImagesAltText(page),
        this.checkFormLabels(page),
        this.checkHeadingHierarchy(page),
        this.checkDocumentLanguage(page),
        this.checkEmptyLinksAndButtons(page),
        this.checkColorContrastCandidates(page),
        this.checkVisualHeadingsWithoutSemantics(page),
      ]);
      for (const result of checkResults) {
        findings.push(...result);
      }
    } catch (err) {
      console.warn(`  ⚠ Hand-rolled checks failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Run axe-core checks — ALWAYS runs even if hand-rolled checks failed
    const axeFindings = await this.runAxeChecks(page);
    const merged = this.deduplicateFindings(findings, axeFindings);

    // Debug: log analysis results
    try {
      const pathname = new URL(url).pathname;
      if (merged.length > 0) {
        console.log(`  📋 ${merged.length} finding(s) on ${pathname} (hand-rolled: ${findings.length}, axe: ${axeFindings.length})`);
      }
    } catch { /* URL parse — ignore */ }

    // Capture screenshots of violations if configured
    if (this.config.captureScreenshots && merged.length > 0) {
      try {
        await this.captureViolationScreenshots(page, merged);
      } catch { /* screenshot failed — non-fatal */ }
    }

    // Stamp page URL and repro steps on each finding
    for (const f of merged) {
      f.pageUrl = normalizePageUrl(f.pageUrl || url, this.config.url);
      if (reproSteps && reproSteps.length > 0) {
        f.reproSteps = [...reproSteps];
      }
    }

    return {
      url,
      metadata,
      findings: merged,
      analysisTimeMs: Date.now() - start,
    };
  }

  /** Capture screenshots for findings — viewport for individual findings, full-page as fallback */
  private async captureViolationScreenshots(page: Page, findings: Finding[]): Promise<void> {
    // Take a viewport screenshot to attach to each finding that doesn't already have one
    let viewportScreenshot: string | undefined;
    try {
      const buf = await page.screenshot({ fullPage: false, type: 'png' });
      viewportScreenshot = buf.toString('base64');
    } catch { /* non-fatal */ }

    for (const finding of findings) {
      if (!finding.screenshot && viewportScreenshot) {
        finding.screenshot = viewportScreenshot;
      }
    }
  }

  /** Run axe-core analysis and map violations to our Finding interface */
  async runAxeChecks(page: Page): Promise<Finding[]> {
    try {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .options({
          iframes: true,
          rules: {
            // Enable experimental rule that catches <p> styled as headings (WCAG 1.3.1)
            'p-as-heading': { enabled: true },
          },
        } as any)
        .analyze();

      // Always log axe-core results for diagnostics
      const passCount = results.passes?.length ?? 0;
      const incompleteCount = results.incomplete?.length ?? 0;
      console.log(`  🔎 axe-core: ${results.violations.length} violation(s), ${incompleteCount} incomplete, ${passCount} passes on ${new URL(page.url()).pathname}`);

      const findings: Finding[] = [];

      for (const violation of results.violations) {
        const category = this.mapAxeCategory(violation.tags);
        const severity = this.mapAxeSeverity(violation.impact || 'minor');
        const wcagLevel = this.extractWcagLevel(violation.tags);
        const wcagCriterion = this.extractWcagCriterion(violation.tags);

        for (const node of violation.nodes) {
          const selector = Array.isArray(node.target) && node.target.length > 0
            ? String(node.target[0])
            : '';
          findings.push({
            ruleId: violation.id,
            category,
            severity,
            wcagLevel,
            wcagCriterion,
            message: `${violation.description}. ${node.failureSummary || ''}`.trim(),
            selector,
            pageUrl: normalizePageUrl(page.url(), this.config.url),
            htmlSnippet: (node.html || '').substring(0, 300),
            remediation: `${violation.help}. See: ${violation.helpUrl}`,
          });
        }
      }

      // Skip ALL incomplete/needs-review findings — only report confirmed violations.
      // Incomplete results are unverified and produce false positives (color-contrast,
      // link-in-text-block, etc.). We only file bugs when we're 100% sure.

      return findings;
    } catch (err) {
      // axe-core can fail on certain page types (e.g., data: URLs, strict CSP) — log and continue
      console.warn(`  ⚠ axe-core failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /** Map axe-core category tags to our RuleCategory */
  private mapAxeCategory(tags: string[]): RuleCategory {
    for (const tag of tags) {
      if (AXE_CATEGORY_MAP[tag]) return AXE_CATEGORY_MAP[tag];
    }
    return 'adaptable';
  }

  /** Map axe-core impact to our Severity */
  private mapAxeSeverity(impact: string): Severity {
    switch (impact) {
      case 'critical': return 'critical';
      case 'serious': return 'serious';
      case 'moderate': return 'moderate';
      case 'minor': return 'minor';
      default: return 'minor';
    }
  }

  /** Extract WCAG conformance level from axe tags */
  private extractWcagLevel(tags: string[]): WcagLevel {
    for (const tag of tags) {
      if (tag === 'wcag2aaa') return 'AAA';
      if (tag === 'wcag2aa' || tag === 'wcag21aa' || tag === 'wcag22aa') return 'AA';
      if (tag === 'wcag2a' || tag === 'wcag21a') return 'A';
    }
    if (tags.includes('best-practice')) return 'AA';
    return 'A';
  }

  /** Extract WCAG criterion (e.g., "1.1.1") from axe tags matching "wcag###" */
  private extractWcagCriterion(tags: string[]): string {
    for (const tag of tags) {
      const match = tag.match(/^wcag(\d)(\d)(\d+)$/);
      if (match) return `${match[1]}.${match[2]}.${match[3]}`;
    }
    return '';
  }

  /**
   * Deduplicate findings: when axe-core and a hand-rolled check flag the same
   * issue (equivalent ruleId on the same selector), keep the axe-core finding.
   */
  private deduplicateFindings(handRolled: Finding[], axeFindings: Finding[]): Finding[] {
    // Build a set of axe findings keyed by normalized-ruleId + selector
    const axeKeys = new Set<string>();
    for (const f of axeFindings) {
      axeKeys.add(`${f.ruleId}::${f.selector}`);
    }

    // Build reverse mapping: axe ruleId → hand-rolled ruleId
    const axeToHandRolled = new Map<string, string>();
    for (const [hrId, axeIds] of Object.entries(HANDROLLED_TO_AXE_EQUIV)) {
      for (const axeId of axeIds) {
        axeToHandRolled.set(axeId, hrId);
      }
    }

    // Filter out hand-rolled findings that have an equivalent axe finding on same selector
    const filteredHandRolled = handRolled.filter((hr) => {
      // Check if any axe finding covers this same issue on same selector
      for (const axeF of axeFindings) {
        const equivalentHrId = axeToHandRolled.get(axeF.ruleId);
        if (equivalentHrId === hr.ruleId && axeF.selector === hr.selector) {
          return false; // Remove hand-rolled, axe-core is more detailed
        }
      }
      return true;
    });

    return [...filteredHandRolled, ...axeFindings];
  }
}
