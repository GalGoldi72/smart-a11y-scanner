#!/usr/bin/env node
/**
 * Smart A11y Scanner — CLI entry point.
 *
 * Usage:
 *   a11y-scan scan https://example.com
 *   a11y-scan scan https://example.com --depth 3 --output html
 *   a11y-scan scan https://example.com --config a11y.yaml --ado --verbose
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, ConfigValidationError } from './config/loader.js';
import type { CliOverrides } from './config/loader.js';
import { ScanEngine } from './scanner/engine.js';
import { Reporter } from './reporting/reporter.js';
import type { ScanResult, AuthConfig, TestPlanConfig } from './scanner/types.js';
import type { Severity } from './rules/types.js';
import { parseTestPlanUrl } from './scanner/test-plan-parser.js';
import { TestCaseSuggester } from './scanner/test-case-suggester.js';
import { generateSuggestionMdReport } from './reporting/formats/suggestion-md-reporter.js';
import { generateSuggestionHtmlReport } from './reporting/formats/suggestion-html-reporter.js';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const VERSION = '0.1.0';

// Slugify a string: lowercase, spaces→hyphens, remove special chars, truncate
function slugifyPageName(title: string | undefined | null, url?: string): string {
  // Priority: viewid param → last URL path segment → page title → default
  if (url) {
    try {
      const parsed = new URL(url);
      // 1. Try viewid query param (e.g., ?viewid=malware-scanning)
      const viewId = parsed.searchParams.get('viewid');
      if (viewId && viewId.trim() !== '') {
        return slugify(viewId);
      }
      // 2. Try last meaningful path segment (e.g., /interop/techpartnerscatalog)
      const pathSegments = parsed.pathname.split('/').filter(s => s.length > 0 && s !== 'v2');
      const lastSegment = pathSegments[pathSegments.length - 1];
      if (lastSegment && lastSegment.trim() !== '') {
        return slugify(lastSegment);
      }
    } catch { /* invalid URL, fall through */ }
  }
  if (!title || title.trim() === '') {
    return 'a11y-suggestions';
  }
  return slugify(title);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .substring(0, 50)
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'a11y-suggestions';
}

// Format date as YYYY-MM-DD
function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const SEVERITY_COLORS: Record<Severity, (s: string) => string> = {
  critical: chalk.red.bold,
  serious: chalk.hex('#ea580c'),
  moderate: chalk.yellow,
  minor: chalk.blue,
};

// ── Progress display ────────────────────────────────────────────────

class ProgressDisplay {
  private pagesScanned = 0;
  private totalFindings = 0;
  private startTime = Date.now();
  private verbose: boolean;

  constructor(verbose: boolean) {
    this.verbose = verbose;
  }

  onPageStart(url: string): void {
    if (this.verbose) {
      process.stdout.write(chalk.gray(`  → Scanning: ${url}...`));
    }
  }

  onPageComplete(url: string, findingsCount: number, timeMs: number): void {
    this.pagesScanned++;
    this.totalFindings += findingsCount;

    if (this.verbose) {
      const findings = findingsCount > 0
        ? chalk.yellow(` ${findingsCount} findings`)
        : chalk.green(' clean');
      console.log(`${findings} ${chalk.gray(`(${timeMs}ms)`)}`);
    } else {
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
      process.stdout.write(
        `\r  ${chalk.cyan('⟳')} ${this.pagesScanned} pages scanned | ${this.totalFindings} findings | ${elapsed}s`,
      );
    }
  }

  finish(): void {
    if (!this.verbose) {
      process.stdout.write('\n');
    }
  }
}

// ── Summary display ─────────────────────────────────────────────────

