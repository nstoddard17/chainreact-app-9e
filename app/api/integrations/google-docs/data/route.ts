import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const body = await req.json()
    const { integrationId, dataType, options = {} } = body

    logger.debug('[Google Docs API] POST request received:', {
      integrationId,
      dataType,
      hasOptions: !!options,
      optionsKeys: Object.keys(options)
    })

    if (!integrationId || !dataType) {
      return errorResponse('Integration ID and data type are required', 400)
    }

    // Fetch the integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'google-docs')
      .single()

    if (integrationError || !integration) {
      logger.error('[Google Docs API] Integration not found:', {
        integrationId,
        error: integrationError
      })
      return errorResponse('Google Docs not connected', 400)
    }

    // Decrypt tokens
    const encryptionKey = process.env.ENCRYPTION_KEY!
    const accessToken = decrypt(integration.access_token, encryptionKey)
    const refreshToken = integration.refresh_token ? decrypt(integration.refresh_token, encryptionKey) : null

    // Initialize OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expiry_date: integration.expires_at ? new Date(integration.expires_at).getTime() : undefined
    })

    // Check if token needs refresh
    if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken()
        oauth2Client.setCredentials(credentials)
        logger.debug('🔄 [Google Docs] Refreshed access token')
      } catch (error: any) {
        logger.error('[Google Docs] Failed to refresh token:', {
          message: error?.message,
          code: error?.code,
          status: error?.status,
          error: error?.response?.data || error?.toString()
        })
        return errorResponse('Google Docs authentication expired. Please reconnect your account.', 401, {
          needsReconnection: true
        })
      }
    }

    // Initialize Google Drive API (Google Docs files are stored in Drive)
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Handle different data types
    if (dataType === 'google-docs-documents') {
      // Fetch Google Docs documents
      const query = [
        `mimeType='application/vnd.google-apps.document'`,
        `trashed = false`
      ]

      // If folderId is provided, filter by parent folder
      if (options.folderId) {
        query.push(`'${options.folderId}' in parents`)
      }

      const response = await drive.files.list({
        q: query.join(' and '),
        fields: 'files(id,name,modifiedTime,webViewLink,iconLink,owners)',
        pageSize: options.maxResults || 100,
        orderBy: 'modifiedTime desc'
      })

      // Format the response for dropdown compatibility
      const documents = (response.data.files || []).map(file => ({
        value: file.id,
        label: file.name,
        id: file.id,
        name: file.name,
        webViewLink: file.webViewLink,
        modifiedTime: file.modifiedTime,
        owners: file.owners
      }))

      logger.debug(`[Google Docs API] Successfully fetched ${documents.length} documents`)

      return jsonResponse({
        data: documents,
        success: true
      })
    }

    return errorResponse('Unsupported data type', 400)
  } catch (error: any) {
    logger.error('[Google Docs API] Error fetching data:', {
      message: error?.message,
      code: error?.code,
      status: error?.status,
      statusCode: error?.statusCode,
      name: error?.name,
      response: error?.response?.data,
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    })

    // Handle specific Google API errors
    const errorCode = error?.code || error?.status || error?.statusCode
    const errorMessage = error?.message || ''

    if (errorCode === 401 || errorMessage.includes('authentication') || errorMessage.includes('expired')) {
      return errorResponse('Google Docs authentication expired. Please reconnect your account.', 401, {
        needsReconnection: true
      })
    }

    if (errorCode === 403 || errorMessage.includes('permission') || errorMessage.includes('forbidden')) {
      return errorResponse('Google Docs API access forbidden. Check your permissions.', 403, {
        needsReconnection: true
      })
    }

    if (errorCode === 429 || errorMessage.includes('rate limit')) {
      return errorResponse('Google Docs API rate limit exceeded. Please try again later.', 429)
    }

    return errorResponse(errorMessage || 'Failed to fetch Google Docs data', 500, {
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}
