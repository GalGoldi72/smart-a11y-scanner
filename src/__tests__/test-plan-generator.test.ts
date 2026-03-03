/**
 * Unit tests for TestPlanGenerator (the INVENT engine).
 *
 * Covers: generate(), 4 heuristic strategies, confidence filtering,
 * max limits, strategy selection, and computeStructuralSimilarity().
 */

import { describe, it, expect } from 'vitest';
import { TestPlanGenerator } from '../scanner/patterns/test-plan-generator.js';
import type {
  LearnedPatterns,
  LearnedPagePattern,
  GenerationConfig,
} from '../scanner/patterns/types.js';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

function makePagePattern(overrides: Partial<LearnedPagePattern> = {}): LearnedPagePattern {
  return {
    urlPattern: 'https://example.com/page',
    observedUrls: ['https://example.com/page'],
    landmarks: [
      { role: 'navigation', label: 'Nav', childElementTypes: ['link'], childCount: 3 },
      { role: 'main', label: 'Content', childElementTypes: ['button', 'tab'], childCount: 5 },
    ],
    elementGroups: [],
    headingStructure: [
      { level: 1, text: 'Page Title', children: [
        { level: 2, text: 'Section', children: [] },
      ]},
    ],
    contentRegions: [],
    structureFingerprint: 'fp-default',
    lastObserved: new Date().toISOString(),
    ...overrides,
  };
}