function printSummary(result: ScanResult): void {
  const s = result.summary;
  const elapsed = result.durationMs >= 1000
    ? `${(result.durationMs / 1000).toFixed(1)}s`
    : `${result.durationMs}ms`;

  console.log('');
  console.log(chalk.bold('━'.repeat(60)));
  console.log(chalk.bold('  📊 Scan Summary'));
  console.log(chalk.bold('━'.repeat(60)));
  console.log(`  ${chalk.gray('URL:')}        ${result.config.url}`);
  console.log(`  ${chalk.gray('Duration:')}   ${elapsed}`);
  console.log(`  ${chalk.gray('Pages:')}      ${s.totalPages}`);
  console.log(`  ${chalk.gray('Findings:')}   ${s.totalFindings}`);
  console.log('');

  // Severity breakdown
  const sevOrder: Severity[] = ['critical', 'serious', 'moderate', 'minor'];
  for (const sev of sevOrder) {
    const count = s.bySeverity[sev];
    if (count > 0) {
      const colorFn = SEVERITY_COLORS[sev];
      const bar = '█'.repeat(Math.min(count, 40));
      console.log(`  ${colorFn(sev.padEnd(10))} ${colorFn(bar)} ${count}`);
    }
  }

  // Category breakdown
  const catEntries = Object.entries(s.byCategory)
    .filter(([, c]) => c > 0)
    .sort(([, a], [, b]) => b - a);

  if (catEntries.length > 0) {
    console.log('');
    console.log(chalk.gray('  By category:'));
    for (const [cat, count] of catEntries) {
      console.log(`    ${cat.padEnd(25)} ${count}`);
    }
  }

  console.log(chalk.bold('━'.repeat(60)));
}

// ── CLI setup ───────────────────────────────────────────────────────

const program = new Command();

program
  .name('a11y-scan')
  .description('Smart A11y Scanner — AI-powered accessibility testing for web applications')
  .version(VERSION);

program
  .command('scan')
  .description('Scan a URL for accessibility violations')
  .argument('<url>', 'URL to scan (e.g. https://example.com)')
  .option('-d, --depth <n>', 'Crawl depth (0 = single page)', parseInt)
  .option('-o, --output <format>', 'Report format: json, html, csv (comma-separated for multiple)')
  .option('-c, --config <path>', 'Path to YAML config file')
  .option('--ado', 'Enable Azure DevOps bug filing')
  .option('--verbose', 'Verbose output with detailed progress')
  .option('--output-path <dir>', 'Output directory for reports')
  .option('-t, --timeout <seconds>', 'Overall scan timeout in seconds (default: 600)', parseInt)
  .option('--auth-url <login-page>', 'URL to navigate to before scanning (for login)')
  .option('--credentials <user:pass>', 'Basic credentials (user:pass) or set A11Y_SCANNER_CREDENTIALS env var')
  .option('--headed', 'Show browser window during scan')
  .option('--interactive-auth', 'Pause for manual login before scanning (implies --headed)')
  .option('--spa [bool]', 'Discover SPA routes by clicking nav elements (default: true with --interactive-auth)')
  .option('--test-plan <id-or-url>', 'ADO test plan ID or test management URL')
  .option('--test-plan-file <path>', 'Path to test plan YAML/JSON file')
  .option('--steps <steps...>', 'Inline test steps (natural language)')
  .option('--explore-depth <n>', 'Auto-exploration depth after each guided step (default: 1)', parseInt)
  .option('--ado-org <url>', 'ADO organization URL (e.g., https://dev.azure.com/msazure)')
  .option('--ado-project <name>', 'ADO project name')
  .option('--ado-pat <token>', 'ADO Personal Access Token (or set ADO_PAT env var)')
  .option('--learn', 'Extract patterns from guided test execution for future generation')
  .option('--generate', 'Generate new test plans from learned patterns and execute them')
  .option('--ai-generate', 'Use LLM for edge case generation (requires OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT)')
  .option('--pattern-dir <path>', 'Directory for pattern storage (default: .a11y-patterns)')
  .option('--max-generated <n>', 'Maximum generated scenarios (default: 30)', parseInt)
  .option('--browser <channel>', 'Browser: chromium (default), edge (uses your logged-in Edge profile)')
  .addHelpText('after', `
${chalk.bold('Examples:')}
  $ a11y-scan scan https://example.com
  $ a11y-scan scan https://example.com --depth 3 --output html
  $ a11y-scan scan https://example.com --output json,csv --verbose
  $ a11y-scan scan https://example.com --config a11y.yaml --ado

${chalk.bold('Exit codes:')}
  0  No accessibility findings
  1  Accessibility findings detected
  2  Error during scan
`)
  .action(async (url: string, options: Record<string, unknown>) => {
    try {
      await runScan(url, options);
    } catch (err) {
      if (err instanceof ConfigValidationError) {
        console.error(chalk.red('\n✖ Configuration error:'));
        for (const e of err.errors) {
          console.error(chalk.red(`  • ${e}`));
        }
        process.exit(2);
      }
      console.error(chalk.red(`\n✖ ${err instanceof Error ? err.message : String(err)}`));
      process.exit(2);
    }
  });

