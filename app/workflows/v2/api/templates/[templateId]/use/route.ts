import { NextResponse } from "next/server"
import { z } from "zod"

import { instantiateTemplate } from "@/src/lib/workflows/builder/templates"
import { getRouteClient } from "@/src/lib/workflows/builder/api/helpers"
import { ensureWorkspaceRole } from "@/src/lib/workflows/builder/workspace"

const UseTemplateSchema = z.object({
  name: z.string().optional(),
})

export async function POST(request: Request, context: { params: Promise<{ templateId: string }> }) {
  const flag = guardFlowV2Enabled()
  if (flag) {
    return flag
  }

  const { templateId } = await context.params

  const supabase = await getRouteClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = UseTemplateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
  }

  const { data: templateMeta, error } = await supabase
    .from("flow_v2_templates")
    .select("workspace_id")
    .eq("id", templateId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (!templateMeta) {
    return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 })
  }

  try {
    await ensureWorkspaceRole(supabase, templateMeta.workspace_id, user.id, "viewer")
  } catch (err: any) {
    const status = err?.status === 403 ? 403 : 500
    const message = status === 403 ? "Forbidden" : err?.message ?? "Unable to use template"
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  try {
    const result = await instantiateTemplate({
      templateId,
      name: parsed.data.name,
      workspaceId: templateMeta.workspace_id ?? undefined,
      createdBy: user.id,
      client: supabase,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
