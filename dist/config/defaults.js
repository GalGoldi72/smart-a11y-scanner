/**
 * Default configuration values.
 *
 * Merged with user-supplied config (user config wins).
 */
export const DEFAULT_CONFIG = {
    targetUrl: '',
    crawlDepth: 2,
    maxPages: 100,
    pageTimeout: 10_000,
    crawlExclusions: [],
    respectRobotsTxt: true,
    viewport: { width: 1280, height: 720 },
    minSeverity: 'minor',
    wcagLevel: 'AA',
    ado: null,
    report: {
        formats: ['html', 'json'],
        outputDir: './a11y-reports',
        includeScreenshots: true,
    },
    fileBugs: false,
    failOnSeverity: null,
};
//# sourceMappingURL=defaults.js.map