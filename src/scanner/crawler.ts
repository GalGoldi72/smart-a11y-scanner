/**
 * Crawler — discovers pages on a website by following links.
 *
 * Uses Playwright to render pages (handles JS-rendered content), extracts
 * same-domain links, deduplicates, and respects depth limits.
 */

import { Browser, BrowserContext, Page } from 'playwright';
import { ScanConfig, PageLink } from './types.js';

/** Result of crawling a single URL */
export interface CrawlPageResult {
  url: string;
  page: Page;
  links: PageLink[];
  error?: string;
}

/** Robot rules — basic path disallow list */
interface RobotRules {
  disallowedPaths: string[];
}

export class Crawler {
  private visited = new Set<string>();
  private queue: Array<{ url: string; depth: number }> = [];
  private links: PageLink[] = [];
  private baseDomain: string;
  private robotRules: RobotRules = { disallowedPaths: [] };

  constructor(private config: ScanConfig) {
    this.baseDomain = new URL(config.url).hostname;
  }

  /** Crawl starting from config.url, return ordered list of URLs to scan */
  async discoverPages(context: BrowserContext, deadline?: number): Promise<{
    urls: string[];
    links: PageLink[];
  }> {
    // Try to fetch robots.txt before crawling
    await this.loadRobotsTxt(context);

    const startUrl = this.normalizeUrl(this.config.url);
    this.queue.push({ url: startUrl, depth: 0 });

    const orderedUrls: string[] = [];

    while (this.queue.length > 0 && orderedUrls.length < this.config.maxPages) {
      // Check timeout before processing each URL
      if (deadline && Date.now() >= deadline) {
        break;
      }

      const item = this.queue.shift()!;
      const normalized = this.normalizeUrl(item.url);

      if (this.visited.has(normalized)) continue;
      if (this.isDisallowedByRobots(normalized)) continue;

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
  private async extractLinks(context: BrowserContext, url: string): Promise<PageLink[]> {
    const page = await context.newPage();
    const pageLinks: PageLink[] = [];

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
          href: (a as HTMLAnchorElement).href,
          text: (a as HTMLAnchorElement).textContent?.trim() || '',
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
        } catch {
          // Skip malformed URLs
        }
      }

      // SPA route discovery — click navigation elements to find client-side routes
      if (this.config.spaDiscovery) {
        const spaLinks = await this.discoverSpaRoutes(context, page, url);
        pageLinks.push(...spaLinks);
      }
    } catch (err) {
      // Navigation failed — page might be down, timeout, etc.
      // We still continue crawling other URLs
    } finally {
      await page.close();
    }

    return pageLinks;
  }

  /**
   * Discover SPA routes by clicking navigation elements and observing URL changes.
   * Targets: nav links, role=link/tab/menuitem, buttons in nav/header/sidebar,
   * data-href, routerlink, and hash/javascript links with click handlers.
   */
  private async discoverSpaRoutes(
    context: BrowserContext,
    page: Page,
    sourceUrl: string,
  ): Promise<PageLink[]> {
    const discovered: PageLink[] = [];
    const seenUrls = new Set<string>();

    // Collect clickable nav element handles from the live page
    const spaSelector = [
      'nav a',
      '[role="link"]',
      '[role="tab"]',
      '[role="menuitem"]',
      'nav button',
      'header button',
      '[class*="sidebar"] button',
      '[class*="nav"] button',
      '[data-href]',
      '[routerlink]',
      'a[href="#"]',
      'a[href^="javascript:"]',
    ].join(', ');

    const candidates = await page.evaluate((sel: string) => {
      const els = Array.from(document.querySelectorAll(sel));
      // Deduplicate and collect info for each element
      return els.map((el, idx) => ({
        index: idx,
        text: (el.textContent?.trim() || '').substring(0, 100),
        tag: el.tagName.toLowerCase(),
        visible: !!(el as HTMLElement).offsetParent || (el as HTMLElement).offsetHeight > 0,
      })).filter(c => c.visible && c.text.length > 0);
    }, spaSelector);

    // Limit to avoid spending too long — click up to 30 nav elements
    const maxClicks = Math.min(candidates.length, 30);

    for (let i = 0; i < maxClicks; i++) {
      const candidate = candidates[i];
      try {
        // Re-query elements each iteration since DOM may have changed
        const elements = await page.$$(spaSelector);
        const el = elements[candidate.index];
        if (!el) continue;

        // Verify element is still visible and interactable
        const isVisible = await el.isVisible().catch(() => false);
        if (!isVisible) continue;

        const urlBefore = page.url();

        await el.click({ timeout: 3000 });
        // Wait for potential SPA navigation
        await page.waitForTimeout(2000);

        const urlAfter = page.url();

        if (urlAfter !== urlBefore && !seenUrls.has(urlAfter)) {
          try {
            const parsed = new URL(urlAfter);
            // Only keep same-domain navigations
            if (parsed.hostname === this.baseDomain) {
              seenUrls.add(urlAfter);
              const normalized = this.normalizeUrl(urlAfter);
              const pathDisplay = parsed.pathname + parsed.hash;
              console.log(`  → SPA route discovered: ${pathDisplay} (via nav click)`);
              discovered.push({
                sourceUrl,
                targetUrl: normalized,
                linkText: `[SPA] ${candidate.text}`,
              });
            }
          } catch {
            // Malformed URL — skip
          }

          // Navigate back to source for next click
          try {
            await page.goto(sourceUrl, {
              waitUntil: 'domcontentloaded',
              timeout: this.config.pageTimeoutMs,
            });
            await page.waitForTimeout(1000);
          } catch {
            // Can't navigate back — stop SPA discovery for this page
            break;
          }
        }
      } catch {
        // Click failed (element detached, timeout, etc.) — skip and continue
      }
    }

    return discovered;
  }

  /** Fetch and parse robots.txt (basic disallow parsing) */
  private async loadRobotsTxt(context: BrowserContext): Promise<void> {
    const page = await context.newPage();
    try {
      const robotsUrl = new URL('/robots.txt', this.config.url).href;
      const response = await page.goto(robotsUrl, { timeout: 5000 });
      if (response && response.ok()) {
        const text = await response.text();
        this.parseRobotsTxt(text);
      }
    } catch {
      // No robots.txt or fetch failed — allow everything
    } finally {
      await page.close();
    }
  }

  private parseRobotsTxt(text: string): void {
    const lines = text.split('\n');
    let relevantSection = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.toLowerCase().startsWith('user-agent:')) {
        const agent = line.split(':')[1]?.trim().toLowerCase() || '';
        relevantSection = agent === '*' || agent.includes('bot');
      } else if (relevantSection && line.toLowerCase().startsWith('disallow:')) {
        const path = line.split(':').slice(1).join(':').trim();
        if (path) {
          this.robotRules.disallowedPaths.push(path);
        }
      }
    }
  }

  private isDisallowedByRobots(url: string): boolean {
    try {
      const pathname = new URL(url).pathname;
      return this.robotRules.disallowedPaths.some(
        disallowed => pathname.startsWith(disallowed)
      );
    } catch {
      return false;
    }
  }

  /** Check if a URL should be followed based on config */
  private shouldFollow(url: string): boolean {
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
    } catch {
      return false;
    }
  }

  /** Normalize URL: remove hash, trailing slash, sort query params */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      // Remove trailing slash (except for root)
      if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }
      parsed.searchParams.sort();
      return parsed.href;
    } catch {
      return url;
    }
  }
}
