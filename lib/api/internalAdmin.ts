/**
 * Typed client for the caller-only internal-admin status check.
 *
 * Returns ONLY the current caller's boolean (`{ isInternalAdmin }` from
 * `/api/internal/admin-status`). Used by the app-shell nav to decide whether to
 * show the internal "React Agent Feedback" link. FAIL CLOSED: any non-2xx
 * response, malformed body, or network error resolves to `false` (hide the link).
 * Link visibility is convenience only — the dashboard/API keep their own gates.
 */
export async function fetchIsInternalAdmin(): Promise<boolean> {
  try {
    const res = await fetch("/api/internal/admin-status", {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { isInternalAdmin?: unknown };
    return body.isInternalAdmin === true;
  } catch {
    return false;
  }
}
