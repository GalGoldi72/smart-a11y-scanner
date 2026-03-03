/**
 * ScanEngine — orchestrates the full scan pipeline.
 *
 *   1. Launch Playwright browser
 *   2. Authenticate (if auth config provided)
 *   3. Crawl: discover pages from start URL
 *   4. Analyze: run accessibility checks on each page
 *   5. Collect: aggregate findings into ScanResult
 *   6. Teardown: close browser
 *
 * Usage:
 *   const engine = new ScanEngine();
 *   const result = await engine.scan({ url: 'https://example.com' });
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import path from 'path';
import os from 'os';
import { ScanConfig, ScanResult, PageResult, PageLink, Finding, DEFAULT_SCAN_CONFIG, AuthConfig, GuidedExplorationResult } from './types.js';
import { Crawler } from './crawler.js';
import { PageAnalyzer, normalizePageUrl } from './page-analyzer.js';
import { DeepExplorer } from './deep-explorer.js';
import { GuidedExplorer } from './guided-explorer.js';
import { parseTestPlanFile, parseInlineSteps } from './test-plan-parser.js';
import { TestCaseImporter } from '../ado/test-case-importer.js';
import type { ImportedTestScenario } from '../ado/types.js';
import { Severity, WcagLevel } from '../rules/types.js';
import { PatternExtractor } from './patterns/pattern-extractor.js';
import { PatternDatabase } from './patterns/pattern-database.js';

export class ScanEngine {
  private config: ScanConfig;

  constructor(config?: Partial<ScanConfig> & { url?: string }) {
    this.config = { ...DEFAULT_SCAN_CONFIG, ...(config || {}) };
  }

  /** Primary public API — run a scan with the given config */
  async scan(config?: Partial<ScanConfig> & { url: string }): Promise<ScanResult> {
    if (config) {
      this.config = { ...DEFAULT_SCAN_CONFIG, ...config };
    }
    // Merge env-var credentials if no auth credentials provided
    this.applyEnvCredentials();
    return this.execute();
  }

  /** @deprecated Use scan() instead */
  async run(): Promise<ScanResult> {
    this.applyEnvCredentials();
    return this.execute();
  }

  /** Read credentials from A11Y_SCANNER_CREDENTIALS env var (format: user:pass) */
  private applyEnvCredentials(): void {
    const envCreds = process.env.A11Y_SCANNER_CREDENTIALS;
    if (envCreds && !this.config.auth?.credentials) {
      const colonIdx = envCreds.indexOf(':');
      if (colonIdx > 0) {
        this.config.auth = {
          ...this.config.auth,
          credentials: {
            username: envCreds.substring(0, colonIdx),
            password: envCreds.substring(colonIdx + 1),
          },
        };
      }
    }
  }

  private async execute(): Promise<ScanResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const deadline = startTime + this.config.timeout;
    let browser: Browser | null = null;
    let persistentContext: BrowserContext | null = null;
    let timedOut = false;

    try {
      // 1. Launch browser — use persistent context for Edge to keep SSO sessions
      let context: BrowserContext;

      if (this.config.browserChannel === 'msedge') {
        // Persistent context: cookies/sessions survive between runs
        const profileDir = path.join(os.homedir(), '.a11y-scanner-profile');
        persistentContext = await chromium.launchPersistentContext(profileDir, {
          headless: this.config.headless,
          channel: 'msedge',
          viewport: {
            width: this.config.viewportWidth,
            height: this.config.viewportHeight,
          },
          userAgent: this.config.userAgent,
          bypassCSP: true,
        });
        context = persistentContext;
      } else {
        browser = await chromium.launch({
          headless: this.config.headless,
        });
        context = await browser.newContext({
          viewport: {
            width: this.config.viewportWidth,
            height: this.config.viewportHeight,
          },
          userAgent: this.config.userAgent,
          bypassCSP: true,
        });
      }

      // 2. Authenticate if configured
      if (this.config.interactiveAuth) {
        await this.interactiveLogin(context);
      } else if (this.config.auth) {
        await this.authenticate(context, this.config.auth);
      }

      // 3. Discover pages and analyze
      const analyzer = new PageAnalyzer(this.config);
      const pages: PageResult[] = [];
      let links: PageLink[] = [];
      let guidedResults: GuidedExplorationResult | undefined;

      // Check for test plan guided scanning
      if (this.config.testPlan) {
        let scenarios: ImportedTestScenario[];
        try {
          scenarios = await this.loadTestPlanScenarios();
          console.log(`  📋 Loaded ${scenarios.length} test scenario(s)`);
        } catch (err) {
          console.error(`  ❌ Failed to load test plan: ${err instanceof Error ? err.message : String(err)}`);
          scenarios = [];
        }
        if (scenarios.length === 0) {
          console.log('  ⚠️  No test scenarios loaded — skipping guided exploration');
        }
        if (scenarios.length > 0) {
          const guidedExplorer = new GuidedExplorer(this.config, analyzer);
          guidedResults = await guidedExplorer.execute(context, scenarios, deadline);
          pages.push(...guidedResults.pages);

        // LEARN phase — extract patterns from guided execution
        if (this.config.learn) {
          const extractor = new PatternExtractor();
          const patterns = await extractor.extract(guidedResults, scenarios, guidedExplorer.getSnapshots(), {
            similarityThreshold: 0.7,
            includeRawTrees: false,
            maxUrlPatterns: 50,
          });
          const db = new PatternDatabase(this.config.patternDir ?? '.a11y-patterns');
          // Merge with existing patterns if available
          const existing = await db.loadLatest(this.config.url);
          const merged = existing ? await db.merge(existing, patterns) : patterns;
          await db.save(merged);
          console.log(`  📚 Learned ${merged.pagePatterns.length} page patterns, ${merged.coverageMap.elementTypeCoverage.length} element types`);
        }

        // GENERATE phase (TestPlanGenerator implemented by Bobbie)
        if (this.config.generate && Date.now() < deadline) {
          const db = new PatternDatabase(this.config.patternDir ?? '.a11y-patterns');
          const patterns = await db.loadLatest(this.config.url);
          if (patterns) {
            try {
              // Import TestPlanGenerator dynamically to avoid hard dep until Bobbie ships it
              const { TestPlanGenerator } = await import('./patterns/test-plan-generator.js');
              const generator = new TestPlanGenerator();
              const generated = await generator.generate(patterns, undefined, {
                strategies: (this.config.generationStrategies ?? ['coverage-completion', 'depth-completion', 'cross-page-transfer', 'element-type-coverage']) as any,
                maxPerStrategy: 10,
                maxTotal: this.config.maxGenerated ?? 30,
                minConfidence: 0.5,
                useLLM: !!this.config.aiGenerate,
                deduplicateAgainstHistory: true,
              });
              console.log(`  🧪 Generated ${generated.length} new test scenarios`);

              await db.saveGeneratedPlans(this.config.url, generated);

              // Execute generated plans
              if (generated.length > 0) {
                const genExplorer = new GuidedExplorer(this.config, analyzer);
                const genResult = await genExplorer.execute(context, generated as any, deadline);
                pages.push(...genResult.pages);
                // Tag findings from generated tests
                for (const page of genResult.pages) {
                  for (const finding of page.findings) {
                    finding.reproSteps = ['[AI-Generated Test]', ...(finding.reproSteps || [])];
                  }
                }
              }
            } catch (err) {
              // TestPlanGenerator not yet available — skip generate phase
              console.warn(`  ⚠ Generate phase skipped: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        // If time remains and SPA discovery is enabled, continue with auto-exploration
          if (this.config.spaDiscovery && Date.now() < deadline) {
            const explorer = new DeepExplorer(this.config, analyzer);
            const { pages: additionalPages } = await explorer.explore(context, deadline);
            pages.push(...additionalPages);
          }
        } // end if (scenarios.length > 0)
      } else if (this.config.spaDiscovery) {
        // Deep SPA exploration — click every interactive element recursively
        const explorer = new DeepExplorer(this.config, analyzer);
        const { pages: exploredPages, statesVisited } = await explorer.explore(context, deadline);
        pages.push(...exploredPages);
        console.log(`  Deep exploration complete: ${statesVisited} states visited, ${exploredPages.length} analyzed`);
      } else {
        // Traditional crawl — follow <a href> links
        const crawler = new Crawler(this.config);
        const crawlResult = await crawler.discoverPages(context, deadline);
        links = crawlResult.links;

        for (const url of crawlResult.urls) {
          // Check timeout before starting each page analysis
          if (Date.now() >= deadline) {
            timedOut = true;
            break;
          }

          const page = await context.newPage();
          try {
            const result = await analyzer.analyze(page, url);
            // Stamp pageUrl onto each finding
            for (const finding of result.findings) {
              finding.pageUrl = url;
            }
            pages.push(result);
          } catch (err) {
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
          } finally {
            await page.close();
          }
        }
      }

      // Check if we ran out of time during analysis
      if (Date.now() >= deadline) {
        timedOut = true;
      }

      // 5. Deduplicate findings across all pages
      this.deduplicateFindings(pages);

      // 5b. Normalize all page-level and finding-level URLs (replace sip. prefix)
      for (const p of pages) {
        p.url = normalizePageUrl(p.url, this.config.url);
        if (p.metadata?.url) {
          p.metadata.url = normalizePageUrl(p.metadata.url, this.config.url);
        }
        for (const f of p.findings) {
          if (f.pageUrl) {
            f.pageUrl = normalizePageUrl(f.pageUrl, this.config.url);
          }
        }
      }

      // 6. Aggregate results
      return this.buildResult(this.config, pages, links, startedAt, startTime, timedOut, guidedResults);
    } catch (err) {
      // Top-level failure (browser didn't launch, etc.)
      return this.buildEmptyResult(startedAt, startTime, timedOut);
    } finally {
      if (persistentContext) {
        await persistentContext.close();
      }
      if (browser) {
        await browser.close();
      }
    }
  }

  /** Perform pre-scan authentication */
  private async authenticate(context: BrowserContext, auth: AuthConfig): Promise<void> {
    // Inject cookies if provided
    if (auth.cookies && auth.cookies.length > 0) {
      await context.addCookies(
        auth.cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: '/',
        }))
      );
    }

    // Form-based login if loginUrl + credentials provided
    if (auth.loginUrl && auth.credentials) {
      const page = await context.newPage();
      try {
        await page.goto(auth.loginUrl, {
          waitUntil: 'domcontentloaded',
          timeout: this.config.pageTimeoutMs,
        });

        // Auto-detect login form fields
        const usernameSelector =
          'input[type="email"], input[type="text"][name*="user"], input[type="text"][name*="email"], ' +
          'input[name="username"], input[name="email"], input[name="login"], ' +
          'input[autocomplete="username"], input[id*="user"], input[id*="email"]';
        const passwordSelector =
          'input[type="password"]';

        // Fill username
        const usernameInput = await page.$(usernameSelector);
        if (usernameInput) {
          await usernameInput.fill(auth.credentials.username);
        }

        // Fill password
        const passwordInput = await page.$(passwordSelector);
        if (passwordInput) {
          await passwordInput.fill(auth.credentials.password);
        }

        // Submit — try submit button, then form submit, then Enter key
        const submitSelector =
          'button[type="submit"], input[type="submit"], button:has-text("Log in"), ' +
          'button:has-text("Sign in"), button:has-text("Login")';
        const submitBtn = await page.$(submitSelector);
        if (submitBtn) {
          await submitBtn.click();
        } else if (passwordInput) {
          await passwordInput.press('Enter');
        }

        // Wait for auth confirmation
        if (auth.waitForSelector) {
          await page.waitForSelector(auth.waitForSelector, { timeout: this.config.pageTimeoutMs });
        } else {
          // Default: wait for navigation to settle
          await page.waitForLoadState('networkidle', { timeout: this.config.pageTimeoutMs }).catch(() => {});
        }
      } finally {
        await page.close();
      }
    }
  }

  /** Interactive login — opens browser to target URL and auto-detects when login completes */
  private async interactiveLogin(context: BrowserContext): Promise<void> {
    const page = await context.newPage();
    const loginUrl = this.config.auth?.loginUrl || this.config.url;
    const targetHost = new URL(this.config.url).hostname;

    console.log(`\n  🔐 Opening browser to: ${loginUrl}`);
    console.log('     Log in with your credentials — scan continues automatically after login.\n');

    await page.goto(loginUrl, {
      waitUntil: 'commit', // Minimal wait — SSO will redirect via JS
      timeout: 120_000,
    });

    // Wait for client-side SSO redirect to kick in (JS redirect to login.microsoftonline.com etc.)
    console.log('  ⏳ Waiting for SSO redirect...');
    await page.waitForTimeout(5000);

    // Phase 1: Wait until we leave the target domain (SSO redirect happening)
    let sawLoginDomain = false;
    const redirectDeadline = Date.now() + 60_000; // 60s for redirect
    while (Date.now() < redirectDeadline) {
      try {
        const currentHost = new URL(page.url()).hostname;
        if (currentHost !== targetHost && !currentHost.endsWith('.' + targetHost)) {
          sawLoginDomain = true;
          console.log(`  🔑 SSO login page detected (${currentHost})`);
          break;
        }
      } catch { /* ignore */ }
      await page.waitForTimeout(1000);
    }

    if (!sawLoginDomain) {
      // Never left target domain — might be pre-authenticated or no SSO redirect
      console.log('  ℹ No SSO redirect detected — checking if already authenticated...');
      try {
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      } catch { /* ignore */ }
      await page.close();
      return;
    }

    // Phase 2: Wait for login to complete (URL returns to target domain) — up to 5 min
    console.log('  ⏳ Complete your login — scan will resume automatically...');
    const loginDeadline = Date.now() + 300_000;
    let authenticated = false;

    while (Date.now() < loginDeadline) {
      await page.waitForTimeout(3000);
      try {
        const currentHost = new URL(page.url()).hostname;
        if (currentHost === targetHost || currentHost.endsWith('.' + targetHost)) {
          // Back on target domain — wait for full page load
          console.log('  🔄 Redirected back to target — waiting for page to load...');
          await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
          authenticated = true;
          break;
        }
      } catch { /* page navigating — keep polling */ }
    }

    if (authenticated) {
      console.log('  ✓ Login successful — continuing scan...');
      // Re-navigate to original URL to preserve tenant ID (?tid=) and other query params
      // SSO redirects often lose the original query parameters
      const currentUrl = page.url();
      const targetUrl = this.config.url;
      if (currentUrl !== targetUrl && targetUrl.includes('?')) {
        console.log('  🔄 Re-navigating to original URL to preserve tenant context...');
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
      }
      console.log('');
    } else {
      console.log('  ⚠ Login timeout (5 min) — continuing with current session...\n');
    }

    await page.close();
  }

  /**
   * Deduplicate findings across all pages by ruleId + selector.
   * Keeps the first occurrence (best screenshot/context from first discovery).
   * Mutates the pages array in place, removing duplicate findings.
   */
  private deduplicateFindings(pages: PageResult[]): void {
    const seen = new Set<string>();
    let originalCount = 0;

    for (const page of pages) {
      const unique: Finding[] = [];
      for (const finding of page.findings) {
        originalCount++;
        const key = finding.selector
          ? `${finding.ruleId}|${finding.selector}`
          : `${finding.ruleId}|${finding.htmlSnippet}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(finding);
        }
      }
      page.findings = unique;
    }

    const uniqueCount = seen.size;
    const removed = originalCount - uniqueCount;
    if (removed > 0) {
      console.log(`  📊 Deduplicated: ${originalCount} → ${uniqueCount} findings (${removed} duplicates removed)`);
    }
  }

  private buildResult(
    config: ScanConfig,
    pages: PageResult[],
    links: PageLink[],
    startedAt: string,
    startTime: number,
    timedOut: boolean,
    guidedResults?: GuidedExplorationResult,
  ): ScanResult {
    const bySeverity: Record<Severity, number> = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    };
    const byCategory: Record<string, number> = {};
    const byWcagLevel: Record<WcagLevel, number> = {
      A: 0,
      AA: 0,
      AAA: 0,
    };
    let totalFindings = 0;

    for (const page of pages) {
      for (const finding of page.findings) {
        totalFindings++;
        bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
        byCategory[finding.category] = (byCategory[finding.category] || 0) + 1;
        byWcagLevel[finding.wcagLevel] = (byWcagLevel[finding.wcagLevel] || 0) + 1;
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      url: config.url,
      scanDate: startedAt,
      duration: durationMs,
      timedOut,
      pagesScanned: pages.length,
      config,
      pages,
      links,
      summary: {
        totalPages: pages.length,
        totalFindings,
        bySeverity,
        byCategory,
        byWcagLevel,
      },
      guidedResults,
      durationMs,
      startedAt,
    };
  }

  private buildEmptyResult(startedAt: string, startTime: number, timedOut: boolean): ScanResult {
    const durationMs = Date.now() - startTime;
    return {
      url: this.config.url,
      scanDate: startedAt,
      duration: durationMs,
      timedOut,
      pagesScanned: 0,
      config: this.config,
      pages: [],
      links: [],
      summary: {
        totalPages: 0,
        totalFindings: 0,
        bySeverity: { critical: 0, serious: 0, moderate: 0, minor: 0 },
        byCategory: {},
        byWcagLevel: { A: 0, AA: 0, AAA: 0 },
      },
      durationMs,
      startedAt,
    };
  }

  /**
   * Load test plan scenarios from the configured source (file, inline, or ADO API).
   */
  private async loadTestPlanScenarios(): Promise<ImportedTestScenario[]> {
    const tp = this.config.testPlan!;

    switch (tp.source) {
      case 'file': {
        if (!tp.filePath) throw new Error('testPlan.filePath is required when source is "file"');
        return parseTestPlanFile(tp.filePath);
      }
      case 'inline': {
        if (!tp.inlineSteps || tp.inlineSteps.length === 0) {
          throw new Error('testPlan.inlineSteps is required when source is "inline"');
        }
        return [parseInlineSteps(tp.inlineSteps)];
      }
      case 'ado-api': {
        if (!tp.ado) throw new Error('testPlan.ado config is required when source is "ado-api"');
        const importer = new TestCaseImporter({
          orgUrl: tp.ado.orgUrl ?? '',
          project: tp.ado.project ?? '',
          pat: tp.ado.pat ?? '',
          testPlanId: tp.ado.planId,
          filter: tp.ado.suiteIds ? { suiteIds: tp.ado.suiteIds } : undefined,
        });
        const result = await importer.importTestCases();
        if (result.warnings.length > 0) {
          console.warn('[engine] ADO import warnings:', result.warnings.join('; '));
        }
        return result.scenarios;
      }
      default:
        throw new Error(`Unknown testPlan source: ${tp.source}`);
    }
  }
}
