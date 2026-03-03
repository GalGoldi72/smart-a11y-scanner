# Smart A11y Scanner — One-Pager

**The One-Liner**

An AI-powered accessibility testing tool that automatically crawls single-page applications to discover WCAG violations and accessibility barriers in minutes—without manual testing.

---

**The Problem**

Manual accessibility testing is slow, expensive, and error-prone. Teams discover issues after launch, when fixes cost more. Modern SPAs are complex—hidden states, overlays, and interactive flows make it easy for human testers to miss critical accessibility gaps. Result: compliance risk, user frustration, and delayed shipping.

---

**What It Does**

🔍 **Intelligent SPA Navigation** — Auto-discovers and explores interactive elements, state changes, and hidden UI flows that static tools miss  
✅ **Comprehensive Compliance Checks** — Runs axe-core WCAG 2.2 validation + custom rules for heading hierarchy, color contrast, ARIA patterns, and keyboard navigation  
📊 **Professional Reporting** — Beautiful HTML reports with severity breakdown, screenshots, state breadcrumbs, and links to WCAG guidance  
🔗 **Azure DevOps Integration** — Auto-file bugs with severity mapping and screenshots  
📝 **Test Plan Support** — Run guided, repeatable scans using YAML-defined user journeys  
⚡ **CI/CD Ready** — CLI-first design for local dev, pipelines, and automation  

---

**Results**

From our latest full-app scan:
- **65 findings** across **15+ UI states** on **9+ pages** in **~7 minutes**
- **16 critical** issues (blocking assistive tech), **27 serious**, **22 moderate**
- Zero false positives through smart deduplication

---

**What's Next**

📋 Azure DevOps automation (in progress)  
🤖 Dynamic interaction checks (auto-detect JavaScript-driven state changes)  
🎯 AI-synthesized test scenarios (auto-generate test cases from patterns)  

---

*Shift left on accessibility. Catch issues early. Ship with confidence.*
