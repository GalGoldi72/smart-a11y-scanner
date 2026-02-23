/**
 * ADO Test Plan / Test Case types for the hybrid scanning feature.
 *
 * Maps Azure DevOps Test Management REST API responses to internal scanner
 * representations. The importer fetches these from ADO, parses test steps,
 * and produces ImportedTestScenario objects the hybrid scanner consumes.
 */

import type { Severity } from '../rules/types.js';

// ---------------------------------------------------------------------------
// ADO API response shapes (subset of fields we actually use)
// ---------------------------------------------------------------------------

/** ADO Test Plan — top-level container */
export interface ADOTestPlan {
  id: number;
  name: string;
  state: string;
  areaPath: string;
  iteration: string;
  rootSuite: { id: number; name: string };
}

/** ADO Test Suite — groups test cases inside a plan */
export interface ADOTestSuite {
  id: number;
  name: string;
  parentSuite?: { id: number; name: string };
  testCaseCount: number;
  suiteType: 'StaticTestSuite' | 'DynamicTestSuite' | 'RequirementTestSuite';
}

/** ADO Test Case — the work item that holds steps */
export interface ADOTestCase {
  workItem: {
    id: number;
    name: string;
    fields: Record<string, unknown>;
  };
  pointAssignments: Array<{
    configurationId: number;
    configurationName: string;
    testerId: string;
  }>;
}

/** A single step inside a test case (parsed from XML) */
export interface ADOTestStep {
  index: number;
  action: string;
  expectedResult: string;
  /** Raw HTML stripped to plain text */
  actionText: string;
  expectedResultText: string;
}

/** Parsed work item fields we care about */
export interface ADOTestCaseFields {
  id: number;
  title: string;
  state: string;
  priority: number;
  areaPath: string;
  tags: string[];
  steps: ADOTestStep[];
  description: string;
  automationStatus: string;
}

// ---------------------------------------------------------------------------
// Import configuration
// ---------------------------------------------------------------------------

/** Filters to narrow which test cases get imported */
export interface TestCaseFilter {
  /** Only import from these suite IDs (empty = all suites in the plan) */
  suiteIds?: number[];
  /** Only import test cases tagged with ANY of these tags */
  tags?: string[];
  /** Only import test cases matching these area paths (prefix match) */
  areaPaths?: string[];
  /** Only import test cases in these states */
  states?: Array<'Design' | 'Ready' | 'Closed'>;
  /** Keyword search in title / steps (case-insensitive) */
  keyword?: string;
}

/** Everything needed to connect to ADO and pull test cases */
export interface TestCaseImportConfig {
  /** ADO organization URL, e.g. "https://dev.azure.com/contoso" */
  orgUrl: string;
  /** ADO project name */
  project: string;
  /** Personal Access Token (must have Test Plan read + Work Items read) */
  pat: string;
  /** Test Plan ID to import from */
  testPlanId: number;
  /** Optional filters */
  filter?: TestCaseFilter;
  /** API version override (default "7.0") */
  apiVersion?: string;
}

// ---------------------------------------------------------------------------
// Scanner-internal representations
// ---------------------------------------------------------------------------

/** Action extracted from a test step: what the tester does */
export type TestAction =
  | { type: 'navigate'; url: string }
  | { type: 'click'; target: string }
  | { type: 'type'; target: string; value: string }
  | { type: 'select'; target: string; value: string }
  | { type: 'verify'; description: string }
  | { type: 'wait'; description: string }
  | { type: 'unknown'; rawText: string };

/** Expected a11y behavior parsed from an expected-result step */
export interface ExpectedA11yBehavior {
  description: string;
  /** Best-guess WCAG criterion if we can infer it, e.g. "4.1.2" */
  wcagCriterion?: string;
  /** Best-guess severity */
  severity?: Severity;
}

