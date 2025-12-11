/**
 * Device / platform detection helpers used for deciding whether to show mobile UI.
 *
 * These utilities are safe to call during SSR; they return conservative defaults
 * when `window`/`navigator` are unavailable.
 */

export type MobileOS = 'ios' | 'android';

/**
 * Best-effort access to the browser user agent string.
 * @returns The user agent string, or an empty string in non-browser contexts.
 */
function getUserAgent(): string {
  if (typeof navigator === 'undefined') return '';
  return typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
}

/**
 * Determines whether a user agent string likely belongs to a mobile device.
 *
 * Notes:
 * - This is intentionally a heuristic and should only be used as a fallback.
 * - Touch-capability checks (events / coarse pointer) are preferred.
 */
function isMobileUserAgent(ua: string): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobi/i.test(ua);
}

/**
 * Returns whether the current environment appears to support touch input.
 *
 * Per the mobile controls architecture (Section 6), this returns `true` if:
 * - the browser supports touch events (`'ontouchstart' in window`)
 * - OR the primary pointer is coarse (`matchMedia('(pointer: coarse)').matches`)
 * - OR the user agent indicates a mobile device.
 *
 * @returns `true` when virtual controls should be eligible to render.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const hasTouchEvents = 'ontouchstart' in window;
  const hasCoarsePointer =
    (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
    false;
  const ua = getUserAgent();
  const isMobileUA = ua.length > 0 ? isMobileUserAgent(ua) : false;

  return hasTouchEvents || hasCoarsePointer || isMobileUA;
}

/**
 * Detects the mobile operating system from the user agent.
 *
 * @returns `'ios'`, `'android'`, or `null` when not a recognized mobile OS or in SSR.
 */
export function getMobileOS(): MobileOS | null {
  const ua = getUserAgent();
  if (!ua) return null;

  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/i.test(ua)) return 'ios';

  return null;
}