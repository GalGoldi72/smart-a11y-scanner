/**
 * TestPlanGenerator — The INVENT Engine
 *
 * Takes `LearnedPatterns` (from PatternExtractor) and produces
 * `GeneratedTestScenario[]` that feed back into GuidedExplorer for round 2.
 *
 * Implements 4 heuristic strategies (no LLM needed):
 *   1. Coverage Completion — fill untested elements in known groups
 *   2. Depth Completion — test deeper interactions (row expand, tree children)
 *   3. Cross-Page Transfer — clone plans to structurally similar pages
 *   4. Element Type Coverage — generate basic tests for untested element types
 *
 * Strategy 5 (Edge Case Generation) is LLM-powered and deferred to Phase 5.
 */

import type {
  LearnedPatterns,
  LearnedPagePattern,
  ElementGroupPattern,
  GeneratedTestScenario,
  GenerationConfig,
  GenerationStrategy,
  PageSnapshot,
  ElementTypeCoverage,
  HeadingNode,
} from './types.js';
import type { TestAction } from '../../ado/types.js';

// ── Role-to-interaction mappings for element type coverage ─────────────
const ROLE_INTERACTION_MAP: Record<string, { actionType: TestAction['type']; verb: string }> = {
  button:   { actionType: 'click', verb: 'Click' },
  link:     { actionType: 'click', verb: 'Click' },
  tab:      { actionType: 'click', verb: 'Click' },
  menuitem: { actionType: 'click', verb: 'Click' },
  checkbox: { actionType: 'click', verb: 'Toggle' },
  switch:   { actionType: 'click', verb: 'Toggle' },
  radio:    { actionType: 'click', verb: 'Select' },
  option:   { actionType: 'click', verb: 'Select' },
  listbox:  { actionType: 'click', verb: 'Expand' },
  select:   { actionType: 'click', verb: 'Open' },
  combobox: { actionType: 'click', verb: 'Open' },
  textbox:  { actionType: 'type', verb: 'Type into' },
  slider:   { actionType: 'click', verb: 'Adjust' },
  spinbutton: { actionType: 'click', verb: 'Adjust' },
  treeitem: { actionType: 'click', verb: 'Expand' },
  row:      { actionType: 'click', verb: 'Click' },
  gridcell: { actionType: 'click', verb: 'Click' },
};

/** Roles that suggest expandable/collapsible content */
const EXPANDABLE_ROLES = new Set(['row', 'treeitem', 'button', 'menuitem']);

let generatedIdCounter = 0;
function nextGeneratedId(): string {
  return `gen-${++generatedIdCounter}`;
}

export class TestPlanGenerator {
  constructor(private llmClient?: unknown) {}

  /**
   * Generate new test scenarios from learned patterns.
   */
  async generate(
    patterns: LearnedPatterns,
    currentPage?: PageSnapshot,
    config?: GenerationConfig,
  ): Promise<GeneratedTestScenario[]> {
    const cfg: GenerationConfig = {
      strategies: ['coverage-completion', 'depth-completion', 'cross-page-transfer', 'element-type-coverage'],
      maxPerStrategy: 10,
      maxTotal: 30,
      minConfidence: 0.5,
      useLLM: false,
      deduplicateAgainstHistory: true,
      ...config,
    };

    const all: GeneratedTestScenario[] = [];

    for (const strategy of cfg.strategies) {
      const generated = await this.runStrategy(strategy, patterns, currentPage, cfg);
      all.push(...generated.slice(0, cfg.maxPerStrategy));
    }

    return all
      .filter(s => s.confidence >= cfg.minConfidence)
      .slice(0, cfg.maxTotal);
  }

  // ── Strategy Router ────────────────────────────────────────────────

  private async runStrategy(
    strategy: GenerationStrategy,
    patterns: LearnedPatterns,
    _currentPage: PageSnapshot | undefined,
    _config: GenerationConfig,
  ): Promise<GeneratedTestScenario[]> {
    switch (strategy) {
      case 'coverage-completion':
        return this.generateCoverageCompletion(patterns);
      case 'depth-completion':
        return this.generateDepthCompletion(patterns);
      case 'cross-page-transfer':
        return this.generateCrossPageTransfer(patterns);
      case 'element-type-coverage':
        return this.generateElementTypeCoverage(patterns);
      case 'edge-case-generation':
        // Phase 5 — LLM-powered, stub for now
        return [];
      default:
        return [];
    }
  }

  // ── Strategy 1: Coverage Completion ────────────────────────────────
  //
  // "Human tested Tab A and Tab B — generate for Tabs C, D, E."
  //
  // For each element group with untested elements, find the scenario that
  // tested a sibling element, clone its action sequence, and swap the target.

