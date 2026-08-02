/**
 * Canonical mobile cursor (MOBILE-COMPANION-M1-MOBILE-READ-API-1).
 *
 * One opaque, versioned keyset-cursor format for every `/api/mobile/v1` list.
 * Transport form: base64url of `v1.<sortIso>.<rowId>` — clients never parse,
 * construct, or reorder it. A cursor is a POSITION, never authority: the
 * decoder returns sort coordinates only, and every query still applies the
 * caller's verified account scope.
 *
 * Keyset semantics (deterministic, no offsets):
 *   ORDER BY <sortTs> DESC, id DESC
 *   next page: rows where (sortTs, id) < (cursor.sortTs, cursor.id)
 * The id tie-breaker makes traversal exact across identical timestamps —
 * including queued runs whose placeholder `started_at` values can collide.
 *
 * Pure by construction (core/ may import contracts only). Bounded input;
 * strict validation; every failure collapses to `null` (the route maps that
 * to one stable 400 INVALID_CURSOR).
 */

/** Matches @chainreact/mobile-contracts MOBILE_CURSOR_MAX_LENGTH. */
export const MOBILE_CURSOR_MAX_INPUT_LENGTH = 512;

const CURSOR_VERSION = "v1";

/** ISO-8601 with milliseconds, as persisted timestamps serialize. */
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MobileCursorPosition {
  /** ISO timestamp of the last row the client has (sort key, DESC). */
  readonly sortTs: string;
  /** Row id of that row (tie-breaker, DESC). */
  readonly id: string;
}

function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    return Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

export function encodeMobileCursor(position: MobileCursorPosition): string {
  return toBase64Url(`${CURSOR_VERSION}.${position.sortTs}.${position.id}`);
}

/**
 * Strict decode. `null` for ANY defect: oversize input, non-base64url,
 * unknown version, malformed timestamp, malformed id. Never throws.
 */
export function decodeMobileCursor(encoded: string): MobileCursorPosition | null {
  if (encoded.length === 0 || encoded.length > MOBILE_CURSOR_MAX_INPUT_LENGTH) {
    return null;
  }
  const raw = fromBase64Url(encoded);
  if (raw === null) return null;

  const firstDot = raw.indexOf(".");
  const lastDot = raw.lastIndexOf(".");
  if (firstDot < 0 || lastDot <= firstDot) return null;

  const version = raw.slice(0, firstDot);
  const sortTs = raw.slice(firstDot + 1, lastDot);
  const id = raw.slice(lastDot + 1);

  if (version !== CURSOR_VERSION) return null;
  if (!ISO_PATTERN.test(sortTs)) return null;
  if (!UUID_PATTERN.test(id)) return null;
  return { sortTs, id };
}

/** Clamp a requested page size into [1, max]; undefined → the default. */
export function clampMobilePageLimit(
  requested: number | undefined,
  { fallback, max }: { fallback: number; max: number },
): number {
  if (requested === undefined || !Number.isInteger(requested)) return fallback;
  return Math.min(Math.max(requested, 1), max);
}
