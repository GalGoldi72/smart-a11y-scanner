/**
 * BugCreator — higher-level facade for filing accessibility bugs in ADO.
 *
 * Uses Naomi's AdoClient for the actual API calls.
 * Transforms scan findings into the format AdoClient expects.
 */

import type { Finding, ScanResult } from '../scanner/types.js';
import type { Severity } from '../rules/types.js';
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
  errors: Array<{ ruleId: string; pageUrl: string; error: string }>;
}

/** Interface for bug creation logic */
export interface IBugCreator {
  /** File bugs for an entire scan result */
  fileForScan(result: ScanResult): Promise<BugFilingResult>;
}

/** Skeleton implementation that delegates to AdoClient */
export class BugCreator implements IBugCreator {
  private client: AdoClient;

  constructor(client: AdoClient) {
    this.client = client;
  }

  async fileForScan(result: ScanResult): Promise<BugFilingResult> {
    // Delegate to AdoClient.fileBugsForScan which already handles
    // grouping, deduplication, and screenshot attachment
    const bugResult: BugFilingResult = {
      totalFindings: result.pages.reduce((sum, p) => sum + p.findings.length, 0),
      filed: [],
      duplicatesSkipped: 0,
      errors: [],
    };

    try {
      const filed = await this.client.fileBugsForScan(result);
      bugResult.filed = filed;
    } catch (err) {
      bugResult.errors.push({
        ruleId: '*',
        pageUrl: result.config.url,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return bugResult;
  }
}
