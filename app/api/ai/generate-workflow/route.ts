import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { generateDynamicWorkflow } from "@/lib/ai/dynamicWorkflowAI"
import { nodeRegistry, getAllNodes } from "@/lib/workflows/nodes/registry"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { randomUUID } from "crypto"

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  // Rate limiting: 10 workflow generation requests per minute per IP (expensive operation)
  const rateLimitResult = checkRateLimit(request, {
    limit: 10,
    windowSeconds: 60
  })
  if (!rateLimitResult.success && rateLimitResult.response) {
    return rateLimitResult.response
  }

  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const { prompt, model, debug, strict } = await request.json()

    if (!prompt) {
      return errorResponse("Prompt is required" , 400)
    }

    // Register nodes if not already registered
    if (getAllNodes().length === 0) {
      nodeRegistry.registerNodes(ALL_NODE_COMPONENTS)
    }

    // Pre-validation: Check if the prompt mentions any coming soon integrations
    const comingSoonIntegrations = getAllNodes()
      .filter(node => node.comingSoon === true)
      .map(node => node.providerId)
      .filter((value, index, self) => value && self.indexOf(value) === index) // unique provider IDs
    
    const promptLower = prompt.toLowerCase()
    const mentionedComingSoon = comingSoonIntegrations.filter(provider => {
      if (!provider) return false
      // Check if the provider name is mentioned in the prompt
      return promptLower.includes(provider.toLowerCase())
    })
    
    if (mentionedComingSoon.length > 0) {
      return jsonResponse({
        error: `The following integrations are coming soon and not yet available: ${mentionedComingSoon.join(', ')}. Please try your request without these integrations.`,
        comingSoonIntegrations: mentionedComingSoon,
      }, { status: 400 })
    }

    // Validate model parameter
    const validModels = ['gpt-4o', 'gpt-4o-mini']
    const selectedModel = model && validModels.includes(model) ? model : 'gpt-4o-mini'

    // Generate workflow using dynamic AI with actual node registry
    const result = await generateDynamicWorkflow({
      prompt,
      userId: user.id,
      model: selectedModel as 'gpt-4o' | 'gpt-4o-mini',
      debug: !!debug,
      strict: !!strict,
    })
    const generatedWorkflow = result.workflow

    // Process nodes to add proper metadata
    const aiGeneratedNodes = generatedWorkflow.nodes.map(node => {
      // Check if this node is part of an AI Agent chain
      const nodeIdParts = node.id.split('-');
      const isChainNode = node.id.includes('-chain') && node.id.includes('-action');
      
      let additionalData: any = {
        isAIGenerated: true
      };
      
      // If this is a chain action node, extract and add chain metadata
      if (isChainNode) {
        // Pattern: {aiAgentId}-chain{index}-action{num}
        const chainMatch = node.id.match(/^(node-\d+)-chain(\d+)-action/);
        if (chainMatch) {
          const parentAIAgentId = chainMatch[1];
          const chainIndex = parseInt(chainMatch[2], 10);
          additionalData = {
            ...additionalData,
            isAIAgentChild: true,
            parentAIAgentId: parentAIAgentId,
            parentChainIndex: chainIndex
          };
          logger.debug(`Setting chain metadata for ${node.id}:`, { parentAIAgentId, chainIndex });
        }
      }
      
      return {
        ...node,
        data: {
          ...node.data,
          ...additionalData
        }
      };
    })
    
    // If strict mode rejected the output, return 422 without saving
    if (debug && result.debug?.rejected) {
      return jsonResponse({
        success: false,
        error: 'Generation rejected by strict mode due to validation issues.',
        debug: result.debug
      }, { status: 422 })
    }

    // Save the generated workflow to the database (without nodes/connections - they go to normalized tables)
    const newWorkflowId = randomUUID()
    const { data: workflow, error: dbError } = await supabase
      .from("workflows")
      .insert({
        id: newWorkflowId,
        name: generatedWorkflow.name,
        description: generatedWorkflow.description,
        user_id: user.id,
        status: "draft"
      })
      .select()
      .single()

    if (dbError) {
      logger.error("Database error:", dbError)
      return errorResponse("Failed to save workflow" , 500)
    }

    // Save nodes and edges to normalized tables
    if (aiGeneratedNodes && aiGeneratedNodes.length > 0) {
      const nodeIdMap = new Map<string, string>()
      const nodeRecords = aiGeneratedNodes.map((node: any, index: number) => {
        const nodeId = node.id || randomUUID()
        nodeIdMap.set(node.id || nodeId, nodeId)
        return {
          id: nodeId,
          workflow_id: newWorkflowId,
          user_id: user.id,
          node_type: node.data?.type || node.type || 'unknown',
          label: node.data?.label || node.data?.title || node.data?.type || 'Unnamed Node',
          description: node.data?.description || null,
          config: node.data?.config || node.data || {},
          position_x: node.position?.x ?? 400,
          position_y: node.position?.y ?? (100 + index * 180),
          is_trigger: node.data?.isTrigger ?? false,
          provider_id: (node.data?.type || '').split(':')[0] || null,
          display_order: index,
          in_ports: [],
          out_ports: [],
          metadata: { position: node.position, isAIGenerated: true },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      })

      const { error: nodesError } = await serviceClient
        .from('workflow_nodes')
        .insert(nodeRecords)

      if (nodesError) {
        logger.error("Error inserting workflow nodes:", nodesError)
      }

      // Insert edges
      if (generatedWorkflow.connections && generatedWorkflow.connections.length > 0) {
        const edgeRecords = generatedWorkflow.connections
          .filter((conn: any) => conn && (conn.source || conn.from) && (conn.target || conn.to))
          .map((conn: any) => {
            const sourceId = conn.source || conn.from
            const targetId = conn.target || conn.to
            return {
              id: conn.id || randomUUID(),
              workflow_id: newWorkflowId,
              user_id: user.id,
              source_node_id: nodeIdMap.get(sourceId) || sourceId,
              target_node_id: nodeIdMap.get(targetId) || targetId,
              source_port_id: conn.sourceHandle || 'source',
              target_port_id: conn.targetHandle || 'target',
              mappings: [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          })

        if (edgeRecords.length > 0) {
          const { error: edgesError } = await serviceClient
            .from('workflow_edges')
            .insert(edgeRecords)

          if (edgesError) {
            logger.error("Error inserting workflow edges:", edgesError)
          }
        }
      }
    }

    // Log the AI generation with model info
    await supabase.from("ai_workflow_generations").insert({
      user_id: user.id,
      prompt,
      generated_workflow: generatedWorkflow,
      confidence_score: 0.8,
      status: "generated",
      metadata: { model: selectedModel, debug: !!debug },
    })

    return jsonResponse({
      success: true,
      workflow,
      generated: generatedWorkflow,
      debug: debug ? result.debug : undefined,
    })
  } catch (error: any) {
    logger.error("Error generating workflow:", error)
    const msg: string = error?.message || ''
    if (msg.startsWith('VALIDATION_FAILED')) {
      let errors: string[] = []
      try {
        const jsonStart = msg.indexOf(':') + 1
        if (jsonStart > 0) errors = JSON.parse(msg.slice(jsonStart).trim())
      } catch {}
      return jsonResponse({
        success: false,
        error: 'AI generation failed validation. If it fails again, please try creating the workflow manually.',
        debug: debug ? { errors, rejected: true } : undefined,
      }, { status: 422 })
    }
    return jsonResponse({
      success: false,
      error: 'AI generation failed. If it fails again, please try creating the workflow manually.',
      details: error?.message,
    }, { status: 500 })
  }
}
