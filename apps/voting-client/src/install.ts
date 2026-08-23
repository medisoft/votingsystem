/**
 * True when the app is already running as an installed PWA.
 */
export function isStandaloneDisplay(): boolean {
  const displayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone,
  );
  return Boolean(displayMode || iosStandalone);
}

/**
 * True for iPhone, iPad, and iPod, including iPadOS desktop UA with touch.
 *
 * @param userAgent - Navigator user agent string.
 * @param platform - Navigator platform string.
 * @param maxTouchPoints - Navigator max touch points.
 */
export function isIosDevice(
  userAgent = navigator.userAgent,
  platform = navigator.platform,
  maxTouchPoints = navigator.maxTouchPoints,
): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true;
  return platform === 'MacIntel' && maxTouchPoints > 1;
}

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
