/**
 * ScanEngine — orchestrates the full scan pipeline.
 *
 *   1. Launch Playwright browser
 *   2. Crawl: discover pages from start URL
 *   3. Analyze: run accessibility checks on each page
 *   4. Collect: aggregate findings into ScanResult
 *   5. Teardown: close browser
 *
 * Usage:
 *   const engine = new ScanEngine({ url: 'https://example.com', maxDepth: 1 });
 *   const result = await engine.run();
 */
import { ScanConfig, ScanResult } from './types.js';
export declare class ScanEngine {
    private config;
    constructor(config: Partial<ScanConfig> & {
        url: string;
    });
    run(): Promise<ScanResult>;
    private buildResult;
}
//# sourceMappingURL=engine.d.ts.map