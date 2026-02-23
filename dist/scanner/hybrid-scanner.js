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
import { chromium } from 'playwright';
import { DEFAULT_SCAN_CONFIG } from './types.js';
import { Crawler } from './crawler.js';
import { PageAnalyzer } from './page-analyzer.js';
import { TestCaseImporter } from '../ado/test-case-importer.js';
import { AdoClient } from '../ado/client.js';
export class HybridScanner {
    hybridConfig;
    scanConfig;
    constructor(hybridConfig, scanConfigOverrides) {
        this.hybridConfig = hybridConfig;
        this.scanConfig = {
            ...DEFAULT_SCAN_CONFIG,
            url: hybridConfig.scanUrl,
            ...scanConfigOverrides,
        };
    }
    /** Run the full hybrid scan pipeline. */
    async run() {
        const startedAt = new Date().toISOString();
        const startTime = Date.now();
        let browser = null;
        try {
            // ---------------------------------------------------------------
            // Step 0: Import test cases from ADO
            // ---------------------------------------------------------------
            const importer = new TestCaseImporter(this.hybridConfig.testCaseImport);
            const importResult = await importer.importTestCases();
            if (importResult.warnings.length > 0) {
                console.warn('[hybrid] Import warnings:', importResult.warnings.join('; '));
            }
            // Build URL → test case ID mapping
            const urlMap = this.buildUrlTestCaseMap(importResult.scenarios);
            // ---------------------------------------------------------------
            // Step 1: Launch browser
            // ---------------------------------------------------------------
            browser = await chromium.launch({ headless: this.scanConfig.headless });
            const context = await browser.newContext({
                viewport: {
                    width: this.scanConfig.viewportWidth,
                    height: this.scanConfig.viewportHeight,
                },
                userAgent: this.scanConfig.userAgent,
                httpCredentials: this.scanConfig.auth
                    ? { username: this.scanConfig.auth.username, password: this.scanConfig.auth.password }
                    : undefined,
            });
            const analyzer = new PageAnalyzer(this.scanConfig);
            const allPages = [];
            const scannedUrls = new Set();
            // ---------------------------------------------------------------
            // Phase 1: Priority scan — ADO test case URLs
            // ---------------------------------------------------------------
            const testCasePages = [];
            if (this.hybridConfig.prioritizeTestCaseUrls) {
                const priorityUrls = this.prioritizeUrls(importResult);
                for (const url of priorityUrls) {
                    if (scannedUrls.has(url))
                        continue;
                    scannedUrls.add(url);
                    const pageResult = await this.scanPage(context, analyzer, url);
                    allPages.push(pageResult);
                    testCasePages.push({
                        url,
                        adoTestCaseIds: urlMap[url] ?? [],
                        findingCount: pageResult.findings.length,
                    });
                }
            }
            // ---------------------------------------------------------------
            // Phase 2: Guided navigation — replay test case flows
            // ---------------------------------------------------------------
            if (this.hybridConfig.replayTestFlows) {
                for (const scenario of importResult.scenarios) {
                    await this.replayTestFlow(context, scenario, scannedUrls, allPages, analyzer, testCasePages, urlMap);
                }
            }
            // ---------------------------------------------------------------
            // Phase 3: Automated crawl — discover additional pages
            // ---------------------------------------------------------------
            const crawledPages = [];
            const remainingBudget = this.hybridConfig.additionalCrawlPages;
            if (remainingBudget > 0) {
                const crawlConfig = {
                    ...this.scanConfig,
                    maxPages: remainingBudget,
                };
                const crawler = new Crawler(crawlConfig);
                const { urls: crawledUrls } = await crawler.discoverPages(context);
                for (const url of crawledUrls) {
                    if (scannedUrls.has(url))
                        continue;
                    scannedUrls.add(url);
                    const pageResult = await this.scanPage(context, analyzer, url);
                    allPages.push(pageResult);
                    crawledPages.push({
                        url,
                        findingCount: pageResult.findings.length,
                    });
                }
            }
            // ---------------------------------------------------------------
            // Phase 4: Gap analysis
            // ---------------------------------------------------------------
            let gapAnalysis;
            if (this.hybridConfig.generateGapAnalysis) {
                gapAnalysis = this.buildGapAnalysis(importResult, urlMap, testCasePages.map(p => p.url), crawledPages.map(p => p.url), allPages);
            }
            // ---------------------------------------------------------------
            // Phase 5: Bug filing with test case links
            // ---------------------------------------------------------------
            const filedBugs = [];
            if (this.hybridConfig.linkBugsToTestCases) {
                const adoConfig = {
                    orgUrl: this.hybridConfig.testCaseImport.orgUrl,
                    project: this.hybridConfig.testCaseImport.project,
                    pat: this.hybridConfig.testCaseImport.pat,
                };
                const adoClient = new AdoClient(adoConfig);
                for (const page of allPages) {
                    if (page.findings.length === 0)
                        continue;
                    const relatedTestCaseIds = urlMap[page.url] ?? [];
                    const scanResult = {
                        config: this.scanConfig,
                        pages: [page],
                        links: [],
                        summary: this.buildPageSummary(page),
                        durationMs: 0,
                        startedAt,
                    };
                    try {
                        const bugs = await adoClient.fileBugsForScan(scanResult);
                        for (const bug of bugs) {
                            // Link the bug to related test cases
                            if (relatedTestCaseIds.length > 0) {
                                await this.linkBugToTestCases(adoClient, bug.id, relatedTestCaseIds);
                            }
                            filedBugs.push({
                                bugId: bug.id,
                                bugUrl: bug.url,
                                relatedTestCaseIds,
                            });
                        }
                    }
                    catch (err) {
                        console.error(`[hybrid] Failed to file bugs for ${page.url}:`, err);
                    }
                }
            }
            // ---------------------------------------------------------------
            // Build result
            // ---------------------------------------------------------------
            const totalFindings = allPages.reduce((sum, p) => sum + p.findings.length, 0);
            return {
                scanDurationMs: Date.now() - startTime,
                startedAt,
                testCasePages,
                crawledPages,
                totalFindings,
                gapAnalysis,
                filedBugs,
            };
        }
        finally {
            if (browser)
                await browser.close();
        }
    }
    // -------------------------------------------------------------------------
    // Phase helpers
    // -------------------------------------------------------------------------
    /** Scan a single page — thin wrapper around PageAnalyzer */
    async scanPage(context, analyzer, url) {
        const page = await context.newPage();
        try {
            return await analyzer.analyze(page, url);
        }
        catch (err) {
            return {
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
            };
        }
        finally {
            await page.close();
        }
    }
    /** Replay a test case flow's navigation and interaction steps */
    async replayTestFlow(context, scenario, scannedUrls, allPages, analyzer, testCasePages, urlMap) {
        const page = await context.newPage();
        try {
            for (const action of scenario.actions) {
                await this.executeAction(page, action);
                // After each navigation, run a11y analysis on the new page
                if (action.type === 'navigate') {
                    const currentUrl = page.url();
                    if (scannedUrls.has(currentUrl))
                        continue;
                    scannedUrls.add(currentUrl);
                    try {
                        const pageResult = await analyzer.analyze(page, currentUrl);
                        allPages.push(pageResult);
                        testCasePages.push({
                            url: currentUrl,
                            adoTestCaseIds: urlMap[currentUrl] ?? [scenario.adoTestCaseId],
                            findingCount: pageResult.findings.length,
                        });
                    }
                    catch {
                        // Analysis failed mid-flow — continue replaying
                    }
                }
            }
        }
        catch (err) {
            console.warn(`[hybrid] Flow replay failed for test case ${scenario.adoTestCaseId}: ${err instanceof Error ? err.message : String(err)}`);
        }
        finally {
            await page.close();
        }
    }
    /** Execute a single parsed test action against a Playwright page */
    async executeAction(page, action) {
        switch (action.type) {
            case 'navigate':
                await page.goto(action.url, {
                    waitUntil: 'domcontentloaded',
                    timeout: this.scanConfig.pageTimeoutMs,
                }).catch(() => { });
                await page.waitForTimeout(1000);
                break;
            case 'click':
                // Try to locate by text, then by selector
                try {
                    const locator = page.getByText(action.target, { exact: false }).first();
                    await locator.click({ timeout: 5000 });
                }
                catch {
                    try {
                        await page.click(action.target, { timeout: 3000 });
                    }
                    catch {
                        // Element not found — skip
                    }
                }
                await page.waitForTimeout(500);
                break;
            case 'type':
                try {
                    const locator = page.getByLabel(action.target, { exact: false }).first();
                    await locator.fill(action.value, { timeout: 5000 });
                }
                catch {
                    try {
                        await page.fill(action.target, action.value, { timeout: 3000 });
                    }
                    catch {
                        // Field not found — skip
                    }
                }
                break;
            case 'select':
                try {
                    await page.selectOption(action.target, action.value, { timeout: 3000 });
                }
                catch {
                    // Dropdown not found — skip
                }
                break;
            case 'wait':
                await page.waitForTimeout(2000);
                break;
            case 'verify':
            case 'unknown':
                // No browser interaction needed
                break;
        }
    }
    // -------------------------------------------------------------------------
    // URL prioritization
    // -------------------------------------------------------------------------
    /** Order URLs by test case priority (lower priority number = scanned first) */
    prioritizeUrls(importResult) {
        const urlPriority = new Map();
        for (const scenario of importResult.scenarios) {
            for (const url of scenario.urls) {
                const existing = urlPriority.get(url) ?? Infinity;
                urlPriority.set(url, Math.min(existing, scenario.priority));
            }
        }
        return [...urlPriority.entries()]
            .sort((a, b) => a[1] - b[1])
            .map(([url]) => url);
    }
    // -------------------------------------------------------------------------
    // URL → Test Case mapping
    // -------------------------------------------------------------------------
    buildUrlTestCaseMap(scenarios) {
        const map = {};
        for (const s of scenarios) {
            for (const url of s.urls) {
                if (!map[url])
                    map[url] = [];
                if (!map[url].includes(s.adoTestCaseId)) {
                    map[url].push(s.adoTestCaseId);
                }
            }
        }
        return map;
    }
    // -------------------------------------------------------------------------
    // Gap analysis
    // -------------------------------------------------------------------------
    buildGapAnalysis(importResult, urlMap, testCaseScannedUrls, crawledUrls, allPages) {
        const manualUrls = new Set(importResult.discoveredUrls);
        const autoUrls = new Set(crawledUrls);
        const allScannedUrls = new Set([...testCaseScannedUrls, ...crawledUrls]);
        // Build a quick lookup: url → PageResult
        const pageMap = new Map();
        for (const p of allPages) {
            pageMap.set(p.url, p);
        }
        const manualOnly = [];
        const bothCovered = [];
        const automatedOnly = [];
        // Manual URLs that were NOT discovered by crawler
        for (const url of manualUrls) {
            const page = pageMap.get(url);
            const entry = {
                url,
                manualTestCaseIds: urlMap[url] ?? [],
                automatedScanCovered: autoUrls.has(url),
                automatedFindingCount: page?.findings.length ?? 0,
                automatedCategories: page
                    ? [...new Set(page.findings.map(f => f.category))]
                    : [],
            };
            if (autoUrls.has(url)) {
                bothCovered.push(entry);
            }
            else {
                manualOnly.push(entry);
            }
        }
        // Automated URLs that have no manual test cases
        for (const url of autoUrls) {
            if (!manualUrls.has(url)) {
                automatedOnly.push(url);
            }
        }
        const totalManual = manualUrls.size;
        const totalAuto = autoUrls.size;
        const overlap = bothCovered.length;
        const totalUnion = new Set([...manualUrls, ...autoUrls]).size;
        const coverageScore = totalUnion > 0 ? overlap / totalUnion : 0;
        return {
            manualOnly,
            automatedOnly,
            bothCovered,
            summary: {
                totalManualUrls: totalManual,
                totalAutomatedUrls: totalAuto,
                overlapCount: overlap,
                manualOnlyCount: manualOnly.length,
                automatedOnlyCount: automatedOnly.length,
                coverageScore: Math.round(coverageScore * 100) / 100,
            },
        };
    }
    // -------------------------------------------------------------------------
    // Bug filing helpers
    // -------------------------------------------------------------------------
    /** Link a filed bug to related ADO test cases using the "Tests / Tested By" relation */
    async linkBugToTestCases(adoClient, bugId, testCaseIds) {
        // AdoClient exposes the http instance indirectly through bug filing.
        // We'll use a direct axios call here for the work item update.
        const token = Buffer.from(`:${this.hybridConfig.testCaseImport.pat}`).toString('base64');
        const baseUrl = `${this.hybridConfig.testCaseImport.orgUrl}/${encodeURIComponent(this.hybridConfig.testCaseImport.project)}/_apis`;
        const patchOps = testCaseIds.map(tcId => ({
            op: 'add',
            path: '/relations/-',
            value: {
                rel: 'Microsoft.VSTS.Common.TestedBy-Forward',
                url: `${this.hybridConfig.testCaseImport.orgUrl}/_apis/wit/workitems/${tcId}`,
                attributes: {
                    comment: 'Linked by smart-a11y-scanner: automated finding related to this manual test case',
                },
            },
        }));
        try {
            const axios_ = (await import('axios')).default;
            await axios_.patch(`${baseUrl}/wit/workitems/${bugId}?api-version=7.0`, patchOps, {
                headers: {
                    'Content-Type': 'application/json-patch+json',
                    Authorization: `Basic ${token}`,
                },
            });
        }
        catch (err) {
            console.warn(`[hybrid] Failed to link bug ${bugId} to test cases [${testCaseIds.join(', ')}]: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /** Build a minimal ScanResult summary for a single page (used in bug filing) */
    buildPageSummary(page) {
        const bySeverity = {
            critical: 0,
            major: 0,
            minor: 0,
            advisory: 0,
        };
        for (const f of page.findings) {
            bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
        }
        return {
            totalPages: 1,
            totalFindings: page.findings.length,
            bySeverity,
            byCategory: {},
        };
    }
}
//# sourceMappingURL=hybrid-scanner.js.map