  private generateCoverageCompletion(
    patterns: LearnedPatterns,
  ): GeneratedTestScenario[] {
    const results: GeneratedTestScenario[] = [];

    for (const page of patterns.pagePatterns) {
      for (const group of page.elementGroups) {
        if (group.untestedElements.length === 0) continue;

        // Find a source scenario from tested elements in this group
        const sourceRef = group.testedElements[0];
        if (!sourceRef) continue;

        const sourceScenarioTitle = sourceRef.testedByScenario;
        const sourceLabel = sourceRef.label;

        for (const untested of group.untestedElements) {
          const replacements = new Map<string, string>();
          replacements.set(sourceLabel, untested.label);

          // Build actions: navigate to the page, then perform the interaction
          const pageUrl = page.observedUrls[0] ?? '';
          const actions = this.buildReplacedActions(
            sourceScenarioTitle,
            patterns,
            pageUrl,
            replacements,
          );

          const title = `Test '${untested.label}' in ${group.groupRole}`;

          results.push(this.createScenario({
            title,
            strategy: 'coverage-completion',
            sourceScenarioTitle,
            confidence: untested.similarityToTested,
            rationale: `Element '${untested.label}' in ${group.groupRole} was not covered by human test`,
            actions,
            urls: pageUrl ? [pageUrl] : [],
            tags: ['ai-generated', 'coverage-completion'],
            priority: 2,
          }));
        }
      }
    }

    return results;
  }

  // ── Strategy 2: Depth Completion ───────────────────────────────────
  //
  // "Human tested table headers but not row expansion."
  //
  // For table/grid groups: if only parent-level elements were tested,
  // generate tests that click into rows expecting detail panels.
  // For tree groups: if only top-level items tested, generate for children.

  private generateDepthCompletion(
    patterns: LearnedPatterns,
  ): GeneratedTestScenario[] {
    const results: GeneratedTestScenario[] = [];

    for (const page of patterns.pagePatterns) {
      const pageUrl = page.observedUrls[0] ?? '';

      for (const group of page.elementGroups) {
        if (group.groupRole === 'table' || group.groupRole === 'grid') {
          results.push(...this.generateTableDepthTests(group, page, pageUrl, patterns));
        }

        if (group.groupRole === 'tree') {
          results.push(...this.generateTreeDepthTests(group, page, pageUrl, patterns));
        }
      }
    }

    return results;
  }

  private generateTableDepthTests(
    group: ElementGroupPattern,
    _page: LearnedPagePattern,
    pageUrl: string,
    patterns: LearnedPatterns,
  ): GeneratedTestScenario[] {
    const results: GeneratedTestScenario[] = [];

    // Check if tested elements only targeted non-row roles (headers, etc.)
    const testedRoles = new Set(group.testedElements.map(e => e.role));
    const hasTestedRows = testedRoles.has('row') || testedRoles.has('gridcell');

    // Find untested row elements that suggest expandability
    const expandableUntested = group.untestedElements.filter(
      el => EXPANDABLE_ROLES.has(el.role),
    );

    // If rows were already deeply tested, skip
    if (hasTestedRows && expandableUntested.length === 0) return results;

    const sourceScenarioTitle = group.testedElements[0]?.testedByScenario ?? '';

    for (const untested of expandableUntested) {
      const actions: TestAction[] = [];

      // Navigate to the page
      if (pageUrl) {
        actions.push({ type: 'navigate', url: pageUrl });
      }

      // Clone setup steps from the source scenario (everything before the target interaction)
      const setupActions = this.getSetupActions(sourceScenarioTitle, patterns);
      actions.push(...setupActions);

      // Click the expandable row/element
      actions.push({ type: 'click', target: untested.label });

      // Verify expansion
      actions.push({
        type: 'verify',
        description: 'Detail panel opens with accessible content',
      });

      const title = `Expand '${untested.label}' in ${group.groupRole} for depth testing`;

      results.push(this.createScenario({
        title,
        strategy: 'depth-completion',
        sourceScenarioTitle,
        confidence: 0.7,
        rationale: `Element '${untested.label}' in ${group.groupRole} appears expandable but was not tested at depth`,
        actions,
        urls: pageUrl ? [pageUrl] : [],
        tags: ['ai-generated', 'depth-completion'],
        priority: 2,
      }));
    }

    return results;
  }

