/**
 * Azure DevOps client — creates bug work items from scan findings.
 *
 * Uses the ADO REST API (v7.0) with PAT authentication.
 * Maps accessibility findings to work item fields with repro steps,
 * severity, and optional screenshot attachments.
 */
import { AdoConfig, ScanResult } from '../scanner/types.js';
/** Work item payload for ADO bug creation */
export interface ADOWorkItem {
    title: string;
    description: string;
    reproSteps: string;
    priority: number;
    severity: string;
    tags: string[];
    customFields?: Record<string, string>;
}
/** Result returned after creating a bug */
export interface ADOCreateResult {
    id: number;
    url: string;
    title: string;
}
/** Contract that bug-creator.ts programs against */
export interface IADOClient {
    createBug(workItem: ADOWorkItem): Promise<ADOCreateResult>;
    findDuplicate(title: string, tags: string[]): Promise<ADOCreateResult | null>;
}
/** Result of filing a single bug (used by engine-level batch filing) */
export interface FiledBug {
    id: number;
    url: string;
    title: string;
    findingRuleId: string;
    pageUrl: string;
}
export declare class AdoClient implements IADOClient {
    private http;
    private config;
    constructor(config: AdoConfig);
    createBug(workItem: ADOWorkItem): Promise<ADOCreateResult>;
    findDuplicate(title: string, tags: string[]): Promise<ADOCreateResult | null>;
    /** File bugs for all findings in a scan result */
    fileBugsForScan(result: ScanResult): Promise<FiledBug[]>;
    private attachScreenshot;
    private groupFindingsByRule;
    private buildReproSteps;
    private buildDescription;
    private escapeHtml;
}
//# sourceMappingURL=client.d.ts.map