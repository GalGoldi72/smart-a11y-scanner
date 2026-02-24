/**
 * DynamicAnalyzer unit tests — validates dynamic a11y checks that require
 * browser manipulation (zoom, keyboard, viewport, focus).
 *
 * Each check is tested in isolation by stubbing the other 9 private check
 * methods, so evaluate mocks only serve a single check at a time.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Page } from 'playwright';
import { DynamicAnalyzer } from '../scanner/dynamic-analyzer.js';
import { DEFAULT_SCAN_CONFIG } from '../scanner/types.js';
import type { Finding } from '../scanner/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock Playwright Page. */
function mockPage(): Page {
  return {
    url: vi.fn().mockReturnValue('https://example.com'),
    evaluate: vi.fn().mockResolvedValue(undefined),
    $$eval: vi.fn().mockResolvedValue([]),
    $eval: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(null),
    $$: vi.fn().mockResolvedValue([]),
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      down: vi.fn().mockResolvedValue(undefined),
      up: vi.fn().mockResolvedValue(undefined),
    },
    mouse: { click: vi.fn().mockResolvedValue(undefined) },
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    goto: vi.fn().mockResolvedValue(undefined),
    title: vi.fn().mockResolvedValue('Test Page'),
  } as unknown as Page;
}

const CHECK_METHODS = [
  'checkZoomReflow',
  'checkTextSpacing',
  'checkKeyboardNavigation',
  'checkFocusOrder',
  'checkLabelInName',
  'checkTargetSize',
  'checkLandmarks',
  'checkSkipLinks',
  'checkLiveRegions',
  'checkOrientation',
] as const;

