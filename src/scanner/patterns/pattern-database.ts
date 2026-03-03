/**
 * PatternDatabase — persists and retrieves learned patterns per-site.
 *
 * File structure:
 *   {baseDir}/
 *     {hostname}/
 *       patterns-{timestamp}.json    (timestamped snapshots)
 *       patterns-latest.json         (copy of latest)
 *       generated-plans/
 *         generated-{timestamp}.json (generated scenarios)
 */

import { readdir, readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { join } from 'path';
import type {
  LearnedPatterns,
  LearnedPagePattern,
  GeneratedTestScenario,
} from './types.js';

export class PatternDatabase {
  constructor(private baseDir: string = '.a11y-patterns') {}

  /**
   * Save learned patterns after a guided run.
   * Writes a timestamped file and copies to patterns-latest.json.
   */
  async save(patterns: LearnedPatterns): Promise<string> {
    const dir = join(this.baseDir, this.siteDir(patterns.siteUrl));
    await mkdir(dir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `patterns-${timestamp}.json`;
    const filePath = join(dir, filename);
    const latestPath = join(dir, 'patterns-latest.json');

    const json = JSON.stringify(patterns, null, 2);
    await writeFile(filePath, json, 'utf-8');
    await writeFile(latestPath, json, 'utf-8');

    return filePath;
  }

  /** Load the latest patterns for a site URL */
  async loadLatest(siteUrl: string): Promise<LearnedPatterns | null> {
    const dir = join(this.baseDir, this.siteDir(siteUrl));
    const latestPath = join(dir, 'patterns-latest.json');

    try {
      const content = await readFile(latestPath, 'utf-8');
      return JSON.parse(content) as LearnedPatterns;
    } catch {
      return null;
    }
  }

  /** Load all historical patterns for a site (for trend analysis) */
  async loadHistory(siteUrl: string): Promise<LearnedPatterns[]> {
    const dir = join(this.baseDir, this.siteDir(siteUrl));
    const results: LearnedPatterns[] = [];

    try {
      const files = await readdir(dir);
      const patternFiles = files
        .filter(f => f.startsWith('patterns-') && f !== 'patterns-latest.json' && f.endsWith('.json'))
        .sort(); // chronological by timestamp in filename

      for (const file of patternFiles) {
        try {
          const content = await readFile(join(dir, file), 'utf-8');
          results.push(JSON.parse(content) as LearnedPatterns);
        } catch {
          // Skip corrupt files
        }
      }
    } catch {
      // Directory doesn't exist — no history
    }

    return results;
  }

  /**
   * Merge new patterns with existing ones (accumulative learning).
   * Union page patterns by fingerprint, accumulate element groups,
   * extend interaction patterns and navigation flow.
   */
  async merge(existing: LearnedPatterns, incoming: LearnedPatterns): Promise<LearnedPatterns> {
    // Merge page patterns by fingerprint
    const patternMap = new Map<string, LearnedPagePattern>();
    for (const p of existing.pagePatterns) {
      patternMap.set(p.structureFingerprint, p);
    }
    for (const p of incoming.pagePatterns) {
      const existing = patternMap.get(p.structureFingerprint);
      if (existing) {
        // Merge observed URLs and element groups
        const urlSet = new Set([...existing.observedUrls, ...p.observedUrls]);
        existing.observedUrls = [...urlSet];
        // Accumulate element groups (union by groupRole + containerSelector)
        const groupKeys = new Set(existing.elementGroups.map(g => `${g.groupRole}::${g.containerSelector}`));
        for (const group of p.elementGroups) {
          const key = `${group.groupRole}::${group.containerSelector}`;
          if (!groupKeys.has(key)) {
            existing.elementGroups.push(group);
            groupKeys.add(key);
          }
        }
        existing.lastObserved = p.lastObserved;
      } else {
        patternMap.set(p.structureFingerprint, { ...p });
      }
    }

    // Merge interaction patterns by name
    const interactionMap = new Map(
      existing.interactionPatterns.map(ip => [ip.name, ip]),
    );
    for (const ip of incoming.interactionPatterns) {
      const ex = interactionMap.get(ip.name);
      if (ex) {
        ex.observationCount += ip.observationCount;
        ex.averageStepCount = (ex.averageStepCount + ip.averageStepCount) / 2;
        const scenarioSet = new Set([...ex.exampleScenarios, ...ip.exampleScenarios]);
        ex.exampleScenarios = [...scenarioSet];
      } else {
        interactionMap.set(ip.name, { ...ip });
      }
    }

    // Merge navigation flow transitions
    const transitionKeys = new Set(
      existing.navigationFlow.transitions.map(t => `${t.fromUrl}→${t.toUrl}`),
    );
    const mergedTransitions = [...existing.navigationFlow.transitions];
    for (const t of incoming.navigationFlow.transitions) {
      const key = `${t.fromUrl}→${t.toUrl}`;
      if (!transitionKeys.has(key)) {
        mergedTransitions.push(t);
        transitionKeys.add(key);
      }
    }
    const allNavUrls = new Set([
      ...existing.navigationFlow.shallowPages,
      ...existing.navigationFlow.deepPages,
      ...incoming.navigationFlow.shallowPages,
      ...incoming.navigationFlow.deepPages,
    ]);

    // Merge coverage map
    const coverageRoleMap = new Map(
      existing.coverageMap.elementTypeCoverage.map(c => [c.role, c]),
    );
    for (const c of incoming.coverageMap.elementTypeCoverage) {
      const ex = coverageRoleMap.get(c.role);
      if (ex) {
        ex.totalFound = Math.max(ex.totalFound, c.totalFound);
        ex.totalTested = Math.max(ex.totalTested, c.totalTested);
        ex.totalUntested = ex.totalFound - ex.totalTested;
        const untestedSet = new Set([...ex.exampleUntested, ...c.exampleUntested]);
        ex.exampleUntested = [...untestedSet].slice(0, 10);
      } else {
        coverageRoleMap.set(c.role, { ...c });
      }
    }

    const wcagSet = new Set([...existing.coverageMap.wcagCriteriaHit, ...incoming.coverageMap.wcagCriteriaHit]);
    const catSet = new Set([...existing.coverageMap.categoriesWithFindings, ...incoming.coverageMap.categoriesWithFindings]);
    const testedPages = new Set([...existing.coverageMap.pagesCoverage.tested, ...incoming.coverageMap.pagesCoverage.tested]);
    const withFindings = new Set([...existing.coverageMap.pagesCoverage.withFindings, ...incoming.coverageMap.pagesCoverage.withFindings]);
    const clean = new Set([...existing.coverageMap.pagesCoverage.clean, ...incoming.coverageMap.pagesCoverage.clean]);

    return {
      version: '1.0',
      extractedAt: incoming.extractedAt,
      siteUrl: incoming.siteUrl,
      testPlanSource: incoming.testPlanSource,
      scenarioCount: existing.scenarioCount + incoming.scenarioCount,
      pagePatterns: [...patternMap.values()],
      interactionPatterns: [...interactionMap.values()],
      navigationFlow: {
        entryUrl: existing.navigationFlow.entryUrl || incoming.navigationFlow.entryUrl,
        transitions: mergedTransitions,
        uniqueUrlCount: allNavUrls.size,
        shallowPages: [...new Set([...existing.navigationFlow.shallowPages, ...incoming.navigationFlow.shallowPages])],
        deepPages: [...new Set([...existing.navigationFlow.deepPages, ...incoming.navigationFlow.deepPages])],
      },
      coverageMap: {
        elementTypeCoverage: [...coverageRoleMap.values()],
        wcagCriteriaHit: [...wcagSet],
        categoriesWithFindings: [...catSet],
        interactionTypesTested: [...new Set([
          ...existing.coverageMap.interactionTypesTested,
          ...incoming.coverageMap.interactionTypesTested,
        ])],
        pagesCoverage: {
          tested: [...testedPages],
          withFindings: [...withFindings],
          clean: [...clean],
        },
      },
      executionSummary: {
        totalSteps: existing.executionSummary.totalSteps + incoming.executionSummary.totalSteps,
        successfulSteps: existing.executionSummary.successfulSteps + incoming.executionSummary.successfulSteps,
        failedSteps: existing.executionSummary.failedSteps + incoming.executionSummary.failedSteps,
        totalFindings: existing.executionSummary.totalFindings + incoming.executionSummary.totalFindings,
        pagesVisited: [...new Set([...existing.executionSummary.pagesVisited, ...incoming.executionSummary.pagesVisited])],
        uniqueElementsInteracted: existing.executionSummary.uniqueElementsInteracted + incoming.executionSummary.uniqueElementsInteracted,
        scanDurationMs: existing.executionSummary.scanDurationMs + incoming.executionSummary.scanDurationMs,
      },
    };
  }

  /** Save generated test plans for replay */
  async saveGeneratedPlans(
    siteUrl: string,
    plans: GeneratedTestScenario[],
  ): Promise<string> {
    const dir = join(this.baseDir, this.siteDir(siteUrl), 'generated-plans');
    await mkdir(dir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `generated-${timestamp}.json`;
    const filePath = join(dir, filename);
    const latestPath = join(dir, 'generated-latest.json');

    const json = JSON.stringify(plans, null, 2);
    await writeFile(filePath, json, 'utf-8');
    await writeFile(latestPath, json, 'utf-8');

    return filePath;
  }

  /** Load previously generated plans */
  async loadGeneratedPlans(siteUrl: string): Promise<GeneratedTestScenario[]> {
    const dir = join(this.baseDir, this.siteDir(siteUrl), 'generated-plans');
    const latestPath = join(dir, 'generated-latest.json');

    try {
      const content = await readFile(latestPath, 'utf-8');
      return JSON.parse(content) as GeneratedTestScenario[];
    } catch {
      return [];
    }
  }

  /** Normalize URL to directory name: extract hostname, strip protocol/path */
  private siteDir(siteUrl: string): string {
    try {
      const url = new URL(siteUrl);
      return url.hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
    } catch {
      // Fallback: sanitize the raw string
      return siteUrl.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 100);
    }
  }
}
