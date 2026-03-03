/**
 * PageAnalyzer unit test — validates individual a11y checks
 * against pages with known accessibility violations.
 *
 * Requires Playwright browsers to be installed.
 * Uses data: URLs so the analyzer's own page.goto() loads the HTML.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { PageAnalyzer } from '../scanner/page-analyzer.js';
import { DEFAULT_SCAN_CONFIG } from '../scanner/types.js';

let browser: Browser | null = null;
let playwrightAvailable = false;

beforeAll(async () => {
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    playwrightAvailable = true;
  } catch {
    playwrightAvailable = false;
  }
});

afterAll(async () => {
  if (browser) await browser.close();
});

function dataUrl(html: string): string {
  return `data:text/html,${encodeURIComponent(html)}`;
}

describe('PageAnalyzer', () => {
  const analyzer = new PageAnalyzer({
    ...DEFAULT_SCAN_CONFIG,
    captureScreenshots: false,
    pageTimeoutMs: 10_000,
  });

  async function newPage(): Promise<{ page: Page; context: BrowserContext } | null> {
    if (!browser) return null;
    const context = await browser.newContext();
    const page = await context.newPage();
    return { page, context };
  }

  it('detects images missing alt text (WCAG 1.1.1)', async () => {
    if (!playwrightAvailable) return;
    const ctx = await newPage();
    if (!ctx) return;

    try {
      const url = dataUrl(`
        <html lang="en"><body>
          <img src="hero.jpg">
          <img src="icon.png" alt="icon">
          <img src="logo.svg">
        </body></html>
      `);
      const result = await analyzer.analyze(ctx.page, url);
      const imgFindings = result.findings.filter((f) => f.ruleId === 'img-alt-text');

      expect(imgFindings.length).toBe(2);
      expect(imgFindings.every((f) => f.severity === 'critical')).toBe(true);
      expect(imgFindings.every((f) => f.wcagCriterion === '1.1.1')).toBe(true);
    } finally {
      await ctx.context.close();
    }
  });

  it('detects form inputs missing labels (WCAG 1.3.1)', async () => {
    if (!playwrightAvailable) return;
    const ctx = await newPage();
    if (!ctx) return;

    try {
      const url = dataUrl(`
        <html lang="en"><body><form>
          <input type="text" name="firstName">
          <input type="email" name="email" aria-label="Email address">
          <select name="country"></select>
          <textarea name="bio"></textarea>
        </form></body></html>
      `);
      const result = await analyzer.analyze(ctx.page, url);
      const formFindings = result.findings.filter((f) => f.ruleId === 'form-input-label');

      // firstName, country, bio are unlabeled; email has aria-label
      expect(formFindings.length).toBe(3);
      expect(formFindings.every((f) => f.severity === 'critical')).toBe(true);
    } finally {
      await ctx.context.close();
    }
  });

  it('detects missing document language (WCAG 3.1.1)', async () => {
    if (!playwrightAvailable) return;
    const ctx = await newPage();
    if (!ctx) return;

    try {
      const url = dataUrl(`<html><body><h1>No lang</h1></body></html>`);
      const result = await analyzer.analyze(ctx.page, url);
      // axe-core dedup may replace 'document-lang' with 'html-has-lang'
      const langFindings = result.findings.filter(
        (f) => f.ruleId === 'document-lang' || f.ruleId === 'html-has-lang'
      );

      expect(langFindings.length).toBeGreaterThanOrEqual(1);
      expect(langFindings[0].wcagCriterion).toMatch(/^3\.1\.1$|^$/); // hand-rolled has '3.1.1', axe may differ
    } finally {
      await ctx.context.close();
    }
  });

  it('detects empty links (WCAG 2.4.4)', async () => {
    if (!playwrightAvailable) return;
    const ctx = await newPage();
    if (!ctx) return;

    try {
      const url = dataUrl(`
        <html lang="en"><body>
          <h1>Test</h1>
          <a href="/page1"></a>
          <a href="/page2">Visible text</a>
        </body></html>
      `);
      const result = await analyzer.analyze(ctx.page, url);
      const linkFindings = result.findings.filter((f) => f.ruleId === 'link-name');

      expect(linkFindings.length).toBeGreaterThanOrEqual(1);
    } finally {
      await ctx.context.close();
    }
  });

  it('detects heading hierarchy issues (WCAG 1.3.1)', async () => {
    if (!playwrightAvailable) return;
    const ctx = await newPage();
    if (!ctx) return;

    try {
      const url = dataUrl(`
        <html lang="en"><body>
          <h1>Main</h1>
          <h3>Skipped h2</h3>
        </body></html>
      `);
      const result = await analyzer.analyze(ctx.page, url);
      // axe-core dedup may replace 'heading-hierarchy' with 'heading-order'
      const headingFindings = result.findings.filter(
        (f) => f.ruleId === 'heading-hierarchy' || f.ruleId === 'heading-order'
      );

      expect(headingFindings.length).toBeGreaterThanOrEqual(1);
    } finally {
      await ctx.context.close();
    }
  });

  it('returns clean result for a well-formed page', async () => {
    if (!playwrightAvailable) return;
    const ctx = await newPage();
    if (!ctx) return;

    try {
      const url = dataUrl(`
        <html lang="en"><head><title>Good Page</title></head><body>
          <h1>Welcome</h1>
          <h2>Section</h2>
          <p>Content</p>
          <img src="photo.jpg" alt="A photo">
          <a href="/about">About us</a>
          <form>
            <label for="name">Name</label>
            <input id="name" type="text">
          </form>
        </body></html>
      `);
      const result = await analyzer.analyze(ctx.page, url);
      // Well-formed page: no critical img-alt or form-label findings
      const criticalFindings = result.findings.filter(
        (f) => f.severity === 'critical'
      );
      expect(criticalFindings.length).toBe(0);
    } finally {
      await ctx.context.close();
    }
  });

  it('axe-core runs and produces diagnostic output', async () => {
    if (!playwrightAvailable) return;
    const ctx = await newPage();
    if (!ctx) return;

    try {
      // Page with known violations — axe-core MUST find something
      const url = dataUrl(`
        <html lang="en"><body>
          <img src="test.jpg">
          <a href="/foo"></a>
          <button></button>
        </body></html>
      `);
      const result = await analyzer.analyze(ctx.page, url);
      // axe-core should detect at least image-alt or link-name violations
      const axeFindings = result.findings.filter(
        f => f.ruleId === 'image-alt' || f.ruleId === 'link-name' || f.ruleId === 'button-name'
      );
      expect(axeFindings.length).toBeGreaterThanOrEqual(1);
    } finally {
      await ctx.context.close();
    }
  });

  it('analyzeCurrentPage works without navigating (for deep explorer)', async () => {
    if (!playwrightAvailable) return;
    const ctx = await newPage();
    if (!ctx) return;

    try {
      // Navigate manually, then use analyzeCurrentPage (like deep explorer does)
      const url = dataUrl(`
        <html lang="en"><body>
          <h1>Hello</h1>
          <img src="no-alt.png">
        </body></html>
      `);
      await ctx.page.goto(url);
      const result = await analyzer.analyzeCurrentPage(ctx.page);
      expect(result.url).toContain('data:text/html');
      // Should find img-alt violation
      const imgFindings = result.findings.filter(f => f.ruleId === 'image-alt');
      expect(imgFindings.length).toBeGreaterThanOrEqual(1);
    } finally {
      await ctx.context.close();
    }
  });
});
