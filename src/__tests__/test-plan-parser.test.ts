/**
 * Unit tests for test-plan-parser.ts
 *
 * Covers: parseTestPlanUrl(), parseInlineSteps(), parseTestPlanFile()
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseTestPlanUrl,
  parseInlineSteps,
  parseTestPlanFile,
} from '../scanner/test-plan-parser.js';

// ---------------------------------------------------------------------------
// parseTestPlanUrl
// ---------------------------------------------------------------------------

describe('parseTestPlanUrl', () => {
  it('parses a valid ADO URL with planId and suiteId', () => {
    const result = parseTestPlanUrl(
      'https://dev.azure.com/contoso/MyProject/_testManagement/runs?planId=123&suiteId=456',
    );
    expect(result).toEqual({
      orgUrl: 'https://dev.azure.com/contoso',
      project: 'MyProject',
      planId: 123,
      suiteId: 456,
    });
  });

  it('parses a valid ADO URL with only planId (no suiteId)', () => {
    const result = parseTestPlanUrl(
      'https://dev.azure.com/contoso/MyProject/_testPlans/execute?planId=99',
    );
    expect(result).toEqual({
      orgUrl: 'https://dev.azure.com/contoso',
      project: 'MyProject',
      planId: 99,
      suiteId: undefined,
    });
  });

  it('returns null for a non-ADO URL', () => {
    expect(parseTestPlanUrl('https://github.com/org/repo')).toBeNull();
  });

  it('returns null for a URL with no planId param', () => {
    expect(
      parseTestPlanUrl('https://dev.azure.com/contoso/MyProject/_testManagement/runs'),
    ).toBeNull();
  });

  it('returns null for completely invalid input', () => {
    expect(parseTestPlanUrl('not a url at all')).toBeNull();
  });

  it('parses old-format visualstudio.com URLs', () => {
    const result = parseTestPlanUrl(
      'https://contoso.visualstudio.com/MyProject/_testManagement/runs?planId=42&suiteId=7',
    );
    expect(result).toEqual({
      orgUrl: 'https://contoso.visualstudio.com',
      project: 'MyProject',
      planId: 42,
      suiteId: 7,
    });
  });

  it('handles URL-encoded project names', () => {
    const result = parseTestPlanUrl(
      'https://dev.azure.com/contoso/My%20Project/_testManagement/runs?planId=10',
    );
    expect(result).not.toBeNull();
    expect(result!.project).toBe('My Project');
  });
});

// ---------------------------------------------------------------------------
// parseInlineSteps
// ---------------------------------------------------------------------------

describe('parseInlineSteps', () => {
  it('parses simple click steps', () => {
    const result = parseInlineSteps(['click the Login button', 'click Submit']);
    expect(result.title).toBe('Inline test steps');
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toEqual({ type: 'click', target: 'Login button' });
    expect(result.actions[1]).toEqual({ type: 'click', target: 'Submit' });
  });

  it('parses navigate steps and extracts URLs', () => {
    const result = parseInlineSteps([
      'navigate to https://example.com/login',
      'go to https://example.com/dashboard',
    ]);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toEqual({ type: 'navigate', url: 'https://example.com/login' });
    expect(result.actions[1]).toEqual({ type: 'navigate', url: 'https://example.com/dashboard' });
    expect(result.urls).toContain('https://example.com/login');
    expect(result.urls).toContain('https://example.com/dashboard');
  });

  it('handles mixed action types', () => {
    const result = parseInlineSteps([
      'navigate to https://example.com',
      'click the Login button',
      'type "admin" into username',
      'verify the dashboard is visible',
      'wait for page to load',
    ]);
    expect(result.actions).toHaveLength(5);
    expect(result.actions[0].type).toBe('navigate');
    expect(result.actions[1].type).toBe('click');
    expect(result.actions[2].type).toBe('type');
    expect(result.actions[3].type).toBe('verify');
    expect(result.actions[4].type).toBe('wait');
  });

  it('returns a valid scenario for an empty steps array', () => {
    const result = parseInlineSteps([]);
    expect(result.actions).toHaveLength(0);
    expect(result.rawSteps).toHaveLength(0);
    expect(result.urls).toHaveLength(0);
    expect(result.title).toBe('Inline test steps');
  });

  it('populates rawSteps with correct indices', () => {
    const result = parseInlineSteps(['click OK', 'click Cancel']);
    expect(result.rawSteps).toHaveLength(2);
    expect(result.rawSteps[0].index).toBe(0);
    expect(result.rawSteps[1].index).toBe(1);
    expect(result.rawSteps[0].actionText).toBe('click OK');
  });

  it('de-duplicates URLs', () => {
    const result = parseInlineSteps([
      'navigate to https://example.com',
      'navigate to https://example.com',
    ]);
    expect(result.urls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// parseTestPlanFile
// ---------------------------------------------------------------------------

describe('parseTestPlanFile', () => {
  const testDir = join(tmpdir(), `a11y-parser-test-${Date.now()}`);

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('parses a valid YAML file with multiple scenarios', async () => {
    const yamlContent = `
scenarios:
  - title: Login flow
    steps:
      - action: navigate to https://example.com/login
      - action: click the Sign In button
        expected: Login form appears
  - title: Dashboard check
    steps:
      - action: navigate to https://example.com/dashboard
      - action: verify the main heading is visible
`;
    const filePath = join(testDir, 'plan.yaml');
    await writeFile(filePath, yamlContent, 'utf-8');

    const scenarios = await parseTestPlanFile(filePath);
    expect(scenarios).toHaveLength(2);
    expect(scenarios[0].title).toBe('Login flow');
    expect(scenarios[0].actions).toHaveLength(2);
    expect(scenarios[0].actions[0].type).toBe('navigate');
    expect(scenarios[0].actions[1].type).toBe('click');
    expect(scenarios[1].title).toBe('Dashboard check');
    expect(scenarios[1].actions).toHaveLength(2);
  });

  it('parses a valid JSON file', async () => {
    const jsonContent = JSON.stringify({
      scenarios: [
        {
          title: 'Simple test',
          steps: [
            { action: 'navigate to https://example.com' },
            { action: 'click Submit' },
          ],
        },
      ],
    });
    const filePath = join(testDir, 'plan.json');
    await writeFile(filePath, jsonContent, 'utf-8');

    const scenarios = await parseTestPlanFile(filePath);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].title).toBe('Simple test');
    expect(scenarios[0].actions[0].type).toBe('navigate');
  });

  it('throws on file not found', async () => {
    await expect(
      parseTestPlanFile(join(testDir, 'does-not-exist.yaml')),
    ).rejects.toThrow();
  });

  it('throws on invalid YAML content (no scenarios key)', async () => {
    const filePath = join(testDir, 'bad.yaml');
    await writeFile(filePath, 'steps:\n  - action: click OK\n', 'utf-8');
    await expect(parseTestPlanFile(filePath)).rejects.toThrow(/scenarios/i);
  });

  it('parses .yml extension as YAML', async () => {
    const yamlContent = `
scenarios:
  - title: YML test
    steps:
      - action: click OK
`;
    const filePath = join(testDir, 'plan.yml');
    await writeFile(filePath, yamlContent, 'utf-8');

    const scenarios = await parseTestPlanFile(filePath);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].title).toBe('YML test');
  });

  it('extracts URLs from file scenarios', async () => {
    const yamlContent = `
scenarios:
  - title: Nav test
    steps:
      - action: navigate to https://example.com/page1
      - action: navigate to https://example.com/page2
`;
    const filePath = join(testDir, 'nav.yaml');
    await writeFile(filePath, yamlContent, 'utf-8');

    const scenarios = await parseTestPlanFile(filePath);
    expect(scenarios[0].urls).toContain('https://example.com/page1');
    expect(scenarios[0].urls).toContain('https://example.com/page2');
  });
});
