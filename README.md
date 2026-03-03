# Smart A11y Scanner

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js->=18.0.0-brightgreen)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![WCAG 2.2](https://img.shields.io/badge/WCAG-2.2-green)](https://www.w3.org/WAI/WCAG22/quickref/)

**AI-powered accessibility scanner for web applications** — Auto-discovers UI flows, detects WCAG 2.2 violations, and files bug reports in Azure DevOps.

[Installation](#installation) • [Quick Start](#quick-start) • [CLI Usage](#usage) • [Configuration](#configuration) • [Contributing](#contributing)

</div>

---

## What It Does

Smart A11y Scanner automates accessibility testing by:

1. **Crawling your site** — Discovers pages from a single starting URL (configurable depth and max pages)
2. **Detecting UI flows** — Automatically identifies interactive elements (buttons, forms, modals, menus) and simulates user interactions
3. **Running WCAG 2.2 checks** — Comprehensive analysis covering semantic HTML, color contrast, keyboard navigation, screen reader compatibility, zoom/reflow, and more
4. **Generating reports** — HTML dashboards, JSON data, or CSV exports with severity breakdowns and remediation guidance
5. **Filing bugs automatically** — Integrates with Azure DevOps to create work items with repro steps and WCAG references (optional)

Perfect for:
- **QA engineers** integrating accessibility into regression test suites
- **Developers** catching accessibility regressions during feature work
- **Accessibility auditors** accelerating manual compliance audits
- **Compliance teams** tracking accessibility debt and demonstrating improvement
- **Product managers** prioritizing accessibility work with quantified data

---

## Key Features

- ✅ **Single-command scanning** — `a11y-scan scan https://your-site.com`
- ✅ **Smart crawling** — Discovers and crawls multiple pages (configurable depth)
- ✅ **Interactive exploration** — Detects and tests buttons, forms, dropdowns, modals, tabs, and more
- ✅ **WCAG 2.2 comprehensive** — 100+ checks across all major accessibility categories
- ✅ **Multiple report formats** — HTML (interactive dashboard), JSON (structured data), CSV (spreadsheet-friendly)
- ✅ **Severity-based filtering** — Critical, serious, moderate, minor — with visual indicators
- ✅ **Actionable findings** — Each violation includes CSS selector, WCAG reference, repro steps, and remediation guidance
- ✅ **Azure DevOps integration** — Auto-file bugs with all details (optional)
- ✅ **Authentication support** — Handle login flows (basic auth, interactive browser login, cookies)
- ✅ **Test plan integration** — Run guided accessibility test plans with step-by-step validation
- ✅ **Pattern learning** — Extract accessibility patterns from guided tests for future generation
- ✅ **Headless & headed modes** — Run unattended or see the browser in action for debugging
- ✅ **Browser profile support** — Use your existing Microsoft Edge profile with logged-in credentials

---

## Prerequisites

- **Node.js** 18.0.0 or later ([download](https://nodejs.org))
- **npm** (included with Node.js)
- **Playwright browsers** (auto-installed on first run)
- **Optional:** Azure DevOps Personal Access Token (PAT) for bug filing

---

## Installation

### As a CLI tool (recommended for most users)

```bash
npm install -g smart-a11y-scanner
```

Then run:
```bash
a11y-scan scan https://your-site.com
# or
smart-a11y-scanner scan https://your-site.com
```

### As a library (for programmatic integration)

```bash
npm install smart-a11y-scanner
```

Then in your code:
```typescript
import { ScanEngine, Reporter } from 'smart-a11y-scanner';

const engine = new ScanEngine({ url: 'https://example.com' });
const result = await engine.run();

const reporter = new Reporter({
  formats: ['html'],
  outputDir: './reports'
});
await reporter.generate(result);
```

### From source

```bash
git clone https://github.com/microsoft/smart-a11y-scanner.git
cd smart-a11y-scanner
npm install
npm run build
npm start -- scan https://your-site.com
```

---

## Quick Start

### Basic scan (single page)

```bash
a11y-scan scan https://example.com
```

**Output:** Summary printed to console with findings grouped by severity.

### Scan with depth (crawl multiple pages)

```bash
a11y-scan scan https://example.com --depth 2
```

Crawls up to 2 levels of links from the starting URL (default: 1 level, max 100 pages).

### Generate reports

```bash
a11y-scan scan https://example.com --output html,json --output-path ./reports
```

Creates:
- `./reports/index.html` — Interactive dashboard
- `./reports/scan-result.json` — Structured data

### With authentication

```bash
a11y-scan scan https://example.com \
  --auth-url https://example.com/login \
  --credentials user@example.com:my-password
```

Or set the env var:
```bash
export A11Y_SCANNER_CREDENTIALS=user@example.com:my-password
a11y-scan scan https://example.com --auth-url https://example.com/login
```

### File bugs in Azure DevOps

```bash
a11y-scan scan https://example.com \
  --ado \
  --ado-org https://dev.azure.com/my-org \
  --ado-project MyProject
```

Set `ADO_PAT` env var or pass `--ado-pat <token>`.

### Test plan execution

```bash
a11y-scan scan https://example.com \
  --test-plan 12345 \
  --ado-org https://dev.azure.com/my-org \
  --ado-project MyProject
```

Fetches test plan #12345 from ADO and runs guided steps, capturing findings per step.

### Learn accessibility patterns

```bash
a11y-scan scan https://example.com \
  --test-plan-file ./my-test-plan.yaml \
  --learn
```

Extracts patterns from guided test execution and saves to `.a11y-patterns/`.

---

## Usage

### Commands

```
a11y-scan scan <url> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `<url>` | **Required.** URL to scan (e.g., `https://example.com`) |

### Options

#### Crawling & Scope

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-d, --depth <n>` | number | 1 | Crawl depth (0 = single page, 1 = page + direct links, 2 = two levels) |
| `--spa [bool]` | boolean | true | Auto-discover SPA routes by clicking navigation elements |

#### Output & Reporting

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-o, --output <formats>` | string | json | Report format: `json`, `html`, `csv` (comma-separated for multiple) |
| `--output-path <dir>` | string | current dir | Output directory for reports |

#### Performance & Timeout

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-t, --timeout <seconds>` | number | 600 | Overall scan timeout in seconds (10 minutes) |

#### Authentication

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--auth-url <url>` | string | – | Login page URL (scanner will navigate here before scanning) |
| `--credentials <user:pass>` | string | env: `A11Y_SCANNER_CREDENTIALS` | Basic credentials in `username:password` format |
| `--interactive-auth` | boolean | false | Pause for manual login in browser (implies `--headed`) |

#### Browser Control

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--headed` | boolean | false | Show browser window during scan (useful for debugging) |
| `--browser <channel>` | string | chromium | Browser to use: `chromium`, `edge` (uses your logged-in Edge profile) |

#### Configuration

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-c, --config <path>` | string | – | Path to YAML config file (CLI flags override) |

#### Verbose Output

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--verbose` | boolean | false | Print detailed progress for each page scanned |

#### Azure DevOps Integration

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--ado` | boolean | false | Enable automatic bug filing in Azure DevOps |
| `--ado-org <url>` | string | from config | ADO organization URL (e.g., `https://dev.azure.com/my-org`) |
| `--ado-project <name>` | string | from config | ADO project name |
| `--ado-pat <token>` | string | env: `ADO_PAT` | ADO Personal Access Token (create one [here](https://dev.azure.com/_usersSettings/tokens)) |

#### Test Plan & Guided Execution

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--test-plan <id-or-url>` | string | – | ADO test plan ID or test management URL |
| `--test-plan-file <path>` | string | – | Path to test plan YAML/JSON file |
| `--steps <steps...>` | string[] | – | Inline test steps (natural language descriptions) |
| `--explore-depth <n>` | number | 1 | Auto-exploration depth after each guided step |

#### Learning & Generation

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--learn` | boolean | false | Extract accessibility patterns from guided test execution |
| `--generate` | boolean | false | Generate new test plans from learned patterns and execute them |
| `--ai-generate` | boolean | false | Use LLM for edge case generation (requires `OPENAI_API_KEY` or `AZURE_OPENAI_ENDPOINT`) |
| `--pattern-dir <path>` | string | `.a11y-patterns` | Directory for pattern storage |
| `--max-generated <n>` | number | 30 | Maximum generated test scenarios |

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Scan completed successfully with **no accessibility findings** |
| `1` | Scan completed successfully but **accessibility findings detected** |
| `2` | **Error** during scan (configuration, network, timeout, etc.) |

### Examples

**Scan a single page:**
```bash
a11y-scan scan https://example.com
```

**Scan with depth and multiple report formats:**
```bash
a11y-scan scan https://example.com \
  --depth 3 \
  --output html,json \
  --output-path ./a11y-reports \
  --verbose
```

**Authenticate, crawl, and file bugs in ADO:**
```bash
a11y-scan scan https://example.com \
  --auth-url https://example.com/login \
  --credentials admin:password123 \
  --depth 2 \
  --ado \
  --ado-org https://dev.azure.com/myorg \
  --ado-project MyProject \
  --ado-pat <your-pat>
```

**Run guided test plan with pattern learning:**
```bash
a11y-scan scan https://example.com \
  --test-plan 567 \
  --explore-depth 2 \
  --learn \
  --ado-org https://dev.azure.com/myorg \
  --ado-project MyProject
```

**Use Microsoft Edge with your profile:**
```bash
a11y-scan scan https://example.com --browser edge
```

---

## Configuration

### Config File (YAML)

Create `config.yaml` (or reference with `-c, --config`):

```yaml
# Target URL
url: "https://your-app.example.com"

# Crawl settings
depth: 2                    # Levels to crawl (0 = single page)
maxPages: 100              # Max unique pages to scan

# Timeouts (milliseconds)
pageTimeout: 10000         # Timeout per page

# WCAG conformance
wcagLevels:
  - A
  - AA

# Output formats
output: json,html          # Formats: json, html, csv
# outputPath: ./reports    # Optional output directory

# Minimum severity to report (all higher severities included)
# Levels: critical, serious, moderate, minor
severityThreshold: advisory

# Enable verbose logging
verbose: false

# Azure DevOps (optional)
ado: false
# adoOrg: https://dev.azure.com/your-org
# adoProject: "YourProject"
```

**Note:** CLI flags override config file settings.

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `A11Y_SCANNER_CREDENTIALS` | Basic auth credentials (user:pass format) | `admin:secret123` |
| `ADO_PAT` | Azure DevOps Personal Access Token | `abc123def456ghi789` |
| `OPENAI_API_KEY` | OpenAI API key (for `--ai-generate`) | `sk-...` |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint (for `--ai-generate`) | `https://...` |

---

## Report Formats

### HTML Report

**Interactive dashboard** with:
- 📊 **Summary stats** — Total findings by severity and category
- 🔍 **Detailed findings** — Each violation as a card with:
  - CSS selector (for locating the element)
  - WCAG 2.2 reference and success criterion
  - Severity badge (critical, serious, moderate, minor)
  - Issue description
  - Remediation guidance
  - Screenshots (if captured)
  - Repro steps (if available)
- 🖼️ **Page screenshots** — State of each page at scan time
- ⚙️ **Live filters** — Toggle by severity and category, search findings
- 📱 **Responsive design** — Works on desktop, tablet, and mobile
- 📋 **Test plan results** (if using `--test-plan`) — Step-by-step execution timeline with pass/fail status
- 📚 **Learning summary** (if using `--learn`) — Accessibility patterns extracted
- 🧪 **Generated tests** (if using `--generate`) — AI-generated test scenarios and their results

**File:** `reports/index.html`

### JSON Report

**Structured data** with:
```json
{
  "config": {
    "url": "https://example.com",
    "crawlDepth": 2,
    "timestamp": "2025-02-23T10:30:00Z"
  },
  "summary": {
    "totalPages": 5,
    "totalFindings": 23,
    "bySeverity": {
      "critical": 2,
      "serious": 5,
      "moderate": 10,
      "minor": 6
    },
    "byCategory": {
      "semantic-html": 8,
      "color-contrast": 7,
      "keyboard-navigation": 5,
      "aria": 3
    }
  },
  "pages": [
    {
      "url": "https://example.com/about",
      "findings": [
        {
          "selector": ".btn-primary",
          "severity": "serious",
          "category": "semantic-html",
          "wcagRef": "4.1.2",
          "message": "Button missing accessible name",
          "remediation": "Add aria-label or visible text inside button"
        }
      ]
    }
  ]
}
```

**File:** `reports/scan-result.json`

### CSV Report

**Spreadsheet-friendly** with columns:
- Page URL
- Finding severity
- Category
- Element selector
- Issue description
- WCAG reference
- Remediation

**File:** `reports/scan-result.csv`

---

## WCAG 2.2 Coverage

The scanner checks compliance against WCAG 2.2 Level AA across these major categories:

### Semantic HTML & ARIA (Guideline 1.3, 4.1)
- ✅ Missing or incorrect `alt` text on images
- ✅ Invalid ARIA roles and attributes
- ✅ Missing form labels
- ✅ Incorrect heading hierarchy
- ✅ Missing landmark regions

### Color & Contrast (Guideline 1.4)
- ✅ Text contrast ratio < 4.5:1 (normal text)
- ✅ UI component stroke contrast < 3:1
- ✅ Color-only information conveyance

### Keyboard Navigation (Guideline 2.1, 2.4)
- ✅ Interactive elements not keyboard accessible
- ✅ Illogical tab order
- ✅ Focus indicator invisible or missing
- ✅ Keyboard traps
- ✅ Missing skip links

### Screen Reader Compatibility (Guideline 4.1)
- ✅ Missing text labels
- ✅ Decorative images announced
- ✅ ARIA live regions not properly marked
- ✅ Navigation structure not exposed

### Form Accessibility (Guideline 3.3, 1.3)
- ✅ Form inputs without labels
- ✅ Error messages not linked to fields
- ✅ Required field indicators not conveyed

### Zoom & Reflow (Guideline 1.4.10)
- ✅ Content requires scrolling at 200% zoom
- ✅ Text spacing issues
- ✅ Responsive design failures

### Voice Access Support
- ✅ Buttons without visible labels
- ✅ Elements not clickable via voice commands

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on:
- Development setup
- Coding standards
- Testing requirements
- Pull request process

### Quick Dev Setup

```bash
git clone https://github.com/microsoft/smart-a11y-scanner.git
cd smart-a11y-scanner
npm install
npm run build
npm test
```

**Architecture:**
- `src/cli.ts` — CLI entry point and command handling
- `src/scanner/` — Core scanning engine (crawler, element detection, rule execution)
- `src/rules/` — WCAG 2.2 rule definitions
- `src/reporting/` — HTML, JSON, CSV report generation
- `src/config/` — Configuration loading and validation
- `src/ado/` — Azure DevOps API integration

---

## Troubleshooting

### Scan times out
- Increase `--timeout` (in seconds): `a11y-scan scan https://example.com --timeout 1200`
- Reduce `--depth` to scan fewer pages: `--depth 1`
- Reduce `maxPages` in config

### Authentication fails
- Use `--headed` to see what's happening: `a11y-scan scan https://example.com --headed --auth-url https://example.com/login --credentials user:pass`
- Try `--interactive-auth` to manually log in
- Use `--browser edge` to leverage your existing Edge profile login

### ADO bug filing not working
- Verify PAT has "Work Items (Read & Write)" permission
- Check org URL: `https://dev.azure.com/YOUR-ORG` (not .visualstudio.com)
- Ensure project exists and you have access
- Use `--verbose` to see detailed ADO API errors

### Report is empty or minimal findings
- Some findings require browser interaction — try `--test-plan-file` or `--steps` for guided execution
- Increase `--depth` to crawl more pages
- Check `--verbose` output for skipped rules or errors

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Support

- 📖 [Full Documentation](docs/)
- 🐛 [Report a Bug](https://github.com/microsoft/smart-a11y-scanner/issues)
- 💬 [Discussions](https://github.com/microsoft/smart-a11y-scanner/discussions)
- 🤝 [Contributing Guide](CONTRIBUTING.md)

---

**Made with ♿ by the Smart A11y team at Microsoft**
