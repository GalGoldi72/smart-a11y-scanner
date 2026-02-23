/**
 * Hybrid Scanner — combines ADO manual test case intelligence with automated
 * crawling to produce deeper, smarter accessibility scans.
 *
 * Strategy:
 *   Phase 1 — Priority scan: visit URLs from ADO test cases first
 *   Phase 2 — Guided navigation: replay test case step flows
 *   Phase 3 — Automated crawl: discover pages manual tests don't cover
 *   Phase 4 — Gap analysis: compare manual vs automated coverage
 *   Phase 5 — Bug filing: link back to related ADO test cases
 */
import { ScanConfig } from './types.js';
import type { HybridScanConfig, HybridScanResult } from '../ado/types.js';
export declare class HybridScanner {
    private hybridConfig;
    private scanConfig;
    constructor(hybridConfig: HybridScanConfig, scanConfigOverrides?: Partial<ScanConfig>);
    /** Run the full hybrid scan pipeline. */
    run(): Promise<HybridScanResult>;
    /** Scan a single page — thin wrapper around PageAnalyzer */
    private scanPage;
    /** Replay a test case flow's navigation and interaction steps */
    private replayTestFlow;
    /** Execute a single parsed test action against a Playwright page */
    private executeAction;
    /** Order URLs by test case priority (lower priority number = scanned first) */
    private prioritizeUrls;
    private buildUrlTestCaseMap;
    private buildGapAnalysis;
    /** Link a filed bug to related ADO test cases using the "Tests / Tested By" relation */
    private linkBugToTestCases;
    /** Build a minimal ScanResult summary for a single page (used in bug filing) */
    private buildPageSummary;
}
//# sourceMappingURL=hybrid-scanner.d.ts.map