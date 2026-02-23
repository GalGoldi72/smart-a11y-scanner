# Product Requirements Document: Smart A11y Scanner

**Version:** 1.0  
**Date:** December 2024  
**Owner:** Avasarala (PM)  
**Status:** Active  

---

## 1. Product Overview

### 1.1 Vision
Smart A11y Scanner is an AI-powered accessibility testing platform that automates the discovery and remediation of accessibility violations in web applications. It takes a single URL, intelligently crawls the site, detects user-facing UI flows, and automatically files detailed accessibility bugs as Azure DevOps work items—eliminating manual audit friction and scaling accessibility testing across complex applications.

### 1.2 Target Users
- **QA Engineers:** Integrate accessibility testing into regression suites
- **Developers:** Catch accessibility regressions during feature development
- **Accessibility Auditors:** Accelerate manual compliance audits with automated pre-screening
- **Compliance Officers:** Track accessibility debt and demonstrate continuous improvement
- **Product Managers:** Prioritize accessibility work using quantified findings

### 1.3 Value Proposition
- **Speed:** Scan a 50-page site in under 5 minutes (vs. days for manual audit)
- **Comprehensiveness:** Covers all major WCAG 2.2 categories in a single pass
- **Integration:** Automatically files bugs in your workflow (ADO work items)
- **Intelligence:** Auto-discovers UI flows and user paths, not just static page analysis
- **Actionability:** Each bug includes repro steps, WCAG reference, and remediation guidance

### 1.4 Problem Statement
Manual accessibility audits are expensive, slow, and reactive. Teams typically discover accessibility issues at the end of a project (when costs are highest) or in production (when user impact is maximum). Static analysis tools miss interactive flows, dynamic content, and screen reader incompatibilities. Smart A11y Scanner flips the model: catch issues early, in context, with actionable guidance that developers can fix immediately.

---

## 2. Core Features (P0 — Must Have)

These features define the minimum viable product and must ship in v1.0.

### 2.1 URL Scanning
**What:** User provides a single URL; the scanner analyzes that page for accessibility violations.

**Acceptance Criteria:**
- Scanner accepts URL via CLI argument or config file
- Handles HTTP and HTTPS URLs
- Follows redirects (up to 5 hops) and respects 3xx status codes
- Logs validation errors for malformed URLs
- Supports URLs with query parameters and fragments
- Timeout: 10 seconds per page

### 2.2 Smart Crawling
**What:** The scanner discovers and follows links on a page to build a site map, enabling multi-page scanning.

**Acceptance Criteria:**
- Crawler discovers all `<a href>` links on a page
- Respects `<base>` tags and relative URL resolution
- Filters out external links, anchors, javascript: URIs, and data: URIs
- Follows only same-origin links (configurable)
- Stores discovered URLs in a queue for processing
- Configurable crawl depth (default: 2 levels deep)
- Respects robots.txt and meta robots directives
- De-duplicates URLs to avoid redundant scans
- Max crawl limit: 100 unique pages per scan (configurable)

### 2.3 UI Flow Detection
**What:** Automatically identify interactive elements and mock user navigation paths to test dynamic behavior and screen reader feedback.

**Acceptance Criteria:**
- Detects all interactive elements:
  - Buttons (`<button>`, `role="button"`, clickable divs)
  - Links (`<a>`, `role="link"`)
  - Form inputs (text, email, password, checkbox, radio, select, textarea)
  - Menus and dropdowns (native and ARIA menus)
  - Modals and dialogs
  - Tabs and tab panels
- Records element location (x, y) and visual state
- Simulates common user flows:
  - Tab through form fields
  - Click buttons and menus
  - Open and close modals
  - Expand/collapse accordions
  - Navigate tabs
- Captures DOM state at each step
- Detects focus movement and focus traps
- Logs interactions for repro steps in bug reports

### 2.4 Comprehensive A11y Checks (WCAG 2.2 Coverage)
**What:** Scanner runs the full spectrum of WCAG 2.2 checks across all major categories.