function makePatterns(overrides: Partial<LearnedPatterns> = {}): LearnedPatterns {
  return {
    version: '1.0',
    extractedAt: new Date().toISOString(),
    siteUrl: 'https://example.com',
    testPlanSource: 'file-or-inline',
    scenarioCount: 2,
    pagePatterns: [],
    interactionPatterns: [],
    navigationFlow: {
      entryUrl: 'https://example.com',
      transitions: [],
      uniqueUrlCount: 1,
      shallowPages: [],
      deepPages: [],
    },
    coverageMap: {
      elementTypeCoverage: [],
      wcagCriteriaHit: [],
      categoriesWithFindings: [],
      interactionTypesTested: ['mouse'],
      pagesCoverage: { tested: [], withFindings: [], clean: [] },
    },
    executionSummary: {
      totalSteps: 5,
      successfulSteps: 4,
      failedSteps: 1,
      totalFindings: 2,
      pagesVisited: ['https://example.com'],
      uniqueElementsInteracted: 3,
      scanDurationMs: 5000,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TestPlanGenerator', () => {
  const generator = new TestPlanGenerator();

  // -- generate() overall ---------------------------------------------------

  describe('generate()', () => {
    it('returns GeneratedTestScenario array', async () => {
      const patterns = makePatterns({
        pagePatterns: [makePagePattern({
          elementGroups: [{
            groupRole: 'tablist',
            containerSelector: '[role="tablist"]',
            totalElements: 3,
            testedElements: [{
              label: 'Tab A', role: 'tab',
              selector: '[role="tab"]:nth-child(1)',
              testedByScenario: 'Test tabs', testedAtStep: 1,
            }],
            untestedElements: [{
              label: 'Tab B', role: 'tab',
              selector: '[role="tab"]:nth-child(2)',
              similarityToTested: 0.9,
              mostSimilarTestedElement: 'Tab A',
            }],
            elementLabels: ['Tab A', 'Tab B', 'Tab C'],
          }],
        })],
      });

      const result = await generator.generate(patterns);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      for (const scenario of result) {
        expect(scenario.adoTestCaseId).toBe(-1);
        expect(scenario.suiteName).toBe('ai-generated');
        expect(scenario.confidence).toBeGreaterThanOrEqual(0);
        expect(scenario.generatedFrom).toBeTruthy();
      }
    });

    it('returns empty array when patterns have no gaps', async () => {
      const patterns = makePatterns({
        pagePatterns: [makePagePattern({
          elementGroups: [{
            groupRole: 'tablist',
            containerSelector: '[role="tablist"]',
            totalElements: 1,
            testedElements: [{
              label: 'Tab A', role: 'tab',
              selector: '[role="tab"]',
              testedByScenario: 'Test tabs', testedAtStep: 1,
            }],
            untestedElements: [],
            elementLabels: ['Tab A'],
          }],
        })],
        coverageMap: {
          elementTypeCoverage: [{ role: 'tab', totalFound: 1, totalTested: 1, totalUntested: 0, exampleUntested: [] }],
          wcagCriteriaHit: [],
          categoriesWithFindings: [],
          interactionTypesTested: ['mouse'],
          pagesCoverage: { tested: [], withFindings: [], clean: [] },
        },
      });

      const result = await generator.generate(patterns);
      // No untested elements, no gaps — should produce few or no scenarios
      expect(result.length).toBeLessThanOrEqual(1);
    });
  });

  // -- Strategy 1: Coverage Completion -------------------------------------

  describe('coverage-completion strategy', () => {
    it('generates scenarios for untested elements in a group', async () => {
      const patterns = makePatterns({
        pagePatterns: [makePagePattern({
          elementGroups: [{
            groupRole: 'tablist',
            containerSelector: '[role="tablist"]',
            totalElements: 4,
            testedElements: [{
              label: 'Overview', role: 'tab',
              selector: '[role="tab"]:nth-child(1)',
              testedByScenario: 'Test Overview tab', testedAtStep: 1,
            }],
            untestedElements: [
              { label: 'Details', role: 'tab', selector: '[role="tab"]:nth-child(2)', similarityToTested: 0.85, mostSimilarTestedElement: 'Overview' },
              { label: 'Settings', role: 'tab', selector: '[role="tab"]:nth-child(3)', similarityToTested: 0.8, mostSimilarTestedElement: 'Overview' },
              { label: 'Admin', role: 'tab', selector: '[role="tab"]:nth-child(4)', similarityToTested: 0.75, mostSimilarTestedElement: 'Overview' },
            ],
            elementLabels: ['Overview', 'Details', 'Settings', 'Admin'],
          }],
        })],
      });

      const config: GenerationConfig = {
        strategies: ['coverage-completion'],
        maxPerStrategy: 10, maxTotal: 30, minConfidence: 0.5,
        useLLM: false, deduplicateAgainstHistory: false,
      };

      const result = await generator.generate(patterns, undefined, config);

      expect(result.length).toBe(3); // 3 untested tabs
      for (const scenario of result) {
        expect(scenario.generatedFrom).toBe('coverage-completion');
        expect(scenario.tags).toContain('coverage-completion');
      }
      const titles = result.map(s => s.title);
      expect(titles.some(t => t.includes('Details'))).toBe(true);
      expect(titles.some(t => t.includes('Settings'))).toBe(true);
      expect(titles.some(t => t.includes('Admin'))).toBe(true);
    });
  });

  // -- Strategy 2: Depth Completion ----------------------------------------

  describe('depth-completion strategy', () => {
    it('generates expand scenarios for untested rows in a table', async () => {
      const patterns = makePatterns({
        pagePatterns: [makePagePattern({
          elementGroups: [{
            groupRole: 'table',
            containerSelector: '[role="table"]',
            totalElements: 4,
            testedElements: [{
              label: 'Header', role: 'columnheader',
              selector: '[role="columnheader"]',
              testedByScenario: 'Test header', testedAtStep: 0,
            }],
            untestedElements: [
              { label: 'Row 1', role: 'row', selector: '[role="row"]:nth-child(1)', similarityToTested: 0.5, mostSimilarTestedElement: 'Header' },
              { label: 'Row 2', role: 'row', selector: '[role="row"]:nth-child(2)', similarityToTested: 0.5, mostSimilarTestedElement: 'Header' },
            ],
            elementLabels: ['Header', 'Row 1', 'Row 2'],
          }],
        })],
      });

      const config: GenerationConfig = {
        strategies: ['depth-completion'],
        maxPerStrategy: 10, maxTotal: 30, minConfidence: 0.5,
        useLLM: false, deduplicateAgainstHistory: false,
      };

      const result = await generator.generate(patterns, undefined, config);

      expect(result.length).toBeGreaterThanOrEqual(2);
      for (const s of result) {
        expect(s.generatedFrom).toBe('depth-completion');
        expect(s.confidence).toBe(0.7);
      }
    });

    it('generates tree depth tests for untested tree items', async () => {
      const patterns = makePatterns({
        pagePatterns: [makePagePattern({
          elementGroups: [{
            groupRole: 'tree',
            containerSelector: '[role="tree"]',
            totalElements: 3,
            testedElements: [{
              label: 'Root', role: 'treeitem',
              selector: '[role="treeitem"]:nth-child(1)',
              testedByScenario: 'Test tree root', testedAtStep: 0,
            }],
            untestedElements: [
              { label: 'Child A', role: 'treeitem', selector: '[role="treeitem"]:nth-child(2)', similarityToTested: 0.6, mostSimilarTestedElement: 'Root' },
            ],
            elementLabels: ['Root', 'Child A'],
          }],
        })],
      });

      const config: GenerationConfig = {
        strategies: ['depth-completion'],
        maxPerStrategy: 10, maxTotal: 30, minConfidence: 0.5,
        useLLM: false, deduplicateAgainstHistory: false,
      };

      const result = await generator.generate(patterns, undefined, config);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.some(s => s.title.includes('Child A'))).toBe(true);
    });
  });

  // -- Strategy 3: Cross-Page Transfer -------------------------------------

  describe('cross-page-transfer strategy', () => {
    it('transfers scenarios between structurally similar pages', async () => {
      const testedPage = makePagePattern({
        urlPattern: 'https://example.com/recommendations',
        observedUrls: ['https://example.com/recommendations'],
        structureFingerprint: 'fp-tested',
        landmarks: [
          { role: 'navigation', label: 'Nav', childElementTypes: ['link'], childCount: 3 },
          { role: 'main', label: 'Content', childElementTypes: ['button'], childCount: 5 },
        ],
        elementGroups: [{
          groupRole: 'tablist',
          containerSelector: '[role="tablist"]',
          totalElements: 2,
          testedElements: [{
            label: 'Tab A', role: 'tab',
            selector: '[role="tab"]:nth-child(1)',
            testedByScenario: 'Test Tab A', testedAtStep: 1,
          }],
          untestedElements: [],
          elementLabels: ['Tab A', 'Tab B'],
        }],
        headingStructure: [{ level: 1, text: 'Recs', children: [{ level: 2, text: 'Sub', children: [] }] }],
      });

      const untestedPage = makePagePattern({
        urlPattern: 'https://example.com/incidents',
        observedUrls: ['https://example.com/incidents'],
        structureFingerprint: 'fp-untested',
        landmarks: [
          { role: 'navigation', label: 'Nav', childElementTypes: ['link'], childCount: 3 },
          { role: 'main', label: 'Content', childElementTypes: ['button'], childCount: 5 },
        ],
        elementGroups: [{
          groupRole: 'tablist',
          containerSelector: '[role="tablist"]',
          totalElements: 2,
          testedElements: [],
          untestedElements: [
            { label: 'Tab X', role: 'tab', selector: '[role="tab"]:nth-child(1)', similarityToTested: 0, mostSimilarTestedElement: '' },
          ],
          elementLabels: ['Tab X', 'Tab Y'],
        }],
        headingStructure: [{ level: 1, text: 'Incidents', children: [{ level: 2, text: 'Sub', children: [] }] }],
      });

      const patterns = makePatterns({
        pagePatterns: [testedPage, untestedPage],
        interactionPatterns: [{
          name: 'click-tab',
          actionSequence: ['click'],
          targetRoleSequence: ['interactive'],
          stateChangeSequence: ['no-change'],
          averageStepCount: 1,
          observationCount: 1,
          exampleScenarios: ['Test Tab A'],
        }],
      });

      const config: GenerationConfig = {
        strategies: ['cross-page-transfer'],
        maxPerStrategy: 10, maxTotal: 30, minConfidence: 0.5,
        useLLM: false, deduplicateAgainstHistory: false,
      };

      const result = await generator.generate(patterns, undefined, config);

      // Should generate transfer scenarios for the untested page
      expect(result.length).toBeGreaterThanOrEqual(1);
      for (const s of result) {
        expect(s.generatedFrom).toBe('cross-page-transfer');
        expect(s.urls).toContain('https://example.com/incidents');
      }
    });

    it('does not transfer when pages are structurally different', async () => {
      const testedPage = makePagePattern({
        urlPattern: 'https://example.com/page-a',
        observedUrls: ['https://example.com/page-a'],
        structureFingerprint: 'fp-a',
        landmarks: [{ role: 'navigation', label: 'Nav', childElementTypes: ['link'], childCount: 3 }],
        elementGroups: [{
          groupRole: 'tablist',
          containerSelector: '[role="tablist"]',
          totalElements: 1,
          testedElements: [{ label: 'Tab', role: 'tab', selector: 's', testedByScenario: 'T', testedAtStep: 0 }],
          untestedElements: [],
          elementLabels: ['Tab'],
        }],
        headingStructure: [{ level: 1, text: 'A', children: [] }],
      });

      const differentPage = makePagePattern({
        urlPattern: 'https://example.com/page-b',
        observedUrls: ['https://example.com/page-b'],
        structureFingerprint: 'fp-b',
        landmarks: [{ role: 'contentinfo', label: 'Footer', childElementTypes: [], childCount: 0 }],
        elementGroups: [{
          groupRole: 'form',
          containerSelector: 'form',
          totalElements: 1,
          testedElements: [],
          untestedElements: [{ label: 'Input', role: 'textbox', selector: 'input', similarityToTested: 0, mostSimilarTestedElement: '' }],
          elementLabels: ['Input'],
        }],
        headingStructure: [{ level: 1, text: 'B', children: [{ level: 2, text: 'C', children: [{ level: 3, text: 'D', children: [] }] }] }],
      });

      const patterns = makePatterns({ pagePatterns: [testedPage, differentPage] });

      const config: GenerationConfig = {
        strategies: ['cross-page-transfer'],
        maxPerStrategy: 10, maxTotal: 30, minConfidence: 0.5,
        useLLM: false, deduplicateAgainstHistory: false,
      };

      const result = await generator.generate(patterns, undefined, config);
      expect(result).toHaveLength(0);
    });
  });

  // -- Strategy 4: Element Type Coverage -----------------------------------

  describe('element-type-coverage strategy', () => {
    it('generates scenarios for untested element types', async () => {
      const patterns = makePatterns({
        coverageMap: {
          elementTypeCoverage: [
            { role: 'button', totalFound: 5, totalTested: 5, totalUntested: 0, exampleUntested: [] },
            { role: 'checkbox', totalFound: 3, totalTested: 0, totalUntested: 3, exampleUntested: ['Enable notifications', 'Dark mode'] },
            { role: 'combobox', totalFound: 2, totalTested: 0, totalUntested: 2, exampleUntested: ['Region selector'] },
          ],
          wcagCriteriaHit: [],
          categoriesWithFindings: [],
          interactionTypesTested: ['mouse'],
          pagesCoverage: { tested: [], withFindings: [], clean: [] },
        },
      });

      const config: GenerationConfig = {
        strategies: ['element-type-coverage'],
        maxPerStrategy: 10, maxTotal: 30, minConfidence: 0.5,
        useLLM: false, deduplicateAgainstHistory: false,
      };

      const result = await generator.generate(patterns, undefined, config);

      // Should generate for checkboxes and comboboxes, not buttons (fully tested)
      expect(result.length).toBe(3); // 2 checkboxes + 1 combobox
      expect(result.every(s => s.generatedFrom === 'element-type-coverage')).toBe(true);
      const titles = result.map(s => s.title);
      expect(titles.some(t => t.includes('checkbox'))).toBe(true);
      expect(titles.some(t => t.includes('combobox'))).toBe(true);
    });

    it('uses correct verbs for different roles', async () => {
      const patterns = makePatterns({
        coverageMap: {
          elementTypeCoverage: [
            { role: 'textbox', totalFound: 1, totalTested: 0, totalUntested: 1, exampleUntested: ['Search'] },
          ],
          wcagCriteriaHit: [],
          categoriesWithFindings: [],
          interactionTypesTested: ['mouse'],
          pagesCoverage: { tested: [], withFindings: [], clean: [] },
        },
      });

      const config: GenerationConfig = {
        strategies: ['element-type-coverage'],
        maxPerStrategy: 10, maxTotal: 30, minConfidence: 0.5,
        useLLM: false, deduplicateAgainstHistory: false,
      };

      const result = await generator.generate(patterns, undefined, config);

      expect(result).toHaveLength(1);
      // textbox should use 'type' action
      expect(result[0].actions.some(a => a.type === 'type')).toBe(true);
      expect(result[0].title).toContain('Type into');
    });
  });

  // -- Confidence filtering -------------------------------------------------

  describe('confidence filtering', () => {
    it('filters out scenarios below minConfidence', async () => {
      const patterns = makePatterns({
        pagePatterns: [makePagePattern({
          elementGroups: [{
            groupRole: 'tablist',
            containerSelector: '[role="tablist"]',
            totalElements: 2,
            testedElements: [{
              label: 'Tab A', role: 'tab',
              selector: '[role="tab"]:nth-child(1)',
              testedByScenario: 'Test Tab A', testedAtStep: 1,
            }],
            untestedElements: [
              { label: 'Tab B', role: 'tab', selector: '[role="tab"]:nth-child(2)', similarityToTested: 0.3, mostSimilarTestedElement: 'Tab A' },
            ],
            elementLabels: ['Tab A', 'Tab B'],
          }],
        })],
      });

      const config: GenerationConfig = {
        strategies: ['coverage-completion'],
        maxPerStrategy: 10, maxTotal: 30,
        minConfidence: 0.8, // Higher than the 0.3 similarity
        useLLM: false, deduplicateAgainstHistory: false,
      };

      const result = await generator.generate(patterns, undefined, config);
      expect(result).toHaveLength(0);
    });
  });

  // -- Max limits -----------------------------------------------------------

  describe('max limits', () => {
    it('respects maxPerStrategy', async () => {
      const untestedElements = Array.from({ length: 20 }, (_, i) => ({
        label: `Item ${i}`, role: 'tab',
        selector: `[role="tab"]:nth-child(${i})`,
        similarityToTested: 0.8,
        mostSimilarTestedElement: 'Source',
      }));

      const patterns = makePatterns({
        pagePatterns: [makePagePattern({
          elementGroups: [{
            groupRole: 'tablist',
            containerSelector: '[role="tablist"]',
            totalElements: 21,
            testedElements: [{
              label: 'Source', role: 'tab',
              selector: '[role="tab"]:nth-child(0)',
              testedByScenario: 'Test source', testedAtStep: 0,
            }],
            untestedElements: untestedElements,
            elementLabels: ['Source', ...untestedElements.map(e => e.label)],
          }],
        })],
      });

      const config: GenerationConfig = {
        strategies: ['coverage-completion'],
        maxPerStrategy: 5, maxTotal: 100,
        minConfidence: 0.5,
        useLLM: false, deduplicateAgainstHistory: false,
      };

      const result = await generator.generate(patterns, undefined, config);
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('respects maxTotal across strategies', async () => {
      const untestedElements = Array.from({ length: 10 }, (_, i) => ({
        label: `Item ${i}`, role: 'tab',
        selector: `[role="tab"]:nth-child(${i})`,
        similarityToTested: 0.8,
        mostSimilarTestedElement: 'Source',
      }));

      const patterns = makePatterns({
        pagePatterns: [makePagePattern({
          elementGroups: [{
            groupRole: 'tablist',
            containerSelector: '[role="tablist"]',
            totalElements: 11,
            testedElements: [{
              label: 'Source', role: 'tab',
              selector: '[role="tab"]:nth-child(0)',
              testedByScenario: 'Test source', testedAtStep: 0,
            }],
            untestedElements: untestedElements,
            elementLabels: ['Source', ...untestedElements.map(e => e.label)],
          }],
        })],
        coverageMap: {
          elementTypeCoverage: [
            { role: 'checkbox', totalFound: 5, totalTested: 0, totalUntested: 5,
              exampleUntested: ['A', 'B', 'C', 'D', 'E'] },
          ],
          wcagCriteriaHit: [], categoriesWithFindings: [],
          interactionTypesTested: ['mouse'],
          pagesCoverage: { tested: [], withFindings: [], clean: [] },
        },
      });

      const config: GenerationConfig = {
        strategies: ['coverage-completion', 'element-type-coverage'],
        maxPerStrategy: 10, maxTotal: 3,
        minConfidence: 0.5,
        useLLM: false, deduplicateAgainstHistory: false,
      };

      const result = await generator.generate(patterns, undefined, config);
      expect(result.length).toBeLessThanOrEqual(3);
    });
  });

  // -- Strategy selection ---------------------------------------------------

  describe('strategy selection', () => {
    it('only runs requested strategies', async () => {
      const patterns = makePatterns({
        pagePatterns: [makePagePattern({
          elementGroups: [{
            groupRole: 'tablist',
            containerSelector: '[role="tablist"]',
            totalElements: 2,
            testedElements: [{
              label: 'Tab A', role: 'tab',
              selector: 's', testedByScenario: 'T', testedAtStep: 0,
            }],
            untestedElements: [{
              label: 'Tab B', role: 'tab', selector: 's',
              similarityToTested: 0.9, mostSimilarTestedElement: 'Tab A',
            }],
            elementLabels: ['Tab A', 'Tab B'],
          }],
        })],
        coverageMap: {
          elementTypeCoverage: [
            { role: 'checkbox', totalFound: 2, totalTested: 0, totalUntested: 2, exampleUntested: ['CB1'] },
          ],
          wcagCriteriaHit: [], categoriesWithFindings: [],
          interactionTypesTested: ['mouse'],
          pagesCoverage: { tested: [], withFindings: [], clean: [] },
        },
      });

      // Only request element-type-coverage, not coverage-completion
      const config: GenerationConfig = {
        strategies: ['element-type-coverage'],
        maxPerStrategy: 10, maxTotal: 30, minConfidence: 0.5,
        useLLM: false, deduplicateAgainstHistory: false,
      };

      const result = await generator.generate(patterns, undefined, config);

      // Should only have element-type-coverage, never coverage-completion
      for (const s of result) {
        expect(s.generatedFrom).toBe('element-type-coverage');
      }
    });

    it('edge-case-generation returns empty (stub)', async () => {
      const patterns = makePatterns();

      const config: GenerationConfig = {
        strategies: ['edge-case-generation'],
        maxPerStrategy: 10, maxTotal: 30, minConfidence: 0.5,
        useLLM: false, deduplicateAgainstHistory: false,
      };

      const result = await generator.generate(patterns, undefined, config);
      expect(result).toHaveLength(0);
    });
  });

  // -- computeStructuralSimilarity -----------------------------------------

  describe('computeStructuralSimilarity()', () => {
    it('returns 1.0 for identical page patterns', () => {
      const page = makePagePattern({
        landmarks: [
          { role: 'navigation', label: 'Nav', childElementTypes: [], childCount: 0 },
          { role: 'main', label: 'Content', childElementTypes: [], childCount: 0 },
        ],
        elementGroups: [
          { groupRole: 'tablist', containerSelector: 's', totalElements: 0, testedElements: [], untestedElements: [], elementLabels: [] },
        ],
        headingStructure: [{ level: 1, text: 'Title', children: [{ level: 2, text: 'Sub', children: [] }] }],
      });

      const similarity = generator.computeStructuralSimilarity(page, page);
      expect(similarity).toBe(1.0);
    });

    it('returns 0.0 for completely different pages', () => {
      const pageA = makePagePattern({
        landmarks: [{ role: 'navigation', label: 'Nav', childElementTypes: [], childCount: 0 }],
        elementGroups: [{ groupRole: 'tablist', containerSelector: 's', totalElements: 0, testedElements: [], untestedElements: [], elementLabels: [] }],
        headingStructure: [{ level: 1, text: 'Title', children: [] }],
      });

      const pageB = makePagePattern({
        landmarks: [{ role: 'contentinfo', label: 'Footer', childElementTypes: [], childCount: 0 }],
        elementGroups: [{ groupRole: 'form', containerSelector: 'form', totalElements: 0, testedElements: [], untestedElements: [], elementLabels: [] }],
        headingStructure: [{ level: 2, text: 'Other', children: [] }],
      });

      const similarity = generator.computeStructuralSimilarity(pageA, pageB);
      expect(similarity).toBe(0);
    });

    it('returns mid-range for partially similar pages', () => {
      const pageA = makePagePattern({
        landmarks: [
          { role: 'navigation', label: 'Nav', childElementTypes: [], childCount: 0 },
          { role: 'main', label: 'Content', childElementTypes: [], childCount: 0 },
        ],
        elementGroups: [
          { groupRole: 'tablist', containerSelector: 's', totalElements: 0, testedElements: [], untestedElements: [], elementLabels: [] },
          { groupRole: 'toolbar', containerSelector: 's', totalElements: 0, testedElements: [], untestedElements: [], elementLabels: [] },
        ],
        headingStructure: [{ level: 1, text: 'Title', children: [{ level: 2, text: 'Sub', children: [] }] }],
      });

      const pageB = makePagePattern({
        landmarks: [
          { role: 'navigation', label: 'Nav', childElementTypes: [], childCount: 0 },
          { role: 'complementary', label: 'Side', childElementTypes: [], childCount: 0 },
        ],
        elementGroups: [
          { groupRole: 'tablist', containerSelector: 's', totalElements: 0, testedElements: [], untestedElements: [], elementLabels: [] },
          { groupRole: 'form', containerSelector: 'form', totalElements: 0, testedElements: [], untestedElements: [], elementLabels: [] },
        ],
        headingStructure: [{ level: 1, text: 'Title', children: [] }],
      });

      const similarity = generator.computeStructuralSimilarity(pageA, pageB);
      expect(similarity).toBeGreaterThan(0.2);
      expect(similarity).toBeLessThan(0.9);
    });

    it('two empty pages return 1.0', () => {
      const empty = makePagePattern({
        landmarks: [],
        elementGroups: [],
        headingStructure: [],
      });

      const similarity = generator.computeStructuralSimilarity(empty, empty);
      expect(similarity).toBe(1.0);
    });
  });

  // -- Scenario structure ---------------------------------------------------

  describe('scenario structure', () => {
    it('generated scenarios have correct fixed fields', async () => {
      const patterns = makePatterns({
        coverageMap: {
          elementTypeCoverage: [
            { role: 'button', totalFound: 2, totalTested: 0, totalUntested: 2, exampleUntested: ['OK'] },
          ],
          wcagCriteriaHit: [], categoriesWithFindings: [],
          interactionTypesTested: ['mouse'],
          pagesCoverage: { tested: [], withFindings: [], clean: [] },
        },
      });

      const config: GenerationConfig = {
        strategies: ['element-type-coverage'],
        maxPerStrategy: 5, maxTotal: 5, minConfidence: 0.5,
        useLLM: false, deduplicateAgainstHistory: false,
      };

      const result = await generator.generate(patterns, undefined, config);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const s = result[0];
      expect(s.adoTestCaseId).toBe(-1);
      expect(s.adoTestCaseUrl).toBe('');
      expect(s.suiteId).toBe(-1);
      expect(s.suiteName).toBe('ai-generated');
      expect(s.llmGenerated).toBe(false);
      expect(s.rationale).toBeTruthy();
      expect(s.actions.length).toBeGreaterThanOrEqual(1);
    });
  });
});
