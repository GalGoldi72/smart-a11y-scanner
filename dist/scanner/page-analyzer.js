/**
 * Page analyzer — runs accessibility checks against a single Playwright page.
 *
 * POC checks:
 *   1. Images missing alt text (WCAG 1.1.1)
 *   2. Form inputs missing labels (WCAG 1.3.1)
 *   3. Heading hierarchy violations (WCAG 1.3.1)
 *   4. Color contrast placeholder (WCAG 1.4.3) — flags elements for review
 *   5. Missing document language (WCAG 3.1.1)
 *   6. Empty links / buttons (WCAG 2.4.4)
 */
export class PageAnalyzer {
    config;
    constructor(config) {
        this.config = config;
    }
    async analyze(page, url) {
        const start = Date.now();
        const findings = [];
        try {
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: this.config.pageTimeoutMs,
            });
            // Give JS-rendered pages time to settle
            await page.waitForTimeout(1500);
            const metadata = await this.extractMetadata(page, url);
            // Run all checks in parallel
            const checkResults = await Promise.all([
                this.checkImagesAltText(page),
                this.checkFormLabels(page),
                this.checkHeadingHierarchy(page),
                this.checkDocumentLanguage(page),
                this.checkEmptyLinksAndButtons(page),
                this.checkColorContrastCandidates(page),
            ]);
            for (const result of checkResults) {
                findings.push(...result);
            }
            // Capture screenshots of violations if configured
            if (this.config.captureScreenshots && findings.length > 0) {
                await this.captureViolationScreenshots(page, findings);
            }
            return {
                url,
                metadata,
                findings,
                analysisTimeMs: Date.now() - start,
            };
        }
        catch (err) {
            return {
                url,
                metadata: {
                    url,
                    title: '',
                    lang: null,
                    metaDescription: null,
                    metaViewport: null,
                    h1Count: 0,
                },
                findings,
                analysisTimeMs: Date.now() - start,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
    async extractMetadata(page, url) {
        return page.evaluate((pageUrl) => {
            const html = document.documentElement;
            return {
                url: pageUrl,
                title: document.title || '',
                lang: html.getAttribute('lang'),
                metaDescription: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
                metaViewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null,
                h1Count: document.querySelectorAll('h1').length,
            };
        }, url);
    }
    /** WCAG 1.1.1 — Images must have alt text */
    async checkImagesAltText(page) {
        return page.evaluate(() => {
            const findings = [];
            const images = document.querySelectorAll('img');
            for (const img of images) {
                const alt = img.getAttribute('alt');
                // Missing alt is a violation; empty alt="" is acceptable (decorative)
                if (alt === null) {
                    findings.push({
                        ruleId: 'img-alt-text',
                        category: 'semantic-html',
                        severity: 'critical',
                        wcagLevel: 'A',
                        wcagCriterion: '1.1.1',
                        message: `Image missing alt attribute: ${img.src?.substring(0, 100) || 'unknown src'}`,
                        selector: buildSelector(img),
                        htmlSnippet: img.outerHTML.substring(0, 300),
                        remediation: 'Add an alt attribute describing the image content. Use alt="" for decorative images.',
                    });
                }
            }
            // Also check inputs of type image
            const imageInputs = document.querySelectorAll('input[type="image"]');
            for (const input of imageInputs) {
                if (!input.getAttribute('alt')) {
                    findings.push({
                        ruleId: 'img-alt-text',
                        category: 'semantic-html',
                        severity: 'critical',
                        wcagLevel: 'A',
                        wcagCriterion: '1.1.1',
                        message: 'Image input missing alt attribute',
                        selector: buildSelector(input),
                        htmlSnippet: input.outerHTML.substring(0, 300),
                        remediation: 'Add an alt attribute to <input type="image"> describing the button action.',
                    });
                }
            }
            function buildSelector(el) {
                if (el.id)
                    return `#${el.id}`;
                const tag = el.tagName.toLowerCase();
                const classes = Array.from(el.classList).join('.');
                const parent = el.parentElement;
                const index = parent
                    ? Array.from(parent.children).filter(c => c.tagName === el.tagName).indexOf(el)
                    : 0;
                return `${tag}${classes ? '.' + classes : ''}:nth-of-type(${index + 1})`;
            }
            return findings;
        });
    }
    /** WCAG 1.3.1 / 4.1.2 — Form inputs must have associated labels */
    async checkFormLabels(page) {
        return page.evaluate(() => {
            const findings = [];
            const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea');
            for (const input of inputs) {
                const hasLabel = !!input.getAttribute('aria-label')
                    || !!input.getAttribute('aria-labelledby')
                    || !!input.getAttribute('title')
                    || !!input.getAttribute('placeholder');
                // Check for an associated <label>
                const id = input.getAttribute('id');
                const hasAssociatedLabel = id
                    ? !!document.querySelector(`label[for="${id}"]`)
                    : false;
                // Check if input is wrapped in a <label>
                const hasWrappingLabel = !!input.closest('label');
                if (!hasLabel && !hasAssociatedLabel && !hasWrappingLabel) {
                    findings.push({
                        ruleId: 'form-input-label',
                        category: 'forms',
                        severity: 'critical',
                        wcagLevel: 'A',
                        wcagCriterion: '1.3.1',
                        message: `Form input missing accessible label: <${input.tagName.toLowerCase()} type="${input.getAttribute('type') || 'text'}">`,
                        selector: buildSelector(input),
                        htmlSnippet: input.outerHTML.substring(0, 300),
                        remediation: 'Associate a <label> element or add aria-label / aria-labelledby.',
                    });
                }
            }
            function buildSelector(el) {
                if (el.id)
                    return `#${el.id}`;
                const tag = el.tagName.toLowerCase();
                const type = el.getAttribute('type') || '';
                const name = el.getAttribute('name') || '';
                return `${tag}${type ? `[type="${type}"]` : ''}${name ? `[name="${name}"]` : ''}`;
            }
            return findings;
        });
    }
    /** WCAG 1.3.1 — Heading levels should not skip */
    async checkHeadingHierarchy(page) {
        return page.evaluate(() => {
            const findings = [];
            const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
            let prevLevel = 0;
            for (const heading of headings) {
                const level = parseInt(heading.tagName.charAt(1), 10);
                if (prevLevel > 0 && level > prevLevel + 1) {
                    findings.push({
                        ruleId: 'heading-hierarchy',
                        category: 'semantic-html',
                        severity: 'minor',
                        wcagLevel: 'A',
                        wcagCriterion: '1.3.1',
                        message: `Heading level skipped: <h${prevLevel}> followed by <h${level}>`,
                        selector: buildSelector(heading),
                        htmlSnippet: heading.outerHTML.substring(0, 300),
                        remediation: `Use sequential heading levels. Expected <h${prevLevel + 1}> but found <h${level}>.`,
                    });
                }
                prevLevel = level;
            }
            // Check for missing h1
            if (document.querySelectorAll('h1').length === 0) {
                findings.push({
                    ruleId: 'heading-hierarchy',
                    category: 'semantic-html',
                    severity: 'minor',
                    wcagLevel: 'A',
                    wcagCriterion: '1.3.1',
                    message: 'Page has no <h1> element',
                    selector: 'html',
                    htmlSnippet: '',
                    remediation: 'Add a single <h1> element to identify the main page content.',
                });
            }
            // Multiple h1s
            if (document.querySelectorAll('h1').length > 1) {
                findings.push({
                    ruleId: 'heading-hierarchy',
                    category: 'semantic-html',
                    severity: 'advisory',
                    wcagLevel: 'A',
                    wcagCriterion: '1.3.1',
                    message: `Page has ${document.querySelectorAll('h1').length} <h1> elements (expected 1)`,
                    selector: 'h1',
                    htmlSnippet: '',
                    remediation: 'Use a single <h1> for the main page heading.',
                });
            }
            function buildSelector(el) {
                if (el.id)
                    return `#${el.id}`;
                return `${el.tagName.toLowerCase()}`;
            }
            return findings;
        });
    }
    /** WCAG 3.1.1 — Document must have a lang attribute */
    async checkDocumentLanguage(page) {
        return page.evaluate(() => {
            const findings = [];
            const lang = document.documentElement.getAttribute('lang');
            if (!lang) {
                findings.push({
                    ruleId: 'document-lang',
                    category: 'language-text',
                    severity: 'major',
                    wcagLevel: 'A',
                    wcagCriterion: '3.1.1',
                    message: 'Document missing lang attribute on <html> element',
                    selector: 'html',
                    htmlSnippet: `<html ${Array.from(document.documentElement.attributes).map(a => `${a.name}="${a.value}"`).join(' ')}>`.substring(0, 300),
                    remediation: 'Add a lang attribute to the <html> element (e.g., lang="en").',
                });
            }
            else if (lang.trim() === '') {
                findings.push({
                    ruleId: 'document-lang',
                    category: 'language-text',
                    severity: 'major',
                    wcagLevel: 'A',
                    wcagCriterion: '3.1.1',
                    message: 'Document has empty lang attribute',
                    selector: 'html',
                    htmlSnippet: `<html lang="">`,
                    remediation: 'Set the lang attribute to a valid language code (e.g., lang="en").',
                });
            }
            return findings;
        });
    }
    /** WCAG 2.4.4 — Links and buttons must have discernible text */
    async checkEmptyLinksAndButtons(page) {
        return page.evaluate(() => {
            const findings = [];
            // Check links
            const links = document.querySelectorAll('a[href]');
            for (const link of links) {
                const hasText = (link.textContent?.trim() || '').length > 0;
                const hasAriaLabel = !!link.getAttribute('aria-label');
                const hasAriaLabelledby = !!link.getAttribute('aria-labelledby');
                const hasTitle = !!link.getAttribute('title');
                const hasImg = !!link.querySelector('img[alt]:not([alt=""])');
                if (!hasText && !hasAriaLabel && !hasAriaLabelledby && !hasTitle && !hasImg) {
                    findings.push({
                        ruleId: 'link-name',
                        category: 'navigation-structure',
                        severity: 'major',
                        wcagLevel: 'A',
                        wcagCriterion: '2.4.4',
                        message: 'Link has no discernible text',
                        selector: buildSelector(link),
                        htmlSnippet: link.outerHTML.substring(0, 300),
                        remediation: 'Add text content, aria-label, or a titled image inside the link.',
                    });
                }
            }
            // Check buttons
            const buttons = document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]');
            for (const btn of buttons) {
                const hasText = (btn.textContent?.trim() || '').length > 0;
                const hasAriaLabel = !!btn.getAttribute('aria-label');
                const hasAriaLabelledby = !!btn.getAttribute('aria-labelledby');
                const hasTitle = !!btn.getAttribute('title');
                const hasValue = !!btn.getAttribute('value');
                if (!hasText && !hasAriaLabel && !hasAriaLabelledby && !hasTitle && !hasValue) {
                    findings.push({
                        ruleId: 'button-name',
                        category: 'navigation-structure',
                        severity: 'major',
                        wcagLevel: 'A',
                        wcagCriterion: '2.4.4',
                        message: 'Button has no discernible text',
                        selector: buildSelector(btn),
                        htmlSnippet: btn.outerHTML.substring(0, 300),
                        remediation: 'Add text content, aria-label, or a value attribute to the button.',
                    });
                }
            }
            function buildSelector(el) {
                if (el.id)
                    return `#${el.id}`;
                const tag = el.tagName.toLowerCase();
                const classes = Array.from(el.classList).slice(0, 2).join('.');
                return `${tag}${classes ? '.' + classes : ''}`;
            }
            return findings;
        });
    }
    /**
     * WCAG 1.4.3 — Color contrast placeholder.
     * Full contrast computation needs a rendering engine; for the POC we flag
     * elements with small text and inline color styles as candidates for review.
     */
    async checkColorContrastCandidates(page) {
        return page.evaluate(() => {
            const findings = [];
            const textElements = document.querySelectorAll('p, span, a, li, td, th, label, h1, h2, h3, h4, h5, h6, button, div');
            for (const el of textElements) {
                const text = el.textContent?.trim() || '';
                if (text.length === 0)
                    continue;
                const style = window.getComputedStyle(el);
                const color = style.color;
                const bgColor = style.backgroundColor;
                // Only flag elements where both fg and bg are explicitly set to non-default values
                // and they look suspiciously similar (basic heuristic)
                if (color && bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                    const fgRgb = parseRgb(color);
                    const bgRgb = parseRgb(bgColor);
                    if (fgRgb && bgRgb) {
                        const ratio = contrastRatio(fgRgb, bgRgb);
                        const fontSize = parseFloat(style.fontSize);
                        const isBold = parseInt(style.fontWeight, 10) >= 700 || style.fontWeight === 'bold';
                        const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && isBold);
                        const threshold = isLargeText ? 3.0 : 4.5;
                        if (ratio < threshold) {
                            findings.push({
                                ruleId: 'color-contrast',
                                category: 'color-contrast',
                                severity: ratio < 3.0 ? 'critical' : 'major',
                                wcagLevel: 'AA',
                                wcagCriterion: '1.4.3',
                                message: `Insufficient color contrast: ratio ${ratio.toFixed(2)}:1 (needs ${threshold}:1). Color: ${color}, Background: ${bgColor}`,
                                selector: buildSelector(el),
                                htmlSnippet: el.outerHTML.substring(0, 200),
                                remediation: `Increase contrast ratio to at least ${threshold}:1. Current ratio is ${ratio.toFixed(2)}:1.`,
                            });
                        }
                    }
                }
            }
            function parseRgb(color) {
                const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (!match)
                    return null;
                return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
            }
            function luminance(r, g, b) {
                const [rs, gs, bs] = [r, g, b].map(c => {
                    c = c / 255;
                    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
                });
                return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
            }
            function contrastRatio(fg, bg) {
                const l1 = luminance(...fg);
                const l2 = luminance(...bg);
                const lighter = Math.max(l1, l2);
                const darker = Math.min(l1, l2);
                return (lighter + 0.05) / (darker + 0.05);
            }
            function buildSelector(el) {
                if (el.id)
                    return `#${el.id}`;
                const tag = el.tagName.toLowerCase();
                return tag;
            }
            // Limit to first 20 contrast findings to avoid flooding
            return findings.slice(0, 20);
        });
    }
    /** Capture a full-page screenshot and attach to first N findings */
    async captureViolationScreenshots(page, findings) {
        try {
            const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
            const base64 = screenshot.toString('base64');
            // Attach the page screenshot to the first finding as a reference
            // (element-level screenshots are expensive; page-level is good for POC)
            if (findings.length > 0) {
                findings[0].screenshot = base64;
            }
        }
        catch {
            // Screenshot failed — non-fatal
        }
    }
}
//# sourceMappingURL=page-analyzer.js.map