**Acceptance Criteria:**

#### 2.4.1 ARIA & Semantic HTML
- [ ] Missing `alt` text on images (WCAG 1.1.1 Non-text Content)
- [ ] Missing or incorrect `role` attributes (WCAG 4.1.2 Name, Role, Value)
- [ ] Missing or incorrect `aria-label` / `aria-labelledby` on controls (WCAG 1.3.1 Info and Relationships)
- [ ] Invalid ARIA roles (WCAG 4.1.2)
- [ ] Missing required ARIA attributes (e.g., `aria-required` on form inputs)
- [ ] Incorrect ARIA state attributes (e.g., `aria-expanded`, `aria-checked`)
- [ ] Non-semantic HTML (missing heading hierarchy, divs instead of buttons)
- [ ] Missing form labels (`<label>` or `aria-label`)
- [ ] Form controls without associated labels

#### 2.4.2 Color & Contrast
- [ ] Text contrast ratio < 4.5:1 (normal text, WCAG AA 1.4.3)
- [ ] Text contrast ratio < 3:1 (large text)
- [ ] UI component stroke contrast < 3:1 (WCAG 1.4.11 Non-text Contrast)
- [ ] Graphical objects contrast < 3:1
- [ ] Color-only information (WCAG 1.4.1 Use of Color)
- [ ] Focus indicator visibility (WCAG 2.4.7)

#### 2.4.3 Zoom & Reflow (Responsive Design)
- [ ] Zoom at 200%: horizontal scrolling required (WCAG 1.4.10 Reflow)
- [ ] Zoom at 400%: content truncated or inaccessible
- [ ] Text size at 200%: line height < 1.5x (WCAG 1.4.12 Text Spacing)
- [ ] Letter spacing at 0.12em: text overlaps (WCAG 1.4.12)
- [ ] Word spacing at 0.16em: text overlaps (WCAG 1.4.12)

#### 2.4.4 Keyboard Navigation
- [ ] All interactive elements not reachable via keyboard (WCAG 2.1.1 Keyboard)
- [ ] Tab order illogical or non-sequential (WCAG 2.4.3 Focus Order)
- [ ] Focus indicator invisible or non-existent (WCAG 2.4.7 Focus Visible)
- [ ] Keyboard trap (focus cannot leave element)
- [ ] Missing skip links (WCAG 2.4.1 Bypass Blocks)
- [ ] Single-key keyboard shortcuts collide with user agent shortcuts

#### 2.4.5 Screen Reader Compatibility
- [ ] Missing text labels on screen reader (e.g., icon buttons)
- [ ] Decorative images read aloud (should have `alt=""`)
- [ ] ARIA live regions not properly marked (`aria-live`)
- [ ] Announcements not audible (WCAG 4.1.3 Status Messages)
- [ ] Navigation structure not exposed (landmarks, headings)

#### 2.4.6 Voice Access Support
- [ ] Buttons without visible labels (voice input cannot click)
- [ ] No visible text for anchor targets (voice "show numbers")
- [ ] Dynamically generated labels (inconsistent voice matching)
- [ ] Forms with only placeholder text (WCAG 3.3.2 Labels or Instructions)

#### 2.4.7 Form Accessibility
- [ ] Form inputs missing labels (WCAG 1.3.1 Info and Relationships)
- [ ] Error messages not linked to fields (WCAG 3.3.1 Error Identification)
- [ ] Required field indicators not conveyed to AT (WCAG 1.3.1)
- [ ] Form submission disabled but not announced (WCAG 2.2.2 Pause, Stop, Hide)
- [ ] Placeholder text used as label (WCAG 3.3.2 Labels or Instructions)

#### 2.4.8 Media Accessibility
- [ ] Videos without captions (WCAG 1.2.2 Captions for Pre-recorded Audio-only)
- [ ] Audio descriptions missing for videos (WCAG 1.2.5 Audio Description for Pre-recorded Video)
- [ ] Audio without transcript (WCAG 1.2.1 Pre-recorded Audio-only)

