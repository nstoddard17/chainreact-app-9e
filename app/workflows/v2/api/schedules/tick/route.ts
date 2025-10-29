import { NextResponse } from "next/server"

import { runDueSchedules } from "@/src/lib/workflows/builder/schedules/runner"

export async function POST() {
  const result = await runDueSchedules()
  return NextResponse.json({ ok: true, ...result })
}
