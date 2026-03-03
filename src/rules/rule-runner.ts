/**
 * RuleRunner — runs accessibility rules against a page.
 *
 * Consumes Drummer's AccessibilityRule definitions from rules/types.ts.
 * Produces Naomi's Finding type from scanner/types.ts.
 */

import { AccessibilityRule, RuleCategory, RuleCatalog } from './types.js';
import { allRules, getRulesByCategory, getRulesByLevel, getRulesByTag } from './index.js';
import { Finding, PageResult } from '../scanner/types.js';
import type { Page } from 'playwright';

/** Context provided to each rule evaluation */
export interface RuleContext {
  /** The URL being evaluated */
  url: string;
  /** The Playwright page handle */
  browserPage: Page;
}

/** Options for filtering which rules to run */
export interface RuleFilterOptions {
  /** Run only rules in these categories */
  categories?: RuleCategory[];
  /** Run only rules at these WCAG levels */
  levels?: ('A' | 'AA' | 'AAA')[];
  /** Run only rules with these tags */
  tags?: string[];
  /** Exclude rules with these tags */
  excludeTags?: string[];
  /** Run only rules with these specific IDs */
  ruleIds?: string[];
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
  /** Run rules filtered by options, using the full catalog */
  runFiltered(context: RuleContext, options: RuleFilterOptions): Promise<RuleEvaluation[]>;
  /** Run a single rule against a page context */
  runSingle(context: RuleContext, rule: AccessibilityRule): Promise<RuleEvaluation>;
}

/** Apply filter options to the full rule catalog */
export function filterRules(options: RuleFilterOptions): AccessibilityRule[] {
  let rules: AccessibilityRule[] = [...allRules];

  if (options.categories?.length) {
    rules = rules.filter(r => options.categories!.includes(r.category));
  }
  if (options.levels?.length) {
    rules = rules.filter(r => r.wcagReferences.some(ref => options.levels!.includes(ref.level)));
  }
  if (options.tags?.length) {
    rules = rules.filter(r => options.tags!.some(t => r.tags.includes(t)));
  }
  if (options.excludeTags?.length) {
    rules = rules.filter(r => !options.excludeTags!.some(t => r.tags.includes(t)));
  }
  if (options.ruleIds?.length) {
    rules = rules.filter(r => options.ruleIds!.includes(r.id));
  }

  return rules;
}

/** Skeleton implementation */
export class RuleRunner implements IRuleRunner {
  constructor() {
    // Rule evaluation strategies will be registered here
  }

  async run(context: RuleContext, rules: RuleCatalog): Promise<RuleEvaluation[]> {
    const results: RuleEvaluation[] = [];

    for (const rule of rules) {
      const evaluation = await this.runSingle(context, rule);
      results.push(evaluation);
    }

    return results;
  }

  async runFiltered(context: RuleContext, options: RuleFilterOptions): Promise<RuleEvaluation[]> {
    const filtered = filterRules(options);
    return this.run(context, filtered);
  }

  async runSingle(context: RuleContext, rule: AccessibilityRule): Promise<RuleEvaluation> {
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
