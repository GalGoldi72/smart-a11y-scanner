/**
 * Crawler — discovers pages on a website by following links.
 *
 * Uses Playwright to render pages (handles JS-rendered content), extracts
 * same-domain links, deduplicates, and respects depth limits.
 */
import { BrowserContext, Page } from 'playwright';
import { ScanConfig, PageLink } from './types.js';
/** Result of crawling a single URL */
export interface CrawlPageResult {
    url: string;
    page: Page;
    links: PageLink[];
    error?: string;
}
export declare class Crawler {
    private config;
    private visited;
    private queue;
    private links;
    private baseDomain;
    private robotRules;
    constructor(config: ScanConfig);
    /** Crawl starting from config.url, return ordered list of URLs to scan */
    discoverPages(context: BrowserContext): Promise<{
        urls: string[];
        links: PageLink[];
    }>;
    /** Extract all links from a page */
    private extractLinks;
    /** Fetch and parse robots.txt (basic disallow parsing) */
    private loadRobotsTxt;
    private parseRobotsTxt;
    private isDisallowedByRobots;
    /** Check if a URL should be followed based on config */
    private shouldFollow;
    /** Normalize URL: remove hash, trailing slash, sort query params */
    private normalizeUrl;
}
//# sourceMappingURL=crawler.d.ts.map