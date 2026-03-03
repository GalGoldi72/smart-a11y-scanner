/**
 * Test plan parser — reads test plans from YAML/JSON files or inline steps
 * and converts them into ImportedTestScenario[] for the GuidedExplorer.
 *
 * Also parses ADO test management URLs to extract planId/suiteId.
 */

import { readFile } from 'fs/promises';
import yaml from 'yaml';
import type {
  ImportedTestScenario,
  TestAction,
  ADOTestStep,
} from '../ado/types.js';

// ---------------------------------------------------------------------------
// YAML / JSON file format
// ---------------------------------------------------------------------------

interface FileStep {
  action: string;
  expected?: string;
}

interface FileScenario {
  title: string;
  steps: FileStep[];
}

interface TestPlanFile {
  scenarios: FileScenario[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read and parse a YAML or JSON test plan file into ImportedTestScenario[].
 * File extension determines the parser (.yaml/.yml → YAML, .json → JSON).
 */
export async function parseTestPlanFile(
  filePath: string,
): Promise<ImportedTestScenario[]> {
  const content = await readFile(filePath, 'utf-8');
  const ext = filePath.toLowerCase();

  let data: TestPlanFile;
  if (ext.endsWith('.yaml') || ext.endsWith('.yml')) {
    data = yaml.parse(content) as TestPlanFile;
  } else if (ext.endsWith('.json')) {
    data = JSON.parse(content) as TestPlanFile;
  } else {
    // Try YAML first (superset of JSON), fall back to JSON
    try {
      data = yaml.parse(content) as TestPlanFile;
    } catch {
      data = JSON.parse(content) as TestPlanFile;
    }
  }

  if (!data?.scenarios || !Array.isArray(data.scenarios)) {
    throw new Error(
      `Invalid test plan file: expected a "scenarios" array at top level`,
    );
  }

  return data.scenarios.map((scenario, idx) =>
    fileScenarioToImported(scenario, idx),
  );
}

/**
 * Convert inline CLI steps (string[]) into a single ImportedTestScenario.
 */
export function parseInlineSteps(steps: string[]): ImportedTestScenario {
  const actions: TestAction[] = [];
  const rawSteps: ADOTestStep[] = [];
  const urls: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const text = steps[i];
    const parsed = parseAction(text);
    actions.push(...parsed);
    rawSteps.push({
      index: i,
      action: text,
      expectedResult: '',
      actionText: text,
      expectedResultText: '',
    });
    for (const a of parsed) {
      if (a.type === 'navigate') urls.push(a.url);
    }
  }

  return {
    adoTestCaseId: 0,
    adoTestCaseUrl: '',
    title: 'Inline test steps',
    priority: 1,
    tags: [],
    urls: [...new Set(urls)],
    actions,
    expectedBehaviors: [],
    rawSteps,
    suiteId: 0,
    suiteName: '',
  };
}

/**
 * Parse an ADO test management URL to extract org, project, planId, and suiteId.
 *
 * Supports:
 *   https://dev.azure.com/{org}/{project}/_testManagement/runs?planId=123&suiteId=456
 *   https://dev.azure.com/{org}/{project}/_testPlans/execute?planId=123&suiteId=456
 *   https://{org}.visualstudio.com/{project}/_testManagement/runs?planId=123
 */
export function parseTestPlanUrl(
  url: string,
): { orgUrl: string; project: string; planId: number; suiteId?: number } | null {
  try {
    const parsed = new URL(url);
    const planIdStr = parsed.searchParams.get('planId');
    if (!planIdStr) return null;
    const planId = parseInt(planIdStr, 10);
    if (isNaN(planId)) return null;

    const suiteIdStr = parsed.searchParams.get('suiteId');
    const suiteId = suiteIdStr ? parseInt(suiteIdStr, 10) : undefined;

    // New-format: https://dev.azure.com/{org}/{project}/...
    const devAzureMatch = parsed.pathname.match(
      /^\/([^/]+)\/([^/]+)\/_test/i,
    );
    if (devAzureMatch && parsed.hostname === 'dev.azure.com') {
      return {
        orgUrl: `https://dev.azure.com/${devAzureMatch[1]}`,
        project: decodeURIComponent(devAzureMatch[2]),
        planId,
        suiteId: suiteId && !isNaN(suiteId) ? suiteId : undefined,
      };
    }

    // Old-format: https://{org}.visualstudio.com/{project}/...
    const vsMatch = parsed.hostname.match(/^(.+)\.visualstudio\.com$/i);
    if (vsMatch) {
      const projectMatch = parsed.pathname.match(/^\/([^/]+)\/_test/i);
      if (projectMatch) {
        return {
          orgUrl: `https://${vsMatch[1]}.visualstudio.com`,
          project: decodeURIComponent(projectMatch[1]),
          planId,
          suiteId: suiteId && !isNaN(suiteId) ? suiteId : undefined,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Convert a file-format scenario into an ImportedTestScenario */
function fileScenarioToImported(
  scenario: FileScenario,
  index: number,
): ImportedTestScenario {
  const actions: TestAction[] = [];
  const rawSteps: ADOTestStep[] = [];
  const urls: string[] = [];

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    const parsed = parseAction(step.action);
    actions.push(...parsed);
    rawSteps.push({
      index: i,
      action: step.action,
      expectedResult: step.expected ?? '',
      actionText: step.action,
      expectedResultText: step.expected ?? '',
    });
    for (const a of parsed) {
      if (a.type === 'navigate') urls.push(a.url);
    }
  }

  return {
    adoTestCaseId: 0,
    adoTestCaseUrl: '',
    title: scenario.title || `Scenario ${index + 1}`,
    priority: 1,
    tags: [],
    urls: [...new Set(urls)],
    actions,
    expectedBehaviors: [],
    rawSteps,
    suiteId: 0,
    suiteName: '',
  };
}

/**
 * Parse a single action text into TestAction[].
 * Mirrors the regex logic from test-case-importer.ts parseAction().
 */
function parseAction(text: string): TestAction[] {
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
      const url = extractFirstUrl(target) ?? target;
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

/** Extract the first URL from text */
function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"')\]]+/i);
  return match ? match[0] : null;
}
