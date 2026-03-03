/**
 * Azure DevOps client — creates bug work items from scan findings.
 *
 * Uses the ADO REST API (v7.0) with PAT authentication.
 * Maps accessibility findings to work item fields with repro steps,
 * severity, and optional screenshot attachments.
 */

import axios, { AxiosInstance } from 'axios';
import { AdoConfig, Finding, PageResult, ScanResult } from '../scanner/types.js';
import { Severity } from '../rules/types.js';

// ── Interfaces consumed by bug-creator.ts ────────────────────────────

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

// ── Severity mapping ─────────────────────────────────────────────────

const SEVERITY_MAP: Record<Severity, string> = {
  critical: '1 - Critical',
  serious: '2 - High',
  moderate: '3 - Medium',
  minor: '4 - Low',
};

/** Result of filing a single bug (used by engine-level batch filing) */
export interface FiledBug {
  id: number;
  url: string;
  title: string;
  findingRuleId: string;
  pageUrl: string;
}

// ── ADO Client ───────────────────────────────────────────────────────

export class AdoClient implements IADOClient {
  private http: AxiosInstance;
  private config: AdoConfig;

  constructor(config: AdoConfig) {
    this.config = config;

    const token = Buffer.from(`:${config.pat}`).toString('base64');

    this.http = axios.create({
      baseURL: `${config.orgUrl}/${encodeURIComponent(config.project)}/_apis`,
      headers: {
        'Content-Type': 'application/json-patch+json',
        Authorization: `Basic ${token}`,
      },
      params: {
        'api-version': '7.0',
      },
    });
  }

  // ── IADOClient interface ─────────────────────────────────────────

  async createBug(workItem: ADOWorkItem): Promise<ADOCreateResult> {
    const patchDocument: Array<{ op: string; path: string; value: unknown }> = [
      { op: 'add', path: '/fields/System.Title', value: workItem.title.substring(0, 255) },
      { op: 'add', path: '/fields/System.Description', value: workItem.description },
      { op: 'add', path: '/fields/Microsoft.VSTS.TCM.ReproSteps', value: workItem.reproSteps },
      { op: 'add', path: '/fields/Microsoft.VSTS.Common.Severity', value: workItem.severity },
      { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: workItem.priority },
    ];

    if (workItem.tags.length > 0) {
      patchDocument.push({ op: 'add', path: '/fields/System.Tags', value: workItem.tags.join('; ') });
    }

    if (this.config.areaPath) {
      patchDocument.push({ op: 'add', path: '/fields/System.AreaPath', value: this.config.areaPath });
    }
    if (this.config.iterationPath) {
      patchDocument.push({ op: 'add', path: '/fields/System.IterationPath', value: this.config.iterationPath });
    }

    const response = await this.http.post('/wit/workitems/$Bug', patchDocument);

    return {
      id: response.data.id,
      url: response.data._links?.html?.href
        || `${this.config.orgUrl}/${this.config.project}/_workitems/edit/${response.data.id}`,
      title: workItem.title.substring(0, 255),
    };
  }

  async findDuplicate(title: string, tags: string[]): Promise<ADOCreateResult | null> {
    try {
      const tagFilter = tags.length > 0
        ? `AND [System.Tags] CONTAINS '${tags[0]}'`
        : '';
      const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Bug' AND [System.Title] CONTAINS '${title.substring(0, 100)}' ${tagFilter} AND [System.State] <> 'Closed'`;

      const response = await this.http.post('/wit/wiql', { query: wiql }, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.data.workItems?.length > 0) {
        const wi = response.data.workItems[0];
        return {
          id: wi.id,
          url: wi.url || `${this.config.orgUrl}/${this.config.project}/_workitems/edit/${wi.id}`,
          title,
        };
      }
    } catch {
      // WIQL query failed — treat as no duplicate
    }

    return null;
  }

  // ── Engine-level batch filing ────────────────────────────────────

