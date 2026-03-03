/**
 * PatternExtractor — the LEARN engine.
 *
 * Runs after GuidedExplorer.execute() completes. Receives the full execution
 * trace (step results, snapshots, scenarios) and produces a LearnedPatterns
 * object capturing page structures, interaction patterns, navigation flow,
 * and coverage gaps.
 *
 * Uses heuristics only — no LLM calls. Element similarity is label-based
 * with role comparison.
 */

import { createHash } from 'crypto';
import type { ImportedTestScenario, TestAction } from '../../ado/types.js';
import type { GuidedExplorationResult, GuidedStepResult } from '../types.js';
import type {
  LearnedPatterns,
  LearnedPagePattern,
  LandmarkPattern,
  ElementGroupPattern,
  TestedElementRef,
  UntestedElementRef,
  HeadingNode,
  ContentRegionPattern,
  LearnedInteractionPattern,
  StateChangeType,
  LearnedNavigationFlow,
  NavigationTransition,
  LearnedCoverageMap,
  ElementTypeCoverage,
  ExecutionSummary,
  PageSnapshot,
  InteractiveElement,
  ExtractionConfig,
} from './types.js';

/** Group roles we look for in snapshots */
const GROUP_ROLES = ['tablist', 'toolbar', 'table', 'grid', 'list', 'listbox', 'tree', 'menu', 'form'];

/** Child roles inside group containers */
const GROUP_CHILD_ROLES: Record<string, string[]> = {
  tablist: ['tab'],
  toolbar: ['button', 'link', 'menuitem'],
  table: ['row', 'rowheader', 'columnheader'],
  grid: ['row', 'gridcell'],
  list: ['listitem'],
  listbox: ['option'],
  tree: ['treeitem'],
  menu: ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
  form: ['textbox', 'combobox', 'checkbox', 'radio', 'spinbutton', 'slider'],
};

export class PatternExtractor {
  /**
   * Extract patterns from a completed guided exploration.
   */
  async extract(
    result: GuidedExplorationResult,
    scenarios: ImportedTestScenario[],
    snapshots: PageSnapshot[],
    config: ExtractionConfig,
  ): Promise<LearnedPatterns> {
    const pagePatterns = this.extractPagePatterns(snapshots, result.stepResults);
    const interactionPatterns = this.extractInteractionPatterns(scenarios, result.stepResults);
    const navigationFlow = this.extractNavigationFlow(result.stepResults);
    const coverageMap = this.extractCoverageMap(snapshots, result.stepResults, scenarios);

    // Build execution summary
    const pagesVisited = [...new Set(result.stepResults.map(s => s.urlAfterStep))];
    const testedElements = new Set<string>();
    for (const step of result.stepResults) {
      if (step.success && step.action !== 'verify' && step.action !== 'wait') {
        testedElements.add(`${step.action}::${step.stepText}`);
      }
    }

    const executionSummary: ExecutionSummary = {
      totalSteps: result.totalSteps,
      successfulSteps: result.successfulSteps,
      failedSteps: result.failedSteps,
      totalFindings: result.totalFindings,
      pagesVisited,
      uniqueElementsInteracted: testedElements.size,
      scanDurationMs: result.stepResults.reduce((sum, s) => sum + s.durationMs, 0),
    };

    // Determine test plan source
    let testPlanSource = 'unknown';
    if (scenarios.length > 0) {
      const first = scenarios[0];
      if (first.adoTestCaseId > 0) {
        testPlanSource = `ado:${first.adoTestCaseId}`;
      } else if (first.suiteId > 0) {
        testPlanSource = `suite:${first.suiteId}`;
      } else {
        testPlanSource = 'file-or-inline';
      }
    }

    return {
      version: '1.0',
      extractedAt: new Date().toISOString(),
      siteUrl: pagesVisited[0] ?? '',
      testPlanSource,
      scenarioCount: scenarios.length,
      pagePatterns: pagePatterns.slice(0, config.maxUrlPatterns),
      interactionPatterns,
      navigationFlow,
      coverageMap,
      executionSummary,
    };
  }

