/**
 * Finding types — barrel re-exports and utilities.
 *
 * Canonical sources:
 *   - Engine-level Finding → scanner/types.ts (Naomi)
 *   - Rule definitions → rules/types.ts (Drummer)
 */
export type { Finding, PageResult, } from '../scanner/types.js';
export type { Severity, WcagReference, RuleCategory } from '../rules/types.js';
/** Priority mapping for ADO bug filing */
import type { Severity } from '../rules/types.js';
export type BugPriority = 0 | 1 | 2 | 3;
/** Maps severity to ADO priority */
export declare function severityToPriority(severity: Severity): BugPriority;
//# sourceMappingURL=finding.d.ts.map