  /** File bugs for all findings in a scan result */
  async fileBugsForScan(result: ScanResult): Promise<FiledBug[]> {
    const filed: FiledBug[] = [];

    for (const page of result.pages) {
      const groupedFindings = this.groupFindingsByRule(page);

      for (const [ruleId, findings] of Object.entries(groupedFindings)) {
        try {
          const primary = findings[0];
          const pageUrl = page.url;
          const title = `[A11y] ${primary.message} — ${new URL(pageUrl).pathname}`;

          const adoResult = await this.createBug({
            title,
            description: this.buildDescription(findings),
            reproSteps: this.buildReproSteps(pageUrl, findings),
            priority: primary.severity === 'critical' ? 1 : primary.severity === 'serious' ? 2 : 3,
            severity: SEVERITY_MAP[primary.severity],
            tags: this.config.tags || ['Accessibility'],
          });

          filed.push({ ...adoResult, findingRuleId: ruleId, pageUrl });

          // Attach screenshot if available
          const screenshotFinding = findings.find(f => f.screenshot);
          if (screenshotFinding?.screenshot) {
            await this.attachScreenshot(adoResult.id, screenshotFinding.screenshot, pageUrl);
          }
        } catch (err) {
          console.error(`Failed to file bug for ${ruleId} on ${page.url}:`, err);
        }
      }
    }

    return filed;
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async attachScreenshot(workItemId: number, base64Png: string, pageUrl: string): Promise<void> {
    const buffer = Buffer.from(base64Png, 'base64');
    const hostname = new URL(pageUrl).hostname;
    const fileName = `a11y-violation-${hostname}-${Date.now()}.png`;

    const uploadResponse = await this.http.post(
      '/wit/attachments',
      buffer,
      {
        headers: { 'Content-Type': 'application/octet-stream' },
        params: { 'api-version': '7.0', fileName },
      },
    );

    const attachmentUrl = uploadResponse.data.url;

    await this.http.patch(`/wit/workitems/${workItemId}`, [
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'AttachedFile',
          url: attachmentUrl,
          attributes: { comment: `Accessibility violation screenshot — ${pageUrl}` },
        },
      },
    ]);
  }

  private groupFindingsByRule(page: PageResult): Record<string, Finding[]> {
    const groups: Record<string, Finding[]> = {};
    for (const finding of page.findings) {
      if (!groups[finding.ruleId]) {
        groups[finding.ruleId] = [];
      }
      groups[finding.ruleId].push(finding);
    }
    return groups;
  }

  private buildReproSteps(pageUrl: string, findings: Finding[]): string {
    const steps = findings.map((f) => `
      <li>
        Navigate to <a href="${this.escapeHtml(pageUrl)}">${this.escapeHtml(pageUrl)}</a><br>
        Locate element: <code>${this.escapeHtml(f.selector)}</code><br>
        Issue: ${this.escapeHtml(f.message)}<br>
        HTML: <pre>${this.escapeHtml(f.htmlSnippet)}</pre>
      </li>
    `).join('\n');

    return `
      <h3>Accessibility Violation — ${this.escapeHtml(findings[0].ruleId)}</h3>
      <p><strong>WCAG ${findings[0].wcagCriterion} (Level ${findings[0].wcagLevel})</strong></p>
      <p><strong>Page:</strong> <a href="${this.escapeHtml(pageUrl)}">${this.escapeHtml(pageUrl)}</a></p>
      <h4>Steps to Reproduce</h4>
      <ol>${steps}</ol>
      <h4>Remediation</h4>
      <p>${this.escapeHtml(findings[0].remediation)}</p>
    `;
  }

  private buildDescription(findings: Finding[]): string {
    const f = findings[0];
    return `Automated accessibility scan found ${findings.length} instance(s) of "${f.ruleId}" violation. WCAG ${f.wcagCriterion} (Level ${f.wcagLevel}), Severity: ${f.severity}.`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
