# SKILL: Pre-Publish Security Scan

**Confidence:** low
**Source:** earned
**Context:** TypeScript/Node.js CLI tool with Azure DevOps integration

## When to Apply
Before pushing any repository to a public GitHub repo.

## Checklist

### 1. .gitignore Existence and Completeness
Must exclude: `node_modules/`, `dist/`, `.env*`, IDE files, OS files, logs, coverage, any runtime output directories.

### 2. Runtime Output Directories
Scan reports, learned patterns, cached data — these often contain:
- Internal URLs (Azure portals, corporate sites)
- Tenant IDs, client IDs, OAuth state tokens
- Base64-encoded screenshots of internal applications
- ADO work item / test plan IDs

### 3. Source Code Secrets Scan
Search patterns:
- `(api[_-]?key|secret|token|password|pat|bearer)\s*[:=]\s*['"][^'"]{10,}`
- `https?://[^/]*:[^/@]+@` (URLs with credentials)
- `eyJ[A-Za-z0-9_-]{20,}` (JWT tokens)
- `(BEGIN\s+PRIVATE\s+KEY|ssh-rsa|AAAA[A-Za-z0-9+/]{20,})`
- `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}` (real GUIDs in tests)

### 4. Personal Information
Corporate email addresses, internal usernames, team member names in config/team files.

### 5. Test Data
Replace real-world GUIDs, tenant IDs, resource IDs with obviously-fake placeholders (e.g., `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`).

### 6. Git History
Check for deleted secret files: `git log --all --format="%H %s" --diff-filter=D -- "*.env" "*.pem" "*.key"`
If secrets were ever committed, the entire history needs scrubbing (BFG Repo Cleaner or git-filter-repo).

### 7. Pre-Publish Files Needed
- README.md
- LICENSE (match package.json license field)
- CONTRIBUTING.md
- .env.example (document required env vars without values)
