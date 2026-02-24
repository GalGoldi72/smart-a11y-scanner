/**
 * DeepExplorer — recursively explores SPA states by clicking interactive elements.
 *
 * Unlike the Crawler (which follows <a href> links), this explorer:
 *   1. Finds ALL interactive elements on the current view
 *   2. Clicks each one and detects state changes (URL, modal, expansion, DOM)
 *   3. Recursively explores new states
 *   4. Runs PageAnalyzer on every unique state discovered
 *   5. Returns PageResult[] combining discovery + analysis
 *
 * Designed for SPAs like Microsoft Security portal (Fluent UI).
 */

import { BrowserContext, Page } from 'playwright';
import { createHash } from 'crypto';
import { ScanConfig, PageResult, ExplorationState, BreadcrumbEntry } from './types.js';
import { PageAnalyzer, normalizePageUrl } from './page-analyzer.js';

/** Comprehensive selectors for interactive elements */
const INTERACTIVE_SELECTORS = [
  'button:not([disabled])',
  '[role="button"]:not([disabled])',
  'a[href]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="treeitem"]',
  '[role="option"]',
  '[aria-expanded]',
  '[aria-haspopup]',
  '[data-href]',
  '[routerlink]',
  '[ng-click]',
  '[onclick]',
  'nav *',
  '[role="navigation"] *',
  '[class*="sidebar"] *',
  '[class*="sidenav"] *',
  '[class*="side-nav"] *',
  '[class*="CommandBar"] *',
  '[class*="ms-Nav"] *',
].join(', ');

/** Selectors for detecting overlays (modals, panels, blades, dialogs) */
const OVERLAY_SELECTORS = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[aria-modal="true"]',
  '.ms-Panel',
  '.ms-Dialog',
  '.ms-Modal',
  '.modal',
  '.overlay',
  '.fui-DialogSurface',           // Fluent UI v9
  '.fui-DrawerBody',              // Fluent UI v9 Drawer (side panel)
  '[class*="ms-Layer--fixed"]',   // Layer-based panels
  '[class*="CommandBar-panel"]',  // Command bar panels
  '[class*="Blade"]',             // Azure-style blades
  '[class*="side-panel"]',        // Generic side panels
  '[class*="NavigationCustomizer"]',  // Microsoft 365 nav customizer
  '[class*="panel-content"]',     // Generic panel content
].join(', ');

/** Selectors for close buttons on overlays */
const CLOSE_SELECTORS = [
  '[aria-label="Close"]',
  '[aria-label="close"]',
  '[aria-label="Dismiss"]',
  '[aria-label="dismiss"]',
  '[aria-label="Close panel"]',
  '[aria-label="Close navigation customizer"]',
  '[aria-label="Got it"]',
  '[aria-label="OK"]',
  '.ms-Panel-closeButton',
  '.ms-Panel button[class*="close"]',
  '.ms-Dialog-button--close',
  'button.close',
  '[data-icon-name="Cancel"]',
  '[data-icon-name="ChromeClose"]',
  '[data-icon-name="Dismiss"]',
  'button[class*="close"]',
  'button[class*="dismiss"]',
  'button[class*="Close"]',
  '.fui-DialogSurface button[aria-label]',  // Fluent UI v9 close buttons
  '[role="dialog"] button:first-of-type',
];

/** Max interactive elements to explore per state */
const MAX_ELEMENTS_PER_STATE = 50;

/** Default max recursion depth */
const DEFAULT_MAX_DEPTH = 5;

/** Priority tiers for element classification */
enum ElementPriority {
  CONTENT_AREA = 1, // Tabs, data rows, action buttons inside content — scan first
  NAVIGATION = 2,   // Nav links that discover new pages — scan second
  CHROME = 3,       // Account/profile, collapse/expand nav, app switcher — skip
}

/** Text patterns that identify chrome/infrastructure UI (case-insensitive) — exported for testing */
export const CHROME_TEXT_PATTERNS = [
  /^account\b/i, /\baccount\s*manager\b/i, /^profile\b/i, /^sign\s*out\b/i,
  /^sign\s*in\b/i, /^log\s*out\b/i, /^log\s*in\b/i,
  /^collapse\b/i, /^expand\b/i, /\bcollapse\s*navigation\b/i, /\bexpand\s*navigation\b/i,
  /^settings$/i, /^notifications?$/i, /^help$/i, /^feedback$/i,
  /^app\s*launcher\b/i, /^waffle\b/i, /\btheme\b/i, /\blanguage\b/i,
  /^what'?s?\s*new\b/i, /^about$/i,
];

/** aria-label patterns that identify chrome elements (case-insensitive) */
const CHROME_ARIA_PATTERNS = [
  /collapse/i, /expand\s*navigation/i, /account\s*manager/i,
  /settings/i, /notifications?/i, /^help$/i, /feedback/i,
  /app\s*launcher/i, /waffle/i, /sign\s*out/i, /sign\s*in/i,
];

/** CSS selector fragments that identify content-area elements */
const CONTENT_SELECTORS = [
  '.ms-Pivot-link', '.ms-CommandBar', '.ms-DetailsRow', '.ms-DetailsList',
  '[data-automationid="DetailsRow"]',
];

/** CSS selector fragments that identify chrome elements */
const CHROME_SELECTORS = [
  '.ms-Panel-closeButton', '.ms-Dialog-button--close',
  '.o365cs-base', '#O365_HeaderLeftRegion', '#O365_MainLink_Me',
  '#O365_HeaderRightRegion', '#meControl', '#mectrl_main',
];

