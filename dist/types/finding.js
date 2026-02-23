/**
 * Finding types — barrel re-exports and utilities.
 *
 * Canonical sources:
 *   - Engine-level Finding → scanner/types.ts (Naomi)
 *   - Rule definitions → rules/types.ts (Drummer)
 */
/** Maps severity to ADO priority */
export function severityToPriority(severity) {
    const map = {
        critical: 0,
        major: 1,
        minor: 2,
        advisory: 3,
    };
    return map[severity];
}
//# sourceMappingURL=finding.js.map