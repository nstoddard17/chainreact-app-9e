/**
 * Stripe Integration Data API Route
 * Handles Stripe data requests with proper authentication and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { stripeHandlers } from './handlers'
import { StripeIntegration } from './types'
import { logger } from '@/lib/utils/logger'
import { decryptToken } from '@/lib/integrations/tokenUtils'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SECRET_KEY || ""

if (!supabaseUrl || !supabaseKey) {
  logger.error('[Stripe API] Missing Supabase environment variables')
}

const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  try {
    let integrationId, dataType, options = {}

    try {
      const body = await req.json()
      integrationId = body.integrationId
      dataType = body.dataType
      options = body.options || {}

      logger.info('[Stripe API] Received request', {
        integrationId,
        dataType,
        options,
        timestamp: new Date().toISOString()
      })
    } catch (parseError: any) {
      logger.error('[Stripe API] Failed to parse request body', {
        error: parseError.message
      })
      return errorResponse('Invalid JSON in request body', 400, {
        details: parseError.message
      })
    }

    // Validate required parameters
    if (!integrationId || !dataType) {
      return errorResponse('Missing required parameters: integrationId and dataType', 400)
    }

    // Fetch integration from database
    logger.info('[Stripe API] Fetching integration from database', {
      integrationId,
      provider: 'stripe'
    })

    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'stripe')
      .single()

    if (integrationError || !integration) {
      logger.error('[Stripe API] Integration not found', {
        integrationId,
        error: integrationError?.message || 'No integration returned',
        errorCode: integrationError?.code
      })
      return errorResponse('Stripe integration not found', 404)
    }

    logger.info('[Stripe API] Integration found', {
      integrationId,
      status: integration.status,
      hasToken: !!integration.access_token,
      userId: integration.user_id
    })

    // Validate integration status
    if (integration.status !== 'connected') {
      logger.error('[Stripe API] Integration not connected', {
        integrationId,
        status: integration.status,
        expectedStatus: 'connected'
      })
      return errorResponse('Stripe integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Get the appropriate handler
    const handler = stripeHandlers[dataType as keyof typeof stripeHandlers]
    if (!handler) {
      logger.error('[Stripe API] Unknown data type', {
        dataType,
        availableTypes: Object.keys(stripeHandlers)
      })
      return jsonResponse({
        error: `Unknown Stripe data type: ${dataType}`,
        availableTypes: Object.keys(stripeHandlers)
      }, { status: 400 })
    }

    logger.info('[Stripe API] Handler found, processing request', {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Decrypt the access token
    logger.info('[Stripe API] Decrypting access token', { integrationId })
    const decryptedToken = await decryptToken(integration.access_token)
    if (!decryptedToken) {
      logger.error('[Stripe API] Failed to decrypt access token', {
        integrationId,
        hasEncryptedToken: !!integration.access_token
      })
      return errorResponse('Failed to decrypt access token. Please reconnect your account.', 500, {
        needsReconnection: true
      })
    }

    logger.info('[Stripe API] Token decrypted successfully', { integrationId })

    // Create integration object with decrypted token
    const integrationWithToken: StripeIntegration = {
      ...integration,
      access_token: decryptedToken
    }

    // Execute the handler
    let data
    try {
      logger.info('[Stripe API] Executing handler', {
        integrationId,
        dataType,
        options
      })
      data = await handler(integrationWithToken, options)
      logger.info('[Stripe API] Handler executed successfully', {
        integrationId,
        dataType,
        resultCount: Array.isArray(data) ? data.length : (data ? 1 : 0),
        resultType: typeof data,
        isArray: Array.isArray(data)
      })
    } catch (handlerError: any) {
      logger.error('[Stripe API] Handler execution failed', {
        dataType,
        error: handlerError.message,
        integrationId,
        statusCode: handlerError.statusCode,
        stripeCode: handlerError.code
      })

      // Return a proper error response
      return errorResponse(handlerError.message || 'Failed to fetch Stripe data', 500, {
        details: process.env.NODE_ENV === 'development' ? handlerError.stack : undefined,
        needsReconnection: handlerError.message?.includes('authentication')
      })
    }

    logger.info(`[Stripe API] Successfully processed ${dataType}`, {
      integrationId,
      resultCount: Array.isArray(data) ? data.length : (data ? 1 : 0)
    })

    return jsonResponse({
      data,
      success: true,
      integrationId,
      dataType
    })

  } catch (error: any) {
    logger.error('[Stripe API] Unexpected error', {
      error: error.message,
      stack: error.stack
    })

    // Handle authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      return errorResponse(error.message, 401, { needsReconnection: true })
    }

    // Handle rate limit errors
    if (error.message?.includes('rate limit')) {
      return errorResponse('Stripe API rate limit exceeded. Please try again later.', 429, {
        retryAfter: 60
      })
    }

    return errorResponse(error.message || 'Internal server error', 500, {
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}