  private generateTreeDepthTests(
    group: ElementGroupPattern,
    _page: LearnedPagePattern,
    pageUrl: string,
    patterns: LearnedPatterns,
  ): GeneratedTestScenario[] {
    const results: GeneratedTestScenario[] = [];

    // For trees: if only top-level items were tested, generate for child items.
    // We detect "top-level only" by checking if untested elements have 'treeitem' role.
    const untestedTreeItems = group.untestedElements.filter(
      el => el.role === 'treeitem',
    );

    if (untestedTreeItems.length === 0) return results;

    const sourceScenarioTitle = group.testedElements[0]?.testedByScenario ?? '';

    for (const untested of untestedTreeItems) {
      const actions: TestAction[] = [];

      if (pageUrl) {
        actions.push({ type: 'navigate', url: pageUrl });
      }

      const setupActions = this.getSetupActions(sourceScenarioTitle, patterns);
      actions.push(...setupActions);

      // Expand the parent tree item first (if we can infer it)
      if (untested.mostSimilarTestedElement) {
        actions.push({ type: 'click', target: untested.mostSimilarTestedElement });
      }

      // Click the child tree item
      actions.push({ type: 'click', target: untested.label });

      // Verify the tree item content is accessible
      actions.push({
        type: 'verify',
        description: 'Child tree item content is accessible and focusable',
      });

      const title = `Expand tree child '${untested.label}'`;

      results.push(this.createScenario({
        title,
        strategy: 'depth-completion',
        sourceScenarioTitle,
        confidence: 0.7,
        rationale: `Tree item '${untested.label}' is a child node that was not tested — only top-level items were exercised`,
        actions,
        urls: pageUrl ? [pageUrl] : [],
        tags: ['ai-generated', 'depth-completion'],
        priority: 2,
      }));
    }

    return results;
  }

  // ── Strategy 3: Cross-Page Transfer ────────────────────────────────
  //
  // "Human tested /recommendations — generate for /incidents which has similar structure."
  //
  // Compare structureFingerprints across page patterns. When similarity > 0.7,
  // clone all scenarios from the tested page to the untested page.

  private generateCrossPageTransfer(
    patterns: LearnedPatterns,
  ): GeneratedTestScenario[] {
    const results: GeneratedTestScenario[] = [];

    // Identify pages that have human-tested scenarios
    const testedPages = new Set<string>();
    for (const page of patterns.pagePatterns) {
      for (const group of page.elementGroups) {
        if (group.testedElements.length > 0) {
          testedPages.add(page.urlPattern);
        }
      }
    }

    for (const page of patterns.pagePatterns) {
      // Skip pages that already have tests
      if (testedPages.has(page.urlPattern)) continue;

      // Compare against all tested pages
      for (const testedPage of patterns.pagePatterns) {
        if (!testedPages.has(testedPage.urlPattern)) continue;
        if (page.urlPattern === testedPage.urlPattern) continue;

        const similarity = this.computeStructuralSimilarity(page, testedPage);
        if (similarity < 0.7) continue;

        // Collect all scenario titles from the tested page
        const scenarioTitles = new Set<string>();
        for (const group of testedPage.elementGroups) {
          for (const tested of group.testedElements) {
            scenarioTitles.add(tested.testedByScenario);
          }
        }

        const pageUrl = page.observedUrls[0] ?? '';
        const testedPageUrl = testedPage.observedUrls[0] ?? '';

        // Build element label mapping: tested page labels → new page labels
        const labelReplacements = this.buildLabelMapping(testedPage, page);

        for (const scenarioTitle of scenarioTitles) {
          const actions = this.buildReplacedActions(
            scenarioTitle,
            patterns,
            pageUrl,
            labelReplacements,
          );

          const title = `[Transfer] ${scenarioTitle} on ${pageUrl}`;

          results.push(this.createScenario({
            title,
            strategy: 'cross-page-transfer',
            sourceScenarioTitle: scenarioTitle,
            confidence: similarity,
            rationale: `Page ${pageUrl} has similar structure to tested page ${testedPageUrl}`,
            actions,
            urls: pageUrl ? [pageUrl] : [],
            tags: ['ai-generated', 'cross-page-transfer'],
            priority: 3,
          }));
        }
      }
    }

    return results;
  }

  /**
   * Compute structural similarity between two page patterns.
   *
   * Weights: landmarks 40%, headings 20%, element groups 40%
   */
  computeStructuralSimilarity(a: LearnedPagePattern, b: LearnedPagePattern): number {
    const landmarkSim = this.computeSetSimilarity(
      a.landmarks.map(l => l.role),
      b.landmarks.map(l => l.role),
    );

    const headingSim = this.computeHeadingSimilarity(a.headingStructure, b.headingStructure);

    const groupSim = this.computeSetSimilarity(
      a.elementGroups.map(g => g.groupRole),
      b.elementGroups.map(g => g.groupRole),
    );

    return landmarkSim * 0.4 + headingSim * 0.2 + groupSim * 0.4;
  }

