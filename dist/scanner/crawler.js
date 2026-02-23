/**
 * Crawler — discovers pages on a website by following links.
 *
 * Uses Playwright to render pages (handles JS-rendered content), extracts
 * same-domain links, deduplicates, and respects depth limits.
 */
export class Crawler {
    config;
    visited = new Set();
    queue = [];
    links = [];
    baseDomain;
    robotRules = { disallowedPaths: [] };
    constructor(config) {
        this.config = config;
        this.baseDomain = new URL(config.url).hostname;
    }
    /** Crawl starting from config.url, return ordered list of URLs to scan */
    async discoverPages(context) {
        // Try to fetch robots.txt before crawling
        await this.loadRobotsTxt(context);
        const startUrl = this.normalizeUrl(this.config.url);
        this.queue.push({ url: startUrl, depth: 0 });
        const orderedUrls = [];
        while (this.queue.length > 0 && orderedUrls.length < this.config.maxPages) {
            const item = this.queue.shift();
            const normalized = this.normalizeUrl(item.url);
            if (this.visited.has(normalized))
                continue;
            if (this.isDisallowedByRobots(normalized))
                continue;
            this.visited.add(normalized);
            orderedUrls.push(normalized);
            // Only follow links if we haven't hit max depth
            if (item.depth < this.config.maxDepth) {
                const pageLinks = await this.extractLinks(context, normalized);
                for (const link of pageLinks) {
                    this.links.push(link);
                    const targetNorm = this.normalizeUrl(link.targetUrl);
                    if (!this.visited.has(targetNorm) && this.shouldFollow(targetNorm)) {
                        this.queue.push({ url: targetNorm, depth: item.depth + 1 });
                    }
                }
            }
        }
        return { urls: orderedUrls, links: this.links };
    }
    /** Extract all links from a page */
    async extractLinks(context, url) {
        const page = await context.newPage();
        const pageLinks = [];
        try {
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: this.config.pageTimeoutMs,
            });
            // Wait briefly for JS-rendered content
            await page.waitForTimeout(1000);
            const rawLinks = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a[href]'));
                return anchors.map(a => ({
                    href: a.href,
                    text: a.textContent?.trim() || '',
                }));
            });
            for (const raw of rawLinks) {
                try {
                    const resolved = new URL(raw.href, url).href;
                    pageLinks.push({
                        sourceUrl: url,
                        targetUrl: resolved,
                        linkText: raw.text.substring(0, 200),
                    });
                }
                catch {
                    // Skip malformed URLs
                }
            }
        }
        catch (err) {
            // Navigation failed — page might be down, timeout, etc.
            // We still continue crawling other URLs
        }
        finally {
            await page.close();
        }
        return pageLinks;
    }
    /** Fetch and parse robots.txt (basic disallow parsing) */
    async loadRobotsTxt(context) {
        const page = await context.newPage();
        try {
            const robotsUrl = new URL('/robots.txt', this.config.url).href;
            const response = await page.goto(robotsUrl, { timeout: 5000 });
            if (response && response.ok()) {
                const text = await response.text();
                this.parseRobotsTxt(text);
            }
        }
        catch {
            // No robots.txt or fetch failed — allow everything
        }
        finally {
            await page.close();
        }
    }
    parseRobotsTxt(text) {
        const lines = text.split('\n');
        let relevantSection = false;
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (line.toLowerCase().startsWith('user-agent:')) {
                const agent = line.split(':')[1]?.trim().toLowerCase() || '';
                relevantSection = agent === '*' || agent.includes('bot');
            }
            else if (relevantSection && line.toLowerCase().startsWith('disallow:')) {
                const path = line.split(':').slice(1).join(':').trim();
                if (path) {
                    this.robotRules.disallowedPaths.push(path);
                }
            }
        }
    }
    isDisallowedByRobots(url) {
        try {
            const pathname = new URL(url).pathname;
            return this.robotRules.disallowedPaths.some(disallowed => pathname.startsWith(disallowed));
        }
        catch {
            return false;
        }
    }
    /** Check if a URL should be followed based on config */
    shouldFollow(url) {
        try {
            const parsed = new URL(url);
            // Same domain check
            if (this.config.sameDomainOnly && parsed.hostname !== this.baseDomain) {
                return false;
            }
            // Only follow http/https
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return false;
            }
            // Skip common non-page resources
            const skipExtensions = [
                '.pdf', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.svg',
                '.css', '.js', '.ico', '.woff', '.woff2', '.ttf', '.eot',
                '.mp3', '.mp4', '.avi', '.mov', '.xml', '.json',
            ];
            const pathLower = parsed.pathname.toLowerCase();
            if (skipExtensions.some(ext => pathLower.endsWith(ext))) {
                return false;
            }
            return true;
        }
        catch {
            return false;
        }
    }
    /** Normalize URL: remove hash, trailing slash, sort query params */
    normalizeUrl(url) {
        try {
            const parsed = new URL(url);
            parsed.hash = '';
            // Remove trailing slash (except for root)
            if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
                parsed.pathname = parsed.pathname.slice(0, -1);
            }
            parsed.searchParams.sort();
            return parsed.href;
        }
        catch {
            return url;
        }
    }
}
//# sourceMappingURL=crawler.js.map