/** Stub every private check method except `except`, so only that check runs. */
function stubAllChecksExcept(analyzer: DynamicAnalyzer, except: string): void {
  for (const m of CHECK_METHODS) {
    if (m !== except) {
      vi.spyOn(analyzer as any, m).mockResolvedValue([]);
    }
  }
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let analyzer: DynamicAnalyzer;

beforeEach(() => {
  analyzer = new DynamicAnalyzer({
    ...DEFAULT_SCAN_CONFIG,
    captureScreenshots: false,
    pageTimeoutMs: 10_000,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// 1. Zoom & Reflow (WCAG 1.4.4, 1.4.10)
// ===========================================================================

describe('Zoom & Reflow checks', () => {
  it('detects horizontal scroll at 200% zoom → finding (1.4.10)', async () => {
    stubAllChecksExcept(analyzer, 'checkZoomReflow');
    const page = mockPage();

    // checkZoomReflow evaluate sequence:
    // 1. set zoom → void  2. hasHorizScroll → bool  3. clippedElements → array  4. reset zoom → void
    (page.evaluate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(undefined)  // set zoom 200%
      .mockResolvedValueOnce(true)       // hasHorizScroll = true
      .mockResolvedValueOnce([])         // no clipped elements
      .mockResolvedValueOnce(undefined); // reset zoom

    const findings = await analyzer.analyze(page);

    const f = findings.filter((r: Finding) => r.ruleId === 'zoom-reflow-horizontal-scroll');
    expect(f.length).toBe(1);
    expect(f[0].wcagCriterion).toBe('1.4.10');
    expect(f[0].severity).toBe('serious');
  });

  it('produces no zoom finding when page reflows properly', async () => {
    stubAllChecksExcept(analyzer, 'checkZoomReflow');
    const page = mockPage();

    (page.evaluate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(undefined)  // set zoom
      .mockResolvedValueOnce(false)      // no horizontal scroll
      .mockResolvedValueOnce([])         // no clipped elements
      .mockResolvedValueOnce(undefined); // reset zoom

    const findings = await analyzer.analyze(page);

    expect(findings.filter((r: Finding) =>
      r.ruleId === 'zoom-reflow-horizontal-scroll' || r.ruleId === 'zoom-reflow-text-clipped',
    ).length).toBe(0);
  });

  it('detects text-spacing overflow → finding (1.4.12)', async () => {
    stubAllChecksExcept(analyzer, 'checkTextSpacing');
    const page = mockPage();

    // checkTextSpacing evaluate sequence:
    // 1. inject style (arg: STYLE_ID)  2. overflowElements  3. hasHorizScroll  4. remove style (arg: STYLE_ID)
    (page.evaluate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(undefined)  // inject style
      .mockResolvedValueOnce([           // overflow elements found
        { selector: 'div#card', snippet: '<div id="card">...' },
      ])
      .mockResolvedValueOnce(false)      // no horizontal scroll from spacing
      .mockResolvedValueOnce(undefined); // remove style

    const findings = await analyzer.analyze(page);

    const f = findings.filter((r: Finding) => r.ruleId === 'text-spacing-overflow');
    expect(f.length).toBe(1);
    expect(f[0].wcagCriterion).toBe('1.4.12');
    expect(f[0].severity).toBe('serious');
  });
});

// ===========================================================================
// 2. Keyboard & Focus (WCAG 2.1.1, 2.1.2, 2.4.3, 2.4.7)
// ===========================================================================

describe('Keyboard & Focus checks', () => {
  it('detects element with focus but no visible focus style → finding (2.4.7)', async () => {
    stubAllChecksExcept(analyzer, 'checkKeyboardNavigation');
    const page = mockPage();
    let callIdx = 0;

    // checkKeyboardNavigation evaluate sequence:
    // 1. blur/focus body  2–31. activeElement info (30 times)
    (page.evaluate as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) return undefined; // blur / focus body
      // 30 different elements, all without visible focus indicator
      return {
        tag: 'BUTTON',
        selector: `button.btn-${callIdx}`,
        hasVisibleIndicator: false,
      };
    });

    const findings = await analyzer.analyze(page);

    const f = findings.filter((r: Finding) => r.ruleId === 'focus-visible-missing');
    expect(f.length).toBe(1);
    expect(f[0].wcagCriterion).toBe('2.4.7');
    expect(f[0].severity).toBe('serious');
  });

  it('detects keyboard trap (same element 3+ times) → critical finding (2.1.2)', async () => {
    stubAllChecksExcept(analyzer, 'checkKeyboardNavigation');
    const page = mockPage();

    // First call: blur body. Rest: always same element (trapped).
    (page.evaluate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(undefined)                                            // blur
      .mockResolvedValue({ tag: 'INPUT', selector: 'input#trapped', hasVisibleIndicator: true }); // trap

    const findings = await analyzer.analyze(page);

    const f = findings.filter((r: Finding) => r.ruleId === 'keyboard-trap');
    expect(f.length).toBe(1);
    expect(f[0].severity).toBe('critical');
    expect(f[0].wcagCriterion).toBe('2.1.2');
  });

  it('produces no keyboard/focus finding when all elements tabbable with visible focus', async () => {
    stubAllChecksExcept(analyzer, 'checkKeyboardNavigation');
    const page = mockPage();
    let callIdx = 0;

    (page.evaluate as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) return undefined; // blur / focus body
      // 30 different elements, all WITH visible focus indicator
      return {
        tag: 'BUTTON',
        selector: `button.btn-${callIdx}`,
        hasVisibleIndicator: true,
      };
    });

    const findings = await analyzer.analyze(page);

    expect(findings.filter((r: Finding) =>
      r.ruleId === 'keyboard-trap' || r.ruleId === 'focus-visible-missing',
    ).length).toBe(0);
  });

  it('detects focus order mismatch with DOM order → finding (2.4.3)', async () => {
    stubAllChecksExcept(analyzer, 'checkFocusOrder');
    const page = mockPage();
    let tabCallIdx = 0;

    // checkFocusOrder evaluate sequence:
    // 1. DOM-order focusable elements  2. blur/focus body  3–N. tab position {top,left}
    (page.evaluate as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      tabCallIdx++;
      if (tabCallIdx === 1) {
        // DOM order: 5 elements at predictable vertical positions
        return [
          { idx: 0, tag: 'button', top: 100, left: 50 },
          { idx: 1, tag: 'a', top: 200, left: 50 },
          { idx: 2, tag: 'input', top: 300, left: 50 },
          { idx: 3, tag: 'button', top: 400, left: 50 },
          { idx: 4, tag: 'select', top: 500, left: 50 },
        ];
      }
      if (tabCallIdx === 2) return undefined; // blur / focus body

      // Tab positions jump backward significantly (>200px) at least twice
      const positions = [
        { top: 500, left: 50 },
        { top: 100, left: 50 },   // jump back 400px ✓
        { top: 500, left: 50 },
        { top: 100, left: 50 },   // jump back 400px ✓
        { top: 200, left: 50 },
      ];
      const idx = tabCallIdx - 3;
      return positions[idx] ?? { top: 300, left: 50 };
    });

    const findings = await analyzer.analyze(page);

    const f = findings.filter((r: Finding) => r.ruleId === 'focus-order-mismatch');
    expect(f.length).toBe(1);
    expect(f[0].wcagCriterion).toBe('2.4.3');
    expect(f[0].severity).toBe('serious');
  });
});

// ===========================================================================
// 3. Voice Access (WCAG 2.5.3, 2.5.8)
// ===========================================================================

describe('Voice Access checks', () => {
  it('detects label-in-name mismatch (aria-label ≠ visible text) → finding (2.5.3)', async () => {
    stubAllChecksExcept(analyzer, 'checkLabelInName');
    const page = mockPage();

    // checkLabelInName: single evaluate call returning mismatches
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        selector: 'button#submit',
        visibleText: 'Go Now',
        accessibleName: 'Submit Form',
        snippet: '<button id="submit" aria-label="Submit Form">Go Now</button>',
      },
    ]);

    const findings = await analyzer.analyze(page);

    const f = findings.filter((r: Finding) => r.ruleId === 'label-in-name');
    expect(f.length).toBe(1);
    expect(f[0].wcagCriterion).toBe('2.5.3');
    expect(f[0].severity).toBe('moderate');
    expect(f[0].message).toContain('Go Now');
    expect(f[0].message).toContain('Submit Form');
  });

  it('produces no finding when button label matches accessible name', async () => {
    stubAllChecksExcept(analyzer, 'checkLabelInName');
    const page = mockPage();

    // No mismatches
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const findings = await analyzer.analyze(page);
    expect(findings.filter((r: Finding) => r.ruleId === 'label-in-name').length).toBe(0);
  });

  it('detects interactive element smaller than 24×24px → finding (2.5.8)', async () => {
    stubAllChecksExcept(analyzer, 'checkTargetSize');
    const page = mockPage();

    // checkTargetSize: single evaluate call returning undersized elements
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { selector: 'button#tiny', width: 16, height: 16, snippet: '<button id="tiny">X</button>' },
      { selector: 'a#small-link', width: 20, height: 12, snippet: '<a id="small-link">?</a>' },
    ]);

    const findings = await analyzer.analyze(page);

    const f = findings.filter((r: Finding) => r.ruleId === 'target-size-minimum');
    expect(f.length).toBe(2);
    expect(f[0].wcagCriterion).toBe('2.5.8');
    expect(f[0].severity).toBe('moderate');
    expect(f[0].message).toContain('16');
  });

  it('produces no finding for element at exactly 24×24px', async () => {
    stubAllChecksExcept(analyzer, 'checkTargetSize');
    const page = mockPage();

    // No undersized elements (24×24 passes the check)
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const findings = await analyzer.analyze(page);
    expect(findings.filter((r: Finding) => r.ruleId === 'target-size-minimum').length).toBe(0);
  });
});

