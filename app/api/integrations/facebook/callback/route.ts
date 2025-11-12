import { type NextRequest } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { encrypt } from '@/lib/security/encryption'

import { logger } from '@/lib/utils/logger'

// Validate environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable")
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable")
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')
  const baseUrl = getBaseUrl()
  const provider = 'facebook'

  if (error) {
    logger.error(`Error with Facebook OAuth: ${error} - ${errorDescription}`)
    return createPopupResponse('error', provider, errorDescription || `OAuth Error: ${error}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'No code or state provided for Facebook OAuth.', baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      return createPopupResponse('error', provider, 'Missing userId in Facebook state.', baseUrl)
    }

    const supabase = createAdminClient()

    const clientId = process.env.FACEBOOK_CLIENT_ID!
    const clientSecret = process.env.FACEBOOK_CLIENT_SECRET!
    const redirectUri = `${baseUrl}/api/integrations/facebook/callback`

    const tokenResponse = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&redirect_uri=${redirectUri}&client_secret=${clientSecret}&code=${code}`,
    )

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      logger.error('Failed to exchange Facebook code for token:', errorData)
      return createPopupResponse(
        'error',
        provider,
        errorData.error?.message || 'Failed to get Facebook access token.',
        baseUrl,
      )
    }

    const tokenData = await tokenResponse.json()

    // Fetch granted scopes using /debug_token
    let grantedScopes: string[] = []
    try {
      const appTokenResponse = await fetch(
        `https://graph.facebook.com/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
      )
      const appTokenData = await appTokenResponse.json()
      const appToken = appTokenData.access_token
      if (appToken) {
        const debugTokenResponse = await fetch(
          `https://graph.facebook.com/debug_token?input_token=${tokenData.access_token}&access_token=${appToken}`
        )
        const debugData = await debugTokenResponse.json()
        if (debugData.data && debugData.data.scopes) {
          grantedScopes = debugData.data.scopes
        }
      }
    } catch (e) {
      logger.warn('Failed to fetch Facebook granted scopes:', e)
    }

    const expiresIn = tokenData.expires_in
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    // Fetch user info for account display including profile picture
    // API VERIFICATION: Facebook Graph API /me endpoint
    // Docs: https://developers.facebook.com/docs/graph-api/reference/user/
    // Fields: email, name, picture.type(large) for profile picture
    let userEmail = null
    let userName = null
    let avatarUrl = null
    try {
      const meResponse = await fetch(
        `https://graph.facebook.com/v19.0/me?fields=email,name,picture.type(large)&access_token=${tokenData.access_token}`
      )
      if (meResponse.ok) {
        const meData = await meResponse.json()
        userEmail = meData.email || null
        userName = meData.name || null
        avatarUrl = meData.picture?.data?.url || null
      }
    } catch (e) {
      logger.warn('Failed to fetch Facebook user info:', e)
    }

    // Encrypt tokens before storing
    const encryptionKey = process.env.ENCRYPTION_KEY
    if (!encryptionKey) {
      return createPopupResponse('error', provider, 'Encryption key not configured', baseUrl)
    }

    const integrationData = {
      user_id: userId,
      provider: provider,
      access_token: encrypt(tokenData.access_token, encryptionKey),
      refresh_token: tokenData.refresh_token ? encrypt(tokenData.refresh_token, encryptionKey) : null,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      scopes: grantedScopes,
      status: 'connected',
      updated_at: new Date().toISOString(),
      // Clear disconnect fields on successful connection
      disconnect_reason: null,
      disconnected_at: null,
      // Workspace context (personal by default)
      workspace_type: 'personal',
      workspace_id: null,
      connected_by: userId,
      // Top-level account identity fields
      email: userEmail,
      username: userEmail?.split('@')[0] || null,
      account_name: userName || userEmail,
      avatar_url: avatarUrl,
      metadata: {
        // Keep in metadata for backward compatibility
        email: userEmail,
        account_name: userName,
        picture: avatarUrl
      }
    }

    // EMAIL-BASED DEDUPLICATION: Check if this account already exists
    // This allows multiple accounts per provider (different emails = different integrations)
    if (userEmail) {
      // Check if user already has this provider connected with this email
      const { data: existingIntegration } = await supabase
        .from('integrations')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', 'facebook')
        .eq('email', userEmail)
        .eq('workspace_type', 'personal')
        .single()

      if (existingIntegration) {
        // Update existing integration (refresh tokens for same account)
        const { error: updateError } = await supabase
          .from('integrations')
          .update(integrationData)
          .eq('id', existingIntegration.id)

        if (updateError) {
          logger.error('Failed to update Facebook integration:', updateError)
          return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
        }

        logger.debug(`✅ Updated existing Facebook integration: ${existingIntegration.id}`)
      } else {
        // Insert new integration (different email = new account)
        const { error: insertError } = await supabase
          .from('integrations')
          .insert(integrationData)

        if (insertError) {
          logger.error('Failed to save Facebook integration:', insertError)
          return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
        }

        logger.debug(`✅ Created new Facebook integration for ${userEmail}`)
      }
    } else {
      // Fallback: No email available, try to update by user_id + provider
      const { data: existingIntegration } = await supabase
        .from('integrations')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', 'facebook')
        .eq('workspace_type', 'personal')
        .single()

      if (existingIntegration) {
        const { error: updateError } = await supabase
          .from('integrations')
          .update(integrationData)
          .eq('id', existingIntegration.id)

        if (updateError) {
          logger.error('Failed to update Facebook integration:', updateError)
          return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
        }

        logger.debug(`✅ Updated existing Facebook integration (no email): ${existingIntegration.id}`)
      } else {
        const { error: insertError } = await supabase
          .from('integrations')
          .insert(integrationData)

        if (insertError) {
          logger.error('Failed to save Facebook integration:', insertError)
          return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
        }

        logger.debug(`✅ Created new Facebook integration (no email)`)
      }
    }

    return createPopupResponse('success', provider, 'Facebook account connected successfully.', baseUrl)
  } catch (error) {
    logger.error('Error during Facebook OAuth callback:', error)
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return createPopupResponse('error', provider, message, baseUrl)
  }
}
