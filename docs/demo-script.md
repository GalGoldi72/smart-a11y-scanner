# Demo Recording Script — Smart A11y Scanner

**Target Duration:** 3–5 minutes  
**Format:** Screen recording with narration + terminal output + browser report viewing

---

## Setup & Pre-Recording Checklist

- [ ] Terminal window: zoom font to 150–200% (Ctrl++ on most terminals)
- [ ] Browser: Pin the default browser (Chrome, Edge, or Firefox) to taskbar for quick access
- [ ] Network: Run scan on a stable connection (no VPN throttling)
- [ ] Clear previous reports: `rm -rf reports/` (optional, but cleaner for recording)
- [ ] Build locally first: `npm run build` (optional, ensures `npx tsx` will work)

**Recording Software Tips:**
- Use OBS Studio or ScreenFlow (macOS), Camtasia, or built-in screen recorder
- Capture at 1920×1080 @ 30fps (good balance for readability + file size)
- Record audio separately if possible (easier to re-record narration if needed)

---

## Target URLs — Choose One

**Option 1: WCAG reference example (no auth required, fast)**
```
https://www.w3.org/WAI/WCAG21/Techniques/html/H64
```
Good for: Quick demo, shows real WCAG documentation site, ~15–30 seconds to scan

**Option 2: Web accessibility demo site (slower, more findings)**
```
https://www.webaimorg.demo
```
Good for: Showcasing multiple findings, longer report walkthrough

**Option 3: Microsoft Docs (realistic corporate target, may require auth)**
```
https://learn.microsoft.com/en-us/accessibility
```
Good for: Enterprise scenario, but if scan times out or auth blocks, fall back to Option 1

**For this script: We'll use Option 1 (W3C page)** — it's fast, authoritative, and demonstrates real a11y issues.

---

## Demo Flow

### **SEGMENT 1: OPENING & INTRO** (~20 seconds)

**[Camera: Wide shot of desktop]**

**Narration (read at natural pace):**
> "Welcome to the Smart A11y Scanner — an AI-powered tool for finding accessibility violations in web applications.
>
> Today we'll scan a real website, the W3C WCAG Techniques reference, and explore the automated findings using axe-core and custom accessibility checks."

**[Action]:**
- Keep the camera on your desktop for 3 seconds
- Then click on a terminal window (clearly visible)

---

### **SEGMENT 2: RUN THE SCAN** (~2–3 minutes)

**[Camera: Focused on terminal, font zoomed in]**

**Narration:**
> "Let's start a scan. I'll use the Smart A11y Scanner CLI to analyze the W3C page for accessibility issues."

**[Action — Type and run this exact command:]**
```bash
npx tsx src/cli.ts scan https://www.w3.org/WAI/WCAG21/Techniques/html/H64 --verbose --timeout 120 --output html
```

**[Then press ENTER and let the scan run]**

**[While the scan is running, read this narration — time it to match the ~30–60 second scan duration]:**

> "The scanner is now doing several things:
>
> First, it uses Playwright to open a headless browser and navigate to the target URL. You can see it's scanning each page in verbose mode, which shows us the progress.
>
> Next, it uses auto-discovery to detect navigation links, buttons, and interactive elements on the page. It's building a map of what users can interact with.
>
> It then runs a depth-first exploration — clicking links and buttons, detecting state changes like modals or expanded panels. When it encounters overlays, it analyzes them without letting them block the rest of the scan.
>
> Finally, for each unique page state discovered, it runs axe-core accessibility checks plus custom hand-rolled checks we've built for WCAG 1.1.1 (text alternatives), 1.3.1 (semantics), 1.4.3 (color contrast), 2.4.4 (link purpose), 3.1.1 (language), and more."

**[Pause and let the scan finish. You should see output like:]**
```
⟳ Starting scan...

  → Scanning: https://www.w3.org/WAI/WCAG21/Techniques/html/H64... [findings] (450ms)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📊 Scan Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  URL:        https://www.w3.org/WAI/WCAG21/Techniques/html/H64
  Duration:   2.3s
  Pages:      1
  Findings:   [N findings]
  
  serious    [bar] [count]
  moderate   [bar] [count]
  minor      [bar] [count]

  By category:
    Color Contrast        [count]
    ARIA Labels           [count]
    ...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  📄 Reports generated:
    ✔ HTML → ./reports/scan-2025-02-23.html (45.2 KB)
    🌐 Opening report in browser...
```

**[The CLI will auto-open the HTML report in your default browser. Let it load for 2–3 seconds.]**

---

### **SEGMENT 3: REPORT WALKTHROUGH** (~1–2 minutes)

**[Camera: Focused on the HTML report in the browser]**

**Narration:**
> "Great! The scan found several accessibility issues. Now let's explore the interactive HTML report."

**[Action 1: Show the summary at the top]**
- Pause/let report fully load
- Read aloud: "At the top, we see a summary: total findings, grouped by severity. Red bars for critical or serious issues, yellow for moderate, and blue for minor."

**Narration:**
> "The scanner groups findings by type — ARIA, color contrast, keyboard navigation, semantic structure, and more. Each category shows how many issues were found."

**[Action 2: Scroll down and click into a finding]**
- Scroll down to see the findings list
- Find a finding with a descriptive title (e.g., "Color Contrast Below 4.5:1")
- Click on it to expand/open details

**[Read aloud the details you see, such as:]**
> "Here's a specific finding: the contrast ratio between the text color and background is 3.2:1, but WCAG AA requires 4.5:1 for normal text. The report tells us exactly which element has the issue and links to the WCAG Understanding page so we can learn how to fix it."

