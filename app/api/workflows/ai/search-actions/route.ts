import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import {
  searchActions,
  rankActions,
  findSimilarActions,
  suggestActions,
  extractIntent,
  matchIntentToActions
} from '@/lib/workflows/ai/semanticSearch'
import { handleCorsPreFlight } from '@/lib/utils/cors'

import { logger } from '@/lib/utils/logger'

/**
 * API endpoint for semantic action search
 * POST /api/workflows/ai/search-actions
 * 
 * Used by the workflow builder to:
 * 1. Search for actions based on query
 * 2. Find similar actions
 * 3. Suggest actions based on workflow context
 * 4. Match user intent to actions
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    const body = await request.json()
    const { action } = body

    // Handle different search actions
    switch (action) {
      case 'search':
        return handleSearch(body)
      
      case 'similar':
        return handleSimilar(body)
      
      case 'suggest':
        return handleSuggest(body)
      
      case 'intent':
        return handleIntent(body)
      
      default:
        return errorResponse('Invalid action' , 400)
    }
  } catch (error) {
    logger.error('Action search error:', error)
    return errorResponse('Failed to search actions' , 500)
  }
}

/**
 * Handle semantic search for actions
 */
async function handleSearch(params: {
  query: string
  availableActions: string[]
  topK?: number
  context?: {
    recentlyUsed?: string[]
    userPreferences?: string[]
    triggerType?: string
  }
}) {
  try {
    const searchResults = await searchActions(
      params.query,
      params.availableActions,
      params.topK || 5
    )
    
    // Rank results based on context if provided
    const rankedResults = params.context ? 
      rankActions(searchResults, params.context) :
      searchResults.map(r => ({ ...r, reasoning: 'Semantic match' }))
    
    return jsonResponse({
      success: true,
      results: rankedResults.map(r => ({
        actionId: r.action.id,
        name: r.action.name,
        description: r.action.description,
        score: r.score,
        reasoning: r.reasoning,
        category: r.action.category,
        tags: r.action.tags
      }))
    })
  } catch (error) {
    logger.error('Search failed:', error)
    return jsonResponse(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * Handle finding similar actions
 */
async function handleSimilar(params: {
  actionId: string
  availableActions: string[]
  topK?: number
}) {
  try {
    const similarActions = await findSimilarActions(
      params.actionId,
      params.availableActions,
      params.topK || 3
    )
    
    return jsonResponse({
      success: true,
      results: similarActions.map(action => ({
        actionId: action.id,
        name: action.name,
        description: action.description,
        category: action.category,
        tags: action.tags
      }))
    })
  } catch (error) {
    logger.error('Similar search failed:', error)
    return jsonResponse(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * Handle action suggestions based on workflow context
 */
async function handleSuggest(params: {
  triggerType?: string
  existingActions: string[]
  workflowPurpose?: string
  allActions: string[]
}) {
  try {
    const suggestions = await suggestActions(
      {
        triggerType: params.triggerType,
        existingActions: params.existingActions,
        workflowPurpose: params.workflowPurpose
      },
      params.allActions
    )
    
    return jsonResponse({
      success: true,
      suggestions: suggestions.map(s => ({
        actionId: s.action.id,
        name: s.action.name,
        description: s.action.description,
        reason: s.reason,
        category: s.action.category,
        provider: s.action.provider
      }))
    })
  } catch (error) {
    logger.error('Suggestion failed:', error)
    return jsonResponse(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * Handle intent extraction and matching
 */
async function handleIntent(params: {
  query: string
  availableActions: string[]
}) {
  try {
    // Extract intent from query
    const intent = extractIntent(params.query)
    
    // Match intent to actions
    const matches = matchIntentToActions(intent, params.availableActions)
    
    return jsonResponse({
      success: true,
      intent: {
        action: intent.action,
        target: intent.target,
        attributes: intent.attributes
      },
      matches: matches.map(m => ({
        actionId: m.actionId,
        confidence: m.confidence
      }))
    })
  } catch (error) {
    logger.error('Intent matching failed:', error)
    return jsonResponse(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * OPTIONS handler for CORS preflight
 * Uses secure origin validation - only allows requests from trusted domains
 */
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: true,
    allowedMethods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
}