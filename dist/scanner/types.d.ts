/**
 * Scanner engine types.
 * Data structures for the scan pipeline:
 *   URL → crawl → detect elements → run checks → collect findings → report
 */
import { Severity, WcagLevel, RuleCategory } from '../rules/types.js';
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
    /** Run browser in headless mode */
    headless: boolean;
    /** Viewport width */
    viewportWidth: number;
    /** Viewport height */
    viewportHeight: number;
    /** Capture screenshots of violations */
    captureScreenshots: boolean;
    /** User-agent string override */
    userAgent?: string;
    /** HTTP basic auth */
    auth?: {
        username: string;
        password: string;
    };
}
export declare const DEFAULT_SCAN_CONFIG: ScanConfig;
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
    /** Outer HTML snippet (truncated) */
    htmlSnippet: string;
    /** Screenshot as base64 PNG */
    screenshot?: string;
    remediation: string;
}
/** Results for a single scanned page */
export interface PageResult {
    url: string;
    metadata: PageMetadata;
    findings: Finding[];
    analysisTimeMs: number;
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
    config: ScanConfig;
    pages: PageResult[];
    links: PageLink[];
    summary: {
        totalPages: number;
        totalFindings: number;
        bySeverity: Record<Severity, number>;
        byCategory: Record<string, number>;
    };
    durationMs: number;
    startedAt: string;
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
//# sourceMappingURL=types.d.ts.map