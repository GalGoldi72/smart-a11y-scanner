/**
 * SiteMapper — Builds a complete site graph from crawled pages and detected interactions.
 *
 * Orchestrates UIDetector, FlowAnalyzer, and InteractionSimulator to create
 * a SiteGraph that the scanner engine can use to plan its scan.
 *
 * Owner: Bobbie (UI Expert)
 */
import { DEFAULT_CONFIG } from './types.js';
import { UIDetector } from './ui-detector.js';
import { FlowAnalyzer } from './flow-analyzer.js';
import { InteractionSimulator } from './interaction-simulator.js';
export class SiteMapper {
    config;
    detector;
    flowAnalyzer;
    simulator;
    graph;
    visitedUrls;
    urlQueue;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.detector = new UIDetector(this.config);
        this.flowAnalyzer = new FlowAnalyzer(this.config);
        this.simulator = new InteractionSimulator(this.config);
        this.graph = {
            seedUrl: '',
            pages: new Map(),
            edges: [],
            totalElements: 0,
            totalForms: 0,
            createdAt: Date.now(),
        };
        this.visitedUrls = new Set();
        this.urlQueue = [];
    }
    /**
     * Build a complete site graph starting from a seed URL.
     *
     * Uses a BrowserContext to open pages and crawl. Respects maxCrawlDepth
     * and maxPages from config.
     */
    async buildGraph(context, seedUrl) {
        this.graph.seedUrl = seedUrl;
        this.urlQueue = [seedUrl];
        let depth = 0;
        while (this.urlQueue.length > 0 && depth <= this.config.maxCrawlDepth) {
            const currentBatch = [...this.urlQueue];
            this.urlQueue = [];
            for (const url of currentBatch) {
                if (this.visitedUrls.has(this.normalizeUrl(url)))
                    continue;
                if (this.visitedUrls.size >= this.config.maxPages)
                    break;
                const page = await context.newPage();
                try {
                    const pageNode = await this.analyzePage(page, url, depth === 0 ? 'seed' : 'link');
                    this.graph.pages.set(this.normalizeUrl(url), pageNode);
                    this.visitedUrls.add(this.normalizeUrl(url));
                    // Extract new URLs from links on this page
                    const newUrls = this.extractLinks(pageNode, seedUrl);
                    for (const newUrl of newUrls) {
                        if (!this.visitedUrls.has(this.normalizeUrl(newUrl))) {
                            this.urlQueue.push(newUrl);
                            // Add edge
                            this.graph.edges.push({
                                from: url,
                                to: newUrl,
                                via: 'link',
                                triggerSelector: null,
                            });
                        }
                    }
                }
                catch (err) {
                    // Record failed page
                    this.graph.pages.set(this.normalizeUrl(url), {
                        url,
                        title: '',
                        discoveredVia: depth === 0 ? 'seed' : 'link',
                        elements: [],
                        flowAnalysis: null,
                        forms: [],
                        statusCode: null,
                        scanned: false,
                    });
                    this.visitedUrls.add(this.normalizeUrl(url));
                }
                finally {
                    await page.close();
                }
            }
            depth++;
        }
        // Compute totals
        this.graph.totalElements = 0;
        this.graph.totalForms = 0;
        for (const node of this.graph.pages.values()) {
            this.graph.totalElements += node.elements.length;
            this.graph.totalForms += node.forms.length;
        }
        return this.graph;
    }
    /**
     * Analyze a single page: navigate, detect elements, run flow analysis.
     */
    async analyzePage(page, url, discoveredVia) {
        // Navigate
        const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: this.config.timeout * 3,
        });
        // Allow JS to settle
        await page.waitForTimeout(1500);
        const statusCode = response?.status() ?? null;
        const title = await page.title();
        // Detect all interactive elements
        const elements = await this.detector.detectAll(page);
        // Run flow analysis
        let flowAnalysis = null;
        try {
            flowAnalysis = await this.flowAnalyzer.analyzeStructure(page, url);
        }
        catch (err) {
            console.warn(`[SiteMapper] Flow analysis failed for ${url}:`, err);
        }
        // Extract forms from flow analysis
        const forms = flowAnalysis?.forms ?? [];
        // Optionally simulate interactions to discover JS-driven navigation
        if (this.config.simulateInteractions) {
            await this.discoverInteractionEdges(page, url, elements);
        }
        return {
            url,
            title,
            discoveredVia,
            elements,
            flowAnalysis,
            forms,
            statusCode,
            scanned: true,
        };
    }
    /**
     * Simulate interactions to discover pages reachable only via JavaScript.
     * Clicks buttons and detects URL changes or new modal content.
     */
    async discoverInteractionEdges(page, sourceUrl, elements) {
        // Only try a limited set of elements to avoid taking too long
        const candidates = elements
            .filter((el) => el.isVisible &&
            !el.isDisabled &&
            (el.category === 'button' || el.category === 'link' || el.category === 'tab'))
            .slice(0, 15);
        for (const el of candidates) {
            try {
                const result = await this.simulator.click(page, el);
                if (result.domDelta.urlChanged && result.domDelta.newUrl) {
                    const newUrl = result.domDelta.newUrl;
                    if (this.isSameOrigin(newUrl, this.graph.seedUrl)) {
                        this.graph.edges.push({
                            from: sourceUrl,
                            to: newUrl,
                            via: el.category === 'link' ? 'link' : el.tag === 'form' ? 'form-submit' : 'button',
                            triggerSelector: el.selector,
                        });
                        if (!this.visitedUrls.has(this.normalizeUrl(newUrl))) {
                            this.urlQueue.push(newUrl);
                        }
                        // Navigate back to continue exploration
                        await page.goBack({ waitUntil: 'domcontentloaded', timeout: this.config.timeout * 2 });
                        await page.waitForTimeout(500);
                    }
                }
                if (result.domDelta.modalAppeared) {
                    this.graph.edges.push({
                        from: sourceUrl,
                        to: `${sourceUrl}#modal-${el.selector}`,
                        via: 'javascript',
                        triggerSelector: el.selector,
                    });
                    // Close modal by pressing Escape
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(300);
                }
            }
            catch {
                // Interaction failed — move on
            }
        }
    }
    /**
     * Extract same-origin link URLs from a page node's detected elements.
     */
    extractLinks(pageNode, seedUrl) {
        const links = [];
        for (const el of pageNode.elements) {
            if (el.category === 'link' && el.tag === 'a') {
                // Extract href from the selector or ariaAttributes
                // Links detected by UIDetector have href in their selector context
                // We need to get the actual href from the page — fall back to trigger relationships
                // For POC, we extract links from the flow analysis triggers
            }
        }
        // Get links from flow analysis triggers
        if (pageNode.flowAnalysis) {
            for (const trigger of pageNode.flowAnalysis.triggers) {
                if (trigger.action === 'navigates' && trigger.targetSelector) {
                    try {
                        const url = new URL(trigger.targetSelector, pageNode.url);
                        if (this.isSameOrigin(url.href, seedUrl)) {
                            links.push(url.href);
                        }
                    }
                    catch {
                        // Invalid URL — skip
                    }
                }
            }
        }
        return [...new Set(links)];
    }
    /**
     * Check if a URL is same-origin as the seed URL.
     */
    isSameOrigin(url, seedUrl) {
        try {
            const a = new URL(url);
            const b = new URL(seedUrl);
            return a.origin === b.origin;
        }
        catch {
            return false;
        }
    }
    /**
     * Normalize a URL by removing fragments and trailing slashes.
     */
    normalizeUrl(url) {
        try {
            const parsed = new URL(url);
            parsed.hash = '';
            let normalized = parsed.href;
            if (normalized.endsWith('/'))
                normalized = normalized.slice(0, -1);
            return normalized;
        }
        catch {
            return url;
        }
    }
    /**
     * Get the current graph (for inspection or serialization).
     */
    getGraph() {
        return this.graph;
    }
    /**
     * Serialize the graph to a JSON-safe format.
     * (Map doesn't serialize to JSON, so we convert to a plain object)
     */
    toJSON() {
        return {
            seedUrl: this.graph.seedUrl,
            pages: Object.fromEntries(this.graph.pages),
            edges: this.graph.edges,
            totalElements: this.graph.totalElements,
            totalForms: this.graph.totalForms,
            createdAt: this.graph.createdAt,
        };
    }
}
//# sourceMappingURL=site-mapper.js.map