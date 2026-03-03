/**
 * Tests for error page detection and URL rewriting logic in guided-explorer.
 * These are the core smart navigation functions that handle error page fallback.
 */
import { describe, it, expect } from 'vitest';
import {
  ERROR_PAGE_INDICATORS,
  rewriteUrlForTarget,
  isErrorPageContent,
} from '../scanner/guided-explorer.js';

// ---------------------------------------------------------------------------
// ERROR_PAGE_INDICATORS + isErrorPageContent
// ---------------------------------------------------------------------------
describe('isErrorPageContent', () => {
  it('detects "Oops! We ran into a problem" (the bug that prompted these tests)', () => {
    const pageText = 'Oops! We ran into a problem while loading this page, please refresh.';
    expect(isErrorPageContent(pageText)).toBe(true);
  });

  it('detects "page not found"', () => {
    expect(isErrorPageContent('Sorry, the page not found')).toBe(true);
  });

  it('detects "access denied"', () => {
    expect(isErrorPageContent('Access Denied - you cannot view this resource')).toBe(true);
  });

  it('detects "something went wrong"', () => {
    expect(isErrorPageContent('Something went wrong. Try again later.')).toBe(true);
  });

  it('detects "403" status text', () => {
    expect(isErrorPageContent('Error 403 Forbidden')).toBe(true);
  });

  it('detects "404" status text', () => {
    expect(isErrorPageContent('Error 404 - Not Found')).toBe(true);
  });

  it('detects "failed to load"', () => {
    expect(isErrorPageContent('Failed to load the requested resource')).toBe(true);
  });

  it('detects "this page isn\'t working"', () => {
    expect(isErrorPageContent("This page isn't working right now")).toBe(true);
  });

  it('detects case-insensitively', () => {
    expect(isErrorPageContent('OOPS! Something WENT WRONG')).toBe(true);
  });

  it('returns false for normal page content', () => {
    expect(isErrorPageContent('Welcome to the Security Dashboard. Monitor your devices and compliance.')).toBe(false);
  });

  it('returns false for empty text', () => {
    expect(isErrorPageContent('')).toBe(false);
  });

  it('returns false for pages that mention "page" in normal context', () => {
    expect(isErrorPageContent('This page shows your compliance score')).toBe(false);
  });

  it('includes all expected indicators', () => {
    // Verify the indicator list covers our known patterns
    const expected = ['oops', 'ran into a problem', 'please refresh', 'something went wrong',
      'page not found', 'access denied', 'forbidden', '404', '403',
      'failed to load', 'unable to load', 'error loading'];
    for (const indicator of expected) {
      expect(ERROR_PAGE_INDICATORS).toContain(indicator);
    }
  });
});

// ---------------------------------------------------------------------------
// rewriteUrlForTarget
// ---------------------------------------------------------------------------
describe('rewriteUrlForTarget', () => {
  const scanTarget = 'https://security.microsoft.com/homepage?tid=my-tenant-id';

  it('replaces tid with scan target tenant', () => {
    const original = 'https://security.microsoft.com/page?tid=other-tenant';
    const urls = rewriteUrlForTarget(original, scanTarget);
    expect(urls[0]).toContain('tid=my-tenant-id');
    expect(urls[0]).not.toContain('other-tenant');
  });

  it('generates fallback URL without id param', () => {
    const original = 'https://security.microsoft.com/resource?viewid=data&id=abc123&tid=old';
    const urls = rewriteUrlForTarget(original, scanTarget);

    // Should have at least 3 variants: full, no-id, path-only
    expect(urls.length).toBeGreaterThanOrEqual(3);

    // First URL keeps id
    expect(urls[0]).toContain('id=abc123');
    // Second URL removes id
    expect(urls[1]).not.toContain('id=abc123');
    expect(urls[1]).toContain('viewid=data');
    // Third URL is path-only with tid and viewid
    expect(urls[2]).toContain('tid=my-tenant-id');
    expect(urls[2]).toContain('viewid=data');
  });

  it('adds tid when original URL lacks it', () => {
    const original = 'https://security.microsoft.com/dashboard';
    const urls = rewriteUrlForTarget(original, scanTarget);
    expect(urls[0]).toContain('tid=my-tenant-id');
  });

  it('decodes &amp; entities before parsing', () => {
    const original = 'https://security.microsoft.com/page?viewid=test&amp;tid=old-tenant&amp;id=res123';
    const urls = rewriteUrlForTarget(original, scanTarget);
    // Should parse correctly despite &amp;
    expect(urls[0]).toContain('tid=my-tenant-id');
    expect(urls.length).toBeGreaterThanOrEqual(2);
  });

  it('returns original URL for non-Microsoft domains', () => {
    const original = 'https://example.com/page?tid=abc';
    const urls = rewriteUrlForTarget(original, scanTarget);
    expect(urls).toEqual([original]);
  });

  it('rewrites cross-domain Microsoft portal URLs', () => {
    const original = 'https://portal.azure.com/resource?tid=old';
    const urls = rewriteUrlForTarget(original, scanTarget);
    // Should rewrite because portal.azure.com is a known MS portal
    expect(urls[0]).toContain('security.microsoft.com');
    expect(urls[0]).toContain('tid=my-tenant-id');
  });

  it('deduplicates identical fallback URLs', () => {
    // When URL has no id param, fallback 1 and 2 would be same
    const original = 'https://security.microsoft.com/page?tid=old';
    const urls = rewriteUrlForTarget(original, scanTarget);
    const unique = new Set(urls);
    expect(urls.length).toBe(unique.size);
  });

  it('handles invalid URL gracefully', () => {
    const urls = rewriteUrlForTarget('not-a-url', scanTarget);
    expect(urls).toEqual(['not-a-url']);
  });

  it('preserves path when rewriting', () => {
    const original = 'https://security.microsoft.com/cloud-resource/v2?viewid=sensitive-data&tid=old';
    const urls = rewriteUrlForTarget(original, scanTarget);
    expect(urls[0]).toContain('/cloud-resource/v2');
  });

  it('handles the exact URL that caused the scanner to get stuck', () => {
    // This is the real-world URL from the bug report
    const original = 'https://security.microsoft.com/cloud-resource/v2?viewid=sensitive-data&amp;id=00000000111122223333444444444444&amp;tid=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const urls = rewriteUrlForTarget(original, scanTarget);

    // First URL: full rewrite with id kept
    expect(urls[0]).toContain('tid=my-tenant-id');
    expect(urls[0]).toContain('id=00000000111122223333444444444444');

    // Second URL: without the resource id (this is the key fallback!)
    expect(urls[1]).not.toContain('id=00000000111122223333444444444444');
    expect(urls[1]).toContain('viewid=sensitive-data');

    // Third URL: path + meaningful params only
    expect(urls[2]).toContain('/cloud-resource/v2');
    expect(urls[2]).toContain('tid=my-tenant-id');
  });
});