#### 2.4.9 Semantic HTML & Structure
- [ ] Missing main landmark (WCAG 1.3.1 Info and Relationships)
- [ ] Heading hierarchy broken (h1 → h3, skipping h2)
- [ ] List markup misused (divs instead of `<ul>`, `<ol>`)
- [ ] Table markup errors (missing `<thead>`, `<tbody>`, `<th>` scopes)
- [ ] Landmark overuse or incorrect usage

#### 2.4.10 Motion & Animation
- [ ] Animations triggered automatically without pause control (WCAG 2.2.2 Pause, Stop, Hide)
- [ ] Animation violates reduced-motion preference (WCAG 2.3.3 Animation from Interactions)
- [ ] No pause/stop button for auto-playing content
- [ ] Flashing/blinking content (WCAG 2.3.2 Three Flashes)

**Scan Output:**
- Each violation includes:
  - WCAG criterion (e.g., 1.4.3, 2.4.7)
  - Severity (Critical, High, Medium, Low)
  - Page URL and element selector
  - Description of the issue
  - Suggested remediation
  - Screenshot of the violation
  - Element HTML (for context)

### 2.5 ADO Bug Filing
**What:** For each accessibility violation discovered, the scanner automatically creates a detailed Azure DevOps work item (bug) in the connected project.

**Acceptance Criteria:**
- Scanner authenticates to ADO using PAT (Personal Access Token) or managed identity
- Creates one bug per unique violation
- Bug title format: `[A11y] {Category}: {Issue} — {Element}` (e.g., "[A11y] Contrast: Text does not meet 4.5:1 ratio — h2.hero-title")
- Bug description includes:
  - WCAG criterion and link to WCAG reference
  - Page URL and CSS selector
  - Current state (screenshot)
  - Step-by-step repro steps (from UI flow detection)
  - Suggested remediation
  - Priority mapping (Critical → P0, High → P1, Medium → P2, Low → P3)
- Custom fields (if configured):
  - A11y Criterion (e.g., "1.4.3 Contrast")
  - Severity Level
  - Detection Method (automated)
- Bug assigned to configurable team or backlog
- Bugs marked with accessibility tag
- Duplicate detection: Skip filing if bug already exists (same URL, element, criterion)

### 2.6 Scan Reports
**What:** Generate human-readable and machine-parseable reports of all findings.

**Acceptance Criteria:**
- **HTML Report:**
  - Executive summary (total violations by severity)
  - Violations grouped by page, then by WCAG category
  - Each violation shows: title, description, repro steps, screenshot, remediation
  - Searchable / filterable by severity, category, page
  - Export-friendly layout
- **JSON Report:**
  - Machine-parseable format
  - Same data as HTML (no summary-only)
  - Includes metadata (scan date, URL, pages crawled)
  - Schema documented
- **CSV Report (optional):**
  - Flat table format for spreadsheet import
  - Columns: Page, Category, Severity, Title, Description, Selector, WCAG Criterion

**Report Features:**
- Generated locally (no cloud upload)
- Report saved to filesystem with timestamp
- Includes scan metadata: start time, end time, total pages scanned, total violations
- Links to ADO bugs (if filed)

---

## 3. Enhanced Features (P1 — Should Have)

These features increase usability and capability but are not required for v1.0. Prioritize based on user feedback.

### 3.1 Authentication Support
**What:** Scan pages behind login by injecting credentials or cookies.

**Acceptance Criteria:**
- Cookie injection: User provides cookie name/value pairs (config file)
- Form-based auth: User provides username/password; scanner logs in before crawling
- Session persistence: Cookies maintained across crawl session
- Timeout handling: Re-authenticate if session expires mid-crawl
- Security: Never log credentials; store in environment variables or secure config only

### 3.2 SPA Support
**What:** Handle single-page applications with client-side routing and dynamic content loading.

