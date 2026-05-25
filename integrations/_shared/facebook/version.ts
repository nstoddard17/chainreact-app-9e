/**
 * Pinned Facebook Graph API version — Slice 3.FACEBOOK-2.
 *
 * ONE source of truth, consumed by both the manifest's `apiVersion` and the
 * shared request layer — closes V1's v14/v19 drift. Kept dependency-free
 * (zero imports) so the manifest can import it without pulling the request
 * layer's `refreshAndRetry` → dispatcher → registry graph into a cycle.
 *
 * Verified against Meta's Graph API changelog 2026-02: v25.0 is the newest
 * (Feb 2026); v21–v24 are all active. v23.0 (released 2025-05-29) is a
 * current, mature version far from deprecation — bumping the bleeding edge
 * isn't needed for the stable endpoints this provider uses (feed / photos /
 * videos / comments / insights / messages / me/accounts). Meta auto-
 * deprecates versions on a ~2-year window; bump this constant (or set the
 * `FACEBOOK_GRAPH_VERSION` env override) as that window advances.
 */
export const GRAPH_API_VERSION =
  process.env.FACEBOOK_GRAPH_VERSION ?? "v23.0";
