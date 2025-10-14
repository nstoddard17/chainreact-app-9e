/**
 * Mailchimp Integration Data API Route
 * Handles Mailchimp data requests with proper authentication and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { mailchimpHandlers } from './handlers'
import { MailchimpIntegration } from './types'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  try {
    const { integrationId, dataType, options = {} } = await req.json()

    // Validate required parameters
    if (!integrationId || !dataType) {
      return errorResponse('Missing required parameters: integrationId and dataType'
      , 400)
    }

    // Fetch integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'mailchimp')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [Mailchimp API] Integration not found:', { integrationId, error: integrationError })
      return errorResponse('Mailchimp integration not found'
      , 404)
    }

    // Validate integration status
    if (integration.status !== 'connected') {
      logger.error('❌ [Mailchimp API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return errorResponse('Mailchimp integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Get the appropriate handler
    const handler = mailchimpHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Mailchimp API] Unknown data type:', dataType)
      return jsonResponse({
        error: `Unknown Mailchimp data type: ${dataType}`,
        availableTypes: Object.keys(mailchimpHandlers)
      }, { status: 400 })
    }

    logger.debug(`🔍 [Mailchimp API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    const data = await handler(integration as MailchimpIntegration, options)

    logger.debug(`✅ [Mailchimp API] Successfully processed ${dataType}:`, {
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
    logger.error('❌ [Mailchimp API] Unexpected error:', {
      error: error.message,
      stack: error.stack
    })

    // Handle authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      return errorResponse(error.message, 401, { needsReconnection: true
       })
    }

    // Handle rate limit errors
    if (error.message?.includes('rate limit')) {
      return errorResponse(error.message, 429, { retryAfter: 60
       })
    }

    // Generic error response
    return errorResponse(error.message || 'An unexpected error occurred', 500, { details: process.env.NODE_ENV === 'development' ? error.stack : undefined
     })
  }
}
