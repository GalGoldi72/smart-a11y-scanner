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
import { chromium } from 'playwright';
import { DEFAULT_SCAN_CONFIG } from './types.js';
import { Crawler } from './crawler.js';
import { PageAnalyzer } from './page-analyzer.js';
export class ScanEngine {
    config;
    constructor(config) {
        this.config = { ...DEFAULT_SCAN_CONFIG, ...config };
    }
    async run() {
        const startedAt = new Date().toISOString();
        const startTime = Date.now();
        let browser = null;
        try {
            // 1. Launch browser
            browser = await chromium.launch({
                headless: this.config.headless,
            });
            const context = await browser.newContext({
                viewport: {
                    width: this.config.viewportWidth,
                    height: this.config.viewportHeight,
                },
                userAgent: this.config.userAgent,
                httpCredentials: this.config.auth
                    ? { username: this.config.auth.username, password: this.config.auth.password }
                    : undefined,
            });
            // 2. Crawl — discover pages
            const crawler = new Crawler(this.config);
            const { urls, links } = await crawler.discoverPages(context);
            // 3. Analyze — run checks on each discovered page
            const analyzer = new PageAnalyzer(this.config);
            const pages = [];
            for (const url of urls) {
                const page = await context.newPage();
                try {
                    const result = await analyzer.analyze(page, url);
                    pages.push(result);
                }
                catch (err) {
                    pages.push({
                        url,
                        metadata: {
                            url,
                            title: '',
                            lang: null,
                            metaDescription: null,
                            metaViewport: null,
                            h1Count: 0,
                        },
                        findings: [],
                        analysisTimeMs: 0,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
                finally {
                    await page.close();
                }
            }
            // 4. Aggregate results
            const result = this.buildResult(this.config, pages, links, startedAt, startTime);
            return result;
        }
        catch (err) {
            // Top-level failure (browser didn't launch, etc.)
            return {
                config: this.config,
                pages: [],
                links: [],
                summary: {
                    totalPages: 0,
                    totalFindings: 0,
                    bySeverity: { critical: 0, major: 0, minor: 0, advisory: 0 },
                    byCategory: {},
                },
                durationMs: Date.now() - startTime,
                startedAt,
            };
        }
        finally {
            if (browser) {
                await browser.close();
            }
        }
    }
    buildResult(config, pages, links, startedAt, startTime) {
        const bySeverity = {
            critical: 0,
            major: 0,
            minor: 0,
            advisory: 0,
        };
        const byCategory = {};
        let totalFindings = 0;
        for (const page of pages) {
            for (const finding of page.findings) {
                totalFindings++;
                bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
                byCategory[finding.category] = (byCategory[finding.category] || 0) + 1;
            }
        }
        return {
            config,
            pages,
            links,
            summary: {
                totalPages: pages.length,
                totalFindings,
                bySeverity,
                byCategory,
            },
            durationMs: Date.now() - startTime,
            startedAt,
        };
    }
}
//# sourceMappingURL=engine.js.map