async function runScan(url: string, options: Record<string, unknown>): Promise<void> {
  const cliOverrides: CliOverrides = {
    url,
    depth: options['depth'] as number | undefined,
    output: options['output'] as string | undefined,
    config: options['config'] as string | undefined,
    ado: options['ado'] as boolean | undefined,
    verbose: options['verbose'] as boolean | undefined,
    outputPath: options['outputPath'] as string | undefined,
  };

  const config = loadConfig(cliOverrides);
  const verbose = !!options['verbose'];
  const timeoutSec = (options['timeout'] as number | undefined) ?? 600;
  const authUrl = options['authUrl'] as string | undefined;
  const credentialsRaw = (options['credentials'] as string | undefined) ?? process.env['A11Y_SCANNER_CREDENTIALS'];
  const interactiveAuth = !!options['interactiveAuth'];
  const headed = !!options['headed'] || interactiveAuth;

  // SPA discovery: explicit --spa flag, or auto-enable with interactive auth or when no test plan
  const spaFlag = options['spa'];
  const spaDiscovery = spaFlag === true || spaFlag === 'true'
    ? true
    : spaFlag === 'false'
      ? false
      : true; // default: always on — smart crawl is the primary mode

  // Build TestPlanConfig from CLI flags
  const testPlanRaw = options['testPlan'] as string | undefined;
  const testPlanFile = options['testPlanFile'] as string | undefined;
  const steps = options['steps'] as string[] | undefined;
  const exploreDepth = options['exploreDepth'] as number | undefined;
  const adoOrg = options['adoOrg'] as string | undefined;
  const adoProject = options['adoProject'] as string | undefined;
  const adoPat = (options['adoPat'] as string | undefined) ?? process.env['ADO_PAT'];

  // Browser channel
  const browserRaw = options['browser'] as string | undefined;
  const browserChannel = browserRaw === 'edge' || browserRaw === 'msedge' ? 'msedge' as const : undefined;

  // Learn / Generate flags
  const learn = !!options['learn'];
  const generate = !!options['generate'];
  const aiGenerate = !!options['aiGenerate'];
  const patternDir = options['patternDir'] as string | undefined;
  const maxGenerated = options['maxGenerated'] as number | undefined;

  let testPlanConfig: TestPlanConfig | undefined;

  if (testPlanFile) {
    testPlanConfig = {
      source: 'file',
      filePath: testPlanFile,
      explorationDepth: exploreDepth,
    };
  } else if (steps && steps.length > 0) {
    testPlanConfig = {
      source: 'inline',
      inlineSteps: steps,
      explorationDepth: exploreDepth,
    };
  } else if (testPlanRaw) {
    // Could be a numeric ID or a full ADO URL
    const parsed = parseTestPlanUrl(testPlanRaw);
    if (parsed) {
      testPlanConfig = {
        source: 'ado-api',
        ado: {
          planId: parsed.planId,
          suiteIds: parsed.suiteId ? [parsed.suiteId] : undefined,
          orgUrl: parsed.orgUrl ?? adoOrg,
          project: parsed.project ?? adoProject,
          pat: adoPat,
        },
        explorationDepth: exploreDepth,
      };
    } else {
      // Treat as numeric plan ID
      const planId = parseInt(testPlanRaw, 10);
      if (isNaN(planId)) {
        console.error(chalk.red('\n✖ --test-plan must be a numeric ID or valid ADO test management URL'));
        process.exit(2);
      }
      testPlanConfig = {
        source: 'ado-api',
        ado: {
          planId,
          orgUrl: adoOrg,
          project: adoProject,
          pat: adoPat,
        },
        explorationDepth: exploreDepth,
      };
    }
  }

  // Build AuthConfig from CLI flags
  let authConfig: AuthConfig | undefined;
  if (credentialsRaw || authUrl) {
    authConfig = {};
    if (authUrl) {
      authConfig.loginUrl = authUrl;
    }
    if (credentialsRaw) {
      const colonIdx = credentialsRaw.indexOf(':');
      if (colonIdx === -1) {
        console.error(chalk.red('\n✖ --credentials must be in user:pass format'));
        process.exit(2);
      }
      authConfig.credentials = {
        username: credentialsRaw.slice(0, colonIdx),
        password: credentialsRaw.slice(colonIdx + 1),
      };
    }
  }

  // Banner
  console.log('');
  console.log(chalk.bold.cyan('  ♿ Smart A11y Scanner v' + VERSION));
  console.log(chalk.gray(`  Target: ${config.targetUrl}`));
  console.log(chalk.gray(`  Depth: ${config.crawlDepth} | Max pages: ${config.maxPages} | WCAG: ${config.wcagLevel}`));
  console.log(chalk.gray(`  Timeout: ${timeoutSec}s`));
  if (authUrl) console.log(chalk.gray(`  Auth URL: ${authUrl}`));
  if (headed) console.log(chalk.gray(`  Mode: headed (browser visible)`));
  if (browserChannel) console.log(chalk.gray(`  Browser: Microsoft Edge`));
  if (interactiveAuth) console.log(chalk.cyan(`  🔐 Interactive auth: browser will open for manual login`));
  if (spaDiscovery) console.log(chalk.gray(`  Smart crawl: enabled (auto-discovers pages)`));
  if (testPlanConfig) {
    const source = testPlanConfig.source === 'file' ? `file: ${testPlanConfig.filePath}`
      : testPlanConfig.source === 'inline' ? `${testPlanConfig.inlineSteps?.length} inline steps`
      : `ADO plan #${testPlanConfig.ado?.planId}`;
    console.log(chalk.cyan(`  📋 Test plan: ${source}`));
  }
  if (learn) console.log(chalk.cyan('  📚 Learning: patterns will be extracted and saved'));
  if (generate) console.log(chalk.cyan('  🧪 Generation: AI will create new test scenarios'));
  if (aiGenerate) console.log(chalk.cyan('  🤖 LLM generation: edge cases via AI'));
  console.log('');

  // Run scan
  const progress = new ProgressDisplay(verbose);

  console.log(chalk.cyan('  ⟳ Starting scan...'));
  console.log('');

  const engine = new ScanEngine({
    url: config.targetUrl,
    maxDepth: config.crawlDepth,
    maxPages: config.maxPages,
    pageTimeoutMs: config.pageTimeout,
    timeout: timeoutSec * 1000,
    headless: !headed,
    interactiveAuth,
    spaDiscovery,
    ...(browserChannel ? { browserChannel } : {}),
    ...(authConfig ? { auth: authConfig } : {}),
    ...(testPlanConfig ? { testPlan: testPlanConfig } : {}),
    // Learn/Generate flags — types added to ScanConfig by Naomi (concurrent)
    ...(learn || generate || aiGenerate ? {
      learn,
      generate,
      aiGenerate,
      ...(patternDir ? { patternDir } : {}),
      ...(maxGenerated !== undefined ? { maxGenerated } : {}),
      captureScreenshots: learn || undefined,
    } as Record<string, unknown> : {}),
  });

  const result = await engine.run();

  // Show progress for each page (engine doesn't emit events yet)
  for (const page of result.pages) {
    progress.onPageStart(page.url);
    progress.onPageComplete(page.url, page.findings.length, page.analysisTimeMs);
  }
  progress.finish();

  // Print summary
  printSummary(result);

  // Generate reports
  const reporter = new Reporter({ verbose });
  const artifacts = await reporter.generate(result, config.report);

  console.log('');
  console.log(chalk.bold('  📄 Reports generated:'));
  let htmlReportPath: string | undefined;
  for (const artifact of artifacts) {
    const size = artifact.sizeBytes >= 1024
      ? `${(artifact.sizeBytes / 1024).toFixed(1)} KB`
      : `${artifact.sizeBytes} bytes`;
    console.log(`    ${chalk.green('✔')} ${artifact.format.toUpperCase().padEnd(5)} → ${artifact.filePath} (${size})`);
    if (artifact.format === 'html') htmlReportPath = artifact.filePath;
  }

  // Auto-open the HTML report in the default browser
  if (htmlReportPath) {
    try {
      const { exec } = await import('child_process');
      const openCmd = process.platform === 'win32' ? `start "" "${htmlReportPath}"`
        : process.platform === 'darwin' ? `open "${htmlReportPath}"`
        : `xdg-open "${htmlReportPath}"`;
      exec(openCmd);
      console.log(`    ${chalk.cyan('🌐')} Opening report in browser...`);
    } catch { /* non-fatal */ }
  }

  // ADO bug filing placeholder
  if (config.fileBugs) {
    console.log('');
    console.log(chalk.yellow('  ⚠ ADO bug filing not yet implemented in POC'));
  }

  // Exit code
  console.log('');
  if (result.summary.totalFindings > 0) {
    console.log(chalk.yellow(`  ⚠ ${result.summary.totalFindings} accessibility findings detected`));
    process.exit(1);
  } else {
    console.log(chalk.green('  ✔ No accessibility findings — site looks clean!'));
    process.exit(0);
  }
}

