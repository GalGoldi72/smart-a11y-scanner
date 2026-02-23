/**
 * SiteMapper — Builds a complete site graph from crawled pages and detected interactions.
 *
 * Orchestrates UIDetector, FlowAnalyzer, and InteractionSimulator to create
 * a SiteGraph that the scanner engine can use to plan its scan.
 *
 * Owner: Bobbie (UI Expert)
 */
import type { BrowserContext } from 'playwright';
import type { SiteGraph, DetectionConfig } from './types.js';
export declare class SiteMapper {
    private config;
    private detector;
    private flowAnalyzer;
    private simulator;
    private graph;
    private visitedUrls;
    private urlQueue;
    constructor(config?: Partial<DetectionConfig>);
    /**
     * Build a complete site graph starting from a seed URL.
     *
     * Uses a BrowserContext to open pages and crawl. Respects maxCrawlDepth
     * and maxPages from config.
     */
    buildGraph(context: BrowserContext, seedUrl: string): Promise<SiteGraph>;
    /**
     * Analyze a single page: navigate, detect elements, run flow analysis.
     */
    private analyzePage;
    /**
     * Simulate interactions to discover pages reachable only via JavaScript.
     * Clicks buttons and detects URL changes or new modal content.
     */
    private discoverInteractionEdges;
    /**
     * Extract same-origin link URLs from a page node's detected elements.
     */
    private extractLinks;
    /**
     * Check if a URL is same-origin as the seed URL.
     */
    private isSameOrigin;
    /**
     * Normalize a URL by removing fragments and trailing slashes.
     */
    private normalizeUrl;
    /**
     * Get the current graph (for inspection or serialization).
     */
    getGraph(): SiteGraph;
    /**
     * Serialize the graph to a JSON-safe format.
     * (Map doesn't serialize to JSON, so we convert to a plain object)
     */
    toJSON(): object;
}
//# sourceMappingURL=site-mapper.d.ts.map