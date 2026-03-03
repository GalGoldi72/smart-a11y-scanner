/**
 * Tests for DeepExplorer element classification (chrome vs content vs nav).
 * The CHROME_TEXT_PATTERNS list determines what the deep explorer skips.
 */
import { describe, it, expect } from 'vitest';
import { CHROME_TEXT_PATTERNS } from '../scanner/deep-explorer.js';

describe('CHROME_TEXT_PATTERNS', () => {
  function matchesChrome(text: string): boolean {
    return CHROME_TEXT_PATTERNS.some(p => p.test(text));
  }

  // These should be classified as chrome (skipped)
  it('identifies "Account Manager"', () => {
    expect(matchesChrome('Account Manager')).toBe(true);
  });

  it('identifies "Sign out"', () => {
    expect(matchesChrome('Sign out')).toBe(true);
  });

  it('identifies "Sign In"', () => {
    expect(matchesChrome('Sign In')).toBe(true);
  });

  it('identifies "Collapse navigation"', () => {
    expect(matchesChrome('Collapse navigation')).toBe(true);
  });

  it('identifies "Expand navigation"', () => {
    expect(matchesChrome('Expand navigation')).toBe(true);
  });

  it('identifies "Settings" exactly', () => {
    expect(matchesChrome('Settings')).toBe(true);
  });

  it('identifies "Notifications"', () => {
    expect(matchesChrome('Notifications')).toBe(true);
  });

  it('identifies "Help"', () => {
    expect(matchesChrome('Help')).toBe(true);
  });

  it('identifies "Feedback"', () => {
    expect(matchesChrome('Feedback')).toBe(true);
  });

  it('identifies "App launcher"', () => {
    expect(matchesChrome('App launcher')).toBe(true);
  });

  it('identifies "What\'s new"', () => {
    expect(matchesChrome("What's new")).toBe(true);
  });

  it('identifies "About"', () => {
    expect(matchesChrome('About')).toBe(true);
  });

  // These should NOT be classified as chrome
  it('does NOT match "Device compliance"', () => {
    expect(matchesChrome('Device compliance')).toBe(false);
  });

  it('does NOT match "Microsoft Secure Score"', () => {
    expect(matchesChrome('Microsoft Secure Score')).toBe(false);
  });

  it('does NOT match "Incidents"', () => {
    expect(matchesChrome('Incidents')).toBe(false);
  });

  it('does NOT match "Cloud apps"', () => {
    expect(matchesChrome('Cloud apps')).toBe(false);
  });

  it('does NOT match "Threat analytics"', () => {
    expect(matchesChrome('Threat analytics')).toBe(false);
  });

  it('does NOT match "Identity protection"', () => {
    expect(matchesChrome('Identity protection')).toBe(false);
  });

  it('does NOT match "Data loss prevention"', () => {
    expect(matchesChrome('Data loss prevention')).toBe(false);
  });

  it('does NOT match "Settings page" (substring, not exact)', () => {
    // "Settings" is exact match only — "Settings page" should NOT match
    expect(matchesChrome('Settings page')).toBe(false);
  });
});
