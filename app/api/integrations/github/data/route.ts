import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { getGitHubHandler } from './handlers'
import { logger } from '@/lib/utils/logger'

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

    const accessToken = integration.access_token

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
    logger.error('❌ [GitHub Data API] Error:', error)
    return errorResponse(error.message || 'Failed to fetch GitHub data', 500)
  }
}
