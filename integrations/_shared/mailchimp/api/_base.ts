/**
 * Shared Mailchimp REST API base — login origin + per-datacenter API
 * origin + pinned API version + URL builder.
 *
 * Slice 14 Commit 2. **First V2 provider with per-integration API
 * host routing.** Mailchimp shards its API by datacenter prefix: every
 * account lives on `us1`, `us2`, …, `us21`, `eu1`, etc. The bearer
 * token alone does not tell you which datacenter to hit; the `dc`
 * value comes from `GET https://login.mailchimp.com/oauth2/metadata`
 * (called once during OAuth callback in `_shared/mailchimp/api/me.ts`)
 * and is persisted on `integrations.accountMetadata.dc`. Every
 * subsequent API call routes through `https://${dc}.api.mailchimp.com`.
 *
 * Two origins, two env overrides:
 *
 *   - `mailchimpLoginBase()` — `https://login.mailchimp.com`. The host
 *     that serves OAuth (`/oauth2/authorize` + `/oauth2/token`) AND the
 *     dc-discovery endpoint (`/oauth2/metadata`). DC-independent.
 *     Env override: `MAILCHIMP_LOGIN_BASE`.
 *
 *   - `mailchimpApiOrigin(dc)` — `https://${dc}.api.mailchimp.com`. The
 *     per-datacenter REST host. DC-dependent — must be called with the
 *     dc value persisted from OAuth callback. Env override:
 *     `MAILCHIMP_API_BASE_OVERRIDE` (when set, replaces the per-dc
 *     origin entirely; required for e2e mocks where a single localhost
 *     port serves both `us1.api.*` and `us2.api.*` worth of traffic).
 *
 * `MAILCHIMP_API_VERSION = "3.0"` — Mailchimp's REST API path version,
 * embedded directly in the URL path (`/3.0/...`). Sent as a path
 * segment, NOT as a header. Bumping is a single-line edit here +
 * manifest sync.
 *
 * `mailchimpApiUrl(dc, path)` — convenience builder for action / lifecycle
 * call sites. Forces dc presence: an empty / null / undefined dc throws
 * `MissingDataCenterError` so the failure is deterministic rather than
 * the URL silently becoming `https://undefined.api.mailchimp.com/...`.
 * V1's [`utils.ts:37-75`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/utils.ts#L37)
 * runtime-refetches dc when missing; V2 captures dc deterministically
 * at OAuth callback and fails loud at action time when it's not there.
 * Surfaces a clear "reconnect Mailchimp" prompt instead of masking
 * data drift.
 *
 * The login base and API base helpers are intentionally separate
 * functions (not constants) because tests flip the env between cases
 * and the e2e mock server points both at one localhost port.
 */

import { MissingDataCenterError } from "../errors";

export function mailchimpLoginBase(): string {
  return process.env.MAILCHIMP_LOGIN_BASE ?? "https://login.mailchimp.com";
}

export function mailchimpApiOrigin(dc: string | null | undefined): string {
  if (!dc) {
    throw new MissingDataCenterError();
  }
  const override = process.env.MAILCHIMP_API_BASE_OVERRIDE;
  if (override) return override;
  return `https://${dc}.api.mailchimp.com`;
}

/**
 * Build a fully-qualified Mailchimp REST URL for the given datacenter
 * and path. The path SHOULD start with a leading slash (e.g.
 * `"/lists/abc/members"`); leading-slash normalization is applied so
 * callers can pass either form without breaking the URL.
 *
 * Throws `MissingDataCenterError` when `dc` is empty / null / undefined.
 */
export function mailchimpApiUrl(
  dc: string | null | undefined,
  path: string,
): string {
  const origin = mailchimpApiOrigin(dc);
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}/${MAILCHIMP_API_VERSION}${normalized}`;
}

/**
 * Pinned Mailchimp Marketing REST API version. Mirrors V1's
 * per-handler usage across `lib/workflows/actions/mailchimp/*.ts` (all
 * hit `https://${dc}.api.mailchimp.com/3.0/...`). Embedded as a path
 * segment, not a header — Mailchimp's API is URL-versioned.
 */
export const MAILCHIMP_API_VERSION = "3.0";