// ===========================================================================
// 4. Screen Reader (WCAG 1.3.1, 2.4.1)
// ===========================================================================

describe('Screen Reader checks', () => {
  it('detects missing <main> landmark → finding (1.3.1)', async () => {
    stubAllChecksExcept(analyzer, 'checkLandmarks');
    const page = mockPage();

    // checkLandmarks: single evaluate returning landmark info
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      hasMain: false,
      hasNav: true,
      totalLandmarks: 2,
    });

    const findings = await analyzer.analyze(page);

    const f = findings.filter((r: Finding) => r.ruleId === 'landmark-main-missing');
    expect(f.length).toBe(1);
    expect(f[0].wcagCriterion).toBe('1.3.1');
    expect(f[0].severity).toBe('serious');
  });

  it('produces no landmark finding when page has proper landmarks', async () => {
    stubAllChecksExcept(analyzer, 'checkLandmarks');
    const page = mockPage();

    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      hasMain: true,
      hasNav: true,
      totalLandmarks: 4,
    });

    const findings = await analyzer.analyze(page);

    expect(findings.filter((r: Finding) =>
      r.ruleId === 'landmark-main-missing' ||
      r.ruleId === 'landmark-nav-missing' ||
      r.ruleId === 'landmark-none',
    ).length).toBe(0);
  });

  it('detects no skip-to-content link → finding (2.4.1)', async () => {
    stubAllChecksExcept(analyzer, 'checkSkipLinks');
    const page = mockPage();

    // checkSkipLinks: single evaluate returning skip link info
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      hasSkipLink: false,
      firstTag: 'button',
      firstText: 'Menu',
    });

    const findings = await analyzer.analyze(page);

    const f = findings.filter((r: Finding) => r.ruleId === 'skip-link-missing');
    expect(f.length).toBe(1);
    expect(f[0].wcagCriterion).toBe('2.4.1');
    expect(f[0].severity).toBe('moderate');
  });

  it('produces no finding when first focusable element is skip link', async () => {
    stubAllChecksExcept(analyzer, 'checkSkipLinks');
    const page = mockPage();

    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      hasSkipLink: true,
      firstTag: 'a',
      firstText: 'Skip to main content',
    });

    const findings = await analyzer.analyze(page);
    expect(findings.filter((r: Finding) => r.ruleId === 'skip-link-missing').length).toBe(0);
  });
});

// ===========================================================================
// 5. Orientation (WCAG 1.3.4)
// ===========================================================================

