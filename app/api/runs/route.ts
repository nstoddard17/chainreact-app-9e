import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import * as workflowRunsRepo from "@/repositories/workflowRuns";
import * as workflowsRepo from "@/repositories/workflows";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import {
  RUN_LIST_DEFAULT_LIMIT,
  toRunListItem,
} from "@/app/runs/_shared";

/**
 * GET /api/runs — list recent workflow runs for the caller's account
 * (Slice 4.RUNS-PAGE-1; account-scoped in 4.ACCOUNT-MODEL-8).
 *
 * Read-only surface backing the `/runs` page's client refresh. Returns
 * the route-safe `RunListItem[]` projection only — see the contract +
 * `repositories/workflowRuns.ts:listByAccountForDisplay` for the
 * column-by-column safety justification. Two parallel fetches:
 *   1. Display runs (limit-capped at 200, default 50).
 *   2. Workflow names for the ids referenced by the runs slice.
 *
 * Auth gate is inline `auth.getUser()`. The run scope is the caller's OWN
 * account, resolved server-side via `ensurePersonalAccount(user.id)` — never a
 * client-supplied id. V2-READY-51: `listByAccountForDisplay` now reads via
 * service-role (the authenticated SELECT grant on `workflow_runs` was revoked),
 * so the `eq('account_id', accountId)` predicate against the caller-derived
 * account IS the authorization; the inline 401 short-circuits anonymous callers.
 * The repo's `DISPLAY_RUN_COLUMNS` projection keeps raw `trigger_event` /
 * `steps` / `fatal_error` off the wire.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const account = await ensurePersonalAccount(user.id);
  const limit = parseLimit(request.url) ?? RUN_LIST_DEFAULT_LIMIT;
  const records = await workflowRunsRepo.listByAccountForDisplay(account.id, {
    limit,
  });

  const workflowIds = Array.from(new Set(records.map((r) => r.workflowId)));
  const nameRows = await workflowsRepo.listNamesByIds(workflowIds);
  const workflowNameById = new Map(nameRows.map((w) => [w.id, w.name]));

  const runs = records.map((r) => toRunListItem(r, workflowNameById));
  return NextResponse.json({ runs });
}

function parseLimit(url: string): number | null {
  try {
    const limitStr = new URL(url).searchParams.get("limit");
    if (limitStr === null) return null;
    const n = Number.parseInt(limitStr, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n; // repo caps at 200.
  } catch {
    return null;
  }
}
