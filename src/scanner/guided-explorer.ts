/**
 * GuidedExplorer — executes test plan scenarios step-by-step using Playwright,
 * running a11y analysis after each step, with optional auto-exploration.
 *
 * Flow per scenario:
 *   1. Execute step (navigate, click, type, etc.)
 *   2. Run a11y analysis on the resulting page state
 *   3. Optionally auto-explore 1 level deep from the step's end state
 *   4. Capture screenshot + timing
 *   5. Collect GuidedStepResult
 */

import type { BrowserContext, Page } from 'playwright';
import type {
  ImportedTestScenario,
  TestAction,
} from '../ado/types.js';
import type {
  ScanConfig,
  PageResult,
  Finding,
  GuidedStepResult,
  GuidedExplorationResult,
} from './types.js';
import type { PageSnapshot, A11yTreeNode, InteractiveElement } from './patterns/types.js';
import { PageAnalyzer } from './page-analyzer.js';
import { DeepExplorer } from './deep-explorer.js';

/** Short timeout for waiting after actions (ms) */
const ACTION_SETTLE_MS = 2000;
/** Timeout for individual Playwright locator operations (ms) */
const LOCATOR_TIMEOUT_MS = 5000;
/** Fallback locator timeout (ms) */
const FALLBACK_TIMEOUT_MS = 3000;
/** Error page indicators (lowercase) — exported for testing */
export const ERROR_PAGE_INDICATORS = [
  'page not found', 'access denied', 'you don\'t have access',
  'resource not found', 'not authorized', 'forbidden', '404', '403',
  'oops', 'ran into a problem', 'please refresh', 'something went wrong',
  'this page isn\'t working', 'cannot be reached', 'took too long',
  'error loading', 'failed to load', 'unable to load',
];

export class GuidedExplorer {
  /** A11y snapshots captured during execution (for pattern extraction) */
  private snapshots: PageSnapshot[] = [];

  constructor(
    private config: ScanConfig,
    private analyzer: PageAnalyzer,
  ) {}

  /**
   * Execute all scenarios sequentially. Each scenario's steps are executed
   * in order; a11y analysis runs after every step that changes page state.
   */
  async execute(
    context: BrowserContext,
    scenarios: ImportedTestScenario[],
    deadline: number,
  ): Promise<GuidedExplorationResult> {
    const allPages: PageResult[] = [];
    const allStepResults: GuidedStepResult[] = [];

    for (const scenario of scenarios) {
      if (Date.now() >= deadline) break;

      const page = await context.newPage();
      try {
        const stepResults = await this.executeScenario(page, scenario, deadline);
        allStepResults.push(...stepResults);

        // Collect page results from all successful steps (track coverage even without findings)
        for (const step of stepResults) {
          if (step.success) {
            allPages.push({
              url: step.urlAfterStep,
              metadata: {
                url: step.urlAfterStep,
                title: step.stepText,
                lang: null,
                metaDescription: null,
                metaViewport: null,
                h1Count: 0,
              },
              findings: [...step.findings, ...step.explorationFindings],
              analysisTimeMs: step.durationMs,
              screenshot: step.screenshot,
            });
          }
        }
      } finally {
        await page.close();
      }
    }

    const successfulSteps = allStepResults.filter(s => s.success).length;
    const failedSteps = allStepResults.filter(s => !s.success).length;
    const totalFindings = allStepResults.reduce(
      (sum, s) => sum + s.findings.length + s.explorationFindings.length,
      0,
    );

    return {
      pages: allPages,
      stepResults: allStepResults,
      totalSteps: allStepResults.length,
      successfulSteps,
      failedSteps,
      totalFindings,
    };
  }

  /** Return captured a11y snapshots (for pattern extraction) */
  getSnapshots(): PageSnapshot[] {
    return this.snapshots;
  }

