/**
 * Slack Integration Data API Route
 * Handles all Slack data requests with proper validation and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from "@supabase/supabase-js"
import { slackHandlers } from './handlers'
import { SlackIntegration } from './types'
import { decryptToken } from '@/lib/integrations/tokenUtils'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  try {
    const { integrationId, dataType, options = {} } = await req.json()

    // Validate required parameters
    if (!integrationId || !dataType) {
      return NextResponse.json({
        error: 'Missing required parameters: integrationId and dataType'
      }, { status: 400 })
    }

    // Fetch integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'slack')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [Slack API] Integration not found:', { integrationId, error: integrationError })
      return NextResponse.json({
        error: 'Slack integration not found'
      }, { status: 404 })
    }

    // Log integration status for debugging
    logger.debug('🔍 [Slack API] Integration status check:', {
      integrationId,
      status: integration.status,
      hasAccessToken: !!integration.access_token,
      tokenLength: integration.access_token?.length,
      tokenFormat: integration.access_token ? (integration.access_token.includes(':') ? 'encrypted' : 'plain') : 'none',
      provider: integration.provider,
      userId: integration.user_id
    })

    // Validate integration has access token (more important than status)
    if (!integration.access_token) {
      logger.error('❌ [Slack API] No access token found:', {
        integrationId,
        status: integration.status
      })
      return NextResponse.json({
        error: 'Slack authentication expired. Please reconnect your account.',
        needsReconnection: true,
        currentStatus: integration.status
      }, { status: 401 })
    }

    // Try to decrypt the token to validate it
    let decryptedAccessToken: string | null = null
    try {
      decryptedAccessToken = await decryptToken(integration.access_token)
      
      logger.debug('🔐 [Slack API] Token decryption result:', {
        integrationId,
        originalTokenLength: integration.access_token?.length,
        decryptedTokenLength: decryptedAccessToken?.length,
        tokenStartsWith: decryptedAccessToken?.substring(0, 10),
        isValidFormat: decryptedAccessToken?.startsWith('xoxb-') || decryptedAccessToken?.startsWith('xoxp-')
      })
      
      if (!decryptedAccessToken) {
        throw new Error('Failed to decrypt access token - result was null')
      }
    } catch (decryptError) {
      logger.error('❌ [Slack API] Failed to decrypt token:', {
        integrationId,
        error: decryptError.message,
        stack: decryptError.stack
      })
      return NextResponse.json({
        error: 'Slack authentication expired. Please reconnect your account.',
        needsReconnection: true,
        decryptionFailed: true
      }, { status: 401 })
    }

    // Validate integration status - allow multiple valid statuses
    const validStatuses = ['connected', 'active', 'authorized']
    if (!validStatuses.includes(integration.status)) {
      logger.warn('⚠️ [Slack API] Integration has unexpected status:', {
        integrationId,
        status: integration.status,
        validStatuses
      })
      // Don't fail if we have a token, just warn
    }

    // Get the appropriate handler
    const handler = slackHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Slack API] Unknown data type:', dataType)
      return NextResponse.json({
        error: `Unknown Slack data type: ${dataType}`,
        availableTypes: Object.keys(slackHandlers)
      }, { status: 400 })
    }

    logger.debug(`🔍 [Slack API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Decrypt the refresh token if it exists
    const decryptedRefreshToken = integration.refresh_token ? await decryptToken(integration.refresh_token) : null

    // Create integration object with decrypted tokens (using the already decrypted access token)
    const integrationWithDecryptedTokens = {
      ...integration,
      access_token: decryptedAccessToken,
      refresh_token: decryptedRefreshToken
    } as SlackIntegration

    // Execute the handler
    const data = await handler(integrationWithDecryptedTokens, options)

    logger.debug(`✅ [Slack API] Successfully processed ${dataType}:`, {
      integrationId,
      resultCount: data?.length || 0
    })

    return NextResponse.json({
      data,
      success: true,
      integrationId,
      dataType
    })

  } catch (error: any) {
    logger.error('❌ [Slack API] Unexpected error:', {
      error: error.message,
      stack: error.stack
    })

    // Handle authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      return NextResponse.json({
        error: error.message,
        needsReconnection: true
      }, { status: 401 })
    }

    // Handle rate limit errors
    if (error.message?.includes('rate limit')) {
      return NextResponse.json({
        error: 'Slack API rate limit exceeded. Please try again later.',
        retryAfter: 60
      }, { status: 429 })
    }

    return NextResponse.json({
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}