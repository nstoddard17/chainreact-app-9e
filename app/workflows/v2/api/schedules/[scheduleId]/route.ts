import { NextResponse } from "next/server"
import { z } from "zod"

import { updateSchedule, deleteSchedule } from "@/src/lib/workflows/builder/schedules"
import { getRouteClient } from "@/src/lib/workflows/builder/api/helpers"
import { ensureWorkspaceRole } from "@/src/lib/workflows/builder/workspace"

const UpdateSchema = z.object({
  cronExpression: z.string().optional(),
  timezone: z.string().optional(),
  enabled: z.boolean().optional(),
})

export async function PATCH(request: Request, context: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await context.params

  const supabase = await getRouteClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
  }

  const existing = await supabase
    .from("flow_v2_schedules")
    .select("flow_id, workspace_id")
    .eq("id", scheduleId)
    .maybeSingle()

  if (existing.error) {
    return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 })
  }

  if (!existing.data) {
    return NextResponse.json({ ok: false, error: "Schedule not found" }, { status: 404 })
  }

  try {
    await ensureWorkspaceRole(supabase, existing.data.workspace_id, user.id, "editor")
  } catch (error: any) {
    const status = error?.status === 403 ? 403 : 500
    const message = status === 403 ? "Forbidden" : error?.message ?? "Unable to update schedule"
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  const schedule = await updateSchedule(scheduleId, parsed.data, supabase)
  return NextResponse.json({ ok: true, schedule })
}

export async function DELETE(_: Request, context: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await context.params

  const supabase = await getRouteClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const existing = await supabase
    .from("flow_v2_schedules")
    .select("workspace_id")
    .eq("id", scheduleId)
    .maybeSingle()

  if (existing.error) {
    return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 })
  }

  if (!existing.data) {
    return NextResponse.json({ ok: false, error: "Schedule not found" }, { status: 404 })
  }

  try {
    await ensureWorkspaceRole(supabase, existing.data.workspace_id, user.id, "editor")
  } catch (error: any) {
    const status = error?.status === 403 ? 403 : 500
    const message = status === 403 ? "Forbidden" : error?.message ?? "Unable to delete schedule"
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  await deleteSchedule(scheduleId, supabase)
  return NextResponse.json({ ok: true })
}
