/**
 * Scanner engine types.
 * Data structures for the scan pipeline:
 *   URL → crawl → detect elements → run checks → collect findings → report
 */

import { Severity, WcagLevel, RuleCategory } from '../rules/types.js';

/** Authentication configuration for scanning as a logged-in user */
export interface AuthConfig {
  /** URL to navigate to for login */
  loginUrl?: string;
  /** Basic username/password credentials */
  credentials?: {
    username: string;
    password: string;
  };
  /** Pre-set cookies to inject before scanning */
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
  }>;
  /** Wait for this selector after login to confirm auth succeeded */
  waitForSelector?: string;
}

/** Configuration for a scan run */
export interface ScanConfig {
  /** Starting URL to scan */
  url: string;
  /** How many links deep to follow (0 = only the start URL) */
  maxDepth: number;
  /** Only follow links on the same domain as the start URL */
  sameDomainOnly: boolean;
  /** Maximum number of pages to scan */
  maxPages: number;
  /** Navigation timeout per page in milliseconds */
  pageTimeoutMs: number;
  /** Overall scan time limit in milliseconds (default: 600000 = 10 min) */
  timeout: number;
  /** Run browser in headless mode */
  headless: boolean;
  /** Pause for manual login before scanning (implies headless: false) */
  interactiveAuth?: boolean;
  /** Discover SPA routes by clicking navigation elements (default: true when interactiveAuth) */
  spaDiscovery?: boolean;
  /** Viewport width */
  viewportWidth: number;
  /** Viewport height */
  viewportHeight: number;
  /** Capture screenshots of violations */
  captureScreenshots: boolean;
  /** User-agent string override */
  userAgent?: string;
  /** Authentication config — use customer credentials */
  auth?: AuthConfig;
  /** Test plan guided scanning config */
  testPlan?: TestPlanConfig;
  /** Extract patterns from guided test execution */
  learn?: boolean;
  /** Generate new test plans from learned patterns */
  generate?: boolean;
  /** Use LLM for edge case generation */
  aiGenerate?: boolean;
  /** Directory for pattern storage (default: '.a11y-patterns') */
  patternDir?: string;
  /** Maximum generated scenarios */
  maxGenerated?: number;
  /** Which generation strategies to use */
  generationStrategies?: string[];
  /** Capture a11y snapshots during guided execution (auto-enabled with learn) */
  captureSnapshots?: boolean;
  /** Browser channel: 'chromium' (default) or 'msedge' */
  browserChannel?: 'chromium' | 'msedge';
  /** Enable dynamic accessibility checks (zoom, keyboard, focus, etc.). Default: false */
  dynamicChecks?: boolean;
}

export const DEFAULT_SCAN_CONFIG: ScanConfig = {
  url: '',
  maxDepth: 1,
  sameDomainOnly: true,
  maxPages: 20,
  pageTimeoutMs: 30_000,
  timeout: 600_000,
  headless: true,
  viewportWidth: 1280,
  viewportHeight: 720,
  captureScreenshots: true,
};

/** Metadata extracted from a scanned page */
export interface PageMetadata {
  url: string;
  title: string;
  lang: string | null;
  metaDescription: string | null;
  metaViewport: string | null;
  h1Count: number;
}

/** A single accessibility finding */
export interface Finding {
  ruleId: string;
  category: RuleCategory;
  severity: Severity;
  wcagLevel: WcagLevel;
  wcagCriterion: string;
  message: string;
  /** CSS selector path to the offending element */
  selector: string;
  /** URL of the page where this finding was detected */
  pageUrl: string;
  /** Outer HTML snippet (truncated) */
  htmlSnippet: string;
  /** Screenshot as base64 PNG */
  screenshot?: string;
  /** Path to screenshot file on disk (if saved) */
  screenshotPath?: string;
  /** Repro steps: human-readable navigation breadcrumb to reach this finding */
  reproSteps?: string[];
  remediation: string;
}

/** Results for a single scanned page */
export interface PageResult {
  url: string;
  metadata: PageMetadata;
  findings: Finding[];
  analysisTimeMs: number;
  /** Screenshot of the page state when scanned (base64 PNG) */
  screenshot?: string;
  error?: string;
}

/** Discovered link between pages */
export interface PageLink {
  sourceUrl: string;
  targetUrl: string;
  linkText: string;
}

/** Complete scan result */
export interface ScanResult {
  /** The target URL that was scanned */
  url: string;
  /** ISO timestamp of when the scan started */
  scanDate: string;
  /** How long the scan took in milliseconds */
  duration: number;
  /** Whether the scan was stopped due to timeout */
  timedOut: boolean;
  /** Number of pages that were scanned */
  pagesScanned: number;
  config: ScanConfig;
  pages: PageResult[];
  links: PageLink[];
  summary: {
    totalPages: number;
    totalFindings: number;
    bySeverity: Record<Severity, number>;
    byCategory: Record<string, number>;
    byWcagLevel: Record<WcagLevel, number>;
  };
  /** Guided exploration results (when testPlan is configured) */
  guidedResults?: GuidedExplorationResult;
  /** Summary of patterns learned during guided execution */
  learningSummary?: {
    patternsExtracted: number;
    pagePatterns: number;
    interactionPatterns: number;
    coverageGaps: number;
    patternFile: string;
  };
  /** Summary of AI-generated test scenarios */
  generationSummary?: {
    scenariosGenerated: number;
    scenariosExecuted: number;
    scenariosSucceeded: number;
    findingsFromGenerated: number;
    strategies: Record<string, number>;
  };
  /** @deprecated Use `duration` */
  durationMs: number;
  /** @deprecated Use `scanDate` */
  startedAt: string;
}

