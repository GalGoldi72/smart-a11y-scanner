/**
 * Pattern types for the LEARN → INVENT pipeline.
 *
 * These types define the structures used by PatternExtractor (LEARN phase)
 * and TestPlanGenerator (INVENT phase) to capture and reason about
 * accessibility testing patterns from guided test execution.
 *
 * Full types owned by Naomi — this is the canonical source.
 */

import type { TestAction, ImportedTestScenario } from '../../ado/types.js';

// ---------------------------------------------------------------------------
// Page structure patterns
// ---------------------------------------------------------------------------

export interface LearnedPagePattern {
  urlPattern: string;
  observedUrls: string[];
  landmarks: LandmarkPattern[];
  elementGroups: ElementGroupPattern[];
  headingStructure: HeadingNode[];
  contentRegions: ContentRegionPattern[];
  structureFingerprint: string;
  lastObserved: string;
}

export interface LandmarkPattern {
  role: string;
  label: string | null;
  childElementTypes: string[];
  childCount: number;
}

export interface ElementGroupPattern {
  groupRole: string;
  containerSelector: string;
  totalElements: number;
  testedElements: TestedElementRef[];
  untestedElements: UntestedElementRef[];
  elementLabels: string[];
}

export interface TestedElementRef {
  label: string;
  role: string;
  selector: string;
  testedByScenario: string;
  testedAtStep: number;
}

export interface UntestedElementRef {
  label: string;
  role: string;
  selector: string;
  similarityToTested: number;
  mostSimilarTestedElement: string;
}

export interface HeadingNode {
  level: number;
  text: string;
  children: HeadingNode[];
}

export interface ContentRegionPattern {
  method: 'aria-landmark' | 'fluent-class' | 'layout-heuristic' | 'css-pattern' | 'fallback';
  selector: string;
  interactiveChildCount: number;
}

// ---------------------------------------------------------------------------
// Interaction patterns
// ---------------------------------------------------------------------------

export interface LearnedInteractionPattern {
  name: string;
  actionSequence: TestAction['type'][];
  targetRoleSequence: string[];
  stateChangeSequence: StateChangeType[];
  averageStepCount: number;
  observationCount: number;
  exampleScenarios: string[];
}

export type StateChangeType =
  | 'url-change'
  | 'overlay-opened'
  | 'panel-expanded'
  | 'content-loaded'
  | 'dom-mutation'
  | 'no-change';

// ---------------------------------------------------------------------------
// Navigation flow
// ---------------------------------------------------------------------------

export interface LearnedNavigationFlow {
  entryUrl: string;
  transitions: NavigationTransition[];
  uniqueUrlCount: number;
  shallowPages: string[];
  deepPages: string[];
}

export interface NavigationTransition {
  fromUrl: string;
  toUrl: string;
  trigger: string;
  triggerRole: string;
  triggerLabel: string;
}

// ---------------------------------------------------------------------------
// Coverage map
// ---------------------------------------------------------------------------

export interface LearnedCoverageMap {
  elementTypeCoverage: ElementTypeCoverage[];
  wcagCriteriaHit: string[];
  categoriesWithFindings: string[];
  interactionTypesTested: string[];
  pagesCoverage: {
    tested: string[];
    withFindings: string[];
    clean: string[];
  };
}

export interface ElementTypeCoverage {
  role: string;
  totalFound: number;
  totalTested: number;
  totalUntested: number;
  exampleUntested: string[];
}

// ---------------------------------------------------------------------------
// Execution summary
// ---------------------------------------------------------------------------

export interface ExecutionSummary {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  totalFindings: number;
  pagesVisited: string[];
  uniqueElementsInteracted: number;
  scanDurationMs: number;
}

// ---------------------------------------------------------------------------
// Top-level learned patterns container
// ---------------------------------------------------------------------------

export interface LearnedPatterns {
  version: '1.0';
  extractedAt: string;
  siteUrl: string;
  testPlanSource: string;
  scenarioCount: number;
  pagePatterns: LearnedPagePattern[];
  interactionPatterns: LearnedInteractionPattern[];
  navigationFlow: LearnedNavigationFlow;
  coverageMap: LearnedCoverageMap;
  executionSummary: ExecutionSummary;
}

// ---------------------------------------------------------------------------
// Generated test scenario
// ---------------------------------------------------------------------------

export interface GeneratedTestScenario extends Omit<ImportedTestScenario, 'adoTestCaseId' | 'adoTestCaseUrl' | 'suiteId' | 'suiteName'> {
  adoTestCaseId: -1;
  adoTestCaseUrl: '';
  suiteId: -1;
  suiteName: 'ai-generated';
  generatedFrom: GenerationStrategy;
  confidence: number;
  rationale: string;
  sourceScenarioTitle: string;
  llmGenerated: boolean;
}

export type GenerationStrategy =
  | 'coverage-completion'
  | 'depth-completion'
  | 'cross-page-transfer'
  | 'element-type-coverage'
  | 'edge-case-generation';

// ---------------------------------------------------------------------------
// Generation config
// ---------------------------------------------------------------------------

export interface GenerationConfig {
  strategies: GenerationStrategy[];
  maxPerStrategy: number;
  maxTotal: number;
  minConfidence: number;
  useLLM: boolean;
  deduplicateAgainstHistory: boolean;
}

// ---------------------------------------------------------------------------
// Page snapshot (captured during guided execution)
// ---------------------------------------------------------------------------

export interface PageSnapshot {
  url: string;
  stepIndex: number;
  accessibilityTree: A11yTreeNode[];
  interactiveElements: InteractiveElement[];
  landmarks: { role: string; label: string | null; selector: string }[];
  headings: { level: number; text: string }[];
}

export interface A11yTreeNode {
  role: string;
  name: string;
  value?: string;
  description?: string;
  focused?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  selected?: boolean;
  children?: A11yTreeNode[];
}

/**
 * Interactive element snapshot — simplified from deep-explorer's InteractiveElement
 * for serialization. Captures enough to identify the element and compare across pages.
 */
export interface InteractiveElement {
  role: string;
  name: string;
  selector: string;
  tag?: string;
  ariaLabel?: string | null;
  isInsideMain?: boolean;
  isInsideNav?: boolean;
  isInsideHeader?: boolean;
  disabled?: boolean;
  attributes?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Extraction config
// ---------------------------------------------------------------------------

export interface ExtractionConfig {
  /** Minimum similarity threshold for grouping elements (0-1). Default: 0.7 */
  similarityThreshold: number;
  /** Include raw a11y trees in output (verbose). Default: false */
  includeRawTrees: boolean;
  /** Maximum URL patterns to extract. Default: 50 */
  maxUrlPatterns: number;
}