**Acceptance Criteria:**
- Wait for dynamic content to load (configurable wait time, default 2s)
- Detect route changes and treat as new "pages" for crawl
- Handle AJAX-loaded content (not just navigation)
- Discover links in dynamically-added DOM
- Test modal dialogs, side panels, and other dynamic UI
- Handle infinite scroll (stop at limit or explicit boundary)

### 3.3 Configurable Scan Depth
**What:** Control how many pages the crawler follows and how deeply.

**Acceptance Criteria:**
- Config option: `crawlDepth` (default: 2)
  - Depth 0: Scan only the provided URL
  - Depth 1: Scan the URL + all direct links
  - Depth 2: Scan URL + links + links from those pages
  - Etc.
- Config option: `maxPages` (default: 100)
  - Stop crawling after N unique pages discovered
- Config option: `pageTimeout` (default: 10s)
  - Max time to wait for a page to load
- Config option: `crawlExclusions` (regex patterns)
  - Exclude URLs matching patterns (e.g., `/admin`, `/settings`)

### 3.4 Baseline & Regression Detection
**What:** Compare current scan against previous scans to detect new, resolved, and persistent issues.

**Acceptance Criteria:**
- Store baseline scans in a results database (JSON files or SQLite)
- Baseline comparison shows:
  - New violations (in current scan, not in baseline)
  - Fixed violations (in baseline, not in current)
  - Persistent violations (in both)
- Regression report highlights new issues that must be addressed
- Config option to fail scan if new violations detected (for CI/CD)
- Option to set a baseline from current scan

### 3.5 CI/CD Integration
**What:** Run the scanner as part of a build pipeline and enforce accessibility gates.

**Acceptance Criteria:**
- Exit code: 0 if all checks pass, non-zero if violations found
- Severity threshold config: Fail build if violations >= configured severity
- Report formats suitable for CI artifact storage (JSON, HTML)
- GitHub Actions / Azure Pipelines example configurations provided
- Supports --fail-on-severity=<level> flag (e.g., --fail-on-severity=high)
- Parallel scans support (for monorepos or multiple URLs)
- Timeout handling: Scan must complete within configured max time

---

## 4. Nice-to-Have Features (P2)

These provide additional value but are deprioritized for v1.0. Evaluate for v1.1+.

### 4.1 NVDA Integration
Real-time integration with screen reader NVDA to test actual compatibility.
- Start NVDA as subprocess
- Record announcements and navigation
- Compare actual vs. expected screen reader output
- Detect missing or incorrect announcements

### 4.2 Browser Profiles
Test across multiple browser configurations.
- Zoom levels: 100%, 125%, 150%, 200%, 400%
- Color modes: Normal, Grayscale, High Contrast, Protanopia, Deuteranopia
- Reduced Motion preference enabled
- Large Font preference enabled
- Each profile generates separate violations

### 4.3 Dashboard & History
Web-based dashboard for tracking accessibility trends.
- View scan history for a URL
- Compare scans over time (graphs)
- Filter violations by severity, category, status
- Mark violations as "acknowledged" or "in progress"
- Sync with ADO work item status

### 4.4 Custom Rules
Allow power users to define custom accessibility checks.
- Rule definition format (JSON or YAML)
- Validation engine for custom rules
- Rule templates for common patterns
- Community rule sharing

### 4.5 Automated Fixes
Suggest or auto-apply common fixes.
- Add missing alt text (with template)
- Fix heading hierarchy
- Add skip links
- Apply ARIA attributes

---

## 5. Technical Requirements

### 5.1 Technology Stack
- **Language:** TypeScript
- **Runtime:** Node.js (v18 or later)
- **Browser Automation:** Playwright (supports Chromium, Firefox, WebKit)
- **Accessibility Scanning:** Custom rules + Axe-core (open-source a11y engine)
- **ADO Integration:** Azure DevOps REST API / node-azure-devops SDK
- **CLI Framework:** Yargs or Commander.js
- **Logging:** Winston or Pino
- **Output Formatting:** Handlebars (HTML reports), JSON
- **Testing:** Jest or Vitest
- **Type Safety:** TypeScript strict mode

