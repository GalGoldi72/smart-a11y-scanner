/**
 * Axe-core → Drummer category mapping.
 *
 * Converts axe-core's tagging system to our RuleCategory taxonomy,
 * WCAG levels, criterion references, and severity values.
 *
 * Owned by Drummer (Accessibility Expert).
 * Consumed by Naomi (Backend) when integrating @axe-core/playwright results.
 */

import type { RuleCategory, WcagLevel, Severity } from './types.js';

// ---------------------------------------------------------------------------
// 1. Axe category tag → RuleCategory constant map
// ---------------------------------------------------------------------------

/**
 * Maps each axe-core "cat.*" tag to the closest RuleCategory in our taxonomy.
 *
 * | Axe Tag                     | Our Category      | Rationale                                           |
 * |-----------------------------|-------------------|-----------------------------------------------------|
 * | cat.color                   | distinguishable   | Color contrast → WCAG 1.4 Distinguishable           |
 * | cat.forms                   | forms             | Direct match                                        |
 * | cat.aria                    | aria              | Direct match                                        |
 * | cat.keyboard                | keyboard          | Direct match                                        |
 * | cat.language                | readable          | WCAG 3.1 Readable covers language of page/parts     |
 * | cat.name-role-value         | aria              | WCAG 4.1.2 maps to ARIA names, roles, states        |
 * | cat.text-alternatives       | images            | Primarily alt text for non-text content (WCAG 1.1)  |
 * | cat.semantics               | compatible        | Proper element usage → WCAG 4.1 Compatible          |
 * | cat.structure               | adaptable         | Info & relationships → WCAG 1.3 Adaptable           |
 * | cat.tables                  | adaptable         | Table structure → WCAG 1.3.1 Info & Relationships   |
 * | cat.time-and-media          | multimedia        | Audio/video content → WCAG 1.2 Time-based Media     |
 * | cat.sensory-and-visual-cues | distinguishable   | Visual presentation → WCAG 1.4 Distinguishable      |
 * | cat.parsing                 | compatible        | Markup validity → WCAG 4.1.1 Parsing                |
 */
export const AXE_CATEGORY_MAP: Record<string, RuleCategory> = {
  'cat.color': 'distinguishable',
  'cat.forms': 'forms',
  'cat.aria': 'aria',
  'cat.keyboard': 'keyboard',
  'cat.language': 'readable',
  'cat.name-role-value': 'aria',
  'cat.text-alternatives': 'images',
  'cat.semantics': 'compatible',
  'cat.structure': 'adaptable',
  'cat.tables': 'adaptable',
  'cat.time-and-media': 'multimedia',
  'cat.sensory-and-visual-cues': 'distinguishable',
  'cat.parsing': 'compatible',
};

/** Fallback category when no "cat.*" tag matches */
const DEFAULT_CATEGORY: RuleCategory = 'compatible';

// ---------------------------------------------------------------------------
// 2. mapAxeCategoryToRuleCategory
// ---------------------------------------------------------------------------

/**
 * Derives the best RuleCategory from an axe-core result's tags array.
 *
 * Strategy: prefer "cat.*" tags (most specific) over WCAG-principle heuristics.
 * If multiple "cat.*" tags are present, the first match wins.
 */
export function mapAxeCategoryToRuleCategory(tags: string[]): RuleCategory {
  // First pass — look for a direct "cat.*" match
  for (const tag of tags) {
    if (tag.startsWith('cat.') && tag in AXE_CATEGORY_MAP) {
      return AXE_CATEGORY_MAP[tag];
    }
  }

  // Second pass — fall back to WCAG principle heuristics derived from criterion tags
  const criterion = mapAxeWcagCriterion(tags);
  if (criterion) {
    const principle = criterion.charAt(0);
    switch (principle) {
      case '1': return wcagGuideline1Fallback(criterion);
      case '2': return wcagGuideline2Fallback(criterion);
      case '3': return wcagGuideline3Fallback(criterion);
      case '4': return 'compatible';
    }
  }

  return DEFAULT_CATEGORY;
}

