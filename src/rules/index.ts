/**
 * Rules barrel — the single import point for the full rule catalog.
 *
 * Usage:
 *   import { allRules } from './rules/index.js';
 *   import { imageRules, keyboardRules } from './rules/index.js';
 */
import { AccessibilityRule, RuleCategory, RuleCatalog } from './types.js';
import {
  imageRules,
  multimediaRules,
  adaptableRules,
  distinguishableRules,
  keyboardRules,
  timingRules,
  seizureRules,
  navigableRules,
  inputModalityRules,
  readableRules,
  predictableRules,
  inputAssistanceRules,
  compatibleRules,
  ariaRules,
  formRules,
  screenReaderRules,
} from './categories/index.js';

/** Every rule in the catalog, across all categories */
export const allRules: RuleCatalog = [
  ...imageRules,
  ...multimediaRules,
  ...adaptableRules,
  ...distinguishableRules,
  ...keyboardRules,
  ...timingRules,
  ...seizureRules,
  ...navigableRules,
  ...inputModalityRules,
  ...readableRules,
  ...predictableRules,
  ...inputAssistanceRules,
  ...compatibleRules,
  ...ariaRules,
  ...formRules,
  ...screenReaderRules,
] as const;

/** Get rules filtered by category */
export function getRulesByCategory(category: RuleCategory): AccessibilityRule[] {
  return allRules.filter(r => r.category === category);
}

/** Get rules filtered by WCAG level (A, AA, AAA) */
export function getRulesByLevel(level: 'A' | 'AA' | 'AAA'): AccessibilityRule[] {
  return allRules.filter(r => r.wcagReferences.some(ref => ref.level === level));
}

/** Get rules filtered by tag */
export function getRulesByTag(tag: string): AccessibilityRule[] {
  return allRules.filter(r => r.tags.includes(tag));
}

// Re-export individual category arrays
export {
  imageRules,
  multimediaRules,
  adaptableRules,
  distinguishableRules,
  keyboardRules,
  timingRules,
  seizureRules,
  navigableRules,
  inputModalityRules,
  readableRules,
  predictableRules,
  inputAssistanceRules,
  compatibleRules,
  ariaRules,
  formRules,
  screenReaderRules,
};

// Re-export types
export type { AccessibilityRule, RuleCategory, RuleCatalog, WcagLevel, Severity, AutomationLevel, WcagReference, AnalysisMode } from './types.js';
