import { NextResponse } from "next/server";
import { loadInternalAdmin } from "../react-agent/_shared";

/**
 * GET /api/internal/admin-status (CHECKLIST-ITEM-... internal-admin nav link).
 *
 * Caller-only self-check: returns ONLY whether the signed-in caller is a
 * ChainReact internal admin — `{ isInternalAdmin: boolean }`. It never returns
 * the roster, other users, ids, or any dashboard data. It exists so the app nav
 * can decide whether to show the "React Agent Feedback" link.
 *
 * This is convenience-only and is deliberately NOT the dashboard's gate: the
 * `/admin/react-agent` page and `/api/internal/react-agent/*` endpoints keep
 * their own non-disclosing 404 gates, so link visibility can never substitute for
 * access. Internal-admin status is decided solely by the `internal_admins` gate
 * (`loadInternalAdmin`) — customer account/team/org roles never affect it.
 *
 * Fail closed: an anonymous caller gets 401 `{ isInternalAdmin: false }`; any
 * unexpected error resolves to `{ isInternalAdmin: false }`. The client hook maps
 * every non-true outcome to "hide the link."
 */
export async function GET(): Promise<Response> {
  try {
    const state = await loadInternalAdmin();
    if (state.status === "anonymous") {
      return NextResponse.json({ isInternalAdmin: false }, { status: 401 });
    }
    return NextResponse.json({ isInternalAdmin: state.status === "ok" });
  } catch {
    return NextResponse.json({ isInternalAdmin: false }, { status: 500 });
  }
}
