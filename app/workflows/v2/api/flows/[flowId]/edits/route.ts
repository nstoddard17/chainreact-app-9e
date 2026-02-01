import { NextResponse } from "next/server"
import { z } from "zod"
import { createHash } from "crypto"

import { FlowSchema, type Node, type Edge } from "@/src/lib/workflows/builder/schema"
import { planEdits, type Edit, type PlannerResult } from "@/src/lib/workflows/builder/agent/planner"
import { getRouteClient, checkWorkflowAccess } from "@/src/lib/workflows/builder/api/helpers"
import { logger } from "@/lib/utils/logger"
import { plannerResultToTemplate } from "@/lib/workflows/ai-agent/planToTemplate"
import { deductAIWorkflowTasks, trackAIWorkflowUsage, checkAIWorkflowTaskBalance } from "@/lib/workflows/ai-agent/aiWorkflowCostTracking"

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
  /** Whether to check for cached templates first (default: true) */
  useTemplateCache: z.boolean().optional(),
  /** Whether to save successful plans as templates (default: true) */
  saveAsTemplate: z.boolean().optional(),
})

/**
 * Generate a normalized hash of the prompt for template lookup
 */
function generatePromptHash(prompt: string): string {
  const normalized = prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

/**
 * Convert cached template back to PlannerResult format
 */
function templateToPlannerResult(template: any, existingNodeIds: Set<string>): PlannerResult {
  const edits: Edit[] = []

  // Parse nodes from template
  const nodes = typeof template.nodes === 'string'
    ? JSON.parse(template.nodes)
    : template.nodes || template.workflow_json?.nodes || []

  const connections = typeof template.connections === 'string'
    ? JSON.parse(template.connections)
    : template.connections || template.workflow_json?.connections || []

  // Create ID mapping for new UUIDs (to avoid conflicts with existing nodes)
  const idMap = new Map<string, string>()

  // Convert template nodes to planner Node format
  for (const templateNode of nodes) {
    // Generate new ID to avoid conflicts
    const newId = crypto.randomUUID()
    idMap.set(templateNode.id, newId)

    const node: Node = {
      id: newId,
      type: templateNode.data?.type || templateNode.type,
      label: templateNode.data?.label || templateNode.data?.type || 'Node',
      description: templateNode.data?.description,
      config: templateNode.data?.config || {},
      inPorts: [],
      outPorts: [],
      io: { inputSchema: undefined, outputSchema: undefined },
      policy: { timeoutMs: 60000, retries: 0 },
      costHint: 0,
      metadata: {
        position: templateNode.position || { x: 400, y: 100 },
        providerId: templateNode.data?.providerId,
        isTrigger: templateNode.data?.isTrigger,
        previewFields: templateNode.data?.previewFields,
        lane: 0,
        branchIndex: 0,
      },
    }

    edits.push({ op: 'addNode', node })
  }

  // Convert template connections to planner Edge format
  for (const conn of connections) {
    const sourceId = conn.source || conn.from
    const targetId = conn.target || conn.to

    const edge: Edge = {
      id: crypto.randomUUID(),
      from: { nodeId: idMap.get(sourceId) || sourceId },
      to: { nodeId: idMap.get(targetId) || targetId },
      mappings: [],
    }

    edits.push({ op: 'connect', edge })
  }

  // Extract prerequisites from integrations
  const prerequisites: string[] = (template.integrations || [])
    .map((integration: string) => `integration:${integration}`)

  return {
    edits,
    prerequisites,
    rationale: template.description || 'Loaded from template',
    deterministicHash: template.prompt_hash || generatePromptHash(template.original_prompt || ''),
    workflowName: template.name,
    planningMethod: 'pattern', // Template match is essentially pattern-based
  }
}

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

  // Check workflow access using service client (bypasses RLS) with explicit authorization
  // Requires 'editor' role for planning edits
  const accessCheck = await checkWorkflowAccess(flowId, user.id, 'editor')

  if (!accessCheck.hasAccess) {
    const status = accessCheck.error === "Flow not found" ? 404 : 403
    return NextResponse.json({ ok: false, errors: [accessCheck.error || "Forbidden"] }, { status })
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
  const useTemplateCache = parsed.data.useTemplateCache ?? true
  const saveAsTemplate = parsed.data.saveAsTemplate ?? true
  const existingNodeIds = new Set(parsed.data.flow.nodes.map((n) => n.id))

  // STEP 0: Check user's task balance before proceeding
  const balanceCheck = await checkAIWorkflowTaskBalance(user.id)
  if (!balanceCheck.hasBalance) {
    logger.warn('[API /edits] User has exceeded task limit', {
      userId: user.id,
      tasksUsed: balanceCheck.tasksUsed,
      tasksLimit: balanceCheck.tasksLimit
    })
    return NextResponse.json({
      ok: false,
      errors: [`Task limit exceeded. You have used ${balanceCheck.tasksUsed} of ${balanceCheck.tasksLimit} tasks this month.`],
      taskLimitExceeded: true,
      tasksUsed: balanceCheck.tasksUsed,
      tasksLimit: balanceCheck.tasksLimit
    }, { status: 402 }) // 402 Payment Required
  }

  try {
    // STEP 1: Check for cached template (template-first approach)
    if (useTemplateCache && parsed.data.flow.nodes.length === 0) {
      const promptHash = generatePromptHash(parsed.data.prompt)

      logger.debug('[API /edits] Checking template cache', { promptHash })

      const { data: cachedTemplate, error: cacheError } = await supabase
        .from('templates')
        .select(`
          id,
          name,
          description,
          category,
          nodes,
          connections,
          workflow_json,
          integrations,
          prompt_hash,
          original_prompt,
          is_ai_generated
        `)
        .eq('prompt_hash', promptHash)
        .eq('is_ai_generated', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!cacheError && cachedTemplate) {
        const duration = Date.now() - startTime
        logger.debug('[API /edits] Template cache HIT', {
          flowId,
          duration,
          templateId: cachedTemplate.id,
          templateName: cachedTemplate.name,
        })

        // Convert cached template to PlannerResult format
        const result = templateToPlannerResult(cachedTemplate, existingNodeIds)

        // Track cache hit usage (no task deduction for templates)
        const nodeCount = result.edits.filter(e => e.op === 'addNode').length
        trackAIWorkflowUsage(
          user.id,
          flowId,
          nodeCount,
          'cache',
          duration
        ).catch(() => {}) // Ignore errors

        return NextResponse.json({
          ok: true,
          flowId,
          ...result,
          fromCache: true,
          cachedTemplateId: cachedTemplate.id,
          taskCost: {
            tasksUsed: 0,
            breakdown: { base: 0, complexity: 0, total: 0 },
            message: 'Template cache hit - no task cost'
          }
        })
      }

      logger.debug('[API /edits] Template cache MISS', { promptHash })
    }

    // STEP 2: Run the planner (LLM or pattern-based)
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

    // STEP 3: Save successful plan as template for future use
    // Only save if: plan has nodes, this is a fresh workflow, and saving is enabled
    if (saveAsTemplate && result.edits.length > 0 && parsed.data.flow.nodes.length === 0) {
      try {
        const templateData = plannerResultToTemplate(result, parsed.data.prompt)

        if (templateData && templateData.nodes.length > 0) {
          // Check if template already exists (race condition protection)
          const { data: existing } = await supabase
            .from('templates')
            .select('id')
            .eq('prompt_hash', templateData.promptHash)
            .eq('is_ai_generated', true)
            .limit(1)
            .maybeSingle()

          if (!existing) {
            const { data: savedTemplate, error: saveError } = await supabase
              .from('templates')
              .insert({
                name: templateData.name,
                description: templateData.description,
                category: templateData.category,
                tags: templateData.tags,
                nodes: templateData.nodes,
                connections: templateData.connections,
                workflow_json: {
                  nodes: templateData.nodes,
                  connections: templateData.connections,
                },
                integrations: templateData.integrations,
                prompt_hash: templateData.promptHash,
                original_prompt: parsed.data.prompt,
                is_ai_generated: true,
                is_public: false, // Start as private, admin can publish later
                is_predefined: false,
                status: 'draft',
                created_by: user.id,
              })
              .select('id, name')
              .single()

            if (saveError) {
              logger.warn('[API /edits] Failed to save template (non-blocking)', {
                error: saveError.message,
              })
            } else {
              logger.debug('[API /edits] Saved plan as template', {
                templateId: savedTemplate.id,
                templateName: savedTemplate.name,
                promptHash: templateData.promptHash,
              })
            }
          }
        }
      } catch (templateError) {
        // Template saving is non-blocking - don't fail the request
        logger.warn('[API /edits] Template save error (non-blocking)', {
          error: templateError instanceof Error ? templateError.message : 'Unknown error',
        })
      }
    }

    // STEP 4: Deduct tasks from user's balance for AI workflow creation
    const nodeCount = result.edits.filter(e => e.op === 'addNode').length
    const costResult = await deductAIWorkflowTasks(
      user.id,
      nodeCount,
      flowId,
      result.planningMethod === 'llm' ? 'llm' : 'pattern'
    )

    // Track usage for analytics (non-blocking)
    trackAIWorkflowUsage(
      user.id,
      flowId,
      nodeCount,
      result.planningMethod || 'unknown',
      duration
    ).catch(() => {}) // Ignore errors

    return NextResponse.json({
      ok: true,
      flowId,
      ...result,
      fromCache: false,
      taskCost: costResult.tasksUsed > 0 ? {
        tasksUsed: costResult.tasksUsed,
        breakdown: costResult.breakdown,
        remainingBalance: costResult.newBalance
      } : undefined
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