describe('Orientation checks', () => {
  it('detects content hidden in portrait orientation → finding (1.3.4)', async () => {
    stubAllChecksExcept(analyzer, 'checkOrientation');
    const page = mockPage();

    // checkOrientation evaluate sequence:
    // 1. portrait scrollWidth  2. portrait main visible  3. landscape scrollWidth  4. css lock
    (page.evaluate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(1200)       // portrait scrollWidth > 768+20 → overflow
      .mockResolvedValueOnce(false)      // main content NOT visible in portrait
      .mockResolvedValueOnce(1024)       // landscape scrollWidth ≤ 1024+20 → ok
      .mockResolvedValueOnce(false);     // no CSS orientation lock

    const findings = await analyzer.analyze(page);

    const f = findings.filter((r: Finding) =>
      r.ruleId === 'orientation-portrait-overflow' ||
      r.ruleId === 'orientation-portrait-content-hidden',
    );
    expect(f.length).toBeGreaterThanOrEqual(1);
    expect(f.every((r: Finding) => r.wcagCriterion === '1.3.4')).toBe(true);
  });

  it('produces no finding when content visible in both orientations', async () => {
    stubAllChecksExcept(analyzer, 'checkOrientation');
    const page = mockPage();

    (page.evaluate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(700)        // portrait scrollWidth ≤ 768+20 → ok
      .mockResolvedValueOnce(true)       // main visible
      .mockResolvedValueOnce(1000)       // landscape scrollWidth ≤ 1024+20 → ok
      .mockResolvedValueOnce(false);     // no CSS lock

    const findings = await analyzer.analyze(page);

    expect(findings.filter((r: Finding) =>
      r.ruleId.startsWith('orientation-'),
    ).length).toBe(0);
  });
});

// ===========================================================================
// Integration: analyze() overall behaviour
// ===========================================================================

describe('DynamicAnalyzer integration', () => {
  it('analyze() returns an array of well-typed Finding objects', async () => {
    // Stub all checks to return a known finding
    for (const m of CHECK_METHODS) {
      vi.spyOn(analyzer as any, m).mockResolvedValue([]);
    }
    // Let one check return a finding
    (vi.spyOn(analyzer as any, 'checkLandmarks') as any).mockResolvedValue([
      {
        ruleId: 'landmark-main-missing',
        category: 'screen-reader',
        severity: 'serious',
        wcagLevel: 'A',
        wcagCriterion: '1.3.1',
        message: 'test',
        selector: 'html',
        pageUrl: 'https://example.com',
        htmlSnippet: '',
        remediation: 'fix it',
      } satisfies Finding,
    ]);

    const page = mockPage();
    const findings = await analyzer.analyze(page);

    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBe(1);
    expect(findings[0]).toHaveProperty('ruleId');
    expect(findings[0]).toHaveProperty('severity');
    expect(findings[0]).toHaveProperty('wcagCriterion');
    expect(findings[0]).toHaveProperty('message');
    expect(findings[0]).toHaveProperty('remediation');
  });

  it('respects deadline — skips checks when deadline already passed', async () => {
    const page = mockPage();
    const pastDeadline = Date.now() - 1000;

    const findings = await analyzer.analyze(page, pastDeadline);

    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBe(0);
    // No evaluate calls should have been made
    expect(page.evaluate).not.toHaveBeenCalled();
  });

  it('constructor accepts ScanConfig and creates a valid instance', () => {
    const da = new DynamicAnalyzer({
      ...DEFAULT_SCAN_CONFIG,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    expect(da).toBeDefined();
    expect(da).toBeInstanceOf(DynamicAnalyzer);
  });

  it('individual check failure does not break other checks', async () => {
    // Stub all checks: one throws, rest return findings
    for (const m of CHECK_METHODS) {
      vi.spyOn(analyzer as any, m).mockResolvedValue([]);
    }
    (vi.spyOn(analyzer as any, 'checkZoomReflow') as any).mockRejectedValue(new Error('boom'));
    (vi.spyOn(analyzer as any, 'checkLandmarks') as any).mockResolvedValue([
      {
        ruleId: 'landmark-main-missing',
        category: 'screen-reader',
        severity: 'serious',
        wcagLevel: 'A',
        wcagCriterion: '1.3.1',
        message: 'test',
        selector: 'html',
        pageUrl: 'https://example.com',
        htmlSnippet: '',
        remediation: 'fix',
      } satisfies Finding,
    ]);

    const page = mockPage();
    const findings = await analyzer.analyze(page);

    // Landmark finding should still be present despite zoom check throwing
    expect(findings.some((r: Finding) => r.ruleId === 'landmark-main-missing')).toBe(true);
  });
});
