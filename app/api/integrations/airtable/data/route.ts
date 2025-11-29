/**
 * Airtable Integration Data API Route
 * Handles Airtable data requests with proper authentication and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { airtableHandlers } from './handlers'
import { AirtableIntegration } from './types'
import { decrypt } from '@/lib/security/encryption'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SECRET_KEY || ""
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
      .eq('provider', 'airtable')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [Airtable API] Integration not found:', { integrationId, error: integrationError })
      return errorResponse('Airtable integration not found'
      , 404)
    }

    // Validate integration status
    if (integration.status !== 'connected') {
      logger.error('❌ [Airtable API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return errorResponse('Airtable integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Decrypt the access token
    const encryptionKey = process.env.ENCRYPTION_KEY
    if (!encryptionKey) {
      logger.error('❌ [Airtable API] ENCRYPTION_KEY not configured')
      return errorResponse('Server configuration error', 500)
    }

    try {
      integration.access_token = decrypt(integration.access_token, encryptionKey)
      if (integration.refresh_token) {
        integration.refresh_token = decrypt(integration.refresh_token, encryptionKey)
      }
    } catch (decryptError) {
      logger.error('❌ [Airtable API] Failed to decrypt tokens:', decryptError)
      return errorResponse('Failed to decrypt authentication tokens. Please reconnect your account.', 500, {
        needsReconnection: true
      })
    }

    // Get the appropriate handler
    const handler = airtableHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Airtable API] Unknown data type:', dataType)
      return jsonResponse({
        error: `Unknown Airtable data type: ${dataType}`,
        availableTypes: Object.keys(airtableHandlers)
      }, { status: 400 })
    }

    logger.debug(`🔍 [Airtable API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    const data = await handler(integration as AirtableIntegration, options)

    logger.debug(`✅ [Airtable API] Successfully processed ${dataType}:`, {
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
    logger.error('❌ [Airtable API] Unexpected error:', {
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
      return errorResponse('Airtable API rate limit exceeded. Please try again later.', 429, { retryAfter: 60
       })
    }

    return errorResponse(error.message || 'Internal server error', 500, { details: process.env.NODE_ENV === 'development' ? error.stack : undefined
     })
  }
}