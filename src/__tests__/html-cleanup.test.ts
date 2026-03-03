/**
 * Tests for HTML/URL cleanup utility functions exported from test-case-importer.
 * These functions handle the messy ADO XML → plain text pipeline.
 */
import { describe, it, expect } from 'vitest';
import { stripHtml, cleanActionText, cleanUrlEntities } from '../ado/test-case-importer.js';

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------
describe('stripHtml', () => {
  it('removes simple HTML tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello');
  });

  it('removes nested HTML tags', () => {
    expect(stripHtml('<div><span>Click <b>here</b></span></div>')).toBe('Click here');
  });

  it('decodes HTML entities and strips resulting tags', () => {
    // &lt;button&gt; decodes to <button> which is a valid tag → gets stripped
    expect(stripHtml('&lt;button&gt;')).toBe('');
  });

  it('handles double-encoded entities from ADO XML', () => {
    // &amp;lt;div&amp;gt; → &lt;div&gt; → <div> → stripped as tag
    expect(stripHtml('&amp;lt;div&amp;gt;')).toBe('');
  });

  it('handles triple-encoded entities', () => {
    expect(stripHtml('&amp;amp;lt;p&amp;amp;gt;')).toBe('');
  });

  it('preserves text around decoded entity tags', () => {
    expect(stripHtml('Click &lt;b&gt;here&lt;/b&gt; now')).toBe('Click here now');
  });

  it('removes orphan angle brackets left after entity decode', () => {
    // This was the bug: "Click on 'Cloud' >" after entity decode
    expect(stripHtml('Click on &gt; Cloud')).toBe('Click on Cloud');
  });

  it('removes orphan < left after entity decode', () => {
    expect(stripHtml('Navigate &lt; to page')).toBe('Navigate to page');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('  too   many    spaces  ')).toBe('too many spaces');
  });

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('');
  });

  it('handles text with no HTML', () => {
    expect(stripHtml('plain text')).toBe('plain text');
  });

  it('decodes &nbsp; to space', () => {
    expect(stripHtml('hello&nbsp;world')).toBe('hello world');
  });

  it('decodes &quot; and &#39;', () => {
    expect(stripHtml('say &quot;hello&quot; and &#39;bye&#39;')).toBe('say "hello" and \'bye\'');
  });

  it('handles real ADO step content with mixed tags and entities', () => {
    const input = '<DIV><P>Click on &quot;Cloud&quot; from the left navigation&nbsp;</P></DIV>';
    expect(stripHtml(input)).toBe('Click on "Cloud" from the left navigation');
  });
});

// ---------------------------------------------------------------------------
// cleanActionText
// ---------------------------------------------------------------------------
describe('cleanActionText', () => {
  it('truncates at "Related page will" boundary', () => {
    expect(cleanActionText("Click on 'Cloud' from the left navigation Related page will display"))
      .toBe("Click on 'Cloud' from the left navigation");
  });

  it('truncates at "verify that" boundary', () => {
    expect(cleanActionText('Open the settings panel Verify that the toggle is visible'))
      .toBe('Open the settings panel');
  });

  it('truncates at "page should display" boundary', () => {
    expect(cleanActionText('Click the button Page should display the results'))
      .toBe('Click the button');
  });

  it('truncates at "user should see" boundary', () => {
    expect(cleanActionText('Navigate to dashboard User should see the chart'))
      .toBe('Navigate to dashboard');
  });

  it('does NOT truncate if action text would be too short', () => {
    // Match at position < 10 → keep the full text
    expect(cleanActionText('Click Verify that it works')).toBe('Click Verify that it works');
  });

  it('returns original text when no result phrase found', () => {
    expect(cleanActionText('Click on the submit button')).toBe('Click on the submit button');
  });

  it('handles empty string', () => {
    expect(cleanActionText('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// cleanUrlEntities
// ---------------------------------------------------------------------------
describe('cleanUrlEntities', () => {
  it('decodes &amp; in URLs', () => {
    expect(cleanUrlEntities('https://example.com?a=1&amp;b=2'))
      .toBe('https://example.com?a=1&b=2');
  });

  it('decodes multiple &amp; in a single URL', () => {
    expect(cleanUrlEntities('https://example.com?a=1&amp;b=2&amp;c=3'))
      .toBe('https://example.com?a=1&b=2&c=3');
  });

  it('decodes &lt; and &gt;', () => {
    expect(cleanUrlEntities('https://example.com?filter=value&lt;10'))
      .toBe('https://example.com?filter=value<10');
  });

  it('decodes &quot; and &#39;', () => {
    expect(cleanUrlEntities('https://example.com?q=&quot;test&#39;'))
      .toBe('https://example.com?q="test\'');
  });

  it('passes through clean URL unchanged', () => {
    const url = 'https://security.microsoft.com/homepage?tid=abc-123';
    expect(cleanUrlEntities(url)).toBe(url);
  });

  it('handles real ADO URL with double-encoded entities', () => {
    const input = 'https://security.microsoft.com/cloud-resource/v2?viewid=sensitive-data&amp;id=aabbccdd&amp;tid=eeff0011';
    expect(cleanUrlEntities(input))
      .toBe('https://security.microsoft.com/cloud-resource/v2?viewid=sensitive-data&id=aabbccdd&tid=eeff0011');
  });
});
