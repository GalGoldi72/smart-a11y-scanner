/**
 * Type definitions for test case suggestion feature.
 *
 * Steps use the ADO navigation-flow format: each step pairs an action
 * ("Activate X") with an expected result ("Verify Y"), matching the
 * step-by-step layout in ADO Test Case work items.
 */

import type { Severity, WcagLevel, RuleCategory } from '../rules/types.js';

/** A single "Activate X → Verify Y" step in a navigation-flow test case. */
export interface TestStep {
  /** What the tester does (e.g. "Navigate to https://…", "Press Tab") */
  action: string;
  /** What should happen after the action (e.g. "Focus moves to main content") */
  expectedResult: string;
}

export interface SuggestedTestCase {
  id: string;
  title: string;
  description: string;
  wcagCriteria: string;        // e.g. "1.4.3"
  wcagCriterionName: string;   // e.g. "Contrast (Minimum)"
  wcagLevel: WcagLevel;
  category: RuleCategory;
  priority: 'high' | 'medium' | 'low';
  sourceType: 'violation' | 'element-based' | 'coverage-gap';
  element?: string;             // CSS selector or element description
  /** Ordered navigation-flow steps — each pairs an action with its expected result */
  steps: TestStep[];
  rationale: string;            // Why this test case is suggested
  relatedRuleId?: string;       // Reference to rule catalog
}

export interface CategorySummary {
  category: RuleCategory;
  emoji: string;
  totalSuggestions: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
}

export interface TestCaseSuggestionResult {
  url: string;
  scanDate: string;
  pageTitle: string;
  duration: number;
  totalSuggestions: number;
  prioritySummary: { high: number; medium: number; low: number };
  categorySummary: CategorySummary[];
  suggestions: SuggestedTestCase[];
  overallScore: number;         // 0-10 coverage score
  overallGrade: string;         // S/A/B/C/D/F
}
