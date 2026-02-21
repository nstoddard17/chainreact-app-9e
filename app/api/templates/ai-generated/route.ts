/**
 * API endpoint for saving AI-generated templates
 *
 * This endpoint is called after a successful workflow generation by the planner.
 * It converts the planner output to template format and saves it for reuse.
 */

import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'
import {
  plannerResultToTemplate,
  findExistingTemplate,
  type TemplateData,
} from '@/lib/workflows/ai-agent/planToTemplate'

interface SaveTemplateRequest {
  /** The planner result containing edits */
  plannerResult: {
    edits: Array<{
      op: string
      node?: any
      edge?: any
    }>
    prerequisites: string[]
    rationale: string
    deterministicHash: string
    workflowName?: string
    planningMethod?: 'llm' | 'pattern'
  }
  /** The original user prompt */
  originalPrompt: string
  /** Optional: Override the auto-generated name */
  name?: string
  /** Optional: Override the auto-generated description */
  description?: string
  /** Optional: Override the auto-generated category */
  category?: string
  /** Whether to make the template public immediately */
  isPublic?: boolean
}

export async function POST(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated", 401)
    }

    const body: SaveTemplateRequest = await request.json()

    if (!body.plannerResult || !body.originalPrompt) {
      return errorResponse("Missing required fields: plannerResult and originalPrompt", 400)
    }

    // Convert planner result to template format
    const templateData = plannerResultToTemplate(
      body.plannerResult as any,
      body.originalPrompt
    )

    if (!templateData) {
      return errorResponse("Failed to convert planner result to template - no nodes found", 400)
    }

    // Check for existing template with same prompt hash
    const existingTemplate = await findExistingTemplate(supabase, templateData.promptHash)

    if (existingTemplate) {
      logger.info('[AI Template] Found existing template with same prompt hash', {
        existingId: existingTemplate.id,
        existingName: existingTemplate.name,
        promptHash: templateData.promptHash,
      })

      // Return existing template instead of creating duplicate
      return jsonResponse({
        template: existingTemplate,
        isExisting: true,
        message: 'A similar template already exists',
      })
    }

    // Apply any overrides
    const finalName = body.name || templateData.name
    const finalDescription = body.description || templateData.description
    const finalCategory = body.category || templateData.category

    // Save to database
    const { data: template, error } = await supabase
      .from("templates")
      .insert({
        name: finalName,
        description: finalDescription,
        category: finalCategory,
        tags: templateData.tags,
        nodes: templateData.nodes,
        connections: templateData.connections,
        workflow_json: {
          nodes: templateData.nodes,
          connections: templateData.connections,
        },
        integrations: templateData.integrations,
        prompt_hash: templateData.promptHash,
        original_prompt: body.originalPrompt,
        is_ai_generated: true,
        is_public: body.isPublic ?? false,
        is_predefined: false,
        status: body.isPublic ? 'published' : 'draft',
        published_at: body.isPublic ? new Date().toISOString() : null,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      logger.error("[AI Template] Error saving template:", error)
      return errorResponse("Failed to save template", 500)
    }

    logger.info('[AI Template] Successfully saved AI-generated template', {
      templateId: template.id,
      templateName: template.name,
      promptHash: templateData.promptHash,
      nodeCount: templateData.nodes.length,
      integrations: templateData.integrations,
    })

    return jsonResponse({
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        tags: template.tags,
        integrations: templateData.integrations,
        nodeCount: templateData.nodes.length,
        isPublic: template.is_public,
      },
      isExisting: false,
      message: 'Template saved successfully',
    })
  } catch (error) {
    logger.error("[AI Template] Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * GET endpoint to find template by prompt hash
 * Used to check if a similar template already exists before planning
 */
export async function GET(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    const { searchParams } = new URL(request.url)

    const promptHash = searchParams.get('promptHash')
    const prompt = searchParams.get('prompt')

    if (!promptHash && !prompt) {
      return errorResponse("Missing required parameter: promptHash or prompt", 400)
    }

    // If prompt is provided, compute hash
    let hash = promptHash
    if (!hash && prompt) {
      const { createHash } = await import('crypto')
      const normalized = prompt
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      hash = createHash('sha256').update(normalized).digest('hex').slice(0, 16)
    }

    // Find template
    const { data: template, error } = await supabase
      .from('templates')
      .select(`
        id,
        name,
        description,
        category,
        tags,
        nodes,
        connections,
        workflow_json,
        integrations,
        is_public,
        is_ai_generated,
        original_prompt,
        created_at
      `)
      .eq('prompt_hash', hash)
      .eq('is_ai_generated', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      logger.error("[AI Template] Error finding template:", error)
      return errorResponse("Failed to find template", 500)
    }

    if (!template) {
      return jsonResponse({ template: null, found: false })
    }

    // Parse JSON fields if needed
    const nodes = typeof template.nodes === 'string'
      ? JSON.parse(template.nodes)
      : template.nodes || template.workflow_json?.nodes || []

    const connections = typeof template.connections === 'string'
      ? JSON.parse(template.connections)
      : template.connections || template.workflow_json?.connections || []

    return jsonResponse({
      template: {
        ...template,
        nodes,
        connections,
      },
      found: true,
    })
  } catch (error) {
    logger.error("[AI Template] Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