/** CSS selector fragments that identify navigation elements */
const NAV_SELECTORS = [
  '.ms-Nav-link', '.ms-Nav-chevronButton',
];

interface InteractiveElement {
  index: number;
  text: string;
  tag: string;
  role: string | null;
  ariaExpanded: string | null;
  selector: string;
  ariaLabel: string | null;
  isInsideMain: boolean;
  isInsideNav: boolean;
  isInsideHeader: boolean;
  className: string;
  priority: ElementPriority;
}

type StateChangeType = 'url_change' | 'overlay_opened' | 'content_expanded' | 'dom_change' | 'none';

interface StateChange {
  type: StateChangeType;
  newUrl?: string;
  overlaySelector?: string;
  overlayLabel?: string;
}

export class DeepExplorer {
  private visitedStates = new Set<string>();
  private explorationStates: ExplorationState[] = [];
  private pages: PageResult[] = [];
  private maxDepth: number;

  constructor(
    private config: ScanConfig,
    private analyzer: PageAnalyzer,
  ) {
    this.maxDepth = DEFAULT_MAX_DEPTH;
  }

  /**
   * Explore the SPA starting from the current authenticated session.
   * Uses a single page instance — clicks around without closing/reopening.
   */
  async explore(
    context: BrowserContext,
    deadline: number,
  ): Promise<{ pages: PageResult[]; statesVisited: number }> {
    const page = await context.newPage();

    try {
      // Navigate to start URL
      await page.goto(this.config.url, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.pageTimeoutMs,
      });
      await page.waitForTimeout(2000);

      // Dismiss any popups/dialogs/modals that appear on page load
      await this.dismissInitialPopups(page);

      // Phase 1: Navigation Discovery — click nav items to find different pages
      console.log(`  🧭 Phase 1: Discovering pages via navigation...`);
      const navUrls = await this.discoverNavPages(page, deadline);
      console.log(`  🧭 Discovered ${navUrls.length} navigation target(s)`);

      // Phase 2: Visit each nav page FIRST (breadth), then DFS explore each one
      // This ensures we scan many pages rather than going deep on just the homepage
      const allPages: Array<{ url: string; label: string }> = [
        { url: this.config.url, label: 'Start URL' },
        ...navUrls,
      ];

      // Time budget: split evenly across all pages
      const timeRemaining = deadline - Date.now();
      const perPageBudget = Math.max(15_000, Math.floor(timeRemaining / allPages.length));

      for (const navPage of allPages) {
        if (Date.now() >= deadline) break;

        const pageDeadline = Math.min(Date.now() + perPageBudget, deadline);
        try {
          // Navigate to page (skip for first if already there)
          if (navPage.url !== this.config.url || allPages.indexOf(navPage) > 0) {
            console.log(`  🧭 Navigating to: ${navPage.label} (${new URL(navPage.url).pathname})`);
            await page.goto(navPage.url, {
              waitUntil: 'domcontentloaded',
              timeout: this.config.pageTimeoutMs,
            });
            await page.waitForTimeout(2500);
            await this.dismissInitialPopups(page);
          }

          const breadcrumb: BreadcrumbEntry[] = [{
            action: 'navigate',
            elementText: navPage.label,
            url: navPage.url,
          }];
          await this.exploreState(page, 0, pageDeadline, `nav: ${navPage.label}`, breadcrumb);
        } catch {
          // Navigation failed — try next
        }
      }

      console.log(`  📊 Deep exploration: ${this.visitedStates.size} states visited, ${this.totalFindings()} findings`);
    } catch (err) {
      console.error(`  ❌ Deep exploration error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await page.close();
    }

    return {
      pages: this.pages,
      statesVisited: this.visitedStates.size,
    };
  }

  /**
   * Discover pages by clicking left-nav items and collecting resulting URLs.
   * Returns to the start URL after each click.
   */
  private async discoverNavPages(
    page: Page,
    deadline: number,
  ): Promise<Array<{ url: string; label: string }>> {
    const startUrl = page.url();
    const discovered: Array<{ url: string; label: string }> = [];
    const seenPaths = new Set<string>();

    try {
      // Find nav links: left sidebar, main navigation
      const navLinks = await page.$$([
        'nav a[href]',
        '[role="navigation"] a[href]',
        '[class*="sidebar"] a[href]',
        '[class*="sidenav"] a[href]',
        '[class*="side-nav"] a[href]',
        '[class*="ms-Nav"] a[href]',
        '[role="treeitem"] a[href]',
        '[role="menuitem"][href]',
      ].join(', '));

      for (const link of navLinks) {
        if (Date.now() >= deadline) break;
        if (discovered.length >= 10) break; // Cap at 10 nav pages

        try {
          const text = await link.textContent().catch(() => '') || '';
          const label = text.trim().substring(0, 60);
          if (!label) continue;

          // Skip chrome-like nav items
          if (CHROME_TEXT_PATTERNS.some(p => p.test(label))) continue;

          const href = await link.getAttribute('href').catch(() => null);
          if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
            const fullUrl = new URL(href, startUrl).href;
            const path = new URL(fullUrl).pathname;
            if (seenPaths.has(path)) continue;
            seenPaths.add(path);

            // Only include same-origin links
            if (new URL(fullUrl).origin === new URL(startUrl).origin) {
              discovered.push({ url: fullUrl, label });
            }
          }
        } catch {
          // Skip this link
        }
      }
    } catch {
      // Nav discovery failed — non-fatal
    }

    return discovered;
  }

  /**
   * Explore a single state depth-first: fingerprint it, screenshot it,
   * analyze it, find interactive elements, and for each one — click it,
   * detect changes, and IMMEDIATELY recurse into the new state before
   * continuing with sibling elements.
   */
  private async exploreState(
    page: Page,
    depth: number,
    deadline: number,
    discoveredVia: string,
    breadcrumb: BreadcrumbEntry[],
  ): Promise<void> {
    if (Date.now() >= deadline) return;
    if (depth > this.maxDepth) return;

    const url = page.url();
    const fingerprint = await this.computeFingerprint(page);
    const stateKey = `${url}#${fingerprint}`;

    // Deduplicate: skip already-visited states
    if (this.visitedStates.has(stateKey)) return;
    this.visitedStates.add(stateKey);

    // Take a full-page screenshot of this state
    let stateScreenshot: string | undefined;
    try {
      const screenshotBuf = await page.screenshot({ fullPage: true, type: 'png' });
      stateScreenshot = screenshotBuf.toString('base64');
    } catch { /* screenshot failed — non-fatal */ }

    // Record exploration state with breadcrumb
    this.explorationStates.push({
      url,
      fingerprint,
      depth,
      discoveredVia,
      stateScreenshot,
      navigationPath: [...breadcrumb],
    });

    // Build human-readable repro steps from the breadcrumb
    const reproSteps = breadcrumb.map(entry => {
      switch (entry.action) {
        case 'navigate':
          return `Navigate to ${entry.url}`;
        case 'click':
          return `Click '${entry.elementText}'`;
        case 'panel_opened':
          return `Panel '${entry.elementText}' opened`;
        case 'content_expanded':
          return `Content expanded after clicking '${entry.elementText}'`;
        case 'dom_change':
          return `DOM updated after clicking '${entry.elementText}'`;
        default:
          return `${entry.action}: '${entry.elementText}' at ${entry.url}`;
      }
    });

    // Find interactive elements
    const elements = await this.findInteractiveElements(page);
    console.log(`  🔍 Exploring: ${new URL(url).pathname} (${elements.length} interactive elements found)`);

    // Analyze current page — attach repro steps and screenshot to each finding
    try {
      const result = await this.analyzer.analyzeCurrentPage(page, reproSteps);
      for (const finding of result.findings) {
        finding.pageUrl = normalizePageUrl(url, this.config.url);        // Take a viewport screenshot for each finding if we don't already have one
        if (!finding.screenshot && stateScreenshot) {
          finding.screenshot = stateScreenshot;
        }
      }
      this.pages.push(result);
    } catch (err) {
      this.pages.push({
        url,
        metadata: { url, title: '', lang: null, metaDescription: null, metaViewport: null, h1Count: 0 },
        findings: [],
        analysisTimeMs: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // DFS: click each interactive element; on state change, IMMEDIATELY
    // recurse into the new state before continuing with siblings.
    // Skip element exploration when an overlay is open — just analyze the overlay state.
    const overlayOpen = await this.countOverlays(page) > 0;
    if (overlayOpen) {
      console.log(`  ⏩ Overlay detected — skipping element exploration (analyze only)`);
    }
    const limit = overlayOpen ? 0 : Math.min(elements.length, MAX_ELEMENTS_PER_STATE);
    for (let i = 0; i < limit; i++) {
      if (Date.now() >= deadline) return;

      const el = elements[i];
      try {
        await this.clickAndExplore(page, el, url, fingerprint, depth, deadline, breadcrumb);
      } catch {
        // Click/explore failed — continue with next element
      }
    }
  }

  /**
   * Click an interactive element, detect what changed, take a screenshot of
   * the new state, build the next breadcrumb entry, IMMEDIATELY recurse
   * depth-first, then return to the previous state.
   */
  private async clickAndExplore(
    page: Page,
    element: InteractiveElement,
    previousUrl: string,
    previousFingerprint: string,
    depth: number,
    deadline: number,
    breadcrumb: BreadcrumbEntry[],
  ): Promise<void> {
    if (Date.now() >= deadline) return;

    // Snapshot state before click — also track open pages to detect new tabs
    const urlBefore = page.url();
    const context = page.context();
    const pageCountBefore = context.pages().length;
    const overlayCountBefore = await this.countOverlays(page);
    const expandedBefore = await this.getExpandedStates(page);
    const contentHashBefore = await this.computeContentHash(page);

    // Click the element — use text/selector matching for reliability (indices shift after DOM changes)
    try {
      let target = null;

      // Strategy 1: Find by unique selector (id-based)
      if (element.selector.startsWith('#')) {
        target = await page.$(element.selector).catch(() => null);
      }

      // Strategy 2: Find by text match within interactive elements
      if (!target) {
        const handle = await page.$$(INTERACTIVE_SELECTORS);
        for (const h of handle) {
          const text = await h.textContent().catch(() => '');
          if (text?.trim().substring(0, 100) === element.text) {
            target = h;
            break;
          }
        }
      }

      // Strategy 3: Fall back to index-based (least reliable)
      if (!target) {
        const handle = await page.$$(INTERACTIVE_SELECTORS);
        target = handle[element.index] || null;
      }

      if (!target) return;

      const isVisible = await target.isVisible().catch(() => false);
      if (!isVisible) return;

      const box = await target.boundingBox().catch(() => null);
      if (!box || box.width === 0 || box.height === 0) return;

      await target.click({ timeout: 5000 });
      await page.waitForTimeout(2500); // SPAs need more time to render new content

      // Close any new tabs that opened (external links with target="_blank")
      const pagesAfter = context.pages();
      if (pagesAfter.length > pageCountBefore) {
        for (let i = pageCountBefore; i < pagesAfter.length; i++) {
          console.log(`  ⛔ Closing external tab: ${new URL(pagesAfter[i].url()).hostname}`);
          await pagesAfter[i].close().catch(() => {});
        }
      }
    } catch {
      return; // Click failed — move on
    }

    // Detect what changed
    const change = await this.detectStateChange(
      page,
      urlBefore,
      overlayCountBefore,
      expandedBefore,
      contentHashBefore,
    );

    if (change.type === 'none') return;

    // Enforce same-origin boundary — skip navigation outside the scan target
    if (change.type === 'url_change' && change.newUrl) {
      try {
        const targetOrigin = new URL(this.config.url).origin;
        const newOrigin = new URL(change.newUrl).origin;
        if (newOrigin !== targetOrigin) {
          console.log(`  ⛔ Skipping cross-origin navigation to ${new URL(change.newUrl).hostname}`);
          await this.returnToPreviousState(page, change, previousUrl, element);
          return;
        }
      } catch { /* URL parse failed — continue */ }
    }

    // Log the discovery and build next breadcrumb entry
    const label = element.text.substring(0, 40);
    let nextEntry: BreadcrumbEntry;
    switch (change.type) {
      case 'url_change':
        console.log(`  → [click] "${label}" → URL changed to ${new URL(change.newUrl!).pathname}`);
        nextEntry = { action: 'click', elementText: label, url: change.newUrl! };
        break;
      case 'overlay_opened':
        console.log(`  → [click] "${label}" → Panel opened: "${change.overlayLabel || 'overlay'}"`);
        nextEntry = { action: 'panel_opened', elementText: change.overlayLabel || label, url: page.url() };
        break;
      case 'content_expanded':
        console.log(`  → [click] "${label}" → Content expanded`);
        nextEntry = { action: 'content_expanded', elementText: label, url: page.url() };
        break;
      case 'dom_change':
        console.log(`  → [click] "${label}" → DOM content changed`);
        nextEntry = { action: 'dom_change', elementText: label, url: page.url() };
        break;
      default:
        nextEntry = { action: 'click', elementText: label, url: page.url() };
        break;
    }

    // DFS: immediately recurse into the new state with extended breadcrumb
    const via = `click: ${label} ${element.tag}`;
    const childBreadcrumb = [...breadcrumb, nextEntry];
    await this.exploreState(page, depth + 1, deadline, via, childBreadcrumb);

    // Return to previous state
    await this.returnToPreviousState(page, change, previousUrl, element);
  }

  /**
   * Classify an element into a priority tier based on its context and attributes.
   */
  private classifyElement(el: {
    text: string;
    role: string | null;
    ariaLabel: string | null;
    isInsideMain: boolean;
    isInsideNav: boolean;
    isInsideHeader: boolean;
    className: string;
    selector: string;
  }): ElementPriority {
    const text = el.text;
    const ariaLabel = el.ariaLabel || '';
    const className = el.className;

    // --- CHROME (P3): match text or aria-label against known chrome patterns ---
    for (const pattern of CHROME_TEXT_PATTERNS) {
      if (pattern.test(text)) return ElementPriority.CHROME;
    }
    for (const pattern of CHROME_ARIA_PATTERNS) {
      if (pattern.test(ariaLabel)) return ElementPriority.CHROME;
    }
    // Chrome by CSS selector/class
    for (const sel of CHROME_SELECTORS) {
      if (sel.startsWith('#')) {
        if (el.selector === sel) return ElementPriority.CHROME;
      } else if (sel.startsWith('.')) {
        if (className.includes(sel.substring(1))) return ElementPriority.CHROME;
      }
    }
    // Panel/dialog close buttons → CHROME
    if (className.includes('ms-Panel-closeButton') || className.includes('ms-Dialog-button--close')) {
      return ElementPriority.CHROME;
    }
    // Inside O365 header → CHROME
    if (el.isInsideHeader) return ElementPriority.CHROME;

    // --- CONTENT_AREA (P1): elements inside main content area ---
    // Fluent UI content patterns
    for (const sel of CONTENT_SELECTORS) {
      if (sel.startsWith('.') && className.includes(sel.substring(1))) return ElementPriority.CONTENT_AREA;
    }
    // Tabs → always content
    if (el.role === 'tab') return ElementPriority.CONTENT_AREA;
    // Rows/gridcells → always content
    if (el.role === 'row' || el.role === 'gridcell') return ElementPriority.CONTENT_AREA;
    // Elements inside [role="main"] or <main>
    if (el.isInsideMain) return ElementPriority.CONTENT_AREA;

    // --- NAVIGATION (P2): nav links ---
    for (const sel of NAV_SELECTORS) {
      if (sel.startsWith('.') && className.includes(sel.substring(1))) return ElementPriority.NAVIGATION;
    }
    if (el.isInsideNav && !el.isInsideMain) return ElementPriority.NAVIGATION;
    if (el.role === 'menuitem' && el.isInsideNav) return ElementPriority.NAVIGATION;

    // Default: if inside main → P1, otherwise → P2
    return el.isInsideMain ? ElementPriority.CONTENT_AREA : ElementPriority.NAVIGATION;
  }

  /** Find all interactive elements on the current page view, classified and sorted by priority. */
  private async findInteractiveElements(page: Page): Promise<InteractiveElement[]> {
    // Gather raw element data with classification context from the browser
    let rawElements: Array<Omit<InteractiveElement, 'priority'>> = [];
    try {
      rawElements = await page.evaluate((selector: string) => {
        const els = Array.from(document.querySelectorAll(selector));
        const seen = new Set<Element>();
        const results: any[] = [];
        const currentOrigin = window.location.origin;

        // Pre-locate main content containers
        const mainEl = document.querySelector('[role="main"], main');
        const headerEl = document.querySelector(
          '.o365cs-base, #O365_HeaderLeftRegion, #O365_HeaderRightRegion, header, [role="banner"]'
        );

        for (let i = 0; i < els.length; i++) {
          const el = els[i] as HTMLElement;
          if (seen.has(el)) continue;
          seen.add(el);

          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (el.offsetParent === null && el.style.position !== 'fixed') continue;

          // Skip external links and target="_blank" (they open new tabs we don't scan)
          if (el.tagName === 'A') {
            const anchor = el as HTMLAnchorElement;
            if (anchor.target === '_blank') continue;
            if (anchor.href && anchor.href.startsWith('http') && !anchor.href.startsWith(currentOrigin)) continue;
          }

          const text = (el.textContent?.trim() || '').substring(0, 100);
          if (!text) continue;

          results.push({
            index: i,
            text,
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role'),
            ariaExpanded: el.getAttribute('aria-expanded'),
            ariaLabel: el.getAttribute('aria-label'),
            selector: buildSelector(el),
            isInsideMain: mainEl ? mainEl.contains(el) : false,
            isInsideNav: !!el.closest('nav, [role="navigation"]'),
            isInsideHeader: headerEl ? headerEl.contains(el) : false,
            className: el.className || '',
          });
        }

        function buildSelector(el: Element): string {
          if (el.id) return `#${el.id}`;
          const tag = el.tagName.toLowerCase();
          const classes = Array.from(el.classList).slice(0, 2).join('.');
          return `${tag}${classes ? '.' + classes : ''}`;
        }

        return results;
      }, INTERACTIVE_SELECTORS);
    } catch {
      rawElements = [];
    }

    // Supplement with ARIA role-based discovery
    try {
      const a11yInteractive = await page.evaluate(() => {
        const a11yRoles = ['link', 'button', 'tab', 'menuitem', 'treeitem', 'combobox', 'listbox'];
        const found: any[] = [];
        const mainEl = document.querySelector('[role="main"], main');
        const headerEl = document.querySelector(
          '.o365cs-base, #O365_HeaderLeftRegion, #O365_HeaderRightRegion, header, [role="banner"]'
        );

        for (const role of a11yRoles) {
          const els = document.querySelectorAll(`[role="${role}"]`);
          for (const el of els) {
            const htmlEl = el as HTMLElement;
            const rect = htmlEl.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (htmlEl.offsetParent === null && htmlEl.style.position !== 'fixed') continue;

            const name = el.getAttribute('aria-label')
              || el.getAttribute('aria-labelledby')
              || el.textContent?.trim()
              || '';
            if (!name) continue;

            found.push({
              text: name.substring(0, 100),
              tag: el.tagName.toLowerCase(),
              role,
              ariaExpanded: el.getAttribute('aria-expanded'),
              ariaLabel: el.getAttribute('aria-label'),
              selector: el.id ? `#${el.id}` : `[role="${role}"]`,
              isInsideMain: mainEl ? mainEl.contains(el) : false,
              isInsideNav: !!el.closest('nav, [role="navigation"]'),
              isInsideHeader: headerEl ? headerEl.contains(el) : false,
              className: (el as HTMLElement).className || '',
            });
          }
        }
        return found;
      });

      const existingSelectors = new Set(rawElements.map(e => e.selector));
      let nextIndex = rawElements.length;

      for (const a11yEl of a11yInteractive) {
        if (!existingSelectors.has(a11yEl.selector)) {
          rawElements.push({ ...a11yEl, index: nextIndex++ });
          existingSelectors.add(a11yEl.selector);
        }
      }
    } catch {
      // a11y role discovery failed — non-fatal
    }

    // Classify each element and filter out chrome (P3)
    const classified: InteractiveElement[] = [];
    let p1Count = 0, p2Count = 0, p3Count = 0;

    for (const el of rawElements) {
      const priority = this.classifyElement(el);
      if (priority === ElementPriority.CHROME) {
        p3Count++;
        continue; // Skip chrome elements entirely
      }
      if (priority === ElementPriority.CONTENT_AREA) p1Count++;
      else p2Count++;

      classified.push({ ...el, priority });
    }

    // Sort: P1 (content) first, then P2 (navigation)
    classified.sort((a, b) => a.priority - b.priority);

    console.log(`  📊 Elements: P1=${p1Count} content, P2=${p2Count} nav, P3=${p3Count} chrome (skipped)`);

    return classified;
  }

  /** Detect what changed after a click. */
  private async detectStateChange(
    page: Page,
    urlBefore: string,
    overlayCountBefore: number,
    expandedBefore: string[],
    contentHashBefore: string,
  ): Promise<StateChange> {
    // 1. URL changed? (includes hash and query param changes)
    const urlAfter = page.url();
    if (urlAfter !== urlBefore) {
      return { type: 'url_change', newUrl: urlAfter };
    }

    // 2. New overlay appeared?
    const overlayCountAfter = await this.countOverlays(page);
    if (overlayCountAfter > overlayCountBefore) {
      const label = await this.getOverlayLabel(page);
      return { type: 'overlay_opened', overlayLabel: label };
    }

    // 3. Content expanded?
    const expandedAfter = await this.getExpandedStates(page);
    if (expandedAfter.length > expandedBefore.length) {
      return { type: 'content_expanded' };
    }

    // 4. Active tab changed? (SPA tab navigation without URL change)
    try {
      const activeTabChanged = await page.evaluate(() => {
        const activeTabs = document.querySelectorAll('[role="tab"][aria-selected="true"]');
        return Array.from(activeTabs).map(t => t.textContent?.trim() || '').join('|');
      });
      // We'll detect this via content hash below, but this hint helps
    } catch { /* non-fatal */ }

    // 5. Significant DOM change?
    const contentHashAfter = await this.computeContentHash(page);
    if (contentHashAfter !== contentHashBefore) {
      return { type: 'dom_change' };
    }

    return { type: 'none' };
  }

  /** Return to the previous state after exploring a new one. */
  private async returnToPreviousState(
    page: Page,
    change: StateChange,
    previousUrl: string,
    element: InteractiveElement,
  ): Promise<void> {
    try {
      switch (change.type) {
        case 'url_change':
          await page.goto(previousUrl, {
            waitUntil: 'domcontentloaded',
            timeout: this.config.pageTimeoutMs,
          });
          await page.waitForTimeout(1500);
          break;

        case 'overlay_opened':
          await this.closeOverlay(page);
          // Verify the overlay actually closed; if not, reload the page as fallback
          {
            const remaining = await this.countOverlays(page);
            if (remaining > 0) {
              console.log(`  ⚠ Overlay still open (${remaining} detected) after close attempt — reloading page to reset state`);
              try {
                await page.goto(previousUrl, {
                  waitUntil: 'domcontentloaded',
                  timeout: this.config.pageTimeoutMs,
                });
                await page.waitForTimeout(2000);
              } catch { /* fallback failed — continue anyway */ }
            }
          }
          break;

        case 'content_expanded':
          // Click the trigger again to collapse
          try {
            const handles = await page.$$(INTERACTIVE_SELECTORS);
            const target = handles[element.index];
            if (target) {
              await target.click({ timeout: 3000 }).catch(() => {});
              await page.waitForTimeout(500);
            }
          } catch { /* ignore */ }
          break;

        case 'dom_change':
          // DOM change — try going back to previous URL to reset
          if (page.url() !== previousUrl) {
            await page.goto(previousUrl, {
              waitUntil: 'domcontentloaded',
              timeout: this.config.pageTimeoutMs,
            });
            await page.waitForTimeout(1000);
          }
          break;
      }
    } catch {
      // Failed to return — try navigating to previous URL as fallback
      try {
        await page.goto(previousUrl, {
          waitUntil: 'domcontentloaded',
          timeout: this.config.pageTimeoutMs,
        });
        await page.waitForTimeout(1000);
      } catch { /* give up */ }
    }
  }

  /**
   * Scan and dismiss any popups, dialogs, modals, or toasts present on page load.
   * Analyzes each popup for accessibility issues BEFORE dismissing it.
   */
  private async dismissInitialPopups(page: Page): Promise<void> {
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const overlayCount = await this.countOverlays(page);
      if (overlayCount === 0) break;

      console.log(`  🔍 Scanning popup for accessibility (${overlayCount} overlay${overlayCount > 1 ? 's' : ''} detected)...`);

      // Analyze the popup state before dismissing
      try {
        const url = page.url();
        const result = await this.analyzer.analyzeCurrentPage(page);
        for (const finding of result.findings) {
          finding.pageUrl = `${normalizePageUrl(url, this.config.url)} [popup]`;
        }
        if (result.findings.length > 0) {
          console.log(`  📋 Popup has ${result.findings.length} accessibility finding(s)`);
          this.pages.push({ ...result, url: `${normalizePageUrl(url, this.config.url)} [popup]` });
        }
      } catch { /* analysis failed — still dismiss */ }

      console.log(`  🚫 Dismissing popup...`);
      const countBefore = overlayCount;
      await this.closeOverlay(page);
      await page.waitForTimeout(1000);

      // Verify the overlay actually closed; if not, try additional strategies
      const countAfter = await this.countOverlays(page);
      if (countAfter >= countBefore) {
        console.log(`  ⚠ Overlay still present after close attempt, trying text-based dismiss buttons...`);
        await this.tryTextBasedDismiss(page);
        await page.waitForTimeout(1000);
      }
    }

    // Also dismiss common portal-specific popups that may not have role="dialog"
    const portalPopupSelectors = [
      '[class*="welcome"] button',
      '[class*="Welcome"] button',
      '[class*="whatsnew"] button',
      '[class*="WhatsNew"] button',
      '[class*="onboarding"] button',
      '[class*="Onboarding"] button',
      '[class*="cookie"] button',
      '[class*="consent"] button',
      '[class*="toast"] button[class*="close"]',
      '[class*="notification"] button[class*="close"]',
      '[class*="banner"] button[class*="close"]',
      '[class*="callout"] button[class*="close"]',
      '.ms-Callout button[aria-label="Close"]',
      '.ms-TeachingBubble button[aria-label="Close"]',
    ];

    let foundPortalPopup = false;
    for (const selector of portalPopupSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn && await btn.isVisible().catch(() => false)) {
          if (!foundPortalPopup) {
            // Scan once for all portal popups before dismissing
            foundPortalPopup = true;
            try {
              const url = page.url();
              const result = await this.analyzer.analyzeCurrentPage(page);
              for (const finding of result.findings) {
                finding.pageUrl = `${normalizePageUrl(url, this.config.url)} [portal-popup]`;
              }
              if (result.findings.length > 0) {
                console.log(`  📋 Portal popup has ${result.findings.length} accessibility finding(s)`);
                this.pages.push({ ...result, url: `${normalizePageUrl(url, this.config.url)} [portal-popup]` });
              }
            } catch { /* analysis failed */ }
          }
          console.log(`  🚫 Dismissing portal popup via: ${selector}`);
          await btn.click({ timeout: 3000 });
          await page.waitForTimeout(500);
        }
      } catch { /* skip */ }
    }
  }

  /** Try to close an overlay (modal/panel/blade). */
  private async closeOverlay(page: Page): Promise<void> {
    const countBefore = await this.countOverlays(page);
    console.log(`    [closeOverlay] overlays detected: ${countBefore}`);
    if (countBefore === 0) {
      // Even if countOverlays sees nothing, there might be a panel the selectors missed.
      // Try a quick Escape and Cancel as safety net.
      try {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      } catch { /* ignore */ }
      return;
    }

    // Strategy 1: Press Escape (try twice with longer wait for animations)
    for (let i = 0; i < 2; i++) {
      try {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);
        if (await this.countOverlays(page) < countBefore) {
          console.log(`    [closeOverlay] Strategy 1 (Escape) succeeded`);
          return;
        }
      } catch { /* try next */ }
    }
    console.log(`    [closeOverlay] Strategy 1 (Escape) failed`);

    // Strategy 2: Find close/cancel button INSIDE the topmost overlay via evaluate
    try {
      const result = await page.evaluate((overlaySelectors: string) => {
        const allOverlays = document.querySelectorAll(overlaySelectors);
        // Filter to visible overlays only
        const overlays = Array.from(allOverlays).filter(el => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          const s = window.getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
        });
        if (overlays.length === 0) return { clicked: false, debug: 'no visible overlays found' };
        const topOverlay = overlays[overlays.length - 1];

        // Gather debug info
        const overlayTag = topOverlay.tagName;
        const overlayClass = (topOverlay as HTMLElement).className?.toString().substring(0, 100) || '';
        const overlayRole = topOverlay.getAttribute('role') || '';

        // Look for close buttons inside the overlay
        const closeSelectors = [
          '[aria-label="Close"]', '[aria-label="close"]',
          '[aria-label="Dismiss"]', '[aria-label="dismiss"]',
          '[aria-label="Close panel"]',
          '[aria-label="Close navigation customizer"]',
          '[data-icon-name="Cancel"]', '[data-icon-name="ChromeClose"]',
          '[data-icon-name="Dismiss"]',
          'button[class*="close"]', 'button[class*="Close"]',
          'button[class*="dismiss"]', 'button[class*="Dismiss"]',
          '.ms-Panel-closeButton',
          'button[class*="fui-Dialog"]',
          '[class*="closeButton"]', '[class*="CloseButton"]',
        ];

        for (const sel of closeSelectors) {
          const btn = topOverlay.querySelector(sel) as HTMLElement;
          if (btn && btn.offsetWidth > 0) {
            btn.click();
            return { clicked: true, debug: `selector: ${sel}` };
          }
        }

        // Fallback: find any button with close/dismiss/cancel text or X-like symbols
        const allButtons = topOverlay.querySelectorAll('button, [role="button"]');
        const buttonTexts: string[] = [];
        for (const btn of allButtons) {
          const el = btn as HTMLElement;
          if (el.offsetWidth === 0) continue;
          const text = el.textContent?.trim() || '';
          const label = el.getAttribute('aria-label') || '';
          buttonTexts.push(`"${text.substring(0, 30)}"|"${label.substring(0, 30)}"`);
          const combined = (text + ' ' + label).toLowerCase();
          if (combined.includes('close') || combined.includes('dismiss') ||
              combined.includes('cancel') || text === '✕' || text === '×' ||
              text === 'X' || text === '✖') {
            el.click();
            return { clicked: true, debug: `text button: "${text}" / "${label}"` };
          }
        }
        return { clicked: false, debug: `overlay: <${overlayTag} class="${overlayClass}" role="${overlayRole}">, buttons: [${buttonTexts.join(', ')}]` };
      }, OVERLAY_SELECTORS);

      console.log(`    [closeOverlay] Strategy 2 (in-overlay): ${result.debug}`);
      if (result.clicked) {
        await page.waitForTimeout(800);
        if (await this.countOverlays(page) < countBefore) return;
      }
    } catch (e) {
      console.log(`    [closeOverlay] Strategy 2 error: ${e}`);
    }

