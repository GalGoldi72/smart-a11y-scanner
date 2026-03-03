/**
 * Report output tests — validates JSON and CSV report generation
 * against a mock ScanResult. Pure unit tests, no browser needed.
 */

import { describe, it, expect } from 'vitest';
import { generateJsonReport } from '../reporting/formats/json-reporter.js';
import { generateCsvReport } from '../reporting/formats/csv-reporter.js';
import type { ScanResult, ScanConfig, Finding, PageResult } from '../scanner/types.js';

/** Build a realistic mock ScanResult for testing */
function createMockScanResult(findingsCount = 3): ScanResult {
  const config: ScanConfig = {
    url: 'https://example.com',
    maxDepth: 1,
    sameDomainOnly: true,
    maxPages: 10,
    pageTimeoutMs: 30_000,
    timeout: 600_000,
    headless: true,
    viewportWidth: 1280,
    viewportHeight: 720,
    captureScreenshots: false,
  };

  const findings: Finding[] = [
    {
      ruleId: 'img-alt-text',
      category: 'semantic-html' as any,
      severity: 'critical',
      wcagLevel: 'A',
      wcagCriterion: '1.1.1',
      message: 'Image missing alt attribute: hero.jpg',
      selector: 'img:nth-of-type(1)',
      pageUrl: 'https://example.com',
      htmlSnippet: '<img src="hero.jpg">',
      remediation: 'Add an alt attribute describing the image.',
    },
    {
      ruleId: 'form-input-label',
      category: 'forms',
      severity: 'critical',
      wcagLevel: 'A',
      wcagCriterion: '1.3.1',
      message: 'Form input missing accessible label',
      selector: 'input[type="text"]',
      pageUrl: 'https://example.com',
      htmlSnippet: '<input type="text" name="search">',
      remediation: 'Add a <label> or aria-label.',
    },
    {
      ruleId: 'document-lang',
      category: 'language-text' as any,
      severity: 'serious' as any,
      wcagLevel: 'A',
      wcagCriterion: '3.1.1',
      message: 'Document missing lang attribute',
      selector: 'html',
      pageUrl: 'https://example.com',
      htmlSnippet: '<html>',
      remediation: 'Add lang="en" to <html>.',
    },
  ].slice(0, findingsCount);

  const page: PageResult = {
    url: 'https://example.com',
    metadata: {
      url: 'https://example.com',
      title: 'Example Page',
      lang: null,
      metaDescription: null,
      metaViewport: 'width=device-width',
      h1Count: 1,
    },
    findings,
    analysisTimeMs: 1500,
  };

  return {
    url: 'https://example.com',
    scanDate: '2025-01-15T10:00:00.000Z',
    duration: 3200,
    timedOut: false,
    pagesScanned: 1,
    config,
    pages: [page],
    links: [],
    summary: {
      totalPages: 1,
      totalFindings: findings.length,
      bySeverity: {
        critical: findings.filter((f) => f.severity === 'critical').length,
        serious: findings.filter((f) => (f.severity as string) === 'serious').length,
        moderate: 0,
        minor: 0,
      },
      byCategory: Object.fromEntries(
        findings.reduce((acc, f) => {
          acc.set(f.category, (acc.get(f.category) || 0) + 1);
          return acc;
        }, new Map<string, number>())
      ),
      byWcagLevel: {
        A: findings.filter((f) => f.wcagLevel === 'A').length,
        AA: 0,
        AAA: 0,
      },
    },
    durationMs: 3200,
    startedAt: '2025-01-15T10:00:00.000Z',
  };
}

describe('JSON report', () => {
  it('produces valid JSON with expected structure', () => {
    const result = createMockScanResult();
    const json = generateJsonReport(result, { pretty: true });

    const parsed = JSON.parse(json);

    expect(parsed.$schema).toBe('smart-a11y-scanner/v1');
    expect(parsed.scan).toBeDefined();
    expect(parsed.scan.url).toBe('https://example.com');
    expect(parsed.scan.pagesScanned).toBe(1);
    expect(typeof parsed.scan.durationMs).toBe('number');
    expect(parsed.scan.startedAt).toBeTruthy();

    expect(parsed.summary).toBeDefined();
    expect(parsed.summary.totalFindings).toBe(3);
    expect(parsed.summary.bySeverity).toBeDefined();
    expect(parsed.summary.byCategory).toBeDefined();

    expect(parsed.pages).toBeInstanceOf(Array);
    expect(parsed.pages.length).toBe(1);
    expect(parsed.pages[0].findings.length).toBe(3);
  });

  it('includes correct finding fields in each entry', () => {
    const result = createMockScanResult(1);
    const parsed = JSON.parse(generateJsonReport(result));

    const finding = parsed.pages[0].findings[0];
    expect(finding.ruleId).toBe('img-alt-text');
    expect(finding.severity).toBe('critical');
    expect(finding.category).toBeTruthy();
    expect(finding.wcag).toBeDefined();
    expect(finding.wcag.criterion).toBe('1.1.1');
    expect(finding.wcag.level).toBe('A');
    expect(finding.message).toBeTruthy();
    expect(finding.element).toBeTruthy();
    expect(finding.remediation).toBeTruthy();
  });

  it('compact mode produces single-line JSON', () => {
    const result = createMockScanResult(1);
    const json = generateJsonReport(result, { pretty: false });

    expect(json.includes('\n')).toBe(false);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('handles zero findings correctly', () => {
    const result = createMockScanResult(0);
    const parsed = JSON.parse(generateJsonReport(result));

    expect(parsed.summary.totalFindings).toBe(0);
    expect(parsed.pages[0].findings).toEqual([]);
  });
});

describe('CSV report', () => {
  it('has correct header row', () => {
    const result = createMockScanResult();
    const csv = generateCsvReport(result);
    const lines = csv.trim().split('\n');

    const expectedHeaders = [
      'Page URL',
      'Page Title',
      'Element',
      'Issue',
      'WCAG Criterion',
      'Level',
      'Severity',
      'Category',
      'Rule ID',
      'Remediation',
    ];
    expect(lines[0]).toBe(expectedHeaders.join(','));
  });

  it('has one data row per finding', () => {
    const result = createMockScanResult(3);
    const csv = generateCsvReport(result);
    const lines = csv.trim().split('\n');

    // 1 header + 3 data rows
    expect(lines.length).toBe(4);
  });

  it('first data row contains expected values', () => {
    const result = createMockScanResult(1);
    const csv = generateCsvReport(result);
    const lines = csv.trim().split('\n');

    const dataRow = lines[1];
    expect(dataRow).toContain('https://example.com');
    expect(dataRow).toContain('Example Page');
    expect(dataRow).toContain('img-alt-text');
    expect(dataRow).toContain('1.1.1');
    expect(dataRow).toContain('critical');
  });

  it('handles zero findings — header only', () => {
    const result = createMockScanResult(0);
    const csv = generateCsvReport(result);
    const lines = csv.trim().split('\n');

    expect(lines.length).toBe(1); // header only
  });

  it('escapes CSV special characters', () => {
    const result = createMockScanResult(1);
    // Inject a message with commas and quotes
    result.pages[0].findings[0].message = 'Image "hero.jpg" missing alt, needs fix';
    const csv = generateCsvReport(result);

    // The value should be properly quoted
    expect(csv).toContain('"Image ""hero.jpg"" missing alt, needs fix"');
  });
});
