/**
 * Mobile app-version policy — THE single source of the version values served
 * by `GET /api/mobile/v1/app-config` (MOBILE-COMPANION-M1-MOBILE-READ-API-1).
 * No route or service may carry version literals of its own.
 *
 * `forceUpdate` is RESERVED for security-critical cases (foundation plan
 * §18); flipping it is an owner decision, shipped as a code change through
 * the certified release flow — deliberately not an env knob, so its state is
 * always attributable to a reviewed SHA.
 */

/** Oldest app version the current backend still supports. */
export const MOBILE_MIN_SUPPORTED_APP_VERSION = "0.1.0";

/** Newest released app version (store version once the app ships). */
export const MOBILE_LATEST_APP_VERSION = "0.1.0";

/** Security-critical hard gate — see module header before ever flipping. */
export const MOBILE_FORCE_UPDATE = false;

/** Maintenance banner served to mobile clients. Message is display copy only. */
export const MOBILE_MAINTENANCE: { active: boolean; message: string | null } = {
  active: false,
  message: null,
};
