import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { prepareIntegrationData } from '@/lib/integrations/tokenUtils'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const baseUrl = getBaseUrl()
  const devWebhookUrl = process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL || process.env.NGROK_URL || process.env.NEXT_PUBLIC_NGROK_URL || process.env.TUNNEL_URL
  const redirectBase = devWebhookUrl || baseUrl
  
  logger.debug('📍 Slack callback - Base URL:', baseUrl)
  logger.debug('📍 Slack callback - Request URL:', request.url)
  logger.debug('📍 Slack callback - Using redirect base:', redirectBase)
  
  const supabase = createAdminClient()

  if (!code || !state) {
    return createPopupResponse("error", "slack", "Authorization code or state parameter is missing.", redirectBase)
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { userId } = stateData

    if (!userId) {
      logger.error("Missing userId in Slack state")
      return createPopupResponse("error", "slack", "User ID is missing from state", redirectBase)
    }

    const clientId = process.env.SLACK_CLIENT_ID
    const clientSecret = process.env.SLACK_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Slack client ID or secret not configured")
    }

    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${redirectBase}/api/integrations/slack/callback`,
      }),
    })

    if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json()
      throw new Error(`Slack token exchange failed: ${errorData.error}`)
    }

    const tokenData = await tokenResponse.json()

    if(!tokenData.ok) {
        throw new Error(`Slack token exchange failed: ${tokenData.error}`)
    }

    // Log token data structure (without sensitive values)
    logger.debug('Slack token response structure:', {
      ok: tokenData.ok,
      app_id: tokenData.app_id,
      authed_user: tokenData.authed_user ? { id: tokenData.authed_user.id } : null,
      team: tokenData.team,
      has_bot_token: !!tokenData.access_token,
      has_user_token: tokenData.authed_user && !!tokenData.authed_user.access_token,
      has_refresh_token: !!tokenData.refresh_token,
      has_authed_user_refresh_token: tokenData.authed_user && !!tokenData.authed_user.refresh_token,
      bot_scope: tokenData.scope,
      user_scope: tokenData.authed_user?.scope,
      token_type: tokenData.token_type,
    });

    // Store BOTH bot and user tokens for flexibility
    // Bot token is used by default, user token is used when sending as user
    const botToken = tokenData.access_token; // xoxb- token
    const userToken = tokenData.authed_user?.access_token; // xoxp- token
    const botRefreshToken = tokenData.refresh_token;
    const userRefreshToken = tokenData.authed_user?.refresh_token;

    // Use bot token as primary (for backward compatibility)
    // But store user token in metadata for "send as user" functionality
    const accessToken = botToken || userToken;
    const refreshToken = botRefreshToken || userRefreshToken;

    // Combine both bot and user scopes if both are present
    const botScopes = tokenData.scope ? tokenData.scope.split(' ') : [];
    const userScopes = tokenData.authed_user?.scope ? tokenData.authed_user.scope.split(' ') : [];
    const scopes = [...new Set([...botScopes, ...userScopes])];

    const expiresIn = tokenData.authed_user?.expires_in || tokenData.expires_in; // Typically in seconds

    const { data: existingIntegration, error: fetchError } = await supabase
      .from('integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'slack')
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // Ignore 'not found' error
      throw new Error(`Failed to check for existing integration: ${fetchError.message}`);
    }

    // Encrypt user token separately for storage in metadata
    const { encryptTokens } = await import('@/lib/integrations/tokenUtils');
    let encryptedUserToken = null;
    let encryptedUserRefreshToken = null;

    if (userToken) {
      const userTokens = await encryptTokens(userToken, userRefreshToken);
      encryptedUserToken = userTokens.encryptedAccessToken;
      encryptedUserRefreshToken = userTokens.encryptedRefreshToken;
    }

    // Prepare integration data with encrypted tokens
    const integrationData = await prepareIntegrationData(
      userId,
      'slack',
      accessToken,
      refreshToken,
      scopes,
      expiresIn,
      {
        token_type: botToken ? 'bot' : 'user',
        team_id: tokenData.team?.id,
        team_name: tokenData.team?.name,
        app_id: tokenData.app_id,
        authed_user_id: tokenData.authed_user?.id,
        // Store encrypted user tokens for "send as user" functionality
        user_token: encryptedUserToken,
        user_refresh_token: encryptedUserRefreshToken,
        has_user_token: !!userToken,
        bot_scopes: tokenData.scope,
        user_scopes: tokenData.authed_user?.scope
      }
    );

    const { error: upsertError } = await supabase.from('integrations').upsert(integrationData, {
      onConflict: 'user_id, provider',
    });

    if (upsertError) {
      throw new Error(`Failed to save Slack integration: ${upsertError.message}`)
    }

    return createPopupResponse("success", "slack", "Slack account connected successfully.", redirectBase)
  } catch (e: any) {
    logger.error("Slack callback error:", e)
    const message = e.message || "An unexpected error occurred."
    return createPopupResponse("error", "slack", message, redirectBase)
  }
}
