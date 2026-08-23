import { describe, expect, it } from 'vitest';
import { isIosDevice, isStandaloneDisplay } from './install';

describe('install helpers', () => {
  it('detects iOS phones and iPadOS desktop UA with touch', () => {
    expect(
      isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'),
    ).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(
      false,
    );
    expect(isIosDevice('Mozilla/5.0', 'MacIntel', 5)).toBe(true);
  });

  it('detects standalone display mode', () => {
    expect(isStandaloneDisplay()).toBe(false);
    const original = window.matchMedia;
    window.matchMedia = (query: string) =>
      ({
        matches: query.includes('standalone'),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList;
    expect(isStandaloneDisplay()).toBe(true);
    window.matchMedia = original;
  });
});
