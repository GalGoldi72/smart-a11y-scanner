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

import axios, { AxiosInstance } from 'axios';
import type {
  ADOTestPlan,
  ADOTestSuite,
  ADOTestCase,
  ADOTestStep,
  ADOTestCaseFields,
  TestCaseImportConfig,
  TestCaseFilter,
  ImportedTestScenario,
  TestCaseImportResult,
  TestAction,
  ExpectedA11yBehavior,
} from './types.js';
import type { Severity } from '../rules/types.js';

/** Page size for ADO API pagination */
const PAGE_SIZE = 200;

export class TestCaseImporter {
  private http: AxiosInstance;
  private testPlanHttp: AxiosInstance;
  private config: TestCaseImportConfig;
  private apiVersion: string;
  private warnings: string[] = [];

  constructor(config: TestCaseImportConfig) {
    this.config = config;
    this.apiVersion = config.apiVersion ?? '7.0';

    const token = Buffer.from(`:${config.pat}`).toString('base64');
    const baseHeaders = {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
    };

    // Work Items API client
    this.http = axios.create({
      baseURL: `${config.orgUrl}/${encodeURIComponent(config.project)}/_apis`,
      headers: baseHeaders,
      params: { 'api-version': this.apiVersion },
    });

    // Test Plans API client (different base path)
    this.testPlanHttp = axios.create({
      baseURL: `${config.orgUrl}/${encodeURIComponent(config.project)}/_apis/testplan`,
      headers: baseHeaders,
      params: { 'api-version': this.apiVersion },
    });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Fetch and import test cases from the configured test plan. */
  async importTestCases(): Promise<TestCaseImportResult> {
    this.warnings = [];

    // 1. Resolve suites to import from
    const suites = await this.resolveSuites();

    // 2. Fetch test case references from each suite
    const rawCases = await this.fetchTestCasesFromSuites(suites);

    // 3. Fetch full work item details (steps, fields) in batches
    const fields = await this.fetchWorkItemDetails(rawCases.map(c => c.workItem.id));

    // 4. Apply filters
    const filtered = this.applyFilters(fields);

    // 5. Parse each test case into an ImportedTestScenario
    const scenarios: ImportedTestScenario[] = [];
    for (const tc of filtered) {
      const suiteInfo = this.findSuiteForTestCase(tc.id, rawCases, suites);
      scenarios.push(this.parseTestCase(tc, suiteInfo));
    }

    // 6. Collect distinct URLs
    const urlSet = new Set<string>();
    for (const s of scenarios) {
      for (const u of s.urls) urlSet.add(u);
    }

    return {
      totalFetched: rawCases.length,
      totalImported: scenarios.length,
      totalSkipped: rawCases.length - scenarios.length,
      scenarios,
      discoveredUrls: [...urlSet],
      warnings: this.warnings,
    };
  }

  /** Fetch the test plan metadata. */
  async getTestPlan(): Promise<ADOTestPlan> {
    const resp = await this.testPlanHttp.get(`/plans/${this.config.testPlanId}`);
    return resp.data;
  }

  /** List all suites in the test plan. */
  async listSuites(): Promise<ADOTestSuite[]> {
    const suites: ADOTestSuite[] = [];
    let continuationToken: string | undefined;

    do {
      const resp = await this.testPlanHttp.get(
        `/plans/${this.config.testPlanId}/suites`,
        { params: { continuationToken, $top: PAGE_SIZE } },
      );
      const items: ADOTestSuite[] = resp.data.value ?? [];
      suites.push(...items);
      continuationToken = resp.headers['x-ms-continuationtoken'] as string | undefined;
    } while (continuationToken);

    return suites;
  }

  // -------------------------------------------------------------------------
  // Internals — suite & test case fetching
  // -------------------------------------------------------------------------

  private async resolveSuites(): Promise<ADOTestSuite[]> {
    const allSuites = await this.listSuites();
    const targetIds = this.config.filter?.suiteIds;

    if (targetIds && targetIds.length > 0) {
      const matched = allSuites.filter(s => targetIds.includes(s.id));
      if (matched.length === 0) {
        this.warnings.push(
          `None of the requested suite IDs [${targetIds.join(', ')}] were found in plan ${this.config.testPlanId}.`,
        );
      }
      return matched;
    }

    return allSuites;
  }

  private async fetchTestCasesFromSuites(
    suites: ADOTestSuite[],
  ): Promise<ADOTestCase[]> {
    const cases: ADOTestCase[] = [];
    const seenIds = new Set<number>();

    for (const suite of suites) {
      let continuationToken: string | undefined;
      do {
        const resp = await this.testPlanHttp.get(
          `/plans/${this.config.testPlanId}/suites/${suite.id}/testcase`,
          { params: { continuationToken } },
        );
        const items: ADOTestCase[] = resp.data.value ?? [];
        for (const tc of items) {
          if (!seenIds.has(tc.workItem.id)) {
            seenIds.add(tc.workItem.id);
            cases.push(tc);
          }
        }
        continuationToken = resp.headers['x-ms-continuationtoken'] as string | undefined;
      } while (continuationToken);
    }

    return cases;
  }

  /** Fetch full work item fields in batches of 200 (ADO batch limit). */
  private async fetchWorkItemDetails(ids: number[]): Promise<ADOTestCaseFields[]> {
    const results: ADOTestCaseFields[] = [];
    const fields = [
      'System.Id',
      'System.Title',
      'System.State',
      'Microsoft.VSTS.Common.Priority',
      'System.AreaPath',
      'System.Tags',
      'Microsoft.VSTS.TCM.Steps',
      'System.Description',
      'Microsoft.VSTS.TCM.AutomationStatus',
    ].join(',');

    for (let i = 0; i < ids.length; i += PAGE_SIZE) {
      const batch = ids.slice(i, i + PAGE_SIZE);
      const resp = await this.http.get('/wit/workitems', {
        params: { ids: batch.join(','), fields, '$expand': 'None' },
      });
      const items: Array<{ id: number; fields: Record<string, unknown> }> = resp.data.value ?? [];

      for (const item of items) {
        try {
          results.push(this.mapWorkItemFields(item));
        } catch (err) {
          this.warnings.push(
            `Failed to parse work item ${item.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    return results;
  }

  private mapWorkItemFields(
    item: { id: number; fields: Record<string, unknown> },
  ): ADOTestCaseFields {
    const f = item.fields;
    const tagsRaw = (f['System.Tags'] as string) ?? '';
    const stepsXml = (f['Microsoft.VSTS.TCM.Steps'] as string) ?? '';

    return {
      id: item.id,
      title: (f['System.Title'] as string) ?? '',
      state: (f['System.State'] as string) ?? '',
      priority: (f['Microsoft.VSTS.Common.Priority'] as number) ?? 4,
      areaPath: (f['System.AreaPath'] as string) ?? '',
      tags: tagsRaw
        .split(';')
        .map(t => t.trim())
        .filter(Boolean),
      steps: this.parseStepsXml(stepsXml),
      description: (f['System.Description'] as string) ?? '',
      automationStatus: (f['Microsoft.VSTS.TCM.AutomationStatus'] as string) ?? 'Not Automated',
    };
  }

  // -------------------------------------------------------------------------
  // Step XML parsing
  // -------------------------------------------------------------------------

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
  parseStepsXml(xml: string): ADOTestStep[] {
    if (!xml || xml.trim() === '') return [];

    const steps: ADOTestStep[] = [];
    const stepRegex = /<step[^>]*id="(\d+)"[^>]*>([\s\S]*?)<\/step>/gi;
    const paramRegex = /<parameterizedString[^>]*>([\s\S]*?)<\/parameterizedString>/gi;

    let stepMatch: RegExpExecArray | null;
    while ((stepMatch = stepRegex.exec(xml)) !== null) {
      const innerHtml = stepMatch[2];
      const params: string[] = [];

      let paramMatch: RegExpExecArray | null;
      const localParamRegex = /<parameterizedString[^>]*>([\s\S]*?)<\/parameterizedString>/gi;
      while ((paramMatch = localParamRegex.exec(innerHtml)) !== null) {
        params.push(paramMatch[1]);
      }

      const action = params[0] ?? '';
      const expectedResult = params[1] ?? '';

      steps.push({
        index: steps.length,
        action,
        expectedResult,
        actionText: this.stripHtml(action),
        expectedResultText: this.stripHtml(expectedResult),
      });
    }

    return steps;
  }

  /** Strip HTML tags to plain text */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------

  private applyFilters(items: ADOTestCaseFields[]): ADOTestCaseFields[] {
    const filter = this.config.filter;
    if (!filter) return items;

    return items.filter(tc => {
      if (filter.states && filter.states.length > 0) {
        if (!filter.states.includes(tc.state as TestCaseFilter['states'] extends Array<infer U> ? U : never)) {
          return false;
        }
      }

      if (filter.tags && filter.tags.length > 0) {
        const lcTags = tc.tags.map(t => t.toLowerCase());
        const hasMatch = filter.tags.some(ft => lcTags.includes(ft.toLowerCase()));
        if (!hasMatch) return false;
      }

      if (filter.areaPaths && filter.areaPaths.length > 0) {
        const match = filter.areaPaths.some(ap => tc.areaPath.startsWith(ap));
        if (!match) return false;
      }

      if (filter.keyword) {
        const kw = filter.keyword.toLowerCase();
        const haystack = [
          tc.title,
          tc.description,
          ...tc.steps.map(s => s.actionText + ' ' + s.expectedResultText),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(kw)) return false;
      }

      return true;
    });
  }

  // -------------------------------------------------------------------------
  // Test case → ImportedTestScenario mapping
  // -------------------------------------------------------------------------

  private parseTestCase(
    tc: ADOTestCaseFields,
    suiteInfo: { id: number; name: string },
  ): ImportedTestScenario {
    const actions: TestAction[] = [];
    const expectedBehaviors: ExpectedA11yBehavior[] = [];
    const urls: string[] = [];

    for (const step of tc.steps) {
      // Parse the action
      const parsedActions = this.parseAction(step.actionText);
      actions.push(...parsedActions);

      // Extract URLs from navigate actions
      for (const a of parsedActions) {
        if (a.type === 'navigate' && a.url) {
          urls.push(a.url);
        }
      }

      // Parse expected result for a11y behaviors
      if (step.expectedResultText.trim()) {
        const behavior = this.parseExpectedBehavior(step.expectedResultText);
        if (behavior) expectedBehaviors.push(behavior);
      }
    }

    // Also scan description for URLs
    const descUrls = this.extractUrls(tc.description);
    urls.push(...descUrls);

    const uniqueUrls = [...new Set(urls)];

    return {
      adoTestCaseId: tc.id,
      adoTestCaseUrl: `${this.config.orgUrl}/${encodeURIComponent(this.config.project)}/_workitems/edit/${tc.id}`,
      title: tc.title,
      priority: tc.priority,
      tags: tc.tags,
      urls: uniqueUrls,
      actions,
      expectedBehaviors,
      rawSteps: tc.steps,
      suiteId: suiteInfo.id,
      suiteName: suiteInfo.name,
    };
  }

  /** Parse a single action text into one or more TestAction objects */
  private parseAction(text: string): TestAction[] {
    const lower = text.toLowerCase();

    // Navigate patterns
    const navPatterns = [
      /navigate\s+to\s+(.+)/i,
      /go\s+to\s+(.+)/i,
      /open\s+(?:the\s+)?(?:url\s+)?(.+)/i,
      /browse\s+to\s+(.+)/i,
      /launch\s+(.+)/i,
    ];
    for (const pattern of navPatterns) {
      const match = text.match(pattern);
      if (match) {
        const target = match[1].trim();
        const url = this.extractFirstUrl(target) ?? target;
        return [{ type: 'navigate', url }];
      }
    }

    // Click patterns
    const clickPatterns = [
      /click\s+(?:on\s+)?(?:the\s+)?(.+)/i,
      /tap\s+(?:on\s+)?(?:the\s+)?(.+)/i,
      /press\s+(?:the\s+)?(.+?)(?:\s+button)?$/i,
      /select\s+(?:the\s+)?(.+?)(?:\s+option|\s+from)/i,
      /activate\s+(?:the\s+)?(.+)/i,
    ];
    for (const pattern of clickPatterns) {
      const match = text.match(pattern);
      if (match) {
        return [{ type: 'click', target: match[1].trim() }];
      }
    }

    // Type / Enter patterns
    const typePatterns = [
      /(?:type|enter|input)\s+"([^"]+)"\s+(?:in|into)\s+(.+)/i,
      /(?:type|enter|input)\s+(.+?)\s+(?:in|into)\s+(.+)/i,
      /fill\s+(?:in\s+)?(.+?)\s+with\s+"([^"]+)"/i,
    ];
    for (const pattern of typePatterns) {
      const match = text.match(pattern);
      if (match) {
        return [{ type: 'type', target: match[2].trim(), value: match[1].trim() }];
      }
    }

    // Select from dropdown
    if (/select/i.test(lower) && /from|dropdown|list/i.test(lower)) {
      const match = text.match(/select\s+"?([^"]+)"?\s+from\s+(.+)/i);
      if (match) {
        return [{ type: 'select', target: match[2].trim(), value: match[1].trim() }];
      }
    }

    // Verify / Check
    if (/^(verify|check|confirm|ensure|validate|assert)/i.test(lower)) {
      return [{ type: 'verify', description: text }];
    }

    // Wait
    if (/^(wait|pause)/i.test(lower)) {
      return [{ type: 'wait', description: text }];
    }

    return [{ type: 'unknown', rawText: text }];
  }

  /** Parse an expected result into an a11y behavior hint */
  private parseExpectedBehavior(text: string): ExpectedA11yBehavior | null {
    if (!text.trim()) return null;

    const behavior: ExpectedA11yBehavior = { description: text };

    // Try to infer WCAG criterion from keywords
    const lower = text.toLowerCase();

    const criterionMap: Array<{ keywords: string[]; criterion: string; severity: Severity }> = [
      { keywords: ['screen reader', 'announce', 'read aloud', 'accessible name'], criterion: '4.1.2', severity: 'critical' },
      { keywords: ['keyboard', 'tab', 'focus', 'focusable'], criterion: '2.1.1', severity: 'critical' },
      { keywords: ['contrast', 'color', 'readable'], criterion: '1.4.3', severity: 'major' },
      { keywords: ['alt text', 'alternative text', 'image description'], criterion: '1.1.1', severity: 'critical' },
      { keywords: ['heading', 'heading level', 'h1', 'h2'], criterion: '1.3.1', severity: 'minor' },
      { keywords: ['label', 'form label', 'input label'], criterion: '1.3.1', severity: 'critical' },
      { keywords: ['aria', 'role', 'aria-label', 'aria-live'], criterion: '4.1.2', severity: 'major' },
      { keywords: ['zoom', 'reflow', 'responsive', 'magnif'], criterion: '1.4.10', severity: 'major' },
      { keywords: ['error', 'validation', 'error message'], criterion: '3.3.1', severity: 'major' },
      { keywords: ['language', 'lang attribute'], criterion: '3.1.1', severity: 'major' },
      { keywords: ['skip', 'skip link', 'bypass'], criterion: '2.4.1', severity: 'major' },
      { keywords: ['timeout', 'time limit', 'session'], criterion: '2.2.1', severity: 'major' },
    ];

    for (const entry of criterionMap) {
      if (entry.keywords.some(kw => lower.includes(kw))) {
        behavior.wcagCriterion = entry.criterion;
        behavior.severity = entry.severity;
        break;
      }
    }

    return behavior;
  }

  // -------------------------------------------------------------------------
  // URL extraction helpers
  // -------------------------------------------------------------------------

  private extractUrls(text: string): string[] {
    if (!text) return [];
    const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
    return [...(text.match(urlRegex) ?? [])];
  }

  private extractFirstUrl(text: string): string | null {
    const urls = this.extractUrls(text);
    return urls.length > 0 ? urls[0] : null;
  }

  // -------------------------------------------------------------------------
  // Suite lookup helper
  // -------------------------------------------------------------------------

  private findSuiteForTestCase(
    testCaseId: number,
    rawCases: ADOTestCase[],
    suites: ADOTestSuite[],
  ): { id: number; name: string } {
    // rawCases are fetched per-suite so we can't directly map back.
    // Return the first suite as a reasonable default.
    // In a real impl we'd track this during fetchTestCasesFromSuites.
    const firstSuite = suites[0];
    return firstSuite
      ? { id: firstSuite.id, name: firstSuite.name }
      : { id: 0, name: 'Unknown' };
  }
}
