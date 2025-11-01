import { NextResponse } from "next/server"
import { z } from "zod"

import { FlowSchema } from "@/src/lib/workflows/builder/schema"
import { planEdits } from "@/src/lib/workflows/builder/agent/planner"
import { getRouteClient } from "@/src/lib/workflows/builder/api/helpers"

const EditsRequestSchema = z.object({
  prompt: z.string().min(1),
  flow: FlowSchema,
})

export async function POST(request: Request, context: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await context.params

  const supabase = await getRouteClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ ok: false, errors: ["Unauthorized"] }, { status: 401 })
  }

  const definition = await supabase
    .from("flow_v2_definitions")
    .select("id")
    .eq("id", flowId)
    .maybeSingle()

  if (definition.error) {
    return NextResponse.json({ ok: false, errors: [definition.error.message] }, { status: 500 })
  }

  if (!definition.data) {
    return NextResponse.json({ ok: false, errors: ["Flow not found"] }, { status: 404 })
  }

  const raw = await request.json().catch(() => null)
  if (!raw) {
    return NextResponse.json({ ok: false, errors: ["Invalid JSON body"] }, { status: 400 })
  }

  const parsed = EditsRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, errors: parsed.error.format() }, { status: 400 })
  }

  const result = planEdits({ prompt: parsed.data.prompt, flow: parsed.data.flow })

  return NextResponse.json({
    ok: true,
    flowId,
    ...result,
  })
}
