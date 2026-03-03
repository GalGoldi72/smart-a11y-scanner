/**
 * JSON report format — structured output for programmatic consumption.
 */

import type { ScanResult } from '../../scanner/types.js';

export interface JsonReportOptions {
  pretty: boolean;
}

/** Generate a JSON report string from scan results */
export function generateJsonReport(
  result: ScanResult,
  options: JsonReportOptions = { pretty: false },
): string {
  const report = {
    $schema: 'smart-a11y-scanner/v1',
    scan: {
      url: result.config.url,
      startedAt: result.startedAt,
      durationMs: result.durationMs,
      depth: result.config.maxDepth,
      pagesScanned: result.summary.totalPages,
    },
    summary: {
      totalFindings: result.summary.totalFindings,
      bySeverity: result.summary.bySeverity,
      byCategory: result.summary.byCategory,
    },
    pages: result.pages.map((page) => ({
      url: page.url,
      title: page.metadata.title,
      analysisTimeMs: page.analysisTimeMs,
      error: page.error ?? null,
      findingsCount: page.findings.length,
      findings: page.findings.map((f) => ({
        ruleId: f.ruleId,
        severity: f.severity,
        category: f.category,
        wcag: {
          criterion: f.wcagCriterion,
          level: f.wcagLevel,
        },
        message: f.message,
        element: f.selector,
        htmlSnippet: f.htmlSnippet,
        remediation: f.remediation,
        ...(f.reproSteps?.length ? { reproSteps: f.reproSteps } : {}),
        ...(f.screenshot ? { screenshot: f.screenshot } : {}),
      })),
    })),
    ...(result.guidedResults ? {
      guidedResults: {
        testPlanSource: result.config.testPlan?.source,
        summary: {
          totalSteps: result.guidedResults.totalSteps,
          successfulSteps: result.guidedResults.successfulSteps,
          failedSteps: result.guidedResults.failedSteps,
          totalFindings: result.guidedResults.totalFindings,
        },
        stepResults: result.guidedResults.stepResults.map(step => ({
          stepIndex: step.stepIndex,
          stepText: step.stepText,
          success: step.success,
          action: step.action,
          urlAfterStep: step.urlAfterStep,
          findingsAtStep: step.findings.length,
          explorationFindings: step.explorationFindings.length,
          ...(step.error ? { error: step.error } : {}),
          ...(step.adoTestCaseId ? { adoTestCaseId: step.adoTestCaseId } : {}),
        })),
      },
    } : {}),
    ...((result as any).learningSummary ? { learningSummary: (result as any).learningSummary } : {}),
    ...((result as any).generationSummary ? { generationSummary: (result as any).generationSummary } : {}),
  };

  return options.pretty
    ? JSON.stringify(report, null, 2)
    : JSON.stringify(report);
}
