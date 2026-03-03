/**
 * Unit tests for PatternExtractor (the LEARN engine).
 *
 * Covers: extract(), extractPagePatterns(), extractElementGroups(),
 * extractNavigationFlow(), extractCoverageMap(), and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { PatternExtractor } from '../scanner/patterns/pattern-extractor.js';
import type {
  PageSnapshot,
  ExtractionConfig,
} from '../scanner/patterns/types.js';
import type { GuidedExplorationResult, GuidedStepResult } from '../scanner/types.js';
import type { ImportedTestScenario } from '../ado/types.js';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const defaultConfig: ExtractionConfig = {
  similarityThreshold: 0.7,
  includeRawTrees: false,
  maxUrlPatterns: 50,
};

function makeSnapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    url: 'https://example.com/page1',
    stepIndex: 0,
    accessibilityTree: [],
    interactiveElements: [
      { role: 'tab', name: 'Overview', selector: '[role="tab"]:nth-child(1)', tag: 'button', ariaLabel: 'Overview' },
      { role: 'tab', name: 'Details', selector: '[role="tab"]:nth-child(2)', tag: 'button', ariaLabel: 'Details' },
      { role: 'button', name: 'Export', selector: '.export-btn', tag: 'button', ariaLabel: 'Export data' },
    ],
    landmarks: [
      { role: 'navigation', label: 'Main navigation', selector: 'nav' },
      { role: 'main', label: 'Page content', selector: 'main' },
    ],
    headings: [
      { level: 1, text: 'Dashboard' },
      { level: 2, text: 'Overview' },
    ],
    ...overrides,
  };
}

function makeStepResult(overrides: Partial<GuidedStepResult> = {}): GuidedStepResult {
  return {
    stepIndex: 0,
    stepText: 'click Overview',
    success: true,
    action: 'click',
    urlAfterStep: 'https://example.com/page1',
    findings: [],
    explorationFindings: [],
    durationMs: 100,
    ...overrides,
  };
}

function makeScenario(overrides: Partial<ImportedTestScenario> = {}): ImportedTestScenario {
  return {
    adoTestCaseId: 100,
    adoTestCaseUrl: 'https://dev.azure.com/org/proj/_workitems/edit/100',
    title: 'Test tab navigation',
    priority: 1,
    tags: ['a11y'],
    urls: ['https://example.com/page1'],
    actions: [
      { type: 'navigate', url: 'https://example.com/page1' },
      { type: 'click', target: 'Overview tab' },
    ],
    expectedBehaviors: [],
    rawSteps: [],
    suiteId: 10,
    suiteName: 'Accessibility Suite',
    ...overrides,
  };
}

function makeGuidedResult(stepResults: GuidedStepResult[]): GuidedExplorationResult {
  const successCount = stepResults.filter(s => s.success).length;
  const allFindings = stepResults.flatMap(s => [...s.findings, ...s.explorationFindings]);
  return {
    pages: [],
    stepResults,
    totalSteps: stepResults.length,
    successfulSteps: successCount,
    failedSteps: stepResults.length - successCount,
    totalFindings: allFindings.length,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PatternExtractor', () => {
  const extractor = new PatternExtractor();

  // -- extract() overall ----------------------------------------------------

  describe('extract()', () => {
    it('produces a valid LearnedPatterns object from mock data', async () => {
      const snapshot = makeSnapshot();
      const stepResults = [
        makeStepResult({ stepIndex: 0, stepText: 'navigate to page1', action: 'navigate' }),
        makeStepResult({ stepIndex: 1, stepText: 'click Overview', action: 'click' }),
      ];
      const result = makeGuidedResult(stepResults);
      const scenarios = [makeScenario()];

      const patterns = await extractor.extract(result, scenarios, [snapshot], defaultConfig);

      expect(patterns.version).toBe('1.0');
      expect(patterns.extractedAt).toBeTruthy();
      expect(patterns.scenarioCount).toBe(1);
      expect(patterns.pagePatterns.length).toBeGreaterThanOrEqual(1);
      expect(patterns.executionSummary.totalSteps).toBe(2);
    });

    it('determines test plan source from ADO scenario', async () => {
      const result = makeGuidedResult([makeStepResult()]);
      const scenario = makeScenario({ adoTestCaseId: 42 });

      const patterns = await extractor.extract(result, [scenario], [makeSnapshot()], defaultConfig);
      expect(patterns.testPlanSource).toBe('ado:42');
    });

    it('determines test plan source from suite-only scenario', async () => {
      const result = makeGuidedResult([makeStepResult()]);
      const scenario = makeScenario({ adoTestCaseId: 0, suiteId: 5 });

      const patterns = await extractor.extract(result, [scenario], [makeSnapshot()], defaultConfig);
      expect(patterns.testPlanSource).toBe('suite:5');
    });

    it('determines test plan source as file-or-inline for non-ADO', async () => {
      const result = makeGuidedResult([makeStepResult()]);
      const scenario = makeScenario({ adoTestCaseId: 0, suiteId: 0 });

      const patterns = await extractor.extract(result, [scenario], [makeSnapshot()], defaultConfig);
      expect(patterns.testPlanSource).toBe('file-or-inline');
    });

    it('reports unknown source when no scenarios', async () => {
      const result = makeGuidedResult([makeStepResult()]);

      const patterns = await extractor.extract(result, [], [makeSnapshot()], defaultConfig);
      expect(patterns.testPlanSource).toBe('unknown');
    });
  });

  // -- extractPagePatterns --------------------------------------------------

  describe('page pattern extraction', () => {
    it('groups snapshots by URL', async () => {
      const snapshots = [
        makeSnapshot({ url: 'https://example.com/a', stepIndex: 0 }),
        makeSnapshot({ url: 'https://example.com/b', stepIndex: 1 }),
        makeSnapshot({ url: 'https://example.com/a', stepIndex: 2 }),
      ];
      const stepResults = snapshots.map((s, i) =>
        makeStepResult({ stepIndex: i, urlAfterStep: s.url }),
      );
      const result = makeGuidedResult(stepResults);

      const patterns = await extractor.extract(result, [makeScenario()], snapshots, defaultConfig);

      // Should have 2 page patterns (one per unique URL)
      expect(patterns.pagePatterns).toHaveLength(2);
      const urls = patterns.pagePatterns.map(p => p.observedUrls).flat();
      expect(urls).toContain('https://example.com/a');
      expect(urls).toContain('https://example.com/b');
    });

    it('extracts landmarks from snapshots', async () => {
      const snapshot = makeSnapshot({
        landmarks: [
          { role: 'banner', label: 'Site header', selector: 'header' },
          { role: 'main', label: 'Content', selector: 'main' },
        ],
      });
      const result = makeGuidedResult([makeStepResult()]);

      const patterns = await extractor.extract(result, [makeScenario()], [snapshot], defaultConfig);

      const page = patterns.pagePatterns[0];
      expect(page.landmarks.length).toBe(2);
      expect(page.landmarks.map(l => l.role)).toContain('banner');
      expect(page.landmarks.map(l => l.role)).toContain('main');
    });

    it('builds heading tree structure', async () => {
      const snapshot = makeSnapshot({
        headings: [
          { level: 1, text: 'Title' },
          { level: 2, text: 'Section A' },
          { level: 3, text: 'Subsection A.1' },
          { level: 2, text: 'Section B' },
        ],
      });
      const result = makeGuidedResult([makeStepResult()]);

      const patterns = await extractor.extract(result, [makeScenario()], [snapshot], defaultConfig);

      const headingTree = patterns.pagePatterns[0].headingStructure;
      expect(headingTree).toHaveLength(1); // one root h1
      expect(headingTree[0].text).toBe('Title');
      expect(headingTree[0].children).toHaveLength(2); // two h2s
      expect(headingTree[0].children[0].children).toHaveLength(1); // one h3
    });

    it('generates unique structure fingerprints', async () => {
      const s1 = makeSnapshot({
        url: 'https://example.com/page1',
        headings: [{ level: 1, text: 'PageA' }],
      });
      const s2 = makeSnapshot({
        url: 'https://example.com/page2',
        headings: [{ level: 1, text: 'PageB' }, { level: 2, text: 'Sub' }],
      });
      const stepResults = [
        makeStepResult({ stepIndex: 0, urlAfterStep: s1.url }),
        makeStepResult({ stepIndex: 1, urlAfterStep: s2.url }),
      ];
      const result = makeGuidedResult(stepResults);

      const patterns = await extractor.extract(result, [makeScenario()], [s1, s2], defaultConfig);

      const fps = patterns.pagePatterns.map(p => p.structureFingerprint);
      expect(fps[0]).not.toBe(fps[1]);
    });
  });

  // -- extractElementGroups -------------------------------------------------

  describe('element group extraction', () => {
    it('identifies element groups from a11y tree', async () => {
      const snapshot = makeSnapshot({
        accessibilityTree: [
          {
            role: 'tablist',
            name: 'Main tabs',
            children: [
              { role: 'tab', name: 'Overview' },
              { role: 'tab', name: 'Details' },
              { role: 'tab', name: 'Settings' },
            ],
          },
        ],
      });
      const stepResults = [
        makeStepResult({ stepIndex: 0, stepText: 'click Overview', success: true }),
      ];
      const result = makeGuidedResult(stepResults);

      const patterns = await extractor.extract(result, [makeScenario()], [snapshot], defaultConfig);

      const groups = patterns.pagePatterns[0].elementGroups;
      expect(groups.length).toBeGreaterThanOrEqual(1);
      const tablistGroup = groups.find(g => g.groupRole === 'tablist');
      expect(tablistGroup).toBeDefined();
      expect(tablistGroup!.totalElements).toBe(3);
    });

    it('marks tested vs untested elements in a group', async () => {
      const snapshot = makeSnapshot({
        accessibilityTree: [
          {
            role: 'tablist',
            name: 'Tabs',
            children: [
              { role: 'tab', name: 'Overview' },
              { role: 'tab', name: 'Details' },
              { role: 'tab', name: 'Settings' },
            ],
          },
        ],
      });
      const stepResults = [
        makeStepResult({ stepIndex: 0, stepText: 'Overview', success: true }),
      ];
      const result = makeGuidedResult(stepResults);

      const patterns = await extractor.extract(result, [makeScenario()], [snapshot], defaultConfig);

      const tablistGroup = patterns.pagePatterns[0].elementGroups.find(g => g.groupRole === 'tablist');
      expect(tablistGroup!.testedElements.length).toBeGreaterThanOrEqual(1);
      expect(tablistGroup!.untestedElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -- extractNavigationFlow ------------------------------------------------

  describe('navigation flow extraction', () => {
    it('builds URL transition graph from step results', async () => {
      const stepResults = [
        makeStepResult({ stepIndex: 0, urlAfterStep: 'https://example.com/', stepText: 'navigate' }),
        makeStepResult({ stepIndex: 1, urlAfterStep: 'https://example.com/page2', stepText: 'click link' }),
        makeStepResult({ stepIndex: 2, urlAfterStep: 'https://example.com/page3', stepText: 'click next' }),
      ];
      const result = makeGuidedResult(stepResults);

      const patterns = await extractor.extract(result, [makeScenario()], [makeSnapshot()], defaultConfig);

      expect(patterns.navigationFlow.entryUrl).toBe('https://example.com/');
      expect(patterns.navigationFlow.transitions).toHaveLength(2);
      expect(patterns.navigationFlow.uniqueUrlCount).toBe(3);
    });

    it('classifies pages as shallow vs deep based on findings', async () => {
      const finding = {
        ruleId: 'test-rule',
        category: 'keyboard' as any,
        severity: 'serious' as any,
        wcagLevel: 'A' as any,
        wcagCriterion: '2.1.1',
        message: 'Not keyboard accessible',
        selector: 'button',
        pageUrl: 'https://example.com/page2',
        htmlSnippet: '<button>',
      };
      const stepResults = [
        makeStepResult({ stepIndex: 0, urlAfterStep: 'https://example.com/', explorationFindings: [] }),
        makeStepResult({ stepIndex: 1, urlAfterStep: 'https://example.com/page2', explorationFindings: [finding] }),
      ];
      const result = makeGuidedResult(stepResults);

      const patterns = await extractor.extract(result, [makeScenario()], [makeSnapshot()], defaultConfig);

      expect(patterns.navigationFlow.shallowPages).toContain('https://example.com/');
      expect(patterns.navigationFlow.deepPages).toContain('https://example.com/page2');
    });
  });

  // -- extractCoverageMap ---------------------------------------------------

  describe('coverage map extraction', () => {
    it('calculates element type coverage from snapshots', async () => {
      const snapshot = makeSnapshot({
        interactiveElements: [
          { role: 'button', name: 'Save', selector: '.save' },
          { role: 'button', name: 'Cancel', selector: '.cancel' },
          { role: 'textbox', name: 'Username', selector: '#username' },
        ],
      });
      const stepResults = [
        makeStepResult({ stepIndex: 0, stepText: 'Save', success: true }),
      ];
      const result = makeGuidedResult(stepResults);

      const patterns = await extractor.extract(result, [makeScenario()], [snapshot], defaultConfig);

      const buttonCov = patterns.coverageMap.elementTypeCoverage.find(c => c.role === 'button');
      expect(buttonCov).toBeDefined();
      expect(buttonCov!.totalFound).toBeGreaterThanOrEqual(2);
    });

    it('tracks WCAG criteria from findings', async () => {
      const finding = {
        ruleId: 'img-alt',
        category: 'images' as any,
        severity: 'serious' as any,
        wcagLevel: 'A' as any,
        wcagCriterion: '1.1.1',
        message: 'Missing alt text',
        selector: 'img',
        pageUrl: 'https://example.com/page1',
        htmlSnippet: '<img>',
      };
      const stepResults = [
        makeStepResult({ findings: [finding] }),
      ];
      const result = makeGuidedResult(stepResults);

      const patterns = await extractor.extract(result, [makeScenario()], [makeSnapshot()], defaultConfig);

      expect(patterns.coverageMap.wcagCriteriaHit).toContain('1.1.1');
      expect(patterns.coverageMap.categoriesWithFindings).toContain('images');
    });
  });

  // -- Edge cases -----------------------------------------------------------

  describe('edge cases', () => {
    it('handles empty snapshots array', async () => {
      const result = makeGuidedResult([makeStepResult()]);

      const patterns = await extractor.extract(result, [makeScenario()], [], defaultConfig);

      expect(patterns.pagePatterns).toHaveLength(0);
      expect(patterns.coverageMap.elementTypeCoverage).toHaveLength(0);
    });

    it('handles empty step results', async () => {
      const result = makeGuidedResult([]);

      const patterns = await extractor.extract(result, [], [], defaultConfig);

      expect(patterns.executionSummary.totalSteps).toBe(0);
      expect(patterns.navigationFlow.transitions).toHaveLength(0);
      expect(patterns.testPlanSource).toBe('unknown');
    });

    it('handles single page with no elements', async () => {
      const snapshot = makeSnapshot({
        interactiveElements: [],
        landmarks: [],
        headings: [],
        accessibilityTree: [],
      });
      const result = makeGuidedResult([makeStepResult()]);

      const patterns = await extractor.extract(result, [makeScenario()], [snapshot], defaultConfig);

      expect(patterns.pagePatterns).toHaveLength(1);
      expect(patterns.pagePatterns[0].elementGroups).toHaveLength(0);
      expect(patterns.pagePatterns[0].landmarks).toHaveLength(0);
    });

    it('respects maxUrlPatterns config', async () => {
      const snapshots = Array.from({ length: 5 }, (_, i) =>
        makeSnapshot({ url: `https://example.com/page${i}`, stepIndex: i }),
      );
      const stepResults = snapshots.map((s, i) =>
        makeStepResult({ stepIndex: i, urlAfterStep: s.url }),
      );
      const result = makeGuidedResult(stepResults);
      const config: ExtractionConfig = { ...defaultConfig, maxUrlPatterns: 2 };

      const patterns = await extractor.extract(result, [makeScenario()], snapshots, config);

      expect(patterns.pagePatterns.length).toBeLessThanOrEqual(2);
    });

    it('handles URL pattern conversion for UUIDs and numeric paths', async () => {
      const snapshot = makeSnapshot({
        url: 'https://example.com/users/123/items/a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      });
      const stepResults = [
        makeStepResult({ urlAfterStep: snapshot.url }),
      ];
      const result = makeGuidedResult(stepResults);

      const patterns = await extractor.extract(result, [makeScenario()], [snapshot], defaultConfig);

      const urlPattern = patterns.pagePatterns[0].urlPattern;
      // UUIDs and numbers should be wildcarded
      expect(urlPattern).toContain('/*');
      expect(urlPattern).not.toContain('123');
    });
  });
});
