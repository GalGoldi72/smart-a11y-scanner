/**
 * CSV report format — one row per finding, importable into Excel / ADO queries.
 */

import type { ScanResult } from '../../scanner/types.js';

const COLUMNS = [
  'Page URL',
  'Page Title',
  'Element',
  'Issue',
  'WCAG Criterion',
  'Level',
  'Severity',
  'Category',
  'Rule ID',
  'Remediation',
] as const;

/** Escape a value for CSV (RFC 4180) */
function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Generate a CSV report string from scan results */
export function generateCsvReport(result: ScanResult): string {
  const rows: string[] = [];

  rows.push(COLUMNS.join(','));

  for (const page of result.pages) {
    for (const f of page.findings) {
      const row = [
        page.url,
        page.metadata.title,
        f.selector,
        f.message,
        f.wcagCriterion,
        f.wcagLevel,
        f.severity,
        f.category,
        f.ruleId,
        f.remediation,
      ].map(escapeCsv);
      rows.push(row.join(','));
    }
  }

  return rows.join('\n') + '\n';
}
