/**
 * Scanner engine types.
 * Data structures for the scan pipeline:
 *   URL → crawl → detect elements → run checks → collect findings → report
 */
export const DEFAULT_SCAN_CONFIG = {
    url: '',
    maxDepth: 1,
    sameDomainOnly: true,
    maxPages: 20,
    pageTimeoutMs: 30_000,
    headless: true,
    viewportWidth: 1280,
    viewportHeight: 720,
    captureScreenshots: true,
};
//# sourceMappingURL=types.js.map