  // ── Strategy 4: Element Type Coverage ──────────────────────────────
  //
  // "Human tested buttons — generate for dropdowns, toggles, checkboxes."
  //
  // From coverageMap.elementTypeCoverage, find untested element types
  // and generate basic interaction scenarios.

  private generateElementTypeCoverage(
    patterns: LearnedPatterns,
  ): GeneratedTestScenario[] {
    const results: GeneratedTestScenario[] = [];

    const untestedTypes = patterns.coverageMap.elementTypeCoverage.filter(
      etc => etc.totalUntested > 0,
    );

    for (const etc of untestedTypes) {
      results.push(...this.generateForElementType(etc, patterns));
    }

    return results;
  }

  private generateForElementType(
    etc: ElementTypeCoverage,
    patterns: LearnedPatterns,
  ): GeneratedTestScenario[] {
    const results: GeneratedTestScenario[] = [];
    const interaction = ROLE_INTERACTION_MAP[etc.role];
    const verb = interaction?.verb ?? 'Interact with';

    // Find a page that contains this element type
    const pageUrl = this.findPageWithRole(etc.role, patterns);

    for (const label of etc.exampleUntested) {
      const actions: TestAction[] = [];

      if (pageUrl) {
        actions.push({ type: 'navigate', url: pageUrl });
      }

      // Primary interaction
      if (interaction?.actionType === 'type') {
        actions.push({ type: 'type', target: label, value: 'test input' });
      } else {
        actions.push({ type: 'click', target: label });
      }

      // Keyboard accessibility verification
      actions.push({
        type: 'verify',
        description: `${verb} '${label}' is keyboard-accessible and has proper ARIA attributes`,
      });

      const title = `${verb} untested ${etc.role} '${label}'`;

      results.push(this.createScenario({
        title,
        strategy: 'element-type-coverage',
        sourceScenarioTitle: '',
        confidence: 0.6,
        rationale: `${etc.role} element '${label}' was found on the page but never tested (${etc.totalUntested} of ${etc.totalFound} ${etc.role} elements untested)`,
        actions,
        urls: pageUrl ? [pageUrl] : [],
        tags: ['ai-generated', 'element-type-coverage', etc.role],
        priority: 3,
      }));
    }

    return results;
  }

  // ── Helper Methods ─────────────────────────────────────────────────

  /**
   * Create a fully-formed GeneratedTestScenario with all required fields.
   */
  private createScenario(opts: {
    title: string;
    strategy: GenerationStrategy;
    sourceScenarioTitle: string;
    confidence: number;
    rationale: string;
    actions: TestAction[];
    urls: string[];
    tags: string[];
    priority: number;
  }): GeneratedTestScenario {
    return {
      adoTestCaseId: -1,
      adoTestCaseUrl: '',
      suiteId: -1,
      suiteName: 'ai-generated',
      title: opts.title,
      priority: opts.priority,
      tags: opts.tags,
      urls: opts.urls,
      actions: opts.actions,
      expectedBehaviors: [],
      rawSteps: [],
      generatedFrom: opts.strategy,
      confidence: opts.confidence,
      rationale: opts.rationale,
      sourceScenarioTitle: opts.sourceScenarioTitle,
      llmGenerated: false,
    };
  }

  /**
   * Clone a source scenario's actions with label replacements.
   * If the source scenario isn't found in patterns, returns a basic navigate action.
   */
  private cloneActions(
    actions: TestAction[],
    replacements: Map<string, string>,
  ): TestAction[] {
    return actions.map(action => {
      const cloned = { ...action };

      if ('target' in cloned && typeof cloned.target === 'string') {
        for (const [from, to] of replacements) {
          cloned.target = cloned.target.replace(from, to);
        }
      }

      if ('url' in cloned && typeof cloned.url === 'string') {
        for (const [from, to] of replacements) {
          cloned.url = cloned.url.replace(from, to);
        }
      }

      if ('description' in cloned && typeof cloned.description === 'string') {
        for (const [from, to] of replacements) {
          cloned.description = cloned.description.replace(from, to);
        }
      }

      return cloned;
    });
  }