### 5.2 Architecture
- **Modular Design:**
  - `scanner/` — Core scanning logic
  - `crawler/` — URL discovery and crawling
  - `detectors/` — Accessibility rule implementations
  - `ado/` — Azure DevOps integration
  - `reports/` — Report generation
  - `cli/` — Command-line interface
  - `utils/` — Shared utilities
- **Plugin Architecture:** Allow third-party rule additions
- **Configuration:** YAML/JSON config file support + CLI flags

### 5.3 Performance & Reliability
- **Performance:**
  - Scan 50-page site: < 5 minutes
  - Single page: < 10 seconds (including load time)
  - Memory: < 512 MB for typical scan
  - Parallel page processing (configurable workers)
- **Reliability:**
  - Graceful error handling for network timeouts
  - Retry logic for flaky pages (3 retries)
  - Malformed HTML tolerance
  - Screenshot fallback if capture fails
  - Detailed logging for debugging
- **Scalability:**
  - Handle 1000+ page crawls (via depth/limit config)
  - Batch ADO bug filing (avoid rate limits)

### 5.4 Security & Privacy
- **Credentials:** Never store credentials in plain text or logs
  - Use environment variables for PAT tokens
  - Support secure credential stores (e.g., Azure Vault)
  - Redact sensitive data from logs and reports
- **Network:** Support proxies for enterprise environments
- **Data:** Local file output only; no cloud uploads without explicit consent

### 5.5 Output Formats
- **HTML Report:** Interactive, searchable, styled
- **JSON Report:** Complete data export, schema validation
- **CSV Report:** Spreadsheet-friendly format
- **Console Output:** Summary statistics and key findings
- **ADO Artifacts:** Bugs filed with full context

---

## 6. User Stories & Acceptance Criteria

### User Story 1: Run a Scan from CLI
**As a** QA Engineer  
**I want to** scan a website URL for accessibility violations  
**So that** I can identify issues before they reach users

**Acceptance Criteria:**
- `smart-a11y scan https://example.com` launches a scan
- Scan completes in under 2 minutes for a single page
- Output displayed in terminal (summary + warnings)
- Exit code 0 on success, non-zero on errors
- Log file saved for debugging

### User Story 2: Auto-file Bugs in ADO
**As a** PM  
**I want** accessibility violations automatically filed as ADO bugs  
**So that** the team has a clear backlog of accessibility work

**Acceptance Criteria:**
- Scanner connects to ADO using PAT token
- Each violation creates one bug
- Bug includes title, description, repro steps, screenshot, WCAG reference
- Bugs appear in sprint backlog with P1 priority for critical issues
- Duplicate bugs not filed (idempotent)
- User notified of filed bugs in CLI output

### User Story 3: Generate an HTML Report
**As a** Stakeholder  
**I want** a human-readable report of all accessibility findings  
**So that** I can review results and plan remediation

**Acceptance Criteria:**
- Report generated after scan completes
- Report includes: summary, violations by page, violations by WCAG category
- Each violation shows: title, description, screenshot, repro steps, remediation
- Report is searchable and filterable
- Report can be shared (HTML is self-contained, no external dependencies)

### User Story 4: Detect Interactive UI Flows
**As a** Developer  
**I want** the scanner to test my form submissions and modal interactions  
**So that** I know they're accessible before going to production

**Acceptance Criteria:**
- Scanner automatically detects and tests forms
- Scanner opens modals and tests dialog focus management
- Scanner expands accordions and menus
- Each interaction recorded with before/after states
- Repro steps include interaction sequences

### User Story 5: Test Behind Login
**As a** QA Engineer  
**I want** to scan authenticated pages (member-only content)  
**So that** I can test the full product, not just public pages

**Acceptance Criteria:**
- Config file supports cookie injection: `cookies: [{name: "auth", value: "..."}]`
- Config file supports form-based login: `auth: {url: "/login", username: "...", password: "..."}`
- Cookies persist across crawl session
- Session expires handled with re-auth