    // Strategy 3: Use Playwright locators to find close buttons globally
    for (const selector of CLOSE_SELECTORS) {
      try {
        const btn = await page.$(selector);
        if (btn && await btn.isVisible().catch(() => false)) {
          console.log(`    [closeOverlay] Strategy 3: clicking ${selector}`);
          await btn.click({ timeout: 3000 });
          await page.waitForTimeout(800);
          if (await this.countOverlays(page) < countBefore) return;
        }
      } catch { /* try next */ }
    }
    console.log(`    [closeOverlay] Strategy 3 (CLOSE_SELECTORS) failed`);

    // Strategy 4: Playwright text locator for close buttons anywhere on page
    const closeTexts = ['Cancel', 'Close', 'Dismiss', 'Got it', 'OK', 'Skip', 'Not now', 'No thanks'];
    for (const text of closeTexts) {
      try {
        // Try exact role=button and button elements
        const btn = page.locator(`button:has-text("${text}"), [role="button"]:has-text("${text}")`).first();
        if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
          console.log(`    [closeOverlay] Strategy 4: clicking "${text}" button`);
          await btn.click({ timeout: 3000 });
          await page.waitForTimeout(800);
          if (await this.countOverlays(page) < countBefore) return;
        }
      } catch { /* try next */ }
    }
    console.log(`    [closeOverlay] Strategy 4 (text buttons) failed`);

    // Strategy 5: Find ANY visible element with aria-label containing close/dismiss (case-insensitive)
    try {
      const closeBtn = page.locator('[aria-label*="lose" i], [aria-label*="ismiss" i], [aria-label*="ancel" i]').first();
      if (await closeBtn.isVisible({ timeout: 300 }).catch(() => false)) {
        console.log(`    [closeOverlay] Strategy 5: clicking aria-label close element`);
        await closeBtn.click({ timeout: 3000 });
        await page.waitForTimeout(800);
        if (await this.countOverlays(page) < countBefore) return;
      }
    } catch { /* try next */ }

    // Strategy 6: Click outside the overlay (top-left corner)
    try {
      console.log(`    [closeOverlay] Strategy 6: clicking outside`);
      await page.mouse.click(5, 5);
      await page.waitForTimeout(800);
    } catch { /* give up */ }
    console.log(`    [closeOverlay] All strategies exhausted, overlays remaining: ${await this.countOverlays(page).catch(() => -1)}`);
  }

  /** Try clicking buttons with common dismiss text (Got it, Close, Dismiss, OK, Skip, etc.). */
  private async tryTextBasedDismiss(page: Page): Promise<void> {
    const dismissTexts = ['Got it', 'Close', 'Dismiss', 'OK', 'Skip', 'Not now', 'Maybe later', 'No thanks'];
    for (const text of dismissTexts) {
      try {
        const btn = page.locator(`[role="dialog"] button:has-text("${text}"), [aria-modal="true"] button:has-text("${text}"), .ms-Dialog button:has-text("${text}"), .ms-Panel button:has-text("${text}"), .ms-Modal button:has-text("${text}"), .fui-DialogSurface button:has-text("${text}")`).first();
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          console.log(`  🚫 Clicking dismiss button: "${text}"`);
          await btn.click({ timeout: 3000 });
          await page.waitForTimeout(500);
          return;
        }
      } catch { /* try next text */ }
    }
  }

  /** Count currently visible overlays. */
  private async countOverlays(page: Page): Promise<number> {
    try {
      return await page.evaluate((sel: string) => {
        const els = document.querySelectorAll(sel);
        let count = 0;
        for (const el of els) {
          const rect = el.getBoundingClientRect();
          // Only count overlays that are actually visible and have dimensions
          if (rect.width > 0 && rect.height > 0) {
            const style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0) {
              count++;
            }
          }
        }
        return count;
      }, OVERLAY_SELECTORS);
    } catch {
      return 0;
    }
  }

  /** Get the accessible label of the topmost overlay. */
  private async getOverlayLabel(page: Page): Promise<string> {
    try {
      return await page.evaluate((sel: string) => {
        const overlays = document.querySelectorAll(sel);
        if (overlays.length === 0) return '';
        const last = overlays[overlays.length - 1];
        return last.getAttribute('aria-label')
          || last.getAttribute('aria-labelledby')
          || last.querySelector('h1, h2, h3, [class*="title"], [class*="Title"]')?.textContent?.trim()
          || '';
      }, OVERLAY_SELECTORS);
    } catch {
      return '';
    }
  }

  /** Get list of IDs/selectors for elements with aria-expanded="true". */
  private async getExpandedStates(page: Page): Promise<string[]> {
    try {
      return await page.evaluate(() => {
        const expanded = document.querySelectorAll('[aria-expanded="true"]');
        return Array.from(expanded).map((el, i) => el.id || `expanded-${i}`);
      });
    } catch {
      return [];
    }
  }

  /**
   * Compute a lightweight content fingerprint from visible headings + nav items.
   * Used for state deduplication even when URL hasn't changed.
   */
  private async computeFingerprint(page: Page): Promise<string> {
    try {
      const content = await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
          .map(h => h.textContent?.trim() || '')
          .join('|');
        const navItems = Array.from(document.querySelectorAll('nav a, [role="tab"], [role="menuitem"]'))
          .map(el => el.textContent?.trim() || '')
          .slice(0, 20)
          .join('|');
        return `${headings}::${navItems}`;
      });
      return createHash('md5').update(content).digest('hex').substring(0, 12);
    } catch {
      return 'unknown';
    }
  }

  /** Compute a hash of the visible content for DOM change detection. */
  private async computeContentHash(page: Page): Promise<string> {
    try {
      const content = await page.evaluate(() => {
        const main = document.querySelector('main, [role="main"], #main, .main-content');
        const target = main || document.body;
        // Hash text content + structural info (tag counts, visible element count)
        const text = (target.textContent || '').trim().substring(0, 5000);
        const headingCount = target.querySelectorAll('h1, h2, h3, h4').length;
        const tableCount = target.querySelectorAll('table, [role="grid"], [role="table"]').length;
        const tabCount = target.querySelectorAll('[role="tab"][aria-selected="true"]').length;
        const visibleChildren = target.querySelectorAll(':scope > *').length;
        return `${headingCount}:${tableCount}:${tabCount}:${visibleChildren}:${text}`;
      });
      return createHash('md5').update(content).digest('hex');
    } catch {
      return '';
    }
  }

  private totalFindings(): number {
    return this.pages.reduce((sum, p) => sum + p.findings.length, 0);
  }
}
