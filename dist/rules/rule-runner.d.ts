/**
 * RuleRunner — runs accessibility rules against a page.
 *
 * Consumes Drummer's AccessibilityRule definitions from rules/types.ts.
 * Produces Naomi's Finding type from scanner/types.ts.
 */
import { AccessibilityRule, RuleCatalog } from './types.js';
import { Finding } from '../scanner/types.js';
import type { Page } from 'playwright';
/** Context provided to each rule evaluation */
export interface RuleContext {
    /** The URL being evaluated */
    url: string;
    /** The Playwright page handle */
    browserPage: Page;
}
/** Result of evaluating a single rule on a page */
export interface RuleEvaluation {
    rule: AccessibilityRule;
    findings: Finding[];
    /** Time taken to evaluate this rule in ms */
    durationMs: number;
    /** Whether the rule was skipped (e.g., browser-mode rule in static scan) */
    skipped: boolean;
    skipReason?: string;
}
/** Interface for the rule runner */
export interface IRuleRunner {
    /** Run all applicable rules against a page context */
    run(context: RuleContext, rules: RuleCatalog): Promise<RuleEvaluation[]>;
    /** Run a single rule against a page context */
    runSingle(context: RuleContext, rule: AccessibilityRule): Promise<RuleEvaluation>;
}
/** Skeleton implementation */
export declare class RuleRunner implements IRuleRunner {
    constructor();
    run(context: RuleContext, rules: RuleCatalog): Promise<RuleEvaluation[]>;
    runSingle(context: RuleContext, rule: AccessibilityRule): Promise<RuleEvaluation>;
}
//# sourceMappingURL=rule-runner.d.ts.map