### User Story 6: Fail CI if Critical Issues Found
**As a** DevOps Engineer  
**I want** the scanner to fail the build if critical accessibility issues are found  
**So that** accessibility regressions are caught before merge

**Acceptance Criteria:**
- `--fail-on-severity=critical` flag causes non-zero exit if any critical violations
- `--fail-on-severity=high` causes non-zero exit if any high or critical violations
- Default behavior: warn only, exit 0 unless errors occur
- Report saved as artifact before exit

### User Story 7: Compare to Baseline
**As a** PM  
**I want** to know which accessibility issues are new vs. persistent  
**So that** I can track progress and identify regressions

**Acceptance Criteria:**
- `--baseline <file>` option loads previous scan results
- Report shows: new violations (current but not baseline), fixed violations (baseline but not current), persistent violations
- Baseline set with `--set-baseline` flag
- Regression detected if new violations > threshold (configurable)

### User Story 8: Crawl Multiple Pages Intelligently
**As a** QA Engineer  
**I want** the scanner to automatically discover and test linked pages  
**So that** I can audit the entire site in one command

**Acceptance Criteria:**
- `--crawl-depth=2` discovers links and follows up to 2 levels deep
- `--max-pages=50` stops after 50 unique pages scanned
- Duplicate URLs not re-scanned
- External links excluded by default
- Crawl excludes patterns: `--crawl-exclude="/admin" --crawl-exclude="/settings"`
- Report groups violations by page

### User Story 9: Export Violations to CSV
**As a** Analyst  
**I want** scan results in CSV format  
**So that** I can import into spreadsheets and analyze in Excel

**Acceptance Criteria:**
- `--format=csv` generates CSV report
- Columns: Page, Category, Severity, Title, Description, Selector, WCAG Criterion
- CSV is valid and opens in Excel/Google Sheets
- Sortable/filterable in spreadsheet

### User Story 10: Configure Scanner with YAML
**As a** QA Engineer  
**I want** to store scanner configuration in a file  
**So that** I don't need to type long command lines

**Acceptance Criteria:**
- Config file: `.a11y-scanner.yaml` (or custom path)
- Supports all CLI options as config keys
- Example: `crawlDepth: 2`, `maxPages: 100`, `adoToken: ${ADO_TOKEN}`
- CLI flags override config file
- `--config=/path/to/config.yaml` flag

### User Story 11: Test WCAG 2.2 Zoom Compliance
**As a** QA Engineer  
**I want** the scanner to test zoom levels (200%, 400%)  
**So that** I know the site is usable at different zoom levels

**Acceptance Criteria:**
- Scanner tests page at 100%, 200%, 400% zoom
- Detects horizontal scrolling at 200%+ (reflow violation)
- Detects cut-off content at 400%
- Report includes zoom violations per page

### User Story 12: Screen Reader Compatibility Check
**As a** QA Engineer  
**I want** the scanner to verify screen reader announcements  
**So that** users with screen readers can navigate my site

**Acceptance Criteria:**
- Scanner detects missing alt text on images
- Scanner detects missing labels on form inputs
- Scanner detects missing landmark roles
- Scanner checks heading hierarchy
- Violations reported with remediation hints
- (NVDA integration in P2, but basic checks in P0)

### User Story 13: Colorblindness Mode Testing
**As a** QA Engineer  
**I want** the scanner to simulate colorblindness (protanopia, deuteranopia)  
**So that** I know my color-coded interfaces are accessible

**Acceptance Criteria:**
- Scanner tests at multiple color modes
- Detects violations: "Information conveyed by color alone"
- Report includes color contrast under each mode
- Recommendations: add icons, patterns, or text labels

### User Story 14: Keyboard Navigation Testing
**As a** QA Engineer  
**I want** the scanner to verify all interactive elements are keyboard-accessible  
**So that** users without mice can navigate my site

