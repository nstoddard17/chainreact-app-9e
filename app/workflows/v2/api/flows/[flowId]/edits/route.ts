import { NextResponse } from "next/server"
import { z } from "zod"

import { FlowSchema } from "@/src/lib/workflows/builder/schema"
import { planEdits } from "@/src/lib/workflows/builder/agent/planner"
import { getRouteClient } from "@/src/lib/workflows/builder/api/helpers"
import { logger } from "@/lib/utils/logger"

/**
 * Conversation message schema for refinement context
 */
const ConversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.string().optional(),
  metadata: z.object({
    reasoningSteps: z.array(z.object({
      step: z.number(),
      phase: z.string(),
      thought: z.string(),
      decision: z.string().optional(),
      confidence: z.enum(['high', 'medium', 'low']).optional(),
      alternatives: z.array(z.string()).optional(),
    })).optional(),
    planVersion: z.number().optional(),
    workflowSnapshot: z.string().optional(),
    partialConfigs: z.record(z.any()).optional(),
    isRefinement: z.boolean().optional(),
    refinementType: z.string().optional(),
  }).optional(),
})

const EditsRequestSchema = z.object({
  prompt: z.string().min(1),
  flow: FlowSchema,
  /** Connected integrations for context-aware planning */
  connectedIntegrations: z.array(z.string()).optional(),
  /** Conversation history for refinement context */
  conversationHistory: z.array(ConversationMessageSchema).optional(),
  /** Whether to use LLM planner (default: true) */
  useLLM: z.boolean().optional(),
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
    .from("workflows")
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

  const startTime = Date.now()

  try {
    const result = await planEdits({
      prompt: parsed.data.prompt,
      flow: parsed.data.flow,
      connectedIntegrations: parsed.data.connectedIntegrations,
      conversationHistory: parsed.data.conversationHistory,
      useLLM: parsed.data.useLLM ?? true,
    })

    const duration = Date.now() - startTime
    logger.debug('[API /edits] Planning complete', {
      flowId,
      duration,
      editCount: result.edits.length,
      planningMethod: result.planningMethod,
      hasReasoning: !!result.reasoning?.length,
      workflowName: result.workflowName,
    })

    return NextResponse.json({
      ok: true,
      flowId,
      ...result,
    })
  } catch (error) {
    logger.error('[API /edits] Planning failed', {
      flowId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json({
      ok: false,
      errors: [error instanceof Error ? error.message : 'Planning failed'],
    }, { status: 500 })
  }
}
