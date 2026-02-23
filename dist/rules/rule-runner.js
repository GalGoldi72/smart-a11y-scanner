/**
 * RuleRunner — runs accessibility rules against a page.
 *
 * Consumes Drummer's AccessibilityRule definitions from rules/types.ts.
 * Produces Naomi's Finding type from scanner/types.ts.
 */
/** Skeleton implementation */
export class RuleRunner {
    constructor() {
        // Rule evaluation strategies will be registered here
    }
    async run(context, rules) {
        const results = [];
        for (const rule of rules) {
            const evaluation = await this.runSingle(context, rule);
            results.push(evaluation);
        }
        return results;
    }
    async runSingle(context, rule) {
        const start = Date.now();
        // Skip browser-mode rules if no browser page available
        if (rule.analysisMode === 'browser' && !context.browserPage) {
            return {
                rule,
                findings: [],
                durationMs: Date.now() - start,
                skipped: true,
                skipReason: 'Browser page not available for browser-mode rule',
            };
        }
        // TODO: Implement rule evaluation logic per category
        throw new Error(`RuleRunner.runSingle not implemented for rule: ${rule.id}`);
    }
}
//# sourceMappingURL=rule-runner.js.map