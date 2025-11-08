import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { getGitHubHandler } from './handlers'
import { logger } from '@/lib/utils/logger'
import { decrypt } from '@/lib/security/encryption'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * POST /api/integrations/github/data
 *
 * Fetches dynamic field data from GitHub API
 *
 * Request body:
 * - integrationId: string - The integration ID
 * - dataType: 'github_repositories' | 'github_assignees' | 'github_labels' | 'github_milestones'
 * - options?: { repository?: string } - Optional parameters (repository required for assignees, labels, milestones)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { integrationId, dataType, options = {} } = body

    logger.debug('🔍 [GitHub Data API] Request:', { integrationId, dataType, options })

    // Validate required parameters
    if (!integrationId || !dataType) {
      logger.debug('❌ [GitHub Data API] Missing required parameters')
      return errorResponse('Missing required parameters: integrationId and dataType', 400)
    }

    // Get GitHub integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'github')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [GitHub API] Integration not found:', { integrationId, error: integrationError })
      return errorResponse('GitHub integration not connected', 404)
    }

    // Validate integration status
    if (integration.status === 'needs_reauthorization') {
      logger.error('❌ [GitHub API] Integration needs re-authorization:', {
        integrationId,
        status: integration.status
      })
      return jsonResponse({
        data: [],
        success: false,
        error: 'GitHub integration needs to be re-authorized. Please reconnect your GitHub account.',
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    if (integration.status === 'disconnected' || integration.status === 'error') {
      logger.error('❌ [GitHub API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return jsonResponse({
        data: [],
        success: false,
        error: 'GitHub integration is not connected. Please reconnect your account.',
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    if (integration.status !== 'connected' && integration.status !== 'active') {
      logger.warn('⚠️ [GitHub API] Non-standard integration status, continuing anyway:', {
        integrationId,
        status: integration.status
      })
    }

    // Get access token from encrypted_data (new format) or access_token field (old format)
    let accessToken: string | null = null

    logger.debug('🔍 [GitHub API] Token extraction debug:', {
      hasEncryptedData: !!integration.encrypted_data,
      hasAccessToken: !!integration.access_token,
      encryptedDataType: typeof integration.encrypted_data
    })

    if (integration.encrypted_data) {
      // New format: encrypted_data contains JSON with encrypted tokens
      try {
        const encryptionKey = process.env.ENCRYPTION_KEY
        if (!encryptionKey) {
          logger.error('❌ [GitHub API] Encryption key not configured')
          throw new Error('Encryption key not configured')
        }

        const encryptedData = typeof integration.encrypted_data === 'string'
          ? JSON.parse(integration.encrypted_data)
          : integration.encrypted_data

        logger.debug('🔍 [GitHub API] Encrypted data parsed:', {
          hasAccessToken: !!encryptedData.access_token,
          keys: Object.keys(encryptedData)
        })

        if (encryptedData.access_token) {
          accessToken = decrypt(encryptedData.access_token, encryptionKey)
          logger.debug('✅ [GitHub API] Access token decrypted successfully')
        } else {
          logger.warn('⚠️ [GitHub API] No access_token in encrypted_data')
        }
      } catch (decryptError: any) {
        logger.error('❌ [GitHub API] Failed to decrypt access token:', {
          error: decryptError.message,
          stack: decryptError.stack
        })
        return errorResponse('Failed to decrypt GitHub access token', 500)
      }
    } else if (integration.access_token) {
      // Old format: access_token stored directly (backwards compatibility)
      // Note: Old format also encrypted the token, just stored in access_token field instead of encrypted_data
      try {
        const encryptionKey = process.env.ENCRYPTION_KEY
        if (!encryptionKey) {
          logger.error('❌ [GitHub API] Encryption key not configured')
          throw new Error('Encryption key not configured')
        }

        accessToken = decrypt(integration.access_token, encryptionKey)
        logger.debug('✅ [GitHub API] Using legacy access_token field (decrypted)')
      } catch (decryptError: any) {
        logger.error('❌ [GitHub API] Failed to decrypt legacy access token:', {
          error: decryptError.message,
          stack: decryptError.stack
        })
        return errorResponse('Failed to decrypt GitHub access token', 500)
      }
    }

    if (!accessToken) {
      logger.error('❌ [GitHub API] No access token found:', {
        integrationId,
        hasEncryptedData: !!integration.encrypted_data,
        hasAccessToken: !!integration.access_token
      })
      return errorResponse('GitHub access token not found', 500)
    }

    logger.debug('✅ [GitHub API] Access token ready, calling handler')

    // Get handler for the requested data type
    const handler = getGitHubHandler(dataType)

    if (!handler) {
      logger.debug('❌ [GitHub Data API] Unsupported data type:', dataType)
      return errorResponse(`Unsupported data type: ${dataType}`, 400)
    }

    // Call the handler with access token and options
    logger.debug('📡 [GitHub Data API] Calling handler:', { dataType, options })
    const data = await handler(accessToken, options)

    logger.debug('✅ [GitHub Data API] Success:', { dataType, count: data.length })
    return jsonResponse({ data, success: true })

  } catch (error: any) {
    // Better error logging - extract all useful information
    const errorDetails = {
      message: error?.message || 'Unknown error',
      name: error?.name,
      code: error?.code,
      status: error?.status,
      statusText: error?.statusText,
      stack: error?.stack,
      // For fetch errors
      cause: error?.cause,
      // For GitHub API errors
      documentation_url: error?.documentation_url
    }

    logger.error('❌ [GitHub Data API] Error:', errorDetails)
    return errorResponse(error.message || 'Failed to fetch GitHub data', 500)
  }
}