program
  .command('suggest')
  .description('Scan a URL and suggest A11Y test cases')
  .argument('<url>', 'URL to analyze for A11Y test case suggestions')
  .option('-o, --output <format>', 'Report format: md, html, or both (default: both)')
  .option('--output-path <dir>', 'Output directory for reports (default: ./a11y-reports)')
  .option('--headed', 'Show browser window during scan')
  .option('--browser <channel>', 'Browser: chromium (default), edge')
  .option('--timeout <seconds>', 'Scan timeout in seconds (default: 120)', parseInt)
  .option('--interactive-auth', 'Pause for manual login before scanning (implies --headed)')
  .option('--spa', 'Discover SPA routes by clicking navigation elements')
  .option('--depth <n>', 'Crawl depth for SPA discovery (default: 1)', parseInt)
  .option('--verbose', 'Verbose output')
  .addHelpText('after', `
${chalk.bold('Examples:')}
  $ a11y-scan suggest https://example.com
  $ a11y-scan suggest https://example.com --output md
  $ a11y-scan suggest https://example.com --headed --browser edge
  $ a11y-scan suggest https://example.com --interactive-auth --spa
  $ a11y-scan suggest https://example.com --spa --depth 2
`)
  .action(async (url: string, options: Record<string, unknown>) => {
    try {
      await runSuggest(url, options);
    } catch (err) {
      console.error(chalk.red(`\n✖ ${err instanceof Error ? err.message : String(err)}`));
      process.exit(2);
    }
  });

