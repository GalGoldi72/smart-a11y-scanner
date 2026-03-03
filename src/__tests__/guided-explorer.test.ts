/**
 * Unit tests for GuidedExplorer.
 *
 * Mocks Playwright and PageAnalyzer to test orchestration logic
 * without launching a real browser.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserContext, Page } from 'playwright';
import type { ImportedTestScenario } from '../ado/types.js';
import type { ScanConfig, PageResult } from '../scanner/types.js';
import { DEFAULT_SCAN_CONFIG } from '../scanner/types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock deep-explorer to avoid real exploration
vi.mock('../scanner/deep-explorer.js', () => ({
  DeepExplorer: vi.fn().mockImplementation(() => ({
    explore: vi.fn().mockResolvedValue({ pages: [] }),
  })),
}));

/** Create a minimal mock Page */
function createMockPage(): Page {
  let currentUrl = 'about:blank';
  const page: Partial<Page> = {
    url: vi.fn(() => currentUrl),
    goto: vi.fn(async (url: string) => {
      currentUrl = url;
      return null;
    }),
    close: vi.fn(async () => {}),
    waitForLoadState: vi.fn(async () => {}),
    waitForTimeout: vi.fn(async () => {}),
    screenshot: vi.fn(async () => Buffer.from('fakepng')),
    click: vi.fn(async () => {}),
    fill: vi.fn(async () => {}),
    selectOption: vi.fn(async () => []),
    evaluate: vi.fn(async () => false),
    getByRole: vi.fn(() => ({
      first: vi.fn(() => ({
        click: vi.fn(async () => { throw new Error('not found'); }),
      })),
    })),
    getByText: vi.fn(() => ({
      first: vi.fn(() => ({
        click: vi.fn(async () => { throw new Error('not found'); }),
      })),
    })),
    getByLabel: vi.fn(() => ({
      first: vi.fn(() => ({
        fill: vi.fn(async () => { throw new Error('not found'); }),
        selectOption: vi.fn(async () => { throw new Error('not found'); }),
      })),
    })),
    getByPlaceholder: vi.fn(() => ({
      first: vi.fn(() => ({
        fill: vi.fn(async () => { throw new Error('not found'); }),
      })),
    })),
    context: vi.fn(),
  };
  // page.context() returns the mock context (set later)
  return page as unknown as Page;
}

/** Create a minimal mock BrowserContext */
function createMockContext(mockPage: Page): BrowserContext {
  const ctx: Partial<BrowserContext> = {
    newPage: vi.fn(async () => mockPage),
  };
  // Wire page.context() back to this context
  (mockPage.context as ReturnType<typeof vi.fn>).mockReturnValue(ctx);
  return ctx as unknown as BrowserContext;
}

/** Create a minimal mock PageAnalyzer */
function createMockAnalyzer() {
  return {
    analyze: vi.fn(async (): Promise<PageResult> => ({
      url: 'about:blank',
      metadata: { url: 'about:blank', title: '', lang: null, metaDescription: null, metaViewport: null, h1Count: 0 },
      findings: [],
      analysisTimeMs: 10,
    })),
    analyzeCurrentPage: vi.fn(async (): Promise<PageResult> => ({
      url: 'about:blank',
      metadata: { url: 'about:blank', title: '', lang: null, metaDescription: null, metaViewport: null, h1Count: 0 },
      findings: [],
      analysisTimeMs: 10,
    })),
  };
}

/** Helper to build a simple scenario */
function makeScenario(overrides: Partial<ImportedTestScenario> = {}): ImportedTestScenario {
  return {
    adoTestCaseId: 0,
    adoTestCaseUrl: '',
    title: 'Test scenario',
    priority: 1,
    tags: [],
    urls: [],
    actions: [],
    expectedBehaviors: [],
    rawSteps: [],
    suiteId: 0,
    suiteName: '',
    ...overrides,
  };
}

const baseConfig: ScanConfig = {
  ...DEFAULT_SCAN_CONFIG,
  url: 'https://example.com',
  testPlan: { source: 'inline', autoExploreAfterSteps: false },
};

// ---------------------------------------------------------------------------
// Tests — import GuidedExplorer after mocks are set up
// ---------------------------------------------------------------------------

