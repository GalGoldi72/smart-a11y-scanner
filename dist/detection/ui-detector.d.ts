/**
 * UIDetector — Detects all interactive elements on a Playwright page.
 *
 * Takes a Playwright Page, crawls the DOM (including shadow DOM and iframes),
 * and returns structured ElementInfo objects for every interactive element found.
 *
 * Owner: Bobbie (UI Expert)
 */
import type { Page } from 'playwright';
import type { ElementInfo, ElementCategory, DetectionConfig } from './types.js';
export declare class UIDetector {
    private config;
    constructor(config?: Partial<DetectionConfig>);
    /**
     * Detect all interactive elements on the page.
     * Returns a flat array covering the main frame, shadow DOMs, and iframes.
     */
    detectAll(page: Page): Promise<ElementInfo[]>;
    /**
     * Detect interactive elements within a single frame.
     */
    private detectInFrame;
    /** Detect interactive elements inside all iframes on the page. */
    private detectInIframes;
    /**
     * Use CDP to detect event listeners on elements.
     * Falls back gracefully if CDP is unavailable (e.g., Firefox).
     */
    private detectEventListeners;
    /** Returns only visible, focusable elements — for keyboard nav analysis. */
    detectFocusable(page: Page): Promise<ElementInfo[]>;
    /** Detect only elements matching a specific category. */
    detectByCategory(page: Page, category: ElementCategory): Promise<ElementInfo[]>;
}
//# sourceMappingURL=ui-detector.d.ts.map