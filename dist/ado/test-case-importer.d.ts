/**
 * ADO Test Case Importer — fetches test cases from Azure DevOps Test Plans
 * and transforms them into scanner-consumable scenarios.
 *
 * Uses the ADO REST API v7.0:
 *   - Test Plans API for suites and test case references
 *   - Work Items API for reading step XML and fields
 *
 * The importer extracts navigation URLs, UI interactions, and expected a11y
 * behaviors from test case steps so the hybrid scanner can replay manual
 * tester flows and prioritize known-important pages.
 */
import type { ADOTestPlan, ADOTestSuite, ADOTestStep, TestCaseImportConfig, TestCaseImportResult } from './types.js';
export declare class TestCaseImporter {
    private http;
    private testPlanHttp;
    private config;
    private apiVersion;
    private warnings;
    constructor(config: TestCaseImportConfig);
    /** Fetch and import test cases from the configured test plan. */
    importTestCases(): Promise<TestCaseImportResult>;
    /** Fetch the test plan metadata. */
    getTestPlan(): Promise<ADOTestPlan>;
    /** List all suites in the test plan. */
    listSuites(): Promise<ADOTestSuite[]>;
    private resolveSuites;
    private fetchTestCasesFromSuites;
    /** Fetch full work item fields in batches of 200 (ADO batch limit). */
    private fetchWorkItemDetails;
    private mapWorkItemFields;
    /**
     * ADO stores test steps as XML:
     * ```xml
     * <steps>
     *   <step id="1" type="ActionStep">
     *     <parameterizedString isformatted="true">Navigate to login page</parameterizedString>
     *     <parameterizedString isformatted="true">Page loads successfully</parameterizedString>
     *   </step>
     * </steps>
     * ```
     * We do a lightweight regex parse — no DOM parser needed for this structure.
     */
    parseStepsXml(xml: string): ADOTestStep[];
    /** Strip HTML tags to plain text */
    private stripHtml;
    private applyFilters;
    private parseTestCase;
    /** Parse a single action text into one or more TestAction objects */
    private parseAction;
    /** Parse an expected result into an a11y behavior hint */
    private parseExpectedBehavior;
    private extractUrls;
    private extractFirstUrl;
    private findSuiteForTestCase;
}
//# sourceMappingURL=test-case-importer.d.ts.map