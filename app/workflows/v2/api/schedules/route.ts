import { NextResponse } from "next/server"
import { z } from "zod"

import { createSchedule, listSchedules } from "@/src/lib/workflows/builder/schedules"
import { getRouteClient } from "@/src/lib/workflows/builder/api/helpers"
import { ensureWorkspaceRole } from "@/src/lib/workflows/builder/workspace"

const BodySchema = z.object({
  flowId: z.string().uuid(),
  cronExpression: z.string(),
  timezone: z.string().optional(),
  enabled: z.boolean().optional(),
})

export async function GET(request: Request) {
  const supabase = await getRouteClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const flowId = searchParams.get("flowId")
  if (!flowId) {
    return NextResponse.json({ ok: false, error: "flowId required" }, { status: 400 })
  }

  const definition = await supabase
    .from("workflows")
    .select("workspace_id")
    .eq("id", flowId)
    .maybeSingle()

  if (definition.error) {
    return NextResponse.json({ ok: false, error: definition.error.message }, { status: 500 })
  }

  if (!definition.data) {
    return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
  }

  try {
    await ensureWorkspaceRole(supabase, definition.data.workspace_id, user.id, "viewer")
  } catch (error: any) {
    const status = error?.status === 403 ? 403 : 500
    const message = status === 403 ? "Forbidden" : error?.message ?? "Unable to list schedules"
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  const schedules = await listSchedules(flowId, supabase)
  return NextResponse.json({ ok: true, schedules })
}

export async function POST(request: Request) {
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
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
  }
  const definition = await supabase
    .from("workflows")
    .select("workspace_id")
    .eq("id", parsed.data.flowId)
    .maybeSingle()

  if (definition.error) {
    return NextResponse.json({ ok: false, error: definition.error.message }, { status: 500 })
  }

  if (!definition.data) {
    return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
  }

  try {
    await ensureWorkspaceRole(supabase, definition.data.workspace_id, user.id, "editor")
  } catch (error: any) {
    const status = error?.status === 403 ? 403 : 500
    const message = status === 403 ? "Forbidden" : error?.message ?? "Unable to create schedule"
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  try {
    const schedule = await createSchedule({
      flowId: parsed.data.flowId,
      cronExpression: parsed.data.cronExpression,
      timezone: parsed.data.timezone,
      enabled: parsed.data.enabled,
      createdBy: user.id,
      workspaceId: definition.data.workspace_id,
    }, supabase)
    return NextResponse.json({ ok: true, schedule })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