**Acceptance Criteria:**
- Scanner tabs through all interactive elements
- Detects unreachable elements (Tab key doesn't reach)
- Detects illogical tab order (focus jumps around)
- Detects keyboard traps (Tab key doesn't escape)
- Detects missing focus indicators
- Report includes focus order diagram

### User Story 15: Accessibility Maturity Report
**As a** Executive  
**I want** a summary of overall accessibility posture  
**So that** I can communicate progress to stakeholders

**Acceptance Criteria:**
- Report includes: Total violations, breakdown by severity, trend (if baseline provided)
- A11y score: based on number and severity of violations
- Quick wins: list of low-hanging fruit to fix
- Action plan: prioritized list of critical → low severity issues
- Comparison to industry benchmarks (if available)

---

## 7. Non-Functional Requirements

### 7.1 Performance
- **Single Page Scan:** < 10 seconds
- **Multi-Page Crawl (50 pages):** < 5 minutes
- **ADO Bug Filing:** < 1 second per bug
- **Memory Usage:** < 512 MB for typical scan
- **Disk Usage:** < 50 MB for reports (including screenshots)

### 7.2 Reliability
- **Network Resilience:** 3-retry logic for flaky requests
- **Timeout Handling:** Graceful fallback if page takes > 10s
- **Error Logging:** Detailed logs for every error (file + stdout)
- **Screenshot Fallback:** Continue scan if screenshot fails
- **Duplicate Handling:** Idempotent ADO bug filing

### 7.3 Usability
- **CLI Clarity:** Help text for every option (`--help`)
- **Error Messages:** Actionable, non-technical where possible
- **Progress Feedback:** Real-time scan progress (pages scanned, violations found)
- **Documentation:** README, examples, troubleshooting guide

### 7.4 Maintainability
- **Code Organization:** Clear module boundaries (scanner, crawler, detectors, ado)
- **Testing:** > 80% code coverage
- **Type Safety:** TypeScript strict mode
- **Documentation:** JSDoc for public APIs

### 7.5 Extensibility
- **Plugin Architecture:** Third-party rules can be added
- **Rule Format:** JSON/YAML for easy custom rules
- **Custom Detectors:** Subclass base detector for new checks

### 7.6 Security
- **No Hard-coded Secrets:** All credentials from env vars or secure stores
- **Log Redaction:** PAT tokens, passwords redacted from logs
- **Secure Defaults:** HTTPS required by default, HTTP warns user
- **Proxy Support:** Enterprise proxy configuration

### 7.7 Accessibility of the Scanner Itself
- **CLI Output:** Compatible with screen readers (structured, no ASCII art)
- **HTML Reports:** Accessible (WCAG AA compliant reports about accessibility!)
- **Documentation:** Accessible PDFs, alt text on images

---

## 8. Success Metrics

### Primary Metrics
1. **Coverage:** All major WCAG 2.2 categories (10+ categories) covered in v1.0
2. **Accuracy:** False positive rate < 5% (validated against manual audits)
3. **Scan Speed:** 50-page site scanned in < 5 minutes
4. **ADO Integration:** 100% of detected violations filed as bugs (no data loss)
5. **User Adoption:** Scan tool used in >= 3 team projects within 3 months

### Secondary Metrics
6. **Bug Actionability:** > 90% of filed bugs actioned by developers (not dismissed)
7. **Crawl Completeness:** Crawler discovers >= 95% of actual links on a site
8. **Remediation Time:** Average developer time to fix filed bug < 30 minutes
9. **Regression Prevention:** No accessibility regressions land on main branch when scan is enforced in CI
10. **User Satisfaction:** NPS >= 40 from QA/dev users

### Operational Metrics
11. **Uptime:** Scanner available >= 99% of the time (no runtime crashes)
12. **Error Rate:** < 2% of scans result in errors
13. **Documentation Quality:** < 5 support questions per month (indicates good self-service docs)

---

## 9. Assumptions & Constraints

### Assumptions
- Users have access to Azure DevOps and can generate PAT tokens
- Target websites are on public internet (not airgapped)
- Browser automation (Playwright/Chromium) available in CI environment
- Users have basic CLI literacy

### Constraints
- **Scope:** Focus on WCAG 2.2 AA compliance (AAA out of scope for v1.0)
- **Performance:** Single-threaded crawl only (parallel crawling in P1)
- **Media Scanning:** Video captions/audio descriptions checked via metadata only (no ML vision in v1.0)
- **Rendering:** Chromium only (Firefox, Safari support in P1)
- **Scale:** Max 100 pages per scan (configurable, but memory is constraint)

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| **WCAG** | Web Content Accessibility Guidelines (W3C standard for accessible web) |
| **A11y** | Numeronym for "accessibility" (11 letters between A and Y) |
| **ARIA** | Accessible Rich Internet Applications (markup for accessible interactive content) |
| **ADO** | Azure DevOps (Microsoft project management platform) |
| **PAT** | Personal Access Token (authentication for Azure DevOps API) |
| **Crawl Depth** | How many levels deep the crawler follows links (depth 0 = single page) |
| **Focus Trap** | Keyboard focus cannot escape an element (Tab key loops inside) |
| **Reflow** | Content displays without loss when zoomed to 200% (no horizontal scroll) |
| **Landmark** | Semantic HTML region (`<main>`, `<nav>`, `<aside>`, etc.) |
| **Repro Steps** | Step-by-step instructions to reproduce an issue |

---

## 11. Roadmap

### Phase 1: v1.0 (MVP)
- [ ] URL scanning
- [ ] Smart crawling (depth 0-2)
- [ ] UI flow detection
- [ ] WCAG 2.2 checks (all 10 categories)
- [ ] ADO bug filing
- [ ] HTML & JSON reports
- [ ] CLI interface
- [ ] ~50 accessibility rules implemented

**Estimated Timeline:** 8-10 weeks  
**Team:** Naomi (backend), Alex (frontend), Drummer (a11y expert), Amos (QA)

### Phase 2: v1.1 (Enhanced)
- [ ] Authentication support (cookies, form login)
- [ ] SPA support (dynamic content, client-side routing)
- [ ] Baseline & regression detection
- [ ] CI/CD integration (GitHub Actions, Azure Pipelines examples)
- [ ] CSV export
- [ ] Configurable crawl depth & exclusions
- [ ] Rate limit handling for ADO

**Estimated Timeline:** 4-6 weeks

### Phase 3: v1.2 (Advanced)
- [ ] Dashboard & history
- [ ] NVDA integration
- [ ] Browser profiles (zoom, color modes, reduced motion)
- [ ] Custom rule engine
- [ ] Performance optimizations (parallel crawl)

**Estimated Timeline:** 6-8 weeks

---

## 12. Dependencies & Risks

### Dependencies
- **Azure DevOps:** Scanner requires ADO API access; if API changes, scanner may break
- **Playwright:** Browser automation engine; updates may affect compatibility
- **Web Standards:** WCAG guidelines may evolve; rules may need updates
- **Network:** Scans depend on network reliability; timeouts/latency affect performance

### Risks
- **Risk:** Screen reader integration (NVDA) complex and fragile → **Mitigation:** Defer to P2, start with basic ARIA checks in P0
- **Risk:** False positive rate too high → **Mitigation:** Extensive validation with manual audits, tuning rules
- **Risk:** ADO API rate limits → **Mitigation:** Batch filing, retry logic, clear error messages
- **Risk:** Crawl too slow for large sites → **Mitigation:** Configurable depth/limits, performance optimizations in P2
- **Risk:** Playwright version incompatibilities → **Mitigation:** Lock version, test in CI before upgrades

---

## 13. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Dec 2024 | Avasarala | Initial PRD: MVP scope, 10+ WCAG categories, ADO integration |

---

## 14. Approval & Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| PM | Avasarala | TBD | TBD |
| Tech Lead | Holden | TBD | TBD |
| A11y Expert | Drummer | TBD | TBD |
| Stakeholder | GalGoldi72 | TBD | TBD |

---

**Document Status:** DRAFT (awaiting team review)  
**Next Review Date:** End of Phase 1