**[Action 3: Look for a "Learn More" or WCAG link]**
- If visible, click it to show that the link works (it should open WCAG docs)
- If not visible in the current finding, mention: "Each finding links to WCAG guidelines, so developers can understand the standard and fix it properly."

**[Action 4: Scroll to see if there are screenshots]**
- If the report includes a "Screenshots" section, scroll to it and mention:
> "The scanner also captured screenshots of the page during the scan, showing where the issues occur. This visual evidence makes it easy for teams to reproduce and fix problems."

---

### **SEGMENT 4: CLOSING** (~20 seconds)

**[Camera: Back to terminal or neutral desktop shot]**

**Narration (read thoughtfully, looking at camera):**
> "That's the Smart A11y Scanner in action. It automates the tedious work of manually testing every page and interaction for accessibility compliance.
>
> Upcoming features include:
> — Automatic bug filing to Azure DevOps (no more manual work entering findings)
> — Guided test plan execution (following human QA workflows while auto-discovering surrounding edge cases)
> — LLM-powered scenario generation (AI learns your site patterns and suggests new test cases you might have missed)
>
> The result is faster, more comprehensive accessibility testing. Thank you for watching!"

**[Hold on screen for 2 seconds, then fade to black]**

---

## Timing Reference

| Segment | Duration | Notes |
|---------|----------|-------|
| Opening intro | ~20s | Keep brisk, engage the viewer |
| Run the scan | ~2m | Scan time + narration (narrate while running, don't just wait) |
| Report walkthrough | ~1.5m | Summary + 1–2 expanded findings + links |
| Closing remarks | ~20s | Forward-looking, future features |
| **Total** | **~4 minutes** | Fits within target 3–5m window |

---

## Common Issues & Fixes

### **Issue: Scan hangs or times out**
**Fix:** The default timeout is 120 seconds (set in the command). If it times out:
- Reduce to a simpler URL: `https://example.com` (even faster)
- Or check your network; the W3C site is generally reliable

### **Issue: Report doesn't open in browser**
**Fix:** The CLI tries to auto-open, but if it fails:
- Manually open the file path shown in the terminal (e.g., `./reports/scan-2025-02-23.html`)
- Or use: `open ./reports/scan-*.html` (macOS) / `start ./reports/scan-*.html` (Windows)

### **Issue: No findings detected**
**Fix:** Some sites are very clean (good news!). If you want more findings for a better demo:
- Try `https://example.com` (often has contrast or alt-text issues)
- Or use a public demo site known for a11y issues (e.g., WebAIM's test pages)

### **Issue: Terminal text too small/blurry**
**Fix:** Before recording, zoom the terminal to 150% or 200%:
- **macOS Terminal:** Cmd+ (plus key)
- **Windows Terminal:** Ctrl+ (plus key)
- **VS Code integrated terminal:** Same keyboard shortcuts
- **Linux (GNOME):** Ctrl+= or use Settings

### **Issue: npx tsx fails (command not found)**
**Fix:** Make sure you're in the project root (`C:\Users\ggoldshtein\source\repos\smart-a11y-scanner`):
```bash
cd C:\Users\ggoldshtein\source\repos\smart-a11y-scanner
npm install  # if not done yet
npx tsx src/cli.ts scan https://example.com
```

---

## Script Variations (Optional)

### **Longer Demo (~5 minutes)**
- Add a second URL: "Let's also scan a different page to show the report handles multiple pages..."
- Run: `npx tsx src/cli.ts scan https://example.com --depth 1`
- This will crawl 1 level (the root page + up to ~5 linked pages)
- Show the report filtering/sorting by severity or category

### **Shorter Demo (~2.5 minutes)**
- Skip the full report walkthrough
- Just show the summary in the terminal
- Mention: "The detailed HTML report has interactive findings, screenshots, and WCAG links for each issue."

### **Advanced Demo (with test plans)**
- If you want to showcase guided scanning, use:
```bash
npx tsx src/cli.ts scan https://example.com --steps "click the search button" "enter a query" "submit the form"
```
- This demonstrates the scanner following real user workflows

---

## Recording Checklist

Before you hit record:
- [ ] Terminal is zoomed (150%+ font)
- [ ] Browser is ready and visible
- [ ] Network is stable
- [ ] You've read through the script 2–3 times so narration is smooth
- [ ] Microphone is on and levels are good
- [ ] Screen recorder is set to 1920×1080 @ 30fps
- [ ] You've tested the exact command once in a terminal beforehand

---

## Post-Recording

1. **Save the video** to your preferred format (MP4, MOV, WebM)
2. **Optional: Cut/edit:**
   - Trim the intro/outro if needed (keep to ~3–5 min)
   - Cut any stuck points (scanner hanging, network hiccups)
   - Add background music (optional, keeps energy up)
3. **Title & metadata:**
   - Title: "Smart A11y Scanner Demo"
   - Description: "Automated accessibility testing with AI-powered discovery, axe-core checks, and interactive reporting."
4. **Publish:** Share on YouTube, internal wiki, or demo site

---

## Presenter Notes

- **Tone:** Friendly, clear, confident. You're showing a tool that solves a real problem.
- **Pacing:** Don't rush. Let the scan run and take its time. Use that time for narration.
- **Eye contact:** Look at the camera when closing; it feels more personal.
- **Enthusiasm:** A11y matters! Convey that this tool makes developers' lives easier and makes the web better for everyone.
- **Pause on key moments:** When the summary appears, pause for 2 seconds. When a finding details expand, read them aloud.

---

**Good luck with your recording! 🎥♿**
