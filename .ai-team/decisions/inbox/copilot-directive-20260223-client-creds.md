### 2026-02-23: Use client credentials
**By:** GalGoldi72 (via Copilot)
**What:** The scanner must use the customer's own credentials (their ADO PAT, their browser auth) — not service/app-level credentials. Authentication flows through the client's identity.
**Why:** User request — enterprise customers need scans to run under their own identity for security, audit trail, and permissions alignment.
