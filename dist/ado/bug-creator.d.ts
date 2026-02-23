/**
 * BugCreator — higher-level facade for filing accessibility bugs in ADO.
 *
 * Uses Naomi's AdoClient for the actual API calls.
 * Transforms scan findings into the format AdoClient expects.
 */
import type { ScanResult } from '../scanner/types.js';
import { AdoClient, FiledBug } from './client.js';
/** Result of a bug filing batch */
export interface BugFilingResult {
    /** Total findings processed */
    totalFindings: number;
    /** Bugs successfully created */
    filed: FiledBug[];
    /** Findings skipped because a duplicate bug already exists */
    duplicatesSkipped: number;
    /** Findings that failed to file */
    errors: Array<{
        ruleId: string;
        pageUrl: string;
        error: string;
    }>;
}
/** Interface for bug creation logic */
export interface IBugCreator {
    /** File bugs for an entire scan result */
    fileForScan(result: ScanResult): Promise<BugFilingResult>;
}
/** Skeleton implementation that delegates to AdoClient */
export declare class BugCreator implements IBugCreator {
    private client;
    constructor(client: AdoClient);
    fileForScan(result: ScanResult): Promise<BugFilingResult>;
}
//# sourceMappingURL=bug-creator.d.ts.map