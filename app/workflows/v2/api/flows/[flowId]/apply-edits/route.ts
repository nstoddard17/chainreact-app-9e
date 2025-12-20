import { NextResponse } from "next/server"
import { z } from "zod"

import { FlowSchema } from "@/src/lib/workflows/builder/schema"
import { getRouteClient, getFlowRepository, getServiceClient } from "@/src/lib/workflows/builder/api/helpers"
import { triggerLifecycleManager } from "@/lib/triggers/TriggerLifecycleManager"
import { logger } from "@/lib/utils/logger"

const ApplyEditsSchema = z.object({
  flow: FlowSchema,
  version: z.number().int().optional(),
})

export async function POST(request: Request, context: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await context.params

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = ApplyEditsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
  }

  const { version } = parsed.data
  const rawFlow = { ...parsed.data.flow, id: flowId }

  // Log original size
  const originalSize = JSON.stringify(rawFlow).length
  console.log(`[apply-edits] Original flow size: ${originalSize} bytes (${(originalSize / 1024).toFixed(2)} KB)`)

  // Sanitize flow: remove test data and validation results from node configs
  const sanitizedFlow = {
    ...rawFlow,
    nodes: rawFlow.nodes?.map((node: any) => {
      const sanitizedConfig = { ...node.config }
      // Remove test-related fields that start with __test or __validation
      Object.keys(sanitizedConfig).forEach(key => {
        if (key.startsWith('__test') || key.startsWith('__validation') || key.startsWith('__options')) {
          delete sanitizedConfig[key]
        }
      })
      return {
        ...node,
        config: sanitizedConfig
      }
    }) || []
  }

  const sanitizedSize = JSON.stringify(sanitizedFlow).length
  console.log(`[apply-edits] Sanitized flow size: ${sanitizedSize} bytes (${(sanitizedSize / 1024).toFixed(2)} KB), saved ${originalSize - sanitizedSize} bytes`)

  const flow = FlowSchema.parse(sanitizedFlow)

  const supabase = await getRouteClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const existingDefinition = await supabase
    .from("workflows")
    .select("id")
    .eq("id", flowId)
    .maybeSingle()

  if (existingDefinition.error) {
    return NextResponse.json({ ok: false, error: existingDefinition.error.message }, { status: 500 })
  }

  if (!existingDefinition.data) {
    return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
  }

  // Use service client to bypass RLS on workflows_revisions table
  const serviceClient = await getServiceClient()
  const repository = await getFlowRepository(serviceClient)

  const { error: definitionError } = await supabase
    .from("workflows")
    .update({ name: flow.name, updated_at: new Date().toISOString() })
    .eq("id", flowId)

  if (definitionError) {
    return NextResponse.json({ ok: false, error: definitionError.message }, { status: 500 })
  }

  try {
    const revision = await repository.createRevision({
      flowId,
      flow,
      version,
    })

    // Clean up orphaned trigger resources for nodes that were removed
    // This runs after revision is saved to ensure we don't lose trigger data on failed saves
    try {
      const currentNodeIds = flow.nodes?.map((node: any) => node.id) || []
      const cleanupResult = await triggerLifecycleManager.cleanupRemovedTriggerNodes(
        flowId,
        user.id,
        currentNodeIds
      )
      if (cleanupResult.deletedCount > 0) {
        logger.debug(`[apply-edits] Cleaned up ${cleanupResult.deletedCount} orphaned trigger resources for workflow ${flowId}`)
      }
      if (cleanupResult.errors.length > 0) {
        logger.warn(`[apply-edits] Trigger cleanup had errors: ${cleanupResult.errors.join(', ')}`)
      }
    } catch (cleanupError) {
      // Don't fail the entire request if cleanup fails - log and continue
      logger.error('[apply-edits] Failed to cleanup orphaned triggers:', cleanupError)
    }

    return NextResponse.json({
      ok: true,
      flow: revision.graph,
      revisionId: revision.id,
      version: revision.version,
    })
  } catch (error: any) {
    console.error('[apply-edits] Failed to create revision:', error)
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to create revision',
      details: error.toString()
    }, { status: 500 })
  }
}
