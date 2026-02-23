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
import type { ScanResult } from './scanner/types.js';
import type { Severity } from './rules/types.js';

const VERSION = '0.1.0';

const SEVERITY_COLORS: Record<Severity, (s: string) => string> = {
  critical: chalk.red.bold,
  major: chalk.hex('#ea580c'),
  minor: chalk.yellow,
  advisory: chalk.blue,
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
  const sevOrder: Severity[] = ['critical', 'major', 'minor', 'advisory'];
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

  // Banner
  console.log('');
  console.log(chalk.bold.cyan('  ♿ Smart A11y Scanner v' + VERSION));
  console.log(chalk.gray(`  Target: ${config.targetUrl}`));
  console.log(chalk.gray(`  Depth: ${config.crawlDepth} | Max pages: ${config.maxPages} | WCAG: ${config.wcagLevel}`));
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
  for (const artifact of artifacts) {
    const size = artifact.sizeBytes >= 1024
      ? `${(artifact.sizeBytes / 1024).toFixed(1)} KB`
      : `${artifact.sizeBytes} bytes`;
    console.log(`    ${chalk.green('✔')} ${artifact.format.toUpperCase().padEnd(5)} → ${artifact.filePath} (${size})`);
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

program.parse();
