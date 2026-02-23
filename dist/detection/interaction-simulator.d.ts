/**
 * InteractionSimulator — Simulates user interactions on detected elements
 * and records DOM changes before/after each action.
 *
 * Uses Playwright to click, hover, fill, tab, and scroll, then captures
 * a DomDelta showing what changed. This feeds the scanner engine's
 * understanding of dynamic content.
 *
 * Owner: Bobbie (UI Expert)
 */
import type { Page } from 'playwright';
import type { ElementInfo, InteractionResult, DetectionConfig } from './types.js';
export declare class InteractionSimulator {
    private config;
    constructor(config?: Partial<DetectionConfig>);
    /**
     * Simulate a click on an element and record what changes.
     */
    click(page: Page, element: ElementInfo): Promise<InteractionResult>;
    /**
     * Simulate hovering over an element to detect hover-dependent content.
     */
    hover(page: Page, element: ElementInfo): Promise<InteractionResult>;
    /**
     * Focus an element (without clicking) and detect what appears.
     */
    focus(page: Page, element: ElementInfo): Promise<InteractionResult>;
    /**
     * Fill a form field with test data appropriate to its type.
     */
    fill(page: Page, element: ElementInfo): Promise<InteractionResult>;
    /**
     * Tab through the page to trace keyboard navigation.
     * Returns results for each Tab press until we cycle back to the start
     * or hit a maximum.
     */
    tabThrough(page: Page, maxSteps?: number): Promise<InteractionResult[]>;
    /**
     * Scroll the page and detect lazy-loaded content.
     * Scrolls in increments, recording new elements appearing after each scroll.
     */
    scrollAndDetect(page: Page): Promise<InteractionResult[]>;
    /**
     * Run a batch of interactions on a list of elements.
     * Clicks visible buttons, hovers on items with tooltips, fills form fields.
     */
    interactWithAll(page: Page, elements: ElementInfo[]): Promise<InteractionResult[]>;
    /**
     * Take a snapshot of the current DOM state.
     */
    private takeSnapshot;
    /**
     * Compute the delta between two DOM snapshots.
     */
    private computeDelta;
    /**
     * Build an InteractionResult from before/after snapshots.
     */
    private buildResult;
    private errorMessage;
    private guessInputType;
}
//# sourceMappingURL=interaction-simulator.d.ts.map