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

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { ScanConfig, ScanResult, PageResult, PageLink, Finding, DEFAULT_SCAN_CONFIG } from './types.js';
import { Crawler } from './crawler.js';
import { PageAnalyzer } from './page-analyzer.js';
import { TestCaseImporter } from '../ado/test-case-importer.js';
import { AdoClient, FiledBug } from '../ado/client.js';
import type {
  HybridScanConfig,
  HybridScanResult,
  ImportedTestScenario,
  TestCaseImportResult,
  GapAnalysisReport,
  CoverageGapEntry,
  TestAction,
} from '../ado/types.js';
import type { Severity, WcagLevel } from '../rules/types.js';

/** Internal tracking for which test cases map to which URLs */
interface UrlTestCaseMap {
  [url: string]: number[];
}

export class HybridScanner {
  private hybridConfig: HybridScanConfig;
  private scanConfig: ScanConfig;

  constructor(hybridConfig: HybridScanConfig, scanConfigOverrides?: Partial<ScanConfig>) {
    this.hybridConfig = hybridConfig;
    this.scanConfig = {
      ...DEFAULT_SCAN_CONFIG,
      url: hybridConfig.scanUrl,
      ...scanConfigOverrides,
    };
  }

  /** Run the full hybrid scan pipeline. */
  async run(): Promise<HybridScanResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let browser: Browser | null = null;

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
        httpCredentials: this.scanConfig.auth?.credentials
          ? { username: this.scanConfig.auth.credentials.username, password: this.scanConfig.auth.credentials.password }
          : undefined,
      });

      const analyzer = new PageAnalyzer(this.scanConfig);
      const allPages: PageResult[] = [];
      const scannedUrls = new Set<string>();

      // ---------------------------------------------------------------
      // Phase 1: Priority scan — ADO test case URLs
      // ---------------------------------------------------------------
      const testCasePages: HybridScanResult['testCasePages'] = [];

      if (this.hybridConfig.prioritizeTestCaseUrls) {
        const priorityUrls = this.prioritizeUrls(importResult);

        for (const url of priorityUrls) {
          if (scannedUrls.has(url)) continue;
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
      const crawledPages: HybridScanResult['crawledPages'] = [];
      const remainingBudget = this.hybridConfig.additionalCrawlPages;

      if (remainingBudget > 0) {
        const crawlConfig: ScanConfig = {
          ...this.scanConfig,
          maxPages: remainingBudget,
        };
        const crawler = new Crawler(crawlConfig);
        const { urls: crawledUrls } = await crawler.discoverPages(context);

        for (const url of crawledUrls) {
          if (scannedUrls.has(url)) continue;
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
      let gapAnalysis: GapAnalysisReport | undefined;
      if (this.hybridConfig.generateGapAnalysis) {
        gapAnalysis = this.buildGapAnalysis(
          importResult,
          urlMap,
          testCasePages.map(p => p.url),
          crawledPages.map(p => p.url),
          allPages,
        );
      }

      // ---------------------------------------------------------------
      // Phase 5: Bug filing with test case links
      // ---------------------------------------------------------------
      const filedBugs: HybridScanResult['filedBugs'] = [];
      if (this.hybridConfig.linkBugsToTestCases) {
        const adoConfig = {
          orgUrl: this.hybridConfig.testCaseImport.orgUrl,
          project: this.hybridConfig.testCaseImport.project,
          pat: this.hybridConfig.testCaseImport.pat,
        };
        const adoClient = new AdoClient(adoConfig);

        for (const page of allPages) {
          if (page.findings.length === 0) continue;

          const relatedTestCaseIds = urlMap[page.url] ?? [];
          const scanResult: ScanResult = {
            url: this.scanConfig.url,
            scanDate: startedAt,
            duration: 0,
            timedOut: false,
            pagesScanned: 1,
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
                await this.linkBugToTestCases(
                  adoClient,
                  bug.id,
                  relatedTestCaseIds,
                );
              }
              filedBugs.push({
                bugId: bug.id,
                bugUrl: bug.url,
                relatedTestCaseIds,
              });
            }
          } catch (err) {
            console.error(`[hybrid] Failed to file bugs for ${page.url}:`, err);
          }
        }
      }

      // ---------------------------------------------------------------
      // Build result
      // ---------------------------------------------------------------
      const totalFindings = allPages.reduce(
        (sum, p) => sum + p.findings.length,
        0,
      );

      return {
        scanDurationMs: Date.now() - startTime,
        startedAt,
        testCasePages,
        crawledPages,
        totalFindings,
        gapAnalysis,
        filedBugs,
      };
    } finally {
      if (browser) await browser.close();
    }
  }

  // -------------------------------------------------------------------------
  // Phase helpers
  // -------------------------------------------------------------------------

  /** Scan a single page — thin wrapper around PageAnalyzer */
  private async scanPage(
    context: BrowserContext,
    analyzer: PageAnalyzer,
    url: string,
  ): Promise<PageResult> {
    const page = await context.newPage();
    try {
      return await analyzer.analyze(page, url);
    } catch (err) {
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
    } finally {
      await page.close();
    }
  }

  /** Replay a test case flow's navigation and interaction steps */
  private async replayTestFlow(
    context: BrowserContext,
    scenario: ImportedTestScenario,
    scannedUrls: Set<string>,
    allPages: PageResult[],
    analyzer: PageAnalyzer,
    testCasePages: HybridScanResult['testCasePages'],
    urlMap: UrlTestCaseMap,
  ): Promise<void> {
    const page = await context.newPage();
    try {
      for (const action of scenario.actions) {
        await this.executeAction(page, action);

        // After each navigation, run a11y analysis on the new page
        if (action.type === 'navigate') {
          const currentUrl = page.url();
          if (scannedUrls.has(currentUrl)) continue;
          scannedUrls.add(currentUrl);

          try {
            const pageResult = await analyzer.analyze(page, currentUrl);
            allPages.push(pageResult);
            testCasePages.push({
              url: currentUrl,
              adoTestCaseIds: urlMap[currentUrl] ?? [scenario.adoTestCaseId],
              findingCount: pageResult.findings.length,
            });
          } catch {
            // Analysis failed mid-flow — continue replaying
          }
        }
      }
    } catch (err) {
      console.warn(
        `[hybrid] Flow replay failed for test case ${scenario.adoTestCaseId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      await page.close();
    }
  }

  /** Execute a single parsed test action against a Playwright page */
  private async executeAction(page: Page, action: TestAction): Promise<void> {
    switch (action.type) {
      case 'navigate':
        await page.goto(action.url, {
          waitUntil: 'domcontentloaded',
          timeout: this.scanConfig.pageTimeoutMs,
        }).catch(() => { /* navigation failure — non-fatal */ });
        await page.waitForTimeout(1000);
        break;

      case 'click':
        // Try to locate by text, then by selector
        try {
          const locator = page.getByText(action.target, { exact: false }).first();
          await locator.click({ timeout: 5000 });
        } catch {
          try {
            await page.click(action.target, { timeout: 3000 });
          } catch {
            // Element not found — skip
          }
        }
        await page.waitForTimeout(500);
        break;

      case 'type':
        try {
          const locator = page.getByLabel(action.target, { exact: false }).first();
          await locator.fill(action.value, { timeout: 5000 });
        } catch {
          try {
            await page.fill(action.target, action.value, { timeout: 3000 });
          } catch {
            // Field not found — skip
          }
        }
        break;

      case 'select':
        try {
          await page.selectOption(action.target, action.value, { timeout: 3000 });
        } catch {
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
  private prioritizeUrls(importResult: TestCaseImportResult): string[] {
    const urlPriority = new Map<string, number>();

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

  private buildUrlTestCaseMap(scenarios: ImportedTestScenario[]): UrlTestCaseMap {
    const map: UrlTestCaseMap = {};
    for (const s of scenarios) {
      for (const url of s.urls) {
        if (!map[url]) map[url] = [];
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

  private buildGapAnalysis(
    importResult: TestCaseImportResult,
    urlMap: UrlTestCaseMap,
    testCaseScannedUrls: string[],
    crawledUrls: string[],
    allPages: PageResult[],
  ): GapAnalysisReport {
    const manualUrls = new Set(importResult.discoveredUrls);
    const autoUrls = new Set(crawledUrls);
    const allScannedUrls = new Set([...testCaseScannedUrls, ...crawledUrls]);

    // Build a quick lookup: url → PageResult
    const pageMap = new Map<string, PageResult>();
    for (const p of allPages) {
      pageMap.set(p.url, p);
    }

    const manualOnly: CoverageGapEntry[] = [];
    const bothCovered: CoverageGapEntry[] = [];
    const automatedOnly: string[] = [];

    // Manual URLs that were NOT discovered by crawler
    for (const url of manualUrls) {
      const page = pageMap.get(url);
      const entry: CoverageGapEntry = {
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
      } else {
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
  private async linkBugToTestCases(
    adoClient: AdoClient,
    bugId: number,
    testCaseIds: number[],
  ): Promise<void> {
    // AdoClient exposes the http instance indirectly through bug filing.
    // We'll use a direct axios call here for the work item update.
    const token = Buffer.from(`:${this.hybridConfig.testCaseImport.pat}`).toString('base64');
    const baseUrl = `${this.hybridConfig.testCaseImport.orgUrl}/${encodeURIComponent(this.hybridConfig.testCaseImport.project)}/_apis`;

    const patchOps = testCaseIds.map(tcId => ({
      op: 'add' as const,
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
      await axios_.patch(
        `${baseUrl}/wit/workitems/${bugId}?api-version=7.0`,
        patchOps,
        {
          headers: {
            'Content-Type': 'application/json-patch+json',
            Authorization: `Basic ${token}`,
          },
        },
      );
    } catch (err) {
      console.warn(
        `[hybrid] Failed to link bug ${bugId} to test cases [${testCaseIds.join(', ')}]: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Build a minimal ScanResult summary for a single page (used in bug filing) */
  private buildPageSummary(page: PageResult) {
    const bySeverity: Record<Severity, number> = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    };
    const byWcagLevel: Record<WcagLevel, number> = { A: 0, AA: 0, AAA: 0 };
    for (const f of page.findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
      byWcagLevel[f.wcagLevel] = (byWcagLevel[f.wcagLevel] ?? 0) + 1;
    }
    return {
      totalPages: 1,
      totalFindings: page.findings.length,
      bySeverity,
      byCategory: {} as Record<string, number>,
      byWcagLevel,
    };
  }
}
