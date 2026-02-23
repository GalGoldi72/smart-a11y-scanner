/**
 * BugCreator — higher-level facade for filing accessibility bugs in ADO.
 *
 * Uses Naomi's AdoClient for the actual API calls.
 * Transforms scan findings into the format AdoClient expects.
 */
/** Skeleton implementation that delegates to AdoClient */
export class BugCreator {
    client;
    constructor(client) {
        this.client = client;
    }
    async fileForScan(result) {
        // Delegate to AdoClient.fileBugsForScan which already handles
        // grouping, deduplication, and screenshot attachment
        const bugResult = {
            totalFindings: result.pages.reduce((sum, p) => sum + p.findings.length, 0),
            filed: [],
            duplicatesSkipped: 0,
            errors: [],
        };
        try {
            const filed = await this.client.fileBugsForScan(result);
            bugResult.filed = filed;
        }
        catch (err) {
            bugResult.errors.push({
                ruleId: '*',
                pageUrl: result.config.url,
                error: err instanceof Error ? err.message : String(err),
            });
        }
        return bugResult;
    }
}
//# sourceMappingURL=bug-creator.js.map