  /**
   * Extract page structure patterns from a11y tree snapshots.
   * Groups snapshots by URL and extracts landmarks, headings, element groups.
   */
  private extractPagePatterns(
    snapshots: PageSnapshot[],
    stepResults: GuidedStepResult[],
  ): LearnedPagePattern[] {
    // Group snapshots by URL
    const byUrl = new Map<string, PageSnapshot[]>();
    for (const snapshot of snapshots) {
      const existing = byUrl.get(snapshot.url) ?? [];
      existing.push(snapshot);
      byUrl.set(snapshot.url, existing);
    }

    // Build set of tested element selectors for coverage analysis
    const testedSelectors = new Set<string>();
    for (const step of stepResults) {
      if (step.success) {
        testedSelectors.add(step.stepText);
      }
    }

    const patterns: LearnedPagePattern[] = [];

    for (const [url, urlSnapshots] of byUrl) {
      // Use the last snapshot as the most complete state
      const representative = urlSnapshots[urlSnapshots.length - 1];

      // Extract landmarks
      const landmarks: LandmarkPattern[] = representative.landmarks.map(lm => {
        const childElements = representative.interactiveElements.filter(el =>
          el.selector.includes(lm.selector) || el.isInsideMain || el.isInsideNav,
        );
        return {
          role: lm.role,
          label: lm.label,
          childElementTypes: [...new Set(childElements.map(e => e.role).filter(Boolean))],
          childCount: childElements.length,
        };
      });

      // Extract heading structure
      const headingStructure = this.buildHeadingTree(representative.headings);

      // Extract element groups
      const elementGroups = this.extractElementGroups(representative, testedSelectors);

      // Build content regions from landmarks
      const contentRegions: ContentRegionPattern[] = representative.landmarks.map(lm => ({
        method: 'aria-landmark' as const,
        selector: lm.selector,
        interactiveChildCount: representative.interactiveElements.filter(el =>
          el.selector.startsWith(lm.selector),
        ).length,
      }));

      // Compute structure fingerprint
      const fpData = [
        ...landmarks.map(l => `${l.role}:${l.childCount}`),
        ...representative.headings.map(h => `h${h.level}:${h.text.slice(0, 20)}`),
        ...elementGroups.map(g => `${g.groupRole}:${g.totalElements}`),
      ].join('|');
      const fingerprint = createHash('md5').update(fpData).digest('hex').slice(0, 12);

      patterns.push({
        urlPattern: this.urlToPattern(url),
        observedUrls: [...new Set(urlSnapshots.map(s => s.url))],
        landmarks,
        elementGroups,
        headingStructure,
        contentRegions,
        structureFingerprint: fingerprint,
        lastObserved: new Date().toISOString(),
      });
    }

    return patterns;
  }

  /**
   * Identify element groups (tab bars, tables, toolbars) and classify
   * which elements were tested vs. untested.
   */
  private extractElementGroups(
    snapshot: PageSnapshot,
    testedElements: Set<string>,
  ): ElementGroupPattern[] {
    const groups: ElementGroupPattern[] = [];

    // Look for group containers in the a11y tree
    for (const node of this.flattenA11yTree(snapshot.accessibilityTree)) {
      if (!GROUP_ROLES.includes(node.role)) continue;

      const childRoles = GROUP_CHILD_ROLES[node.role] ?? [];
      const children = (node.children ?? []).filter(c => childRoles.includes(c.role));
      if (children.length === 0) continue;

      const tested: TestedElementRef[] = [];
      const untested: UntestedElementRef[] = [];
      const labels: string[] = [];

      for (const child of children) {
        const label = child.name || '(unnamed)';
        labels.push(label);

        // Check if this element was tested — heuristic: match by label text
        const wasTested = this.isElementTested(child.name, child.role, testedElements);
        if (wasTested) {
          tested.push({
            label,
            role: child.role,
            selector: `[role="${child.role}"][name="${child.name}"]`,
            testedByScenario: wasTested.scenario,
            testedAtStep: wasTested.step,
          });
        } else {
          // Find most similar tested element
          const similarity = this.findMostSimilarTested(child.name, child.role, tested);
          untested.push({
            label,
            role: child.role,
            selector: `[role="${child.role}"][name="${child.name}"]`,
            similarityToTested: similarity.score,
            mostSimilarTestedElement: similarity.label,
          });
        }
      }

      groups.push({
        groupRole: node.role,
        containerSelector: `[role="${node.role}"]`,
        totalElements: children.length,
        testedElements: tested,
        untestedElements: untested,
        elementLabels: labels,
      });
    }

    return groups;
  }

