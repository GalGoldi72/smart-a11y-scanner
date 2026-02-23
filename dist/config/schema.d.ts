/**
 * Configuration schema for the scanner.
 *
 * This is the USER-FACING config shape — what gets loaded from YAML
 * and CLI args. The engine has its own internal config (scanner/types.ts)
 * and detection has its own (detection/types.ts).
 *
 * The config/loader.ts merges YAML + CLI → ScanConfig.
 */
import type { Severity, WcagLevel } from '../rules/types.js';
/** Azure DevOps connection configuration */
export interface ADOConfig {
    /** ADO organization URL (e.g. "https://dev.azure.com/myorg") */
    orgUrl: string;
    /** ADO project name */
    project: string;
    /** Personal Access Token (read from env var ADO_PAT) */
    pat: string;
    /** Area path for filed bugs */
    areaPath?: string;
    /** Iteration path for filed bugs */
    iterationPath?: string;
    /** Tags to apply to all filed bugs */
    tags?: string[];
}
/** Report output configuration */
export interface ReportConfig {
    /** Output formats to generate */
    formats: Array<'html' | 'json' | 'csv'>;
    /** Output directory for reports */
    outputDir: string;
    /** Whether to include screenshots in reports */
    includeScreenshots: boolean;
}
/** The full scanner configuration (user-facing) */
export interface ScanConfig {
    /** Target URL to scan */
    targetUrl: string;
    /** Maximum crawl depth (0 = single page) */
    crawlDepth: number;
    /** Maximum number of pages to scan */
    maxPages: number;
    /** Page load timeout in milliseconds */
    pageTimeout: number;
    /** URL patterns to exclude from crawling */
    crawlExclusions: string[];
    /** Whether to respect robots.txt */
    respectRobotsTxt: boolean;
    /** Viewport dimensions */
    viewport: {
        width: number;
        height: number;
    };
    /** Minimum severity to report */
    minSeverity: Severity;
    /** WCAG conformance level to test against */
    wcagLevel: WcagLevel;
    /** ADO integration config (null = disabled) */
    ado: ADOConfig | null;
    /** Report output config */
    report: ReportConfig;
    /** Whether to file bugs in ADO */
    fileBugs: boolean;
    /** Severity threshold for CI exit code (fail if findings >= this) */
    failOnSeverity: Severity | null;
}
export type { HybridScanConfig, TestCaseImportConfig, ImportedTestScenario, HybridScanResult, GapAnalysisReport, } from '../ado/types.js';
//# sourceMappingURL=schema.d.ts.map