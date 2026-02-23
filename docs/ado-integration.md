# Azure DevOps Integration — Hybrid Scanning

The smart-a11y-scanner can import your **existing manual accessibility test cases** from Azure DevOps (ADO) Test Plans and combine them with automated crawling for deeper, smarter scans.

## Prerequisites

### PAT Permissions

Create a Personal Access Token (PAT) in ADO with these scopes:

| Scope | Access | Why |
|-------|--------|-----|
| **Test Management** | Read | Fetch test plans, suites, and test cases |
| **Work Items** | Read & Write | Read test case steps; file bugs and link them back |

Generate your PAT at: `https://dev.azure.com/{your-org}/_usersSettings/tokens`

### Environment Variable

```bash
export ADO_PAT="your-personal-access-token"
```

On Windows:

```powershell
$env:ADO_PAT = "your-personal-access-token"
```

## Configuration

Add the ADO section to your scanner YAML config file:

```yaml
# a11y-scan.yaml
url: "https://your-app.example.com"
depth: 2
maxPages: 100

ado:
  orgUrl: "https://dev.azure.com/my-org"
  project: "my-project"
  pat: "${ADO_PAT}"       # resolved from environment variable

  # Test Plan import settings
  testPlan:
    id: 12345              # required — your ADO Test Plan ID
    suiteIds: [100, 101]   # optional — specific suites (default: all)
    tags: ["accessibility"] # optional — filter by test case tags
    states: ["Ready"]      # optional — filter by state (Design / Ready / Closed)

  # Bug filing settings
  areaPath: "MyProject\\Accessibility"
  iterationPath: "MyProject\\Sprint 1"
  tags: ["a11y", "automated"]
  linkTestCases: true      # link bugs back to related manual test cases

# Hybrid scanning mode
hybridScan:
  enabled: true
  prioritizeTestCaseUrls: true   # scan manual test URLs first
  replayTestFlows: true          # replay test case navigation steps
  additionalCrawlPages: 50       # automated discovery budget
  generateGapAnalysis: true      # manual vs automated coverage report
```

## How Hybrid Scanning Works

### Phase 1 — Priority Scan

The scanner reads your ADO test cases and extracts URLs from test steps (e.g., "Navigate to https://app.example.com/login"). These pages are scanned **first** because your testers already identified them as important.

### Phase 2 — Guided Navigation

Test case steps like "Click the Submit button" and "Type admin into the Username field" are replayed in the browser using Playwright. The scanner runs accessibility checks after each navigation action, catching issues in interactive flows that a simple crawl would miss.

### Phase 3 — Automated Crawl

After covering the manual test paths, the scanner crawls additional pages your test cases don't cover. This finds new content, recently added pages, or flows your testers haven't written cases for yet.

### Phase 4 — Gap Analysis

The scanner compares what your manual test cases cover vs. what automated scanning discovered:

- **Manual Only** — URLs that only exist in your test cases (not found by the crawler). These pages may be behind authentication or deep navigation flows.
- **Automated Only** — URLs the crawler found that have no manual test cases. These are your coverage gaps.
- **Both Covered** — URLs tested by both methods. The scanner shows how many automated findings exist on these pages.
- **Coverage Score** — A 0–1 metric showing the overlap between manual and automated coverage.

### Phase 5 — Enriched Bug Filing

When the scanner files ADO bugs, it links them to the related manual test case using ADO's "Tested By" relation:

> _"This automated finding relates to Test Case #12345"_

This gives your QA team direct traceability from automated bugs back to their manual test plans.

## What Gets Extracted from Test Cases

The importer parses test case step actions and expected results:

| Test Case Step | Extracted As |
|---------------|-------------|
| "Navigate to https://app.com/login" | `navigate` action → URL added to priority scan |
| "Click the Submit button" | `click` action → replayed in browser |
| "Type 'admin' into the Username field" | `type` action → form interaction |
| "Verify screen reader announces the dialog" | Expected a11y behavior → WCAG 4.1.2 hint |
| "Check that focus moves to the error message" | Expected a11y behavior → WCAG 2.1.1 hint |

## Programmatic Usage

```typescript
import { HybridScanner, TestCaseImporter } from 'smart-a11y-scanner';

// Import test cases first (optional — to inspect before scanning)
const importer = new TestCaseImporter({
  orgUrl: 'https://dev.azure.com/my-org',
  project: 'my-project',
  pat: process.env.ADO_PAT!,
  testPlanId: 12345,
  filter: {
    tags: ['accessibility'],
    states: ['Ready'],
  },
});

const importResult = await importer.importTestCases();
console.log(`Imported ${importResult.totalImported} test cases`);
console.log(`Discovered ${importResult.discoveredUrls.length} URLs`);

// Run hybrid scan
const scanner = new HybridScanner({
  scanUrl: 'https://your-app.example.com',
  testCaseImport: {
    orgUrl: 'https://dev.azure.com/my-org',
    project: 'my-project',
    pat: process.env.ADO_PAT!,
    testPlanId: 12345,
    filter: { tags: ['accessibility'] },
  },
  prioritizeTestCaseUrls: true,
  replayTestFlows: true,
  additionalCrawlPages: 50,
  linkBugsToTestCases: true,
  generateGapAnalysis: true,
});

const result = await scanner.run();

// Inspect gap analysis
if (result.gapAnalysis) {
  const gap = result.gapAnalysis.summary;
  console.log(`Manual test URLs: ${gap.totalManualUrls}`);
  console.log(`Automated URLs: ${gap.totalAutomatedUrls}`);
  console.log(`Overlap: ${gap.overlapCount}`);
  console.log(`Coverage score: ${(gap.coverageScore * 100).toFixed(0)}%`);
  console.log(`Untested by automation: ${gap.manualOnlyCount} URLs`);
  console.log(`Not in manual tests: ${gap.automatedOnlyCount} URLs`);
}
```

## Reading the Gap Analysis Report

| Metric | What It Means |
|--------|-------------|
| **Coverage Score** | `overlap / (manual + automated unique URLs)`. Higher = better alignment between manual and automated testing. |
| **Manual Only** | Pages your testers know about but the crawler can't reach. Often behind auth, deep flows, or single-page app routes. Consider adding these to the crawler's seed URLs. |
| **Automated Only** | Pages the crawler found that have no manual tests. These are your coverage gaps — consider writing test cases for the important ones. |
| **Both Covered** | The sweet spot. Review the automated finding counts to see if the manual tests are catching the same issues. |

## Troubleshooting

### "None of the requested suite IDs were found"

Check that the suite IDs in your config match suites inside the specified test plan. Suite IDs are plan-specific — a suite from plan 100 won't appear in plan 200.

### Test case steps not being parsed

The importer recognizes common patterns:
- ✅ "Navigate to https://..."
- ✅ "Click the Submit button"
- ✅ "Type 'admin' into the Username field"
- ❌ "Do the login thing" (too vague — parsed as `unknown` action)

Write test steps using clear action verbs (navigate, click, type, select, verify) for best results.

### PAT authentication errors

Ensure your PAT hasn't expired and has the required scopes. The scanner uses HTTP Basic authentication with the PAT as the password (ADO convention).