  /**
   * Build replaced actions for a scenario targeting a new page.
   * Finds the source scenario's interaction pattern and constructs actions.
   */
  private buildReplacedActions(
    sourceScenarioTitle: string,
    patterns: LearnedPatterns,
    newPageUrl: string,
    replacements: Map<string, string>,
  ): TestAction[] {
    // Try to reconstruct actions from interaction patterns
    const interactionPattern = patterns.interactionPatterns.find(
      ip => ip.exampleScenarios.includes(sourceScenarioTitle),
    );

    const actions: TestAction[] = [];

    // Always navigate to the target page first
    if (newPageUrl) {
      actions.push({ type: 'navigate', url: newPageUrl });
    }

    if (interactionPattern) {
      // Reconstruct from the interaction pattern's action sequence
      for (let i = 0; i < interactionPattern.actionSequence.length; i++) {
        const actionType = interactionPattern.actionSequence[i]!;
        const targetRole = interactionPattern.targetRoleSequence[i] ?? '';

        if (actionType === 'navigate') continue; // already added
        if (actionType === 'click') {
          actions.push({ type: 'click', target: targetRole });
        } else if (actionType === 'type') {
          actions.push({ type: 'type', target: targetRole, value: 'test input' });
        } else if (actionType === 'verify') {
          actions.push({ type: 'verify', description: targetRole });
        } else if (actionType === 'select') {
          actions.push({ type: 'select', target: targetRole, value: '' });
        } else if (actionType === 'wait') {
          actions.push({ type: 'wait', description: targetRole });
        }
      }
    }

    // Apply label replacements
    return this.cloneActions(actions, replacements);
  }

  /**
   * Extract the setup actions from a source scenario (navigate + pre-interaction steps).
   */
  private getSetupActions(
    sourceScenarioTitle: string,
    patterns: LearnedPatterns,
  ): TestAction[] {
    const interactionPattern = patterns.interactionPatterns.find(
      ip => ip.exampleScenarios.includes(sourceScenarioTitle),
    );

    if (!interactionPattern) return [];

    const setup: TestAction[] = [];
    for (const actionType of interactionPattern.actionSequence) {
      // Stop before the main interaction — setup is everything that's 'navigate' or 'wait'
      if (actionType === 'click' || actionType === 'type' || actionType === 'select') break;
      if (actionType === 'wait') {
        setup.push({ type: 'wait', description: 'Wait for page load' });
      }
    }

    return setup;
  }

  /**
   * Compute Jaccard similarity between two sets of strings.
   * Returns intersection / union.
   */
  private computeSetSimilarity(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);

    if (setA.size === 0 && setB.size === 0) return 1.0;

    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }

    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Compare heading structures by depth coverage.
   */
  private computeHeadingSimilarity(a: HeadingNode[], b: HeadingNode[]): number {
    const depthsA = this.collectHeadingDepths(a);
    const depthsB = this.collectHeadingDepths(b);
    return this.computeSetSimilarity(
      depthsA.map(String),
      depthsB.map(String),
    );
  }

  private collectHeadingDepths(nodes: HeadingNode[]): number[] {
    const depths: number[] = [];
    const walk = (list: HeadingNode[]): void => {
      for (const node of list) {
        depths.push(node.level);
        if (node.children.length > 0) walk(node.children);
      }
    };
    walk(nodes);
    return [...new Set(depths)];
  }

  /**
   * Build a label mapping between a tested page and a new page.
   * Maps each tested-page element label to the closest label on the new page.
   */
  private buildLabelMapping(
    testedPage: LearnedPagePattern,
    newPage: LearnedPagePattern,
  ): Map<string, string> {
    const mapping = new Map<string, string>();

    for (let gi = 0; gi < testedPage.elementGroups.length; gi++) {
      const testedGroup = testedPage.elementGroups[gi]!;
      const newGroup = newPage.elementGroups[gi]; // positional match
      if (!newGroup) continue;

      for (let ei = 0; ei < testedGroup.elementLabels.length; ei++) {
        const testedLabel = testedGroup.elementLabels[ei]!;
        const newLabel = newGroup.elementLabels[ei]; // positional match
        if (newLabel && testedLabel !== newLabel) {
          mapping.set(testedLabel, newLabel);
        }
      }
    }

    return mapping;
  }

  /**
   * Find a page URL that contains an element with the given role.
   */
  private findPageWithRole(role: string, patterns: LearnedPatterns): string {
    for (const page of patterns.pagePatterns) {
      for (const group of page.elementGroups) {
        const hasRole =
          group.testedElements.some(e => e.role === role) ||
          group.untestedElements.some(e => e.role === role);
        if (hasRole && page.observedUrls.length > 0) {
          return page.observedUrls[0]!;
        }
      }
    }
    return '';
  }
}


