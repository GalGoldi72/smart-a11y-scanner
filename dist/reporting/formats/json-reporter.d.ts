/**
 * JSON report format — structured output for programmatic consumption.
 */
import type { ScanResult } from '../../scanner/types.js';
export interface JsonReportOptions {
    pretty: boolean;
}
/** Generate a JSON report string from scan results */
export declare function generateJsonReport(result: ScanResult, options?: JsonReportOptions): string;
//# sourceMappingURL=json-reporter.d.ts.map