  /**
   * Detect interaction patterns across scenarios.
   * Groups action sequences by their type pattern.
   */
  private extractInteractionPatterns(
    scenarios: ImportedTestScenario[],
    stepResults: GuidedStepResult[],
  ): LearnedInteractionPattern[] {
    const patternMap = new Map<string, LearnedInteractionPattern>();

    // Group step results by scenario (using stepIndex reset as boundary)
    let currentScenarioIdx = 0;
    let prevStepIdx = -1;

    for (const scenario of scenarios) {
      const actionTypes = scenario.actions.map(a => a.type);
      const targetRoles = scenario.actions.map(a => this.actionTargetRole(a));

      // Detect state changes from step results
      const scenarioSteps = stepResults.filter(s =>
        s.adoTestCaseId === scenario.adoTestCaseId ||
        s.stepText.includes(scenario.title),
      );
      const stateChanges: StateChangeType[] = [];
      let prevUrl = '';
      for (const step of scenarioSteps) {
        if (step.urlAfterStep !== prevUrl && prevUrl !== '') {
          stateChanges.push('url-change');
        } else if (step.explorationFindings.length > 0) {
          stateChanges.push('dom-mutation');
        } else {
          stateChanges.push('no-change');
        }
        prevUrl = step.urlAfterStep;
      }

      // Create a pattern key from the action type sequence
      const patternKey = actionTypes.join(',');
      const existing = patternMap.get(patternKey);
      if (existing) {
        existing.observationCount++;
        existing.averageStepCount = (existing.averageStepCount * (existing.observationCount - 1) + actionTypes.length) / existing.observationCount;
        existing.exampleScenarios.push(scenario.title);
      } else {
        patternMap.set(patternKey, {
          name: `pattern-${patternMap.size + 1}: ${actionTypes.slice(0, 3).join('→')}`,
          actionSequence: actionTypes,
          targetRoleSequence: targetRoles,
          stateChangeSequence: stateChanges.length > 0 ? stateChanges : ['no-change'],
          averageStepCount: actionTypes.length,
          observationCount: 1,
          exampleScenarios: [scenario.title],
        });
      }
    }

    return [...patternMap.values()];
  }

  /**
   * Build navigation flow graph from step URLs.
   * Tracks page transitions triggered by each step.
   */
  private extractNavigationFlow(
    stepResults: GuidedStepResult[],
  ): LearnedNavigationFlow {
    const transitions: NavigationTransition[] = [];
    const urlSet = new Set<string>();
    const deepPages = new Set<string>();
    const shallowPages = new Set<string>();
    let entryUrl = '';

    let prevUrl = '';
    for (const step of stepResults) {
      const url = step.urlAfterStep;
      urlSet.add(url);

      if (!entryUrl && url) {
        entryUrl = url;
      }

      // Track transitions
      if (prevUrl && url !== prevUrl) {
        transitions.push({
          fromUrl: prevUrl,
          toUrl: url,
          trigger: step.stepText,
          triggerRole: step.action,
          triggerLabel: step.stepText,
        });
      }

      // Pages with exploration findings are "deep"
      if (step.explorationFindings.length > 0) {
        deepPages.add(url);
      } else {
        shallowPages.add(url);
      }

      prevUrl = url;
    }

    // Remove deep pages from shallow set
    for (const dp of deepPages) {
      shallowPages.delete(dp);
    }

    return {
      entryUrl,
      transitions,
      uniqueUrlCount: urlSet.size,
      shallowPages: [...shallowPages],
      deepPages: [...deepPages],
    };
  }

