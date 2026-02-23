/**
 * Type definitions for UI detection and flow analysis.
 *
 * These types are owned by Bobbie (UI Expert).
 * The scanner engine (Naomi) consumes ElementInfo and FlowGraph
 * to decide what to scan and in what order.
 */
/** Sensible defaults */
export const DEFAULT_CONFIG = {
    timeout: 5000,
    includeIframes: true,
    includeShadowDom: true,
    detectEventListeners: true,
    maxElementsPerPage: 5000,
    maxCrawlDepth: 2,
    maxPages: 50,
    simulateInteractions: true,
    formTestData: {
        email: 'test@example.com',
        password: 'TestP@ss123',
        text: 'Test input',
        search: 'accessibility',
        tel: '+1234567890',
        url: 'https://example.com',
        number: '42',
    },
};
//# sourceMappingURL=types.js.map