/**
 * Unit tests for PatternDatabase.
 *
 * Covers: siteDir normalization, save/loadLatest round-trip,
 * loadHistory, merge, saveGeneratedPlans/loadGeneratedPlans,
 * and edge cases.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { rm, readdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { PatternDatabase } from '../scanner/patterns/pattern-database.js';
import type {
  LearnedPatterns,
  GeneratedTestScenario,
} from '../scanner/patterns/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = join(tmpdir(), `a11y-patdb-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  tempDirs = [];
});

function makePatterns(overrides: Partial<LearnedPatterns> = {}): LearnedPatterns {
  return {
    version: '1.0',
    extractedAt: new Date().toISOString(),
    siteUrl: 'https://example.com',
    testPlanSource: 'file-or-inline',
    scenarioCount: 1,
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

function makeGeneratedScenario(title: string): GeneratedTestScenario {
  return {
    adoTestCaseId: -1,
    adoTestCaseUrl: '',
    suiteId: -1,
    suiteName: 'ai-generated',
    title,
    priority: 2,
    tags: ['ai-generated'],
    urls: ['https://example.com'],
    actions: [{ type: 'click', target: 'Submit' }],
    expectedBehaviors: [],
    rawSteps: [],
    generatedFrom: 'coverage-completion',
    confidence: 0.8,
    rationale: 'Test rationale',
    sourceScenarioTitle: 'Source scenario',
    llmGenerated: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PatternDatabase', () => {
  // -- siteDir normalization ------------------------------------------------

  describe('siteDir normalization', () => {
    it('normalizes a standard HTTPS URL to hostname', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);
      const patterns = makePatterns({ siteUrl: 'https://portal.contoso.com/app/page' });

      const filePath = await db.save(patterns);
      expect(filePath).toContain('portal.contoso.com');
    });

    it('normalizes a URL with port to hostname only', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);
      const patterns = makePatterns({ siteUrl: 'http://localhost:3000/dashboard' });

      const filePath = await db.save(patterns);
      expect(filePath).toContain('localhost');
    });

    it('sanitizes invalid URL strings as fallback', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);
      const patterns = makePatterns({ siteUrl: 'not a valid url !!!' });

      const filePath = await db.save(patterns);
      // Should sanitize special characters
      expect(filePath).not.toContain(' ');
      expect(filePath).not.toContain('!');
    });
  });

  // -- save / loadLatest round-trip ----------------------------------------

  describe('save and loadLatest', () => {
    it('round-trips patterns through save then loadLatest', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);
      const patterns = makePatterns({ scenarioCount: 42 });

      await db.save(patterns);
      const loaded = await db.loadLatest('https://example.com');

      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe('1.0');
      expect(loaded!.scenarioCount).toBe(42);
      expect(loaded!.siteUrl).toBe('https://example.com');
    });

    it('loadLatest returns null for non-existent site', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);

      const loaded = await db.loadLatest('https://never-saved.example.com');
      expect(loaded).toBeNull();
    });

    it('loadLatest returns the most recent save when called twice', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);

      await db.save(makePatterns({ scenarioCount: 1 }));
      await db.save(makePatterns({ scenarioCount: 99 }));

      const loaded = await db.loadLatest('https://example.com');
      expect(loaded!.scenarioCount).toBe(99);
    });
  });

  // -- loadHistory ----------------------------------------------------------

  describe('loadHistory', () => {
    it('returns empty array for non-existent site', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);

      const history = await db.loadHistory('https://no-such-site.example.com');
      expect(history).toEqual([]);
    });

    it('returns all timestamped saves in chronological order', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);

      await db.save(makePatterns({ scenarioCount: 1 }));
      // Small delay to ensure different timestamps
      await new Promise(r => setTimeout(r, 20));
      await db.save(makePatterns({ scenarioCount: 2 }));

      const history = await db.loadHistory('https://example.com');
      expect(history.length).toBe(2);
      expect(history[0].scenarioCount).toBe(1);
      expect(history[1].scenarioCount).toBe(2);
    });

    it('excludes patterns-latest.json from history', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);

      await db.save(makePatterns());
      const history = await db.loadHistory('https://example.com');

      // Should have exactly 1 entry (the timestamped file, not the -latest copy)
      expect(history.length).toBe(1);
    });
  });

  // -- merge ----------------------------------------------------------------

  describe('merge', () => {
    it('unions page patterns by structure fingerprint', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);

      const existing = makePatterns({
        pagePatterns: [
          {
            urlPattern: 'https://example.com/a',
            observedUrls: ['https://example.com/a'],
            landmarks: [],
            elementGroups: [],
            headingStructure: [],
            contentRegions: [],
            structureFingerprint: 'fp-AAA',
            lastObserved: '2024-01-01',
          },
        ],
      });

      const incoming = makePatterns({
        pagePatterns: [
          {
            urlPattern: 'https://example.com/b',
            observedUrls: ['https://example.com/b'],
            landmarks: [],
            elementGroups: [],
            headingStructure: [],
            contentRegions: [],
            structureFingerprint: 'fp-BBB',
            lastObserved: '2024-01-02',
          },
        ],
      });

      const merged = await db.merge(existing, incoming);
      expect(merged.pagePatterns).toHaveLength(2);
      const fingerprints = merged.pagePatterns.map(p => p.structureFingerprint);
      expect(fingerprints).toContain('fp-AAA');
      expect(fingerprints).toContain('fp-BBB');
    });

    it('merges observed URLs for same fingerprint', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);

      const existing = makePatterns({
        pagePatterns: [{
          urlPattern: 'https://example.com/*',
          observedUrls: ['https://example.com/1'],
          landmarks: [], elementGroups: [], headingStructure: [],
          contentRegions: [], structureFingerprint: 'fp-SAME', lastObserved: '2024-01-01',
        }],
      });

      const incoming = makePatterns({
        pagePatterns: [{
          urlPattern: 'https://example.com/*',
          observedUrls: ['https://example.com/2'],
          landmarks: [], elementGroups: [], headingStructure: [],
          contentRegions: [], structureFingerprint: 'fp-SAME', lastObserved: '2024-01-02',
        }],
      });

      const merged = await db.merge(existing, incoming);
      expect(merged.pagePatterns).toHaveLength(1);
      expect(merged.pagePatterns[0].observedUrls).toContain('https://example.com/1');
      expect(merged.pagePatterns[0].observedUrls).toContain('https://example.com/2');
    });

    it('concatenates interaction patterns by name', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);

      const existing = makePatterns({
        interactionPatterns: [{
          name: 'click-flow',
          actionSequence: ['click'],
          targetRoleSequence: ['button'],
          stateChangeSequence: ['no-change'],
          averageStepCount: 1,
          observationCount: 2,
          exampleScenarios: ['Scenario A'],
        }],
      });

      const incoming = makePatterns({
        interactionPatterns: [{
          name: 'click-flow',
          actionSequence: ['click'],
          targetRoleSequence: ['button'],
          stateChangeSequence: ['no-change'],
          averageStepCount: 3,
          observationCount: 1,
          exampleScenarios: ['Scenario B'],
        }],
      });

      const merged = await db.merge(existing, incoming);
      expect(merged.interactionPatterns).toHaveLength(1);
      expect(merged.interactionPatterns[0].observationCount).toBe(3);
      expect(merged.interactionPatterns[0].exampleScenarios).toContain('Scenario A');
      expect(merged.interactionPatterns[0].exampleScenarios).toContain('Scenario B');
    });

    it('merges coverage maps by element role', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);

      const existing = makePatterns({
        coverageMap: {
          elementTypeCoverage: [{ role: 'button', totalFound: 10, totalTested: 5, totalUntested: 5, exampleUntested: ['btn-1'] }],
          wcagCriteriaHit: ['4.1.2'],
          categoriesWithFindings: ['keyboard'],
          interactionTypesTested: ['mouse'],
          pagesCoverage: { tested: ['https://example.com/a'], withFindings: [], clean: ['https://example.com/a'] },
        },
      });

      const incoming = makePatterns({
        coverageMap: {
          elementTypeCoverage: [{ role: 'button', totalFound: 12, totalTested: 8, totalUntested: 4, exampleUntested: ['btn-2'] }],
          wcagCriteriaHit: ['1.1.1'],
          categoriesWithFindings: ['images'],
          interactionTypesTested: ['keyboard'],
          pagesCoverage: { tested: ['https://example.com/b'], withFindings: ['https://example.com/b'], clean: [] },
        },
      });

      const merged = await db.merge(existing, incoming);
      const buttonCoverage = merged.coverageMap.elementTypeCoverage.find(c => c.role === 'button');
      expect(buttonCoverage).toBeDefined();
      expect(buttonCoverage!.totalFound).toBe(12); // max
      expect(buttonCoverage!.totalTested).toBe(8); // max
      expect(merged.coverageMap.wcagCriteriaHit).toContain('4.1.2');
      expect(merged.coverageMap.wcagCriteriaHit).toContain('1.1.1');
      expect(merged.coverageMap.pagesCoverage.tested).toContain('https://example.com/a');
      expect(merged.coverageMap.pagesCoverage.tested).toContain('https://example.com/b');
    });

    it('sums execution summary counts', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);

      const existing = makePatterns({
        executionSummary: {
          totalSteps: 10, successfulSteps: 8, failedSteps: 2,
          totalFindings: 3, pagesVisited: ['https://example.com/a'],
          uniqueElementsInteracted: 5, scanDurationMs: 3000,
        },
      });

      const incoming = makePatterns({
        executionSummary: {
          totalSteps: 6, successfulSteps: 5, failedSteps: 1,
          totalFindings: 1, pagesVisited: ['https://example.com/b'],
          uniqueElementsInteracted: 3, scanDurationMs: 2000,
        },
      });

      const merged = await db.merge(existing, incoming);
      expect(merged.executionSummary.totalSteps).toBe(16);
      expect(merged.executionSummary.successfulSteps).toBe(13);
      expect(merged.executionSummary.failedSteps).toBe(3);
      expect(merged.executionSummary.totalFindings).toBe(4);
      expect(merged.executionSummary.scanDurationMs).toBe(5000);
      expect(merged.executionSummary.pagesVisited).toContain('https://example.com/a');
      expect(merged.executionSummary.pagesVisited).toContain('https://example.com/b');
    });

    it('merges navigation flow transitions without duplicates', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);

      const existing = makePatterns({
        navigationFlow: {
          entryUrl: 'https://example.com',
          transitions: [{ fromUrl: 'https://example.com', toUrl: 'https://example.com/a', trigger: 'click', triggerRole: 'link', triggerLabel: 'A' }],
          uniqueUrlCount: 2,
          shallowPages: ['https://example.com'],
          deepPages: ['https://example.com/a'],
        },
      });

      const incoming = makePatterns({
        navigationFlow: {
          entryUrl: 'https://example.com',
          transitions: [
            { fromUrl: 'https://example.com', toUrl: 'https://example.com/a', trigger: 'click', triggerRole: 'link', triggerLabel: 'A' }, // duplicate
            { fromUrl: 'https://example.com/a', toUrl: 'https://example.com/b', trigger: 'click', triggerRole: 'link', triggerLabel: 'B' }, // new
          ],
          uniqueUrlCount: 3,
          shallowPages: [],
          deepPages: ['https://example.com/b'],
        },
      });

      const merged = await db.merge(existing, incoming);
      expect(merged.navigationFlow.transitions).toHaveLength(2); // no dup
      expect(merged.navigationFlow.deepPages).toContain('https://example.com/a');
      expect(merged.navigationFlow.deepPages).toContain('https://example.com/b');
    });
  });

  // -- saveGeneratedPlans / loadGeneratedPlans ------------------------------

  describe('saveGeneratedPlans and loadGeneratedPlans', () => {
    it('round-trips generated plans through save then load', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);
      const plans = [makeGeneratedScenario('Test button'), makeGeneratedScenario('Test link')];

      await db.saveGeneratedPlans('https://example.com', plans);
      const loaded = await db.loadGeneratedPlans('https://example.com');

      expect(loaded).toHaveLength(2);
      expect(loaded[0].title).toBe('Test button');
      expect(loaded[1].title).toBe('Test link');
    });

    it('loadGeneratedPlans returns empty array for non-existent site', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);

      const loaded = await db.loadGeneratedPlans('https://no-plans.example.com');
      expect(loaded).toEqual([]);
    });

    it('saveGeneratedPlans creates the generated-plans directory', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);

      await db.saveGeneratedPlans('https://example.com', [makeGeneratedScenario('X')]);

      const siteDir = join(dir, 'example.com', 'generated-plans');
      const files = await readdir(siteDir);
      expect(files.some(f => f.startsWith('generated-'))).toBe(true);
      expect(files.some(f => f === 'generated-latest.json')).toBe(true);
    });
  });

  // -- Edge cases -----------------------------------------------------------

  describe('edge cases', () => {
    it('handles empty patterns save/load', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);
      const patterns = makePatterns({
        pagePatterns: [],
        interactionPatterns: [],
        scenarioCount: 0,
      });

      await db.save(patterns);
      const loaded = await db.loadLatest('https://example.com');

      expect(loaded).not.toBeNull();
      expect(loaded!.pagePatterns).toHaveLength(0);
      expect(loaded!.interactionPatterns).toHaveLength(0);
    });

    it('loadLatest returns null when directory is missing', async () => {
      const db = new PatternDatabase(join(tmpdir(), 'nonexistent-dir-' + Date.now()));
      const loaded = await db.loadLatest('https://example.com');
      expect(loaded).toBeNull();
    });

    it('multiple different sites are isolated', async () => {
      const dir = makeTempDir();
      const db = new PatternDatabase(dir);

      await db.save(makePatterns({ siteUrl: 'https://alpha.example.com', scenarioCount: 10 }));
      await db.save(makePatterns({ siteUrl: 'https://beta.example.com', scenarioCount: 20 }));

      const alpha = await db.loadLatest('https://alpha.example.com');
      const beta = await db.loadLatest('https://beta.example.com');

      expect(alpha!.scenarioCount).toBe(10);
      expect(beta!.scenarioCount).toBe(20);
    });
  });
});
