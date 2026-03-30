/**
 * Public API barrel export.
 */

// Scanner engine
export { ScanEngine } from './scanner/engine.js';
export { Crawler } from './scanner/crawler.js';
export { PageAnalyzer } from './scanner/page-analyzer.js';
export type {
  ScanConfig,
  ScanResult,
  PageResult,
  Finding,
  PageLink,
  PageMetadata,
  AdoConfig,
  AuthConfig,
} from './scanner/types.js';
export { DEFAULT_SCAN_CONFIG } from './scanner/types.js';

// Test case suggestion
export { TestCaseSuggester } from './scanner/test-case-suggester.js';
export type { 
  SuggestedTestCase,
  TestStep,
  TestCaseSuggestionResult, 
  CategorySummary 
} from './types/suggestion-test-case.js';

// Rules (Drummer)
export type {
  AccessibilityRule,
  RuleCatalog,
  Severity,
  WcagLevel,
  RuleCategory,
} from './rules/types.js';
export { RuleRunner } from './rules/rule-runner.js';
export type { IRuleRunner, RuleContext, RuleEvaluation } from './rules/rule-runner.js';

// Detection (Bobbie)
export { UIDetector } from './detection/ui-detector.js';
export { FlowAnalyzer } from './detection/flow-analyzer.js';
export type { IFlowAnalyzer, UserFlow } from './detection/flow-analyzer.js';

// Reporting (Alex)
export { Reporter } from './reporting/reporter.js';
export type { IReporter, ReportArtifact } from './reporting/reporter.js';

// ADO integration
export { AdoClient } from './ado/client.js';
export { BugCreator } from './ado/bug-creator.js';
export type { IBugCreator, BugFilingResult } from './ado/bug-creator.js';
export { TestCaseImporter } from './ado/test-case-importer.js';
export type {
  HybridScanConfig,
  HybridScanResult,
  ImportedTestScenario,
  TestCaseImportConfig,
  TestCaseImportResult,
  GapAnalysisReport,
} from './ado/types.js';

// Hybrid scanner
export { HybridScanner } from './scanner/hybrid-scanner.js';

// Config
export { loadConfig, ConfigValidationError } from './config/loader.js';
