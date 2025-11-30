/**
 * Dropbox Integration Data API Route
 * Handles Dropbox data requests with proper authentication and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { dropboxHandlers } from './handlers'
import { DropboxIntegration } from './types'
import { flagIntegrationWorkflows } from '@/lib/integrations/integrationWorkflowManager'

import { logger } from '@/lib/utils/logger'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function POST(req: NextRequest) {
  let integration: any = null

  try {
    const { integrationId, dataType, options = {} } = await req.json()

    // Validate required parameters
    if (!integrationId || !dataType) {
      return errorResponse('Missing required parameters: integrationId and dataType'
      , 400)
    }

    // Fetch integration from database
    const { data: integrationRecord, error: integrationError } = await getSupabase()
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'dropbox')
      .single()

    if (integrationError || !integrationRecord) {
      logger.error('❌ [Dropbox API] Integration not found:', { integrationId, error: integrationError })
      return errorResponse('Dropbox integration not found'
      , 404)
    }

    integration = integrationRecord

    // Validate integration status
    if (integration.status !== 'connected') {
      logger.error('❌ [Dropbox API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return errorResponse('Dropbox integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Get the appropriate handler
    const handler = dropboxHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Dropbox API] Unknown data type:', dataType)
      return jsonResponse({
        error: `Unknown Dropbox data type: ${dataType}`,
        availableTypes: Object.keys(dropboxHandlers)
      }, { status: 400 })
    }

    logger.debug(`🔍 [Dropbox API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    const data = await handler(integration as DropboxIntegration, options)

    logger.debug(`✅ [Dropbox API] Successfully processed ${dataType}:`, {
      integrationId,
      resultCount: data?.length || 0
    })

    return jsonResponse({
      data,
      success: true,
      integrationId,
      dataType
    })

  } catch (error: any) {
    logger.error('❌ [Dropbox API] Unexpected error:', {
      error: error.message,
      stack: error.stack
    })

    // Handle authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      if (integration?.id && integration?.user_id) {
        await flagIntegrationWorkflows({
          integrationId: integration.id,
          provider: 'dropbox',
          userId: integration.user_id,
          reason: error.message,
        })
      }
      return errorResponse(error.message, 401, { needsReconnection: true
       })
    }

    // Handle rate limit errors
    if (error.message?.includes('rate limit')) {
      return errorResponse('Dropbox API rate limit exceeded. Please try again later.', 429, { retryAfter: 60
       })
    }

    return errorResponse(error.message || 'Internal server error', 500, { details: process.env.NODE_ENV === 'development' ? error.stack : undefined
     })
  }
}
