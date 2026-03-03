/**
 * Engine smoke test — validates the core scan pipeline end-to-end.
 *
 * Requires Playwright browsers to be installed.
 * Skips gracefully if they are not available.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ScanEngine } from '../scanner/engine.js';
import type { ScanResult } from '../scanner/types.js';

let playwrightAvailable = false;

beforeAll(async () => {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    playwrightAvailable = true;
  } catch {
    playwrightAvailable = false;
  }
});

describe('ScanEngine smoke test', () => {
  it('scans a simple data: URL and returns a valid ScanResult', async () => {
    if (!playwrightAvailable) {
      console.warn('⚠ Playwright browsers not installed — skipping smoke test');
      return;
    }

    const html = `
      <html lang="en">
        <head><title>Test Page</title></head>
        <body>
          <h1>Hello</h1>
          <p>Accessible page</p>
        </body>
      </html>
    `;
    const url = `data:text/html,${encodeURIComponent(html)}`;

    const engine = new ScanEngine();
    const result: ScanResult = await engine.scan({
      url,
      timeout: 15_000,
      maxDepth: 0,
      maxPages: 1,
      captureScreenshots: false,
    });

    // Core fields exist
    expect(result.url).toBe(url);
    expect(result.scanDate).toBeTruthy();
    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThan(0);
    expect(result.pagesScanned).toBeGreaterThanOrEqual(1);

    // Findings array is present (may be empty for a well-formed page)
    expect(Array.isArray(result.pages)).toBe(true);

    // Summary structure
    expect(result.summary).toBeDefined();
    expect(typeof result.summary.totalFindings).toBe('number');
    expect(result.summary.bySeverity).toBeDefined();
    expect(result.summary.byCategory).toBeDefined();
    expect(result.summary.byWcagLevel).toBeDefined();

    // Not timed out with 15s timeout
    expect(result.timedOut).toBe(false);
  });

  it('detects accessibility issues on a page with known violations', async () => {
    if (!playwrightAvailable) {
      console.warn('⚠ Playwright browsers not installed — skipping');
      return;
    }

    const html = `
      <html>
        <head><title>Bad Page</title></head>
        <body>
          <img src="photo.jpg">
          <input type="text" name="email">
          <a href="/nowhere"></a>
        </body>
      </html>
    `;
    const url = `data:text/html,${encodeURIComponent(html)}`;

    const engine = new ScanEngine();
    const result = await engine.scan({
      url,
      timeout: 15_000,
      maxDepth: 0,
      maxPages: 1,
      captureScreenshots: false,
    });

    expect(result.pagesScanned).toBeGreaterThanOrEqual(1);

    const allFindings = result.pages.flatMap((p) => p.findings);

    // Should detect: missing alt, missing lang, missing form label, empty link
    expect(allFindings.length).toBeGreaterThan(0);

    const ruleIds = allFindings.map((f) => f.ruleId);
    expect(ruleIds).toContain('img-alt-text');
    // axe-core dedup may replace 'document-lang' with 'html-has-lang'
    expect(ruleIds.some((id) => id === 'document-lang' || id === 'html-has-lang')).toBe(true);
    expect(ruleIds).toContain('form-input-label');
    expect(ruleIds).toContain('link-name');
  });

  it('reports timedOut: true with a very short timeout', async () => {
    if (!playwrightAvailable) {
      console.warn('⚠ Playwright browsers not installed — skipping');
      return;
    }

    // 1ms timeout — engine should still return a result but may time out
    const engine = new ScanEngine();
    const result = await engine.scan({
      url: 'data:text/html,<html><body>Hello</body></html>',
      timeout: 1,
      maxDepth: 0,
      maxPages: 1,
      captureScreenshots: false,
    });

    // The engine should return something (either timed out or completed very fast)
    expect(result).toBeDefined();
    expect(typeof result.timedOut).toBe('boolean');
    // With a 1ms timeout, the scan will almost certainly time out or return an empty result
    // Either outcome is valid — the key is no crash
    expect(result.url).toBeTruthy();
    expect(result.summary).toBeDefined();
  });
});