/** One imported test scenario — the scanner's internal model of an ADO test case */
export interface ImportedTestScenario {
  /** ADO work item ID */
  adoTestCaseId: number;
  /** ADO work item URL for linking */
  adoTestCaseUrl: string;
  /** Test case title */
  title: string;
  /** Priority (1 = highest, 4 = lowest — ADO convention) */
  priority: number;
  /** Tags from ADO */
  tags: string[];
  /** URLs mentioned in test steps (de-duplicated) */
  urls: string[];
  /** Ordered actions parsed from test steps */
  actions: TestAction[];
  /** Expected a11y behaviors parsed from expected results */
  expectedBehaviors: ExpectedA11yBehavior[];
  /** The raw ADO steps for reference */
  rawSteps: ADOTestStep[];
  /** Source suite ID */
  suiteId: number;
  /** Source suite name */
  suiteName: string;
}

/** Import result returned by the importer */
export interface TestCaseImportResult {
  /** How many test cases were fetched from ADO */
  totalFetched: number;
  /** How many passed the filter */
  totalImported: number;
  /** How many were skipped (filter, parse error, etc.) */
  totalSkipped: number;
  /** The imported scenarios */
  scenarios: ImportedTestScenario[];
  /** Distinct URLs extracted from all scenarios */
  discoveredUrls: string[];
  /** Errors encountered (non-fatal) */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Hybrid scan configuration and results
// ---------------------------------------------------------------------------

/** Configuration for a hybrid scan that merges manual + automated */
export interface HybridScanConfig {
  /** Standard scan config (the automated crawl) */
  scanUrl: string;
  /** Import config for pulling ADO test cases */
  testCaseImport: TestCaseImportConfig;
  /** Scan ADO-sourced URLs first before crawling */
  prioritizeTestCaseUrls: boolean;
  /** Follow the step-by-step navigation flows from test cases */
  replayTestFlows: boolean;
  /** Maximum pages to discover beyond what test cases reference */
  additionalCrawlPages: number;
  /** Link filed bugs back to related ADO test cases */
  linkBugsToTestCases: boolean;
  /** Generate gap analysis comparing manual vs automated coverage */
  generateGapAnalysis: boolean;
}

/** One entry in the gap analysis */
export interface CoverageGapEntry {
  /** URL from manual test case */
  url: string;
  /** ADO test case IDs that cover this URL */
  manualTestCaseIds: number[];
  /** Whether the automated scanner also scanned this URL */
  automatedScanCovered: boolean;
  /** Automated findings on this URL (count) */
  automatedFindingCount: number;
  /** Categories of automated findings */
  automatedCategories: string[];
}

/** Gap analysis report: manual vs automated coverage */
export interface GapAnalysisReport {
  /** URLs covered by manual tests only */
  manualOnly: CoverageGapEntry[];
  /** URLs covered by automated scanning only */
  automatedOnly: string[];
  /** URLs covered by both */
  bothCovered: CoverageGapEntry[];
  /** Summary stats */
  summary: {
    totalManualUrls: number;
    totalAutomatedUrls: number;
    overlapCount: number;
    manualOnlyCount: number;
    automatedOnlyCount: number;
    coverageScore: number;
  };
}

/** Result of a hybrid scan run */
export interface HybridScanResult {
  /** Standard scan results (all pages, findings, etc.) */
  scanDurationMs: number;
  startedAt: string;
  /** Pages scanned from ADO test case URLs (priority phase) */
  testCasePages: Array<{ url: string; adoTestCaseIds: number[]; findingCount: number }>;
  /** Pages discovered by automated crawling (exploration phase) */
  crawledPages: Array<{ url: string; findingCount: number }>;
  /** All findings across both phases */
  totalFindings: number;
  /** Gap analysis (if requested) */
  gapAnalysis?: GapAnalysisReport;
  /** Bugs filed with test case links */
  filedBugs: Array<{
    bugId: number;
    bugUrl: string;
    relatedTestCaseIds: number[];
  }>;
}
