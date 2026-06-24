/**
 * Same-origin redirect sanitizer for post-auth `returnTo` handoff
 * (ANON-BUILDER-2). Prevents open-redirects: only a path beginning with a single
 * "/" is allowed; anything else (absolute URL, protocol-relative "//host",
 * non-string) falls back. Mirrors the callback route's `safeNextPath`, but
 * defaults to the workflows home rather than "/".
 */
export function safeReturnPath(
  next: string | null | undefined,
  fallback = "/workflows",
): string {
  if (typeof next !== "string" || next.length === 0) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