  /**
   * Build coverage map: what elements were tested vs. what exists on the pages.
   */
  private extractCoverageMap(
    snapshots: PageSnapshot[],
    stepResults: GuidedStepResult[],
    scenarios: ImportedTestScenario[],
  ): LearnedCoverageMap {
    // Count elements by role across all snapshots
    const roleCount = new Map<string, { total: number; tested: number; untested: string[] }>();

    for (const snapshot of snapshots) {
      for (const el of snapshot.interactiveElements) {
        const role = el.role || 'unknown';
        const entry = roleCount.get(role) ?? { total: 0, tested: 0, untested: [] };
        entry.total++;
        roleCount.set(role, entry);
      }
    }

    // Mark tested elements based on step actions
    const testedLabels = new Set<string>();
    for (const step of stepResults) {
      if (step.success) {
        testedLabels.add(step.stepText.toLowerCase());
      }
    }

    // Match tested labels to elements
    for (const snapshot of snapshots) {
      for (const el of snapshot.interactiveElements) {
        const role = el.role || 'unknown';
        const entry = roleCount.get(role);
        if (!entry) continue;

        const name = (el.name || el.ariaLabel || '').toLowerCase();
        const wasTested = [...testedLabels].some(label =>
          label.includes(name) || name.includes(label),
        );
        if (wasTested) {
          entry.tested++;
        } else {
          if (entry.untested.length < 10) {
            entry.untested.push(el.name || el.ariaLabel || el.selector);
          }
        }
      }
    }

    const elementTypeCoverage: ElementTypeCoverage[] = [...roleCount.entries()].map(([role, data]) => ({
      role,
      totalFound: data.total,
      totalTested: Math.min(data.tested, data.total),
      totalUntested: Math.max(0, data.total - data.tested),
      exampleUntested: data.untested.slice(0, 10),
    }));

    // WCAG criteria from findings
    const wcagSet = new Set<string>();
    const categorySet = new Set<string>();
    const pagesWithFindings = new Set<string>();
    const allPages = new Set<string>();

    for (const step of stepResults) {
      allPages.add(step.urlAfterStep);
      for (const finding of [...step.findings, ...step.explorationFindings]) {
        wcagSet.add(finding.wcagCriterion);
        categorySet.add(finding.category);
        pagesWithFindings.add(step.urlAfterStep);
      }
    }

    const cleanPages = [...allPages].filter(p => !pagesWithFindings.has(p));

    return {
      elementTypeCoverage,
      wcagCriteriaHit: [...wcagSet],
      categoriesWithFindings: [...categorySet],
      interactionTypesTested: ['mouse'], // Guided execution uses mouse clicks
      pagesCoverage: {
        tested: [...allPages],
        withFindings: [...pagesWithFindings],
        clean: cleanPages,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Build a heading tree from flat heading list */
  private buildHeadingTree(headings: { level: number; text: string }[]): HeadingNode[] {
    const root: HeadingNode[] = [];
    const stack: { node: HeadingNode; level: number }[] = [];

    for (const h of headings) {
      const node: HeadingNode = { level: h.level, text: h.text, children: [] };

      // Pop stack until we find a parent with lower level
      while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
        stack.pop();
      }

      if (stack.length === 0) {
        root.push(node);
      } else {
        stack[stack.length - 1].node.children.push(node);
      }

      stack.push({ node, level: h.level });
    }

    return root;
  }

  /** Flatten a11y tree into a list of all nodes */
  private flattenA11yTree(nodes: { role: string; name: string; children?: any[] }[]): { role: string; name: string; children?: any[] }[] {
    const result: { role: string; name: string; children?: any[] }[] = [];
    const walk = (nodes: { role: string; name: string; children?: any[] }[]) => {
      for (const node of nodes) {
        result.push(node);
        if (node.children) {
          walk(node.children);
        }
      }
    };
    walk(nodes);
    return result;
  }

  /** Convert a URL to a URL pattern (replace specific path segments with wildcards) */
  private urlToPattern(url: string): string {
    try {
      const parsed = new URL(url);
      // Replace UUID-like and numeric path segments with wildcards
      const pattern = parsed.pathname
        .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/*')
        .replace(/\/\d+/g, '/*');
      return `${parsed.origin}${pattern}`;
    } catch {
      return url;
    }
  }

  /** Check if an element was tested by comparing label text against step texts */
  private isElementTested(
    name: string,
    role: string,
    testedSteps: Set<string>,
  ): { scenario: string; step: number } | null {
    if (!name) return null;
    const nameLower = name.toLowerCase();

    for (const stepText of testedSteps) {
      const stepLower = stepText.toLowerCase();
      // Match if the step text references this element by name
      if (stepLower.includes(nameLower) || nameLower.includes(stepLower)) {
        return { scenario: stepText, step: 0 };
      }
    }
    return null;
  }

  /** Find the most similar tested element using label-based comparison */
  private findMostSimilarTested(
    name: string,
    role: string,
    testedElements: TestedElementRef[],
  ): { score: number; label: string } {
    if (testedElements.length === 0) {
      return { score: 0, label: '' };
    }

    let bestScore = 0;
    let bestLabel = testedElements[0].label;

    for (const tested of testedElements) {
      let score = 0;

      // Role match gives a base similarity
      if (tested.role === role) {
        score += 0.4;
      }

      // Label similarity (simple character overlap)
      if (name && tested.label) {
        const overlap = this.labelSimilarity(name, tested.label);
        score += overlap * 0.6;
      }

      if (score > bestScore) {
        bestScore = score;
        bestLabel = tested.label;
      }
    }

    return { score: Math.min(bestScore, 1), label: bestLabel };
  }

  /** Simple label similarity: ratio of shared words */
  private labelSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let shared = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) shared++;
    }

    const union = new Set([...wordsA, ...wordsB]).size;
    return union > 0 ? shared / union : 0;
  }

  /** Extract the target role from an action */
  private actionTargetRole(action: TestAction): string {
    switch (action.type) {
      case 'click': return 'interactive';
      case 'type': return 'textbox';
      case 'select': return 'combobox';
      case 'navigate': return 'page';
      case 'verify': return 'assertion';
      case 'wait': return 'timing';
      case 'unknown': return 'unknown';
    }
  }
}