describe('GuidedExplorer', () => {
  let GuidedExplorer: typeof import('../scanner/guided-explorer.js').GuidedExplorer;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import so mocks are in place
    const mod = await import('../scanner/guided-explorer.js');
    GuidedExplorer = mod.GuidedExplorer;
  });

  it('creates an instance with config and analyzer', () => {
    const analyzer = createMockAnalyzer();
    const explorer = new GuidedExplorer(baseConfig, analyzer as any);
    expect(explorer).toBeDefined();
  });

  it('returns empty result for empty scenarios', async () => {
    const analyzer = createMockAnalyzer();
    const explorer = new GuidedExplorer(baseConfig, analyzer as any);
    const mockPage = createMockPage();
    const mockCtx = createMockContext(mockPage);
    const deadline = Date.now() + 30_000;

    const result = await explorer.execute(mockCtx, [], deadline);

    expect(result.totalSteps).toBe(0);
    expect(result.successfulSteps).toBe(0);
    expect(result.failedSteps).toBe(0);
    expect(result.totalFindings).toBe(0);
    expect(result.stepResults).toHaveLength(0);
    expect(result.pages).toHaveLength(0);
  });

  it('executes a simple navigate scenario', async () => {
    const analyzer = createMockAnalyzer();
    const explorer = new GuidedExplorer(baseConfig, analyzer as any);
    const mockPage = createMockPage();
    const mockCtx = createMockContext(mockPage);
    const deadline = Date.now() + 30_000;

    const scenario = makeScenario({
      actions: [{ type: 'navigate', url: 'https://example.com/page1' }],
      rawSteps: [{ index: 0, action: 'navigate to https://example.com/page1', expectedResult: '', actionText: 'navigate to https://example.com/page1', expectedResultText: '' }],
    });

    const result = await explorer.execute(mockCtx, [scenario], deadline);

    expect(result.totalSteps).toBe(1);
    expect(result.successfulSteps).toBe(1);
    expect(result.failedSteps).toBe(0);
    expect(result.stepResults[0].success).toBe(true);
    expect(result.stepResults[0].action).toBe('navigate');
    expect(mockPage.goto).toHaveBeenCalledWith('https://example.com/page1', expect.any(Object));
  });

  it('gracefully handles step failure without crashing', async () => {
    const analyzer = createMockAnalyzer();
    const explorer = new GuidedExplorer(baseConfig, analyzer as any);
    const mockPage = createMockPage();
    const mockCtx = createMockContext(mockPage);
    const deadline = Date.now() + 30_000;

    // Make goto throw on the first call, but resolve on the second
    (mockPage.goto as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('net::ERR_CONNECTION_REFUSED'))
      .mockResolvedValueOnce(null);

    const scenario = makeScenario({
      actions: [
        { type: 'navigate', url: 'https://fail.example.com' },
        { type: 'navigate', url: 'https://ok.example.com' },
      ],
      rawSteps: [
        { index: 0, action: 'navigate to fail', expectedResult: '', actionText: 'navigate to fail', expectedResultText: '' },
        { index: 1, action: 'navigate to ok', expectedResult: '', actionText: 'navigate to ok', expectedResultText: '' },
      ],
    });

    const result = await explorer.execute(mockCtx, [scenario], deadline);

    // Both steps attempted, first failed, second succeeded
    expect(result.totalSteps).toBe(2);
    expect(result.failedSteps).toBe(1);
    expect(result.successfulSteps).toBe(1);
    expect(result.stepResults[0].success).toBe(false);
    expect(result.stepResults[0].error).toBeTruthy();
    expect(result.stepResults[1].success).toBe(true);
  });

  it('tracks correct metadata on step results', async () => {
    const analyzer = createMockAnalyzer();
    const explorer = new GuidedExplorer(baseConfig, analyzer as any);
    const mockPage = createMockPage();
    const mockCtx = createMockContext(mockPage);
    const deadline = Date.now() + 30_000;

    const scenario = makeScenario({
      actions: [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'click', target: 'Submit' },
        { type: 'verify', description: 'check heading' },
      ],
      rawSteps: [
        { index: 0, action: 'navigate to https://example.com', expectedResult: '', actionText: 'navigate to https://example.com', expectedResultText: '' },
        { index: 1, action: 'click Submit', expectedResult: '', actionText: 'click Submit', expectedResultText: '' },
        { index: 2, action: 'check heading', expectedResult: '', actionText: 'check heading', expectedResultText: '' },
      ],
    });

    const result = await explorer.execute(mockCtx, [scenario], deadline);

    expect(result.stepResults).toHaveLength(3);

    // Check stepIndex is correct for each step
    expect(result.stepResults[0].stepIndex).toBe(0);
    expect(result.stepResults[1].stepIndex).toBe(1);
    expect(result.stepResults[2].stepIndex).toBe(2);

    // Check action types are recorded
    expect(result.stepResults[0].action).toBe('navigate');
    expect(result.stepResults[1].action).toBe('click');
    expect(result.stepResults[2].action).toBe('verify');

    // Each step should have a durationMs >= 0
    for (const step of result.stepResults) {
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('respects deadline and stops early', async () => {
    const analyzer = createMockAnalyzer();
    const explorer = new GuidedExplorer(baseConfig, analyzer as any);
    const mockPage = createMockPage();
    const mockCtx = createMockContext(mockPage);
    // Deadline already passed
    const deadline = Date.now() - 1000;

    const scenario = makeScenario({
      actions: [{ type: 'navigate', url: 'https://example.com' }],
      rawSteps: [{ index: 0, action: 'navigate', expectedResult: '', actionText: 'navigate', expectedResultText: '' }],
    });

    const result = await explorer.execute(mockCtx, [scenario], deadline);

    // Should not have executed any steps due to expired deadline
    expect(result.totalSteps).toBe(0);
  });
});
