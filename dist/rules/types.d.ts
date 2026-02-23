/**
 * Type definitions for accessibility scanner rules.
 *
 * These types define the shape of every rule in the catalog.
 * The scanner engine (Naomi) consumes these; Drummer owns the definitions.
 */
/** WCAG conformance levels */
export type WcagLevel = 'A' | 'AA' | 'AAA';
/** Impact severity of a rule violation */
export type Severity = 'critical' | 'major' | 'minor' | 'advisory';
/** Whether the check can run on static HTML or needs a live browser */
export type AnalysisMode = 'static' | 'browser' | 'both';
/** High-level categories that group related rules */
export type RuleCategory = 'aria' | 'color-contrast' | 'zoom-reflow' | 'keyboard' | 'screen-reader' | 'voice-access' | 'forms' | 'media' | 'semantic-html' | 'motion' | 'language-text' | 'navigation-structure' | 'timing' | 'error-handling' | 'authentication';
/** A single WCAG success criterion reference */
export interface WcagReference {
    /** Success criterion number, e.g. "1.4.3" */
    criterion: string;
    /** Human-readable criterion name */
    name: string;
    /** Conformance level */
    level: WcagLevel;
}
/** A single accessibility rule the scanner should enforce */
export interface AccessibilityRule {
    /** Unique rule identifier, kebab-case (e.g. "img-alt-text") */
    id: string;
    /** Category for grouping */
    category: RuleCategory;
    /** Short human-readable title */
    title: string;
    /** Detailed description of what the rule checks */
    description: string;
    /** WCAG 2.2 success criteria this rule maps to */
    wcagReferences: WcagReference[];
    /** How severe a violation of this rule is */
    severity: Severity;
    /** How to fix a violation of this rule */
    remediation: string;
    /** CSS selectors or DOM patterns to inspect (hints for the engine) */
    selectorHints: string[];
    /** Whether static HTML analysis suffices or a live browser is needed */
    analysisMode: AnalysisMode;
    /** Tags for filtering (e.g. "new-in-2.2", "automated", "semi-automated") */
    tags: string[];
    /** If true, the rule can be fully evaluated by automation.
     *  If false, the scanner can flag candidates but a human must confirm. */
    fullyAutomatable: boolean;
}
/** The complete rule catalog exported by this module */
export type RuleCatalog = readonly AccessibilityRule[];
//# sourceMappingURL=types.d.ts.map