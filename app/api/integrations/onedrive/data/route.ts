/**
 * OneDrive Integration Data API Route
 * Handles OneDrive data requests with proper authentication and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from "@supabase/supabase-js"
import { onedriveHandlers } from './handlers'
import { OneDriveIntegration } from './types'
import { safeDecrypt } from '@/lib/security/encryption'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  try {
    const { integrationId, dataType, options = {} } = await req.json()

    // Log request to debug spamming issue
    logger.debug(`📥 [OneDrive API] Request received:`, {
      timestamp: new Date().toISOString(),
      dataType,
      integrationId: `${integrationId?.substring(0, 8) }...`,
      options,
      folderId: options?.folderId
    })

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
      .in('provider', ['onedrive', 'microsoft-onedrive'])
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [OneDrive API] Integration not found:', { integrationId, error: integrationError })
      return NextResponse.json({
        error: 'OneDrive integration not found'
      }, { status: 404 })
    }

    // Validate integration status
    if (integration.status !== 'connected') {
      logger.error('❌ [OneDrive API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return NextResponse.json({
        error: 'OneDrive integration is not connected. Please reconnect your Microsoft account.',
        needsReconnection: true,
        currentStatus: integration.status
      }, { status: 400 })
    }

    // Get the appropriate handler
    const handler = onedriveHandlers[dataType]
    if (!handler) {
      logger.error('❌ [OneDrive API] Unknown data type:', dataType)
      return NextResponse.json({
        error: `Unknown OneDrive data type: ${dataType}`,
        availableTypes: Object.keys(onedriveHandlers)
      }, { status: 400 })
    }

    logger.debug(`🔍 [OneDrive API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token,
      tokenLength: integration.access_token?.length,
      tokenPreview: integration.access_token ? `${integration.access_token.substring(0, 50) }...` : null
    })

    // Decrypt the access token before passing to handler
    let decryptedAccessToken = null
    let decryptedRefreshToken = null

    try {
      if (integration.access_token) {
        logger.debug(`🔑 [OneDrive API] Attempting to decrypt access token...`)
        decryptedAccessToken = safeDecrypt(integration.access_token)
        logger.debug(`✅ [OneDrive API] Access token decrypted, length: ${decryptedAccessToken?.length}`)
      }
      if (integration.refresh_token) {
        decryptedRefreshToken = safeDecrypt(integration.refresh_token)
      }
    } catch (decryptError) {
      logger.error(`❌ [OneDrive API] Token decryption failed:`, decryptError)
      throw new Error('Failed to decrypt OneDrive tokens. Please reconnect your account.')
    }

    const decryptedIntegration = {
      ...integration,
      access_token: decryptedAccessToken,
      refresh_token: decryptedRefreshToken
    }

    logger.debug(`🔐 [OneDrive API] Token validation:`, {
      hasAccessToken: !!decryptedIntegration.access_token,
      accessTokenLength: decryptedIntegration.access_token?.length,
      isValidJWT: decryptedIntegration.access_token?.includes('.'),
      tokenType: typeof decryptedIntegration.access_token,
      firstChars: decryptedIntegration.access_token ? decryptedIntegration.access_token.substring(0, 20) : null
    })

    // Execute the handler with decrypted integration
    const data = await handler(decryptedIntegration as OneDriveIntegration, options)

    logger.debug(`✅ [OneDrive API] Successfully processed ${dataType}:`, {
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
    logger.error('❌ [OneDrive API] Unexpected error:', {
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
        error: 'Microsoft Graph API rate limit exceeded. Please try again later.',
        retryAfter: 60
      }, { status: 429 })
    }

    return NextResponse.json({
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}