async function runSuggest(url: string, options: Record<string, unknown>): Promise<void> {
  const verbose = !!options['verbose'];
  const timeoutSec = (options['timeout'] as number | undefined) ?? 120;
  const interactiveAuth = !!options['interactiveAuth'];
  const spaDiscovery = !!options['spa'];
  const maxDepth = (options['depth'] as number | undefined) ?? (spaDiscovery ? 1 : 0);
  const headed = !!options['headed'] || interactiveAuth;
  const outputFormat = (options['output'] as string | undefined) ?? 'both';
  const outputPath = (options['outputPath'] as string | undefined) ?? './a11y-reports';
  const browserRaw = options['browser'] as string | undefined;
  const browserChannel = browserRaw === 'edge' || browserRaw === 'msedge' ? 'msedge' as const : 'chromium' as const;

  // Banner
  console.log('');
  console.log(chalk.bold.cyan('  ♿ Smart A11y Scanner — Test Case Suggester v' + VERSION));
  console.log(chalk.gray(`  Target: ${url}`));
  console.log(chalk.gray(`  Timeout: ${timeoutSec}s`));
  if (headed) console.log(chalk.gray(`  Mode: headed (browser visible)`));
  if (interactiveAuth) console.log(chalk.gray(`  Interactive auth: enabled (will pause for login)`));
  if (spaDiscovery) console.log(chalk.gray(`  SPA discovery: enabled (depth: ${maxDepth})`));
  if (browserChannel === 'msedge') console.log(chalk.gray(`  Browser: Microsoft Edge`));
  console.log('');

  // Run suggestion engine
  console.log(chalk.cyan('  ⟳ Analyzing page for test case suggestions...'));
  console.log('');

  const suggester = new TestCaseSuggester();
  const result = await suggester.suggest(url, {
    timeout: timeoutSec,
    headed,
    browser: browserChannel,
    verbose,
    interactiveAuth,
    spaDiscovery,
    maxDepth,
  });

  // Print summary
  console.log('');
  console.log(chalk.bold('━'.repeat(60)));
  console.log(chalk.bold('  📊 Suggestion Summary'));
  console.log(chalk.bold('━'.repeat(60)));
  console.log(`  ${chalk.gray('URL:')}           ${url}`);
  console.log(`  ${chalk.gray('Page:')}          ${result.pageTitle}`);
  console.log(`  ${chalk.gray('Duration:')}      ${(result.duration / 1000).toFixed(1)}s`);
  console.log(`  ${chalk.gray('Suggestions:')}   ${result.totalSuggestions}`);
  console.log('');
  console.log(`  ${chalk.red('🔴 High:')}       ${result.prioritySummary.high}`);
  console.log(`  ${chalk.yellow('🟡 Medium:')}     ${result.prioritySummary.medium}`);
  console.log(`  ${chalk.blue('🔵 Low:')}        ${result.prioritySummary.low}`);
  console.log('');

  console.log(chalk.bold('━'.repeat(60)));

  // Generate reports
  console.log('');
  console.log(chalk.cyan('  📄 Generating reports...'));

  await mkdir(outputPath, { recursive: true });

  const shouldGenerateMd = outputFormat === 'md' || outputFormat === 'both';
  const shouldGenerateHtml = outputFormat === 'html' || outputFormat === 'both';

  let mdPath: string | undefined;
  let htmlPath: string | undefined;

  if (shouldGenerateMd) {
    const mdContent = generateSuggestionMdReport(result);
    const pageName = slugifyPageName(result.pageTitle, result.url);
    const date = formatDateYYYYMMDD(new Date());
    mdPath = join(outputPath, `${pageName}-${date}.md`);
    await writeFile(mdPath, mdContent, 'utf-8');

    const size = Buffer.byteLength(mdContent, 'utf-8');
    const sizeStr = size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} bytes`;
    console.log(`    ${chalk.green('✔')} MD    → ${mdPath} (${sizeStr})`);
  }

  if (shouldGenerateHtml) {
    const htmlContent = generateSuggestionHtmlReport(result);
    const pageName = slugifyPageName(result.pageTitle, result.url);
    const date = formatDateYYYYMMDD(new Date());
    htmlPath = join(outputPath, `${pageName}-${date}.html`);
    await writeFile(htmlPath, htmlContent, 'utf-8');

    const size = Buffer.byteLength(htmlContent, 'utf-8');
    const sizeStr = size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} bytes`;
    console.log(`    ${chalk.green('✔')} HTML  → ${htmlPath} (${sizeStr})`);
  }

  // Auto-open the HTML report in the default browser
  if (htmlPath) {
    try {
      const { exec } = await import('child_process');
      const openCmd = process.platform === 'win32' ? `start "" "${htmlPath}"`
        : process.platform === 'darwin' ? `open "${htmlPath}"`
        : `xdg-open "${htmlPath}"`;
      exec(openCmd);
      console.log(`    ${chalk.cyan('🌐')} Opening report in browser...`);
    } catch { /* non-fatal */ }
  }

  console.log('');
  console.log(chalk.green('  ✔ Test case suggestions generated successfully!'));
  process.exit(0);
}

program.parse();
