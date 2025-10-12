import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { processAIFields, ProcessingContext } from '@/lib/workflows/ai/fieldProcessor'
import { discoverActions } from '@/lib/workflows/ai/fieldProcessor'

import { logger } from '@/lib/utils/logger'

/**
 * API endpoint for AI field resolution
 * POST /api/workflows/ai/resolve-fields
 * 
 * Used by the workflow builder to:
 * 1. Preview AI field resolution
 * 2. Test AI routing decisions
 * 3. Discover actions based on intent
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { 
      action,
      nodeType,
      nodeId,
      config,
      triggerData,
      previousNodes,
      workflowId,
      executionId,
      userIntent
    } = body

    // Handle different actions
    switch (action) {
      case 'resolve':
        return handleFieldResolution({
          userId: user.id,
          nodeType,
          nodeId,
          config,
          triggerData,
          previousNodes,
          workflowId,
          executionId
        })
      
      case 'discover':
        return handleActionDiscovery({
          userId: user.id,
          userIntent,
          availableActions: body.availableActions || []
        })
      
      case 'preview':
        return handlePreview({
          userId: user.id,
          nodeType,
          config,
          sampleData: body.sampleData
        })
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error) {
    logger.error('AI field resolution error:', error)
    return NextResponse.json(
      { error: 'Failed to process AI fields' },
      { status: 500 }
    )
  }
}

/**
 * Handle field resolution for a node
 */
async function handleFieldResolution(params: {
  userId: string
  nodeType: string
  nodeId: string
  config: Record<string, any>
  triggerData?: any
  previousNodes?: Record<string, any>
  workflowId?: string
  executionId?: string
}) {
  const processingContext: ProcessingContext = {
    userId: params.userId,
    workflowId: params.workflowId || 'preview',
    executionId: params.executionId || 'preview',
    nodeId: params.nodeId,
    nodeType: params.nodeType,
    triggerData: params.triggerData,
    previousNodes: params.previousNodes ? new Map(Object.entries(params.previousNodes)) : undefined,
    config: params.config,
    apiKey: params.config.customApiKey,
    model: params.config.model || 'gpt-3.5-turbo'
  }

  try {
    const result = await processAIFields(processingContext)
    
    return NextResponse.json({
      success: true,
      resolvedFields: result.fields,
      routing: result.routing,
      cost: result.cost,
      tokensUsed: result.tokensUsed
    })
  } catch (error) {
    logger.error('Field resolution failed:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * Handle action discovery based on intent
 */
async function handleActionDiscovery(params: {
  userId: string
  userIntent: string
  availableActions: string[]
}) {
  try {
    const result = await discoverActions(
      params.userIntent,
      params.availableActions,
      {
        userId: params.userId,
        workflowId: 'discovery',
        executionId: 'discovery',
        nodeId: 'discovery',
        nodeType: 'ai_router',
        config: {},
        model: 'gpt-4o-mini'
      }
    )
    
    return NextResponse.json({
      success: true,
      actions: result.actions,
      confidence: result.confidence,
      cost: result.cost
    })
  } catch (error) {
    logger.error('Action discovery failed:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * Handle preview of AI field resolution
 */
async function handlePreview(params: {
  userId: string
  nodeType: string
  config: Record<string, any>
  sampleData: any
}) {
  // Create sample context for preview
  const processingContext: ProcessingContext = {
    userId: params.userId,
    workflowId: 'preview',
    executionId: 'preview',
    nodeId: 'preview',
    nodeType: params.nodeType,
    triggerData: params.sampleData.trigger || {
      email: {
        from: 'john@example.com',
        sender_name: 'John Doe',
        subject: 'Test Subject',
        body: 'This is a test email body'
      }
    },
    previousNodes: params.sampleData.previousNodes ? 
      new Map(Object.entries(params.sampleData.previousNodes)) : 
      undefined,
    config: params.config,
    apiKey: params.config.customApiKey,
    model: params.config.model || 'gpt-3.5-turbo'
  }

  try {
    const result = await processAIFields(processingContext)
    
    // Format the preview response
    const preview: Record<string, any> = {}
    
    for (const [field, value] of Object.entries(params.config)) {
      if (typeof value === 'string' && (
        value.includes('{{AI_FIELD:') ||
        value.includes('[') ||
        value.includes('{{AI:')
      )) {
        preview[field] = {
          original: value,
          resolved: result.fields[field],
          type: value.includes('{{AI_FIELD:') ? 'ai-generated' : 'template'
        }
      } else {
        preview[field] = {
          original: value,
          resolved: value,
          type: 'static'
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      preview,
      routing: result.routing,
      estimatedCost: result.cost
    })
  } catch (error) {
    logger.error('Preview generation failed:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * OPTIONS handler for CORS
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