/** A single step in the navigation breadcrumb for repro steps */
export interface BreadcrumbEntry {
  action: string;       // e.g., "navigate", "click", "panel_opened"
  elementText: string;  // e.g., "Incidents button", "Settings link"
  url: string;          // URL at the time of this action
}

/** Deep exploration state tracking */
export interface ExplorationState {
  url: string;
  fingerprint: string;
  depth: number;
  parentState?: string;
  discoveredVia: string; // e.g., "click: Incidents button"
  /** Base64 PNG screenshot of the state when first visited */
  stateScreenshot?: string;
  /** Navigation breadcrumb showing how the scanner reached this state */
  navigationPath?: BreadcrumbEntry[];
}

/** Test plan configuration — can come from ADO API, file, or inline steps */
export interface TestPlanConfig {
  /** Source type */
  source: 'ado-api' | 'file' | 'inline';
  /** ADO API settings (when source = 'ado-api') */
  ado?: {
    planId: number;
    suiteIds?: number[];
    /** ADO org URL — falls back to AdoConfig.orgUrl */
    orgUrl?: string;
    project?: string;
    pat?: string;
  };
  /** File path to test plan YAML/JSON (when source = 'file') */
  filePath?: string;
  /** Inline steps (when source = 'inline') */
  inlineSteps?: string[];
  /** Auto-explore after each guided step. Default: true */
  autoExploreAfterSteps?: boolean;
  /** Exploration depth at each step. Default: 1 */
  explorationDepth?: number;
}

/** Result of a guided step execution */
export interface GuidedStepResult {
  /** Step index (0-based) */
  stepIndex: number;
  /** Original step text */
  stepText: string;
  /** ADO test case ID (if from ADO) */
  adoTestCaseId?: number;
  /** Whether the step executed successfully */
  success: boolean;
  /** Error if step failed */
  error?: string;
  /** Playwright action that was executed */
  action: string;
  /** URL after step execution */
  urlAfterStep: string;
  /** A11y findings at this step's state */
  findings: Finding[];
  /** Additional findings from auto-exploration at this step */
  explorationFindings: Finding[];
  /** Screenshot after step */
  screenshot?: string;
  /** Time spent on this step (ms) */
  durationMs: number;
}

/** Result of the guided exploration session */
export interface GuidedExplorationResult {
  /** All page results from guided + exploration */
  pages: PageResult[];
  /** Per-step results for report mapping */
  stepResults: GuidedStepResult[];
  /** Total guided steps attempted */
  totalSteps: number;
  /** Steps that executed successfully */
  successfulSteps: number;
  /** Steps that failed */
  failedSteps: number;
  /** Total findings across all steps */
  totalFindings: number;
}

/** Test plan configuration — can come from ADO API, file, or CLI inline steps */
export interface TestPlanConfig {
  /** Source type */
  source: 'ado-api' | 'file' | 'inline';
  /** ADO API settings (when source = 'ado-api') */
  ado?: {
    planId: number;
    suiteIds?: number[];
    /** ADO org URL — falls back to AdoConfig.orgUrl */
    orgUrl?: string;
    project?: string;
    pat?: string;
  };
  /** File path to test plan YAML/JSON (when source = 'file') */
  filePath?: string;
  /** Inline steps (when source = 'inline') */
  inlineSteps?: string[];
  /** Auto-explore after each guided step. Default: true */
  autoExploreAfterSteps?: boolean;
  /** Exploration depth at each step. Default: 1 */
  explorationDepth?: number;
  /** Use LLM for step interpretation. Default: false */
  useAIInterpretation?: boolean;
}

/** Result of a guided step execution */
export interface GuidedStepResult {
  /** Step index (0-based) */
  stepIndex: number;
  /** Original step text */
  stepText: string;
  /** ADO test case ID (if from ADO) */
  adoTestCaseId?: number;
  /** Whether the step executed successfully */
  success: boolean;
  /** Error if step failed */
  error?: string;
  /** Playwright action that was executed */
  action: string;
  /** URL after step execution */
  urlAfterStep: string;
  /** A11y findings at this step's state */
  findings: Finding[];
  /** Additional findings from auto-exploration at this step */
  explorationFindings: Finding[];
  /** Screenshot after step */
  screenshot?: string;
  /** Time spent on this step (ms) */
  durationMs: number;
}

/** Result of the guided exploration session */
export interface GuidedExplorationResult {
  /** All page results from guided + exploration */
  pages: PageResult[];
  /** Per-step results for report mapping */
  stepResults: GuidedStepResult[];
  /** Total guided steps attempted */
  totalSteps: number;
  /** Steps that executed successfully */
  successfulSteps: number;
  /** Steps that failed */
  failedSteps: number;
  /** Total findings across all steps */
  totalFindings: number;
}

/** Azure DevOps config for bug filing */
export interface AdoConfig {
  orgUrl: string;
  project: string;
  areaPath?: string;
  iterationPath?: string;
  pat: string;
  tags?: string[];
  /** Test plan import for hybrid scanning */
  testPlan?: {
    id: number;
    suiteIds?: number[];
    tags?: string[];
    areaPaths?: string[];
    states?: Array<'Design' | 'Ready' | 'Closed'>;
  };
  /** Link filed bugs back to related ADO test cases */
  linkTestCases?: boolean;
}
