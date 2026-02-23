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
import { Page } from 'playwright';
import { PageResult } from './types.js';
import { ScanConfig } from './types.js';
export declare class PageAnalyzer {
    private config;
    constructor(config: ScanConfig);
    analyze(page: Page, url: string): Promise<PageResult>;
    private extractMetadata;
    /** WCAG 1.1.1 — Images must have alt text */
    private checkImagesAltText;
    /** WCAG 1.3.1 / 4.1.2 — Form inputs must have associated labels */
    private checkFormLabels;
    /** WCAG 1.3.1 — Heading levels should not skip */
    private checkHeadingHierarchy;
    /** WCAG 3.1.1 — Document must have a lang attribute */
    private checkDocumentLanguage;
    /** WCAG 2.4.4 — Links and buttons must have discernible text */
    private checkEmptyLinksAndButtons;
    /**
     * WCAG 1.4.3 — Color contrast placeholder.
     * Full contrast computation needs a rendering engine; for the POC we flag
     * elements with small text and inline color styles as candidates for review.
     */
    private checkColorContrastCandidates;
    /** Capture a full-page screenshot and attach to first N findings */
    private captureViolationScreenshots;
}
//# sourceMappingURL=page-analyzer.d.ts.map