/** WCAG Principle 1 (Perceivable) sub-guideline fallback */
function wcagGuideline1Fallback(criterion: string): RuleCategory {
  const guideline = criterion.split('.')[1];
  switch (guideline) {
    case '1': return 'images';          // 1.1 Text Alternatives
    case '2': return 'multimedia';      // 1.2 Time-based Media
    case '3': return 'adaptable';       // 1.3 Adaptable
    case '4': return 'distinguishable'; // 1.4 Distinguishable
    default:  return 'images';
  }
}

/** WCAG Principle 2 (Operable) sub-guideline fallback */
function wcagGuideline2Fallback(criterion: string): RuleCategory {
  const guideline = criterion.split('.')[1];
  switch (guideline) {
    case '1': return 'keyboard';         // 2.1 Keyboard Accessible
    case '2': return 'timing';           // 2.2 Enough Time
    case '3': return 'seizures';         // 2.3 Seizures and Physical
    case '4': return 'navigable';        // 2.4 Navigable
    case '5': return 'input-modalities'; // 2.5 Input Modalities
    default:  return 'keyboard';
  }
}

/** WCAG Principle 3 (Understandable) sub-guideline fallback */
function wcagGuideline3Fallback(criterion: string): RuleCategory {
  const guideline = criterion.split('.')[1];
  switch (guideline) {
    case '1': return 'readable';         // 3.1 Readable
    case '2': return 'predictable';      // 3.2 Predictable
    case '3': return 'input-assistance'; // 3.3 Input Assistance
    default:  return 'readable';
  }
}

// ---------------------------------------------------------------------------
// 3. mapAxeWcagLevel
// ---------------------------------------------------------------------------

/** Pattern: "wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aaa", etc. */
const WCAG_LEVEL_RE = /^wcag2[0-2]?(?:a{1,3})$/;

/**
 * Extracts the WCAG conformance level from an axe-core tags array.
 *
 * Handles all variants: "wcag2a", "wcag2aa", "wcag21a", "wcag21aa",
 * "wcag22aa", "wcag2aaa", etc.
 *
 * Falls back to "AA" when only "best-practice" is present (sensible default
 * since most best-practice rules align with AA expectations).
 */
export function mapAxeWcagLevel(tags: string[]): WcagLevel {
  for (const tag of tags) {
    if (!WCAG_LEVEL_RE.test(tag)) continue;

    // Count trailing 'a' characters to determine level
    const aCount = tag.length - tag.search(/a+$/);
    if (aCount === 3) return 'AAA';
    if (aCount === 2) return 'AA';
    if (aCount === 1) return 'A';
  }

  // "best-practice" or unrecognised → default AA
  return 'AA';
}

// ---------------------------------------------------------------------------
// 4. mapAxeWcagCriterion
// ---------------------------------------------------------------------------

/**
 * Pattern for WCAG criterion tags.
 * Examples: "wcag111" → 1.1.1, "wcag143" → 1.4.3, "wcag2411" → 2.4.11
 *
 * Format: "wcag" + principle (1 digit) + guideline (1 digit) + criterion (1+ digits)
 */
const WCAG_CRITERION_RE = /^wcag(\d)(\d)(\d+)$/;

/**
 * Extracts a dotted WCAG criterion string from axe-core tags.
 *
 * "wcag111"  → "1.1.1"
 * "wcag143"  → "1.4.3"
 * "wcag2411" → "2.4.11"
 * "wcag338"  → "3.3.8"
 *
 * Returns empty string when no criterion tag is found.
 */
export function mapAxeWcagCriterion(tags: string[]): string {
  for (const tag of tags) {
    const m = WCAG_CRITERION_RE.exec(tag);
    if (m) {
      return `${m[1]}.${m[2]}.${m[3]}`;
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// 5. mapAxeImpactToSeverity
// ---------------------------------------------------------------------------

/** Valid axe-core impact values */
const AXE_IMPACT_MAP: Record<string, Severity> = {
  critical: 'critical',
  serious: 'serious',
  moderate: 'moderate',
  minor: 'minor',
};

/**
 * Maps an axe-core impact string to our Severity type.
 *
 * Direct 1:1 mapping since our Severity type was intentionally aligned
 * with axe-core's impact scale (see history.md 2025-07 entry).
 * Null or unknown values default to "moderate".
 */
export function mapAxeImpactToSeverity(impact: string | null): Severity {
  if (impact && impact in AXE_IMPACT_MAP) {
    return AXE_IMPACT_MAP[impact];
  }
  return 'moderate';
}
