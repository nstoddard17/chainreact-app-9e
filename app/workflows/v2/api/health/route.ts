import { NextResponse } from "next/server"

import { getRouteClient } from "@/src/lib/workflows/builder/api/helpers"

const RUN_STATUSES_IN_PROGRESS = ["pending", "running"]

export async function GET() {
  const supabase = await getRouteClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const pending = await supabase
    .from("flow_v2_runs")
    .select("id", { count: "exact", head: true })
    .in("status", RUN_STATUSES_IN_PROGRESS)

  if (pending.error) {
    return NextResponse.json({ ok: false, error: pending.error.message }, { status: 500 })
  }

  const pendingRuns = pending.count ?? 0

  const { data: lastRun } = await supabase
    .from("flow_v2_runs")
    .select("id, status, finished_at, started_at")
    .order("finished_at", { ascending: false })
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    db: "ok",
    pendingRuns,
    lastRun: lastRun
      ? {
          id: lastRun.id,
          status: lastRun.status,
          finishedAt: lastRun.finished_at,
        }
      : null,
  })
}