  /**
   * Execute a single scenario's steps sequentially on the given page.
   */
  private async executeScenario(
    page: Page,
    scenario: ImportedTestScenario,
    deadline: number,
  ): Promise<GuidedStepResult[]> {
    const results: GuidedStepResult[] = [];

    for (let i = 0; i < scenario.actions.length; i++) {
      if (Date.now() >= deadline) break;

      const action = scenario.actions[i];
      const stepText = scenario.rawSteps[i]?.actionText ?? this.actionToText(action);

      const result = await this.executeStep(page, action, stepText, i);
      result.adoTestCaseId = scenario.adoTestCaseId || undefined;

      // Run auto-exploration from this step's end state if configured
      if (
        result.success &&
        this.config.testPlan?.autoExploreAfterSteps !== false &&
        Date.now() < deadline
      ) {
        try {
          const explorer = new DeepExplorer(this.config, this.analyzer);
          const stepDeadline = Math.min(
            deadline,
            Date.now() + 30_000, // cap exploration at 30s per step
          );
          const context = page.context();
          const { pages: exploredPages } = await explorer.explore(context, stepDeadline);
          for (const ep of exploredPages) {
            result.explorationFindings.push(...ep.findings);
          }
        } catch (err) {
          // Exploration failure is non-fatal
          console.warn(
            `[guided] Auto-exploration failed after step ${i}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Execute a single test step and run a11y analysis on the resulting state.
   */
  private async executeStep(
    page: Page,
    action: TestAction,
    stepText: string,
    stepIndex: number,
  ): Promise<GuidedStepResult> {
    const start = Date.now();
    const result: GuidedStepResult = {
      stepIndex,
      stepText,
      success: false,
      action: action.type,
      urlAfterStep: page.url(),
      findings: [],
      explorationFindings: [],
      durationMs: 0,
    };

    try {
      await this.executeAction(page, action);
      result.success = true;
      result.urlAfterStep = page.url();

      // Capture a11y snapshot for pattern extraction (when learn mode is enabled)
      if (this.config.learn || this.config.captureSnapshots) {
        try {
          const snapshot = await this.captureSnapshot(page, stepIndex);
          this.snapshots.push(snapshot);
        } catch {
          // Snapshot failure is non-fatal
        }
      }

      // Capture screenshot after step
      try {
        const screenshotBuffer = await page.screenshot({ fullPage: false });
        result.screenshot = screenshotBuffer.toString('base64');
      } catch {
        // Screenshot failure is non-fatal
      }

      // Run a11y analysis on the current page state
      try {
        const reproSteps = [`Step ${stepIndex + 1}: ${stepText}`];
        const pageResult = await this.analyzer.analyzeCurrentPage(page, reproSteps);
        result.findings = pageResult.findings;
      } catch (err) {
        console.warn(
          `[guided] A11y analysis failed after step ${stepIndex}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      console.warn(`[guided] Step ${stepIndex} failed: ${result.error}`);
    }

    result.durationMs = Date.now() - start;
    return result;
  }

  /**
   * Execute a single Playwright action.
   * Improved over hybrid-scanner's executeAction():
   *   - click: getByRole → getByText → CSS selector
   *   - type: getByLabel → getByPlaceholder → CSS selector
   *   - Waits for network idle after each action
   */
  private async executeAction(page: Page, action: TestAction): Promise<void> {
    switch (action.type) {
      case 'navigate': {
        // Validate URL — if invalid (e.g., HTML-polluted text), fall back to UI nav
        let isValidUrl = false;
        try { new URL(action.url); isValidUrl = true; } catch { /* not a URL */ }
        if (isValidUrl) {
          await this.smartNavigate(page, action.url);
        } else {
          // Try to navigate via UI using the text as a hint
          const intent = this.extractNavigationIntent(action.url);
          if (intent) {
            await this.navigateViaUI(page, intent);
          } else {
            throw new Error(`Invalid URL and no navigation intent: "${action.url.slice(0, 100)}"`);
          }
        }
        break;
      }

      case 'click':
        await this.clickElement(page, action.target);
        await page.waitForLoadState('networkidle', { timeout: ACTION_SETTLE_MS }).catch(() => {});
        break;

      case 'type':
        await this.fillElement(page, action.target, action.value);
        break;

      case 'select':
        try {
          await page.selectOption(action.target, action.value, { timeout: FALLBACK_TIMEOUT_MS });
        } catch {
          // Try getByLabel for accessible select
          try {
            const locator = page.getByLabel(action.target, { exact: false }).first();
            await locator.selectOption(action.value, { timeout: FALLBACK_TIMEOUT_MS });
          } catch {
            // Dropdown not found — skip
          }
        }
        break;

      case 'wait':
        await page.waitForTimeout(ACTION_SETTLE_MS);
        break;

      case 'verify':
      case 'unknown':
        // No browser interaction
        break;
    }
  }

  /**
   * Click an element using a cascading locator strategy:
   *   1. getByRole (button/link/tab with accessible name)
   *   2. getByText (visible text match)
   *   3. CSS selector fallback
   */
  private async clickElement(page: Page, target: string): Promise<void> {
    // Strip surrounding quotes from target
    const cleanTarget = target.replace(/^['"]|['"]$/g, '');

    // Try getByRole for common roles
    for (const role of ['button', 'link', 'tab', 'menuitem'] as const) {
      try {
        const locator = page.getByRole(role, { name: cleanTarget, exact: false }).first();
        await locator.click({ timeout: LOCATOR_TIMEOUT_MS });
        return;
      } catch {
        // Try next role
      }
    }

    // Try getByText
    try {
      const locator = page.getByText(cleanTarget, { exact: false }).first();
      await locator.click({ timeout: LOCATOR_TIMEOUT_MS });
      return;
    } catch {
      // Fall through
    }

    // CSS selector fallback — target might be a valid selector
    try {
      await page.click(cleanTarget, { timeout: FALLBACK_TIMEOUT_MS });
    } catch {
      throw new Error(`Could not find clickable element: "${cleanTarget}"`);
    }
  }

  /**
   * Fill an element using a cascading locator strategy:
   *   1. getByLabel (accessible label match)
   *   2. getByPlaceholder
   *   3. CSS selector fallback
   */
  private async fillElement(page: Page, target: string, value: string): Promise<void> {
    const cleanTarget = target.replace(/^['"]|['"]$/g, '');

    // Try getByLabel
    try {
      const locator = page.getByLabel(cleanTarget, { exact: false }).first();
      await locator.fill(value, { timeout: LOCATOR_TIMEOUT_MS });
      return;
    } catch {
      // Fall through
    }

    // Try getByPlaceholder
    try {
      const locator = page.getByPlaceholder(cleanTarget, { exact: false }).first();
      await locator.fill(value, { timeout: LOCATOR_TIMEOUT_MS });
      return;
    } catch {
      // Fall through
    }

    // CSS selector fallback
    try {
      await page.fill(cleanTarget, value, { timeout: FALLBACK_TIMEOUT_MS });
    } catch {
      throw new Error(`Could not find input element: "${cleanTarget}"`);
    }
  }

  /**
   * Capture an a11y snapshot of the current page state.
   * Walks the DOM to collect interactive elements, landmarks, headings,
   * and builds an a11y tree from ARIA roles.
   */
  private async captureSnapshot(page: Page, stepIndex: number): Promise<PageSnapshot> {
    const url = page.url();

    const domData = await page.evaluate(() => {
      // Collect interactive elements
      const interactiveSelectors = [
        'button', '[role="button"]', 'a[href]', '[role="link"]',
        '[role="tab"]', '[role="menuitem"]', '[role="treeitem"]',
        '[role="option"]', 'input', 'select', 'textarea',
        '[role="checkbox"]', '[role="radio"]', '[role="slider"]',
        '[role="switch"]', '[role="combobox"]', '[role="spinbutton"]',
      ];
      const interactiveElements: Array<{
        role: string; name: string; selector: string;
        tag: string; ariaLabel: string | null;
        isInsideMain: boolean; isInsideNav: boolean; isInsideHeader: boolean;
        disabled: boolean;
      }> = [];

      const seen = new Set<Element>();
      for (const sel of interactiveSelectors) {
        for (const el of document.querySelectorAll(sel)) {
          if (seen.has(el)) continue;
          seen.add(el);
          const htmlEl = el as HTMLElement;
          interactiveElements.push({
            role: el.getAttribute('role') || el.tagName.toLowerCase(),
            name: htmlEl.textContent?.trim().slice(0, 100) || '',
            selector: buildSelector(el),
            tag: el.tagName.toLowerCase(),
            ariaLabel: el.getAttribute('aria-label'),
            isInsideMain: !!el.closest('main, [role="main"]'),
            isInsideNav: !!el.closest('nav, [role="navigation"]'),
            isInsideHeader: !!el.closest('header, [role="banner"]'),
            disabled: htmlEl.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
          });
        }
      }

      // Collect landmarks
      const landmarkRoles = ['main', 'navigation', 'banner', 'complementary', 'contentinfo', 'search', 'form', 'region'];
      const landmarks: Array<{ role: string; label: string | null; selector: string }> = [];
      for (const role of landmarkRoles) {
        for (const el of document.querySelectorAll(`[role="${role}"], ${role === 'banner' ? 'header' : role === 'contentinfo' ? 'footer' : role === 'navigation' ? 'nav' : role}`)) {
          landmarks.push({
            role: el.getAttribute('role') || el.tagName.toLowerCase(),
            label: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || null,
            selector: buildSelector(el),
          });
        }
      }

      // Collect headings
      const headings: Array<{ level: number; text: string }> = [];
      for (const el of document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')) {
        const level = el.getAttribute('aria-level')
          ? parseInt(el.getAttribute('aria-level')!, 10)
          : parseInt(el.tagName.replace('H', ''), 10) || 0;
        headings.push({
          level,
          text: (el as HTMLElement).textContent?.trim().slice(0, 200) || '',
        });
      }

      // Build simplified a11y tree from ARIA roles
      function buildA11yTree(root: Element, depth: number): Array<{
        role: string; name: string; expanded?: boolean; selected?: boolean; disabled?: boolean; children?: any[];
      }> {
        if (depth > 5) return [];
        const nodes: Array<{
          role: string; name: string; expanded?: boolean; selected?: boolean; disabled?: boolean; children?: any[];
        }> = [];
        for (const child of root.children) {
          const role = child.getAttribute('role') || child.tagName.toLowerCase();
          // Only include semantically meaningful elements
          if (role === 'div' || role === 'span') continue;
          const node: any = {
            role,
            name: child.getAttribute('aria-label') || (child as HTMLElement).textContent?.trim().slice(0, 100) || '',
          };
          if (child.getAttribute('aria-expanded')) {
            node.expanded = child.getAttribute('aria-expanded') === 'true';
          }
          if (child.getAttribute('aria-selected')) {
            node.selected = child.getAttribute('aria-selected') === 'true';
          }
          if ((child as HTMLElement).hasAttribute('disabled') || child.getAttribute('aria-disabled') === 'true') {
            node.disabled = true;
          }
          const childNodes = buildA11yTree(child, depth + 1);
          if (childNodes.length > 0) {
            node.children = childNodes;
          }
          nodes.push(node);
        }
        return nodes;
      }

      function buildSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        const role = el.getAttribute('role');
        const label = el.getAttribute('aria-label');
        if (role && label) return `[role="${role}"][aria-label="${label}"]`;
        if (role) return `[role="${role}"]`;
        return el.tagName.toLowerCase();
      }

      const a11yTree = buildA11yTree(document.body, 0);

      return { interactiveElements, landmarks, headings, a11yTree };
    });

    return {
      url,
      stepIndex,
      accessibilityTree: domData.a11yTree as A11yTreeNode[],
      interactiveElements: domData.interactiveElements as InteractiveElement[],
      landmarks: domData.landmarks,
      headings: domData.headings,
    };
  }

  // -------------------------------------------------------------------------
  // Smart URL rewriting + fallback navigation
  // -------------------------------------------------------------------------

  /**
   * Rewrite a URL from a test plan to match the scan target's domain and tenant.
   * Delegates to the exported standalone function.
   */
  private rewriteUrlForTarget(originalUrl: string): string[] {
    return rewriteUrlForTarget(originalUrl, this.config.url);
  }

  /**
   * Navigate using rewritten URLs with automatic fallback.
   * Tries each URL variant; if all fail, falls back to UI navigation.
   */
  private async smartNavigate(page: Page, originalUrl: string): Promise<void> {
    // Clean HTML entities that may survive from ADO test step XML (e.g. &amp; → &)
    const cleanedUrl = originalUrl.replace(/&amp;/gi, '&');
    const urls = this.rewriteUrlForTarget(cleanedUrl);

    for (const url of urls) {
      try {
        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: this.config.pageTimeoutMs,
        });
        await page.waitForLoadState('networkidle', { timeout: ACTION_SETTLE_MS }).catch(() => {});
        // Wait extra for SPA error messages to render
        await page.waitForTimeout(2000);

        // Check for HTTP error status
        if (response && response.status() >= 400) {
          console.log(`  ⚠ URL returned HTTP ${response.status()}: ${url.substring(0, 80)}...`);
          continue;
        }

        // Check for error page content
        const isErrorPage = await page.evaluate((indicators) => {
          const text = document.body?.innerText?.toLowerCase() || '';
          return indicators.some(ind => text.includes(ind));
        }, ERROR_PAGE_INDICATORS).catch(() => false);

        if (!isErrorPage) return; // Success
        console.log(`  ⚠ Error page detected, trying next URL variant...`);
      } catch {
        continue; // Try next URL variant
      }
    }

    // All URL attempts failed — try to find the destination via UI navigation
    const intent = this.extractNavigationIntent(originalUrl);
    if (intent) {
      console.log(`  🔄 URL navigation failed — trying UI navigation for "${intent.section || intent.tab || intent.path}"`);
      await this.navigateViaUI(page, intent);
    } else {
      throw new Error(`Could not navigate to any variant of "${originalUrl.slice(0, 100)}"`);
    }
  }

  /**
   * Extract semantic navigation intent from a URL.
   * E.g., `/cloud-resource/v2?viewid=sensitive-data` → { path: '/cloud-resource/v2', section: 'cloud resource', tab: 'sensitive data' }
   */
  private extractNavigationIntent(urlOrText: string): { path: string; section?: string; tab?: string } | null {
    try {
      const parsed = new URL(urlOrText);
      const path = parsed.pathname;
      const viewid = parsed.searchParams.get('viewid');
      // Last meaningful path segment, e.g., 'cloud-resource' from '/cloud-resource/v2'
      const segments = path.split('/').filter(s => s && s !== 'v2' && s !== 'v1');
      const section = segments.pop()?.replace(/[-_]/g, ' ');
      const tab = viewid?.replace(/[-_]/g, ' ');
      return { path, section, tab };
    } catch {
      // Not a URL — treat as a text hint
      const cleaned = urlOrText.replace(/[<>"']/g, '').replace(/[-_]/g, ' ').trim();
      if (cleaned.length > 0 && cleaned.length < 200) {
        return { path: '', section: cleaned };
      }
      return null;
    }
  }

  /**
   * Navigate to a page by finding and clicking matching nav elements in the UI.
   * Tries section name then tab name against links, tabs, menuitems.
   */
  private async navigateViaUI(page: Page, intent: { path: string; section?: string; tab?: string }): Promise<void> {
    const searchTerms = [intent.tab, intent.section].filter(Boolean) as string[];

    for (const term of searchTerms) {
      const humanReadable = term.replace(/[-_]/g, ' ');

      // Try accessible roles first (link, tab, menuitem, button)
      for (const role of ['link', 'tab', 'menuitem', 'treeitem', 'button'] as const) {
        try {
          const locator = page.getByRole(role, { name: humanReadable, exact: false }).first();
          await locator.click({ timeout: LOCATOR_TIMEOUT_MS });
          await page.waitForLoadState('networkidle', { timeout: ACTION_SETTLE_MS }).catch(() => {});
          return;
        } catch {
          continue;
        }
      }

      // Try getByText as fallback
      try {
        const locator = page.getByText(humanReadable, { exact: false }).first();
        await locator.click({ timeout: LOCATOR_TIMEOUT_MS });
        await page.waitForLoadState('networkidle', { timeout: ACTION_SETTLE_MS }).catch(() => {});
        return;
      } catch {
        continue;
      }
    }

    throw new Error(`Could not find UI element for "${searchTerms.join('" or "')}"`);
  }

  /** Convert a TestAction back to human-readable text */
  private actionToText(action: TestAction): string {
    switch (action.type) {
      case 'navigate':
        return `Navigate to ${action.url}`;
      case 'click':
        return `Click "${action.target}"`;
      case 'type':
        return `Type "${action.value}" into "${action.target}"`;
      case 'select':
        return `Select "${action.value}" from "${action.target}"`;
      case 'verify':
        return action.description;
      case 'wait':
        return action.description;
      case 'unknown':
        return action.rawText;
    }
  }
}

// ---------------------------------------------------------------------------
// Exported utility functions (testable without instantiating classes)
// ---------------------------------------------------------------------------

/**
 * Rewrite a URL from a test plan to match a scan target's domain and tenant.
 * Returns an ordered array of URLs to try, from most specific to least:
 *   1. Full rewrite (domain + tid replaced, resource id kept)
 *   2. Without resource-specific 'id' param
 *   3. Path + meaningful params only (viewid, tab)
 */
export function rewriteUrlForTarget(originalUrl: string, scanTargetUrl: string): string[] {
  try {
    const cleanUrl = originalUrl.replace(/&amp;/gi, '&');
    const scanTarget = new URL(scanTargetUrl);
    const parsed = new URL(cleanUrl);

    const sameDomain = parsed.hostname === scanTarget.hostname;
    const msPortals = ['security.microsoft.com', 'portal.azure.com', 'compliance.microsoft.com', 'admin.microsoft.com'];
    const originalIsMsPortal = msPortals.some(p => parsed.hostname.includes(p));
    const targetIsMsPortal = msPortals.some(p => scanTarget.hostname.includes(p));
    // Allow cross-domain rewrite only between known MS portals
    if (!sameDomain && !(originalIsMsPortal && targetIsMsPortal)) return [originalUrl];

    const urls: string[] = [];

    parsed.hostname = scanTarget.hostname;
    parsed.protocol = scanTarget.protocol;
    if (scanTarget.port) parsed.port = scanTarget.port;

    const targetTid = scanTarget.searchParams.get('tid');
    if (targetTid) {
      if (parsed.searchParams.has('tid')) {
        parsed.searchParams.set('tid', targetTid);
      } else {
        parsed.searchParams.append('tid', targetTid);
      }
    }

    urls.push(parsed.toString());

    if (parsed.searchParams.has('id')) {
      const noId = new URL(parsed.toString());
      noId.searchParams.delete('id');
      urls.push(noId.toString());
    }

    const pathOnly = new URL(scanTarget.origin + parsed.pathname);
    if (targetTid) pathOnly.searchParams.set('tid', targetTid);
    const viewid = parsed.searchParams.get('viewid');
    if (viewid) pathOnly.searchParams.set('viewid', viewid);
    urls.push(pathOnly.toString());

    return [...new Set(urls)];
  } catch {
    return [originalUrl];
  }
}

/**
 * Check if page text contains error page indicators.
 * Useful for testing the error detection logic without a browser.
 */
export function isErrorPageContent(pageText: string): boolean {
  const lower = pageText.toLowerCase();
  return ERROR_PAGE_INDICATORS.some(ind => lower.includes(ind));
}
