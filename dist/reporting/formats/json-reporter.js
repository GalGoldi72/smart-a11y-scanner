/**
 * JSON report format — structured output for programmatic consumption.
 */
/** Generate a JSON report string from scan results */
export function generateJsonReport(result, options = { pretty: false }) {
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
            })),
        })),
    };
    return options.pretty
        ? JSON.stringify(report, null, 2)
        : JSON.stringify(report);
}
//# sourceMappingURL=json-reporter.js.map