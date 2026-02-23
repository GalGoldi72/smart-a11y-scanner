/**
 * Reporter — orchestrates report generation across formats.
 * Consumes ScanResult from Naomi's engine, outputs to requested format(s).
 */
import type { ScanResult } from '../scanner/types.js';
import type { ReportConfig } from '../config/schema.js';
/** A generated report artifact */
export interface ReportArtifact {
    format: 'html' | 'json' | 'csv';
    filePath: string;
    sizeBytes: number;
}
/** Interface for report generation */
export interface IReporter {
    generate(result: ScanResult, config: ReportConfig): Promise<ReportArtifact[]>;
}
export declare class Reporter implements IReporter {
    private verbose;
    constructor(options?: {
        verbose?: boolean;
    });
    generate(result: ScanResult, config: ReportConfig): Promise<ReportArtifact[]>;
    private writeReport;
}
//# sourceMappingURL=reporter.d.ts.map