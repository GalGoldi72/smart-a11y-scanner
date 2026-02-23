/**
 * Finding types — barrel re-exports and utilities.
 *
 * Canonical sources:
 *   - Engine-level Finding → scanner/types.ts (Naomi)
 *   - Rule definitions → rules/types.ts (Drummer)
 */

export type {
  Finding,
  PageResult,
} from '../scanner/types.js';

export type { Severity, WcagReference, RuleCategory } from '../rules/types.js';

/** Priority mapping for ADO bug filing */
import type { Severity } from '../rules/types.js';
export type BugPriority = 0 | 1 | 2 | 3;

/** Maps severity to ADO priority */
export function severityToPriority(severity: Severity): BugPriority {
  const map: Record<Severity, BugPriority> = {
    critical: 0,
    major: 1,
    minor: 2,
    advisory: 3,
  };
  return map[severity];
}
