import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { prepareIntegrationData } from '@/lib/integrations/tokenUtils'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const baseUrl = getBaseUrl()
  console.log('📍 Slack callback - Base URL:', baseUrl)
  console.log('📍 Slack callback - Request URL:', request.url)
  
  const supabase = createAdminClient()

  if (!code || !state) {
    return createPopupResponse("error", "slack", "Authorization code or state parameter is missing.", baseUrl)
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { userId } = stateData

    if (!userId) {
      console.error("Missing userId in Slack state")
      return createPopupResponse("error", "slack", "User ID is missing from state", baseUrl)
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
        redirect_uri: `${baseUrl}/api/integrations/slack/callback`,
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
    console.log('Slack token response structure:', {
      ok: tokenData.ok,
      app_id: tokenData.app_id,
      authed_user: tokenData.authed_user ? { id: tokenData.authed_user.id } : null,
      team: tokenData.team,
      has_access_token: !!tokenData.access_token,
      has_authed_user_token: tokenData.authed_user && !!tokenData.authed_user.access_token,
      has_refresh_token: !!tokenData.refresh_token,
      has_authed_user_refresh_token: tokenData.authed_user && !!tokenData.authed_user.refresh_token,
      scope: tokenData.scope,
      token_type: tokenData.token_type,
    });

    // For user token flow, the token is in authed_user.access_token
    const accessToken = tokenData.authed_user?.access_token || tokenData.access_token;
    const refreshToken = tokenData.authed_user?.refresh_token || tokenData.refresh_token;
    const tokenType = tokenData.authed_user?.access_token ? 'user' : 'bot';
    const scopes = tokenData.authed_user?.scope ? tokenData.authed_user.scope.split(' ') : 
                  (tokenData.scope ? tokenData.scope.split(' ') : []);

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

    // Prepare integration data with encrypted tokens
    const integrationData = await prepareIntegrationData(
      userId,
      'slack',
      accessToken,
      refreshToken,
      scopes,
      expiresIn,
      {
        token_type: tokenType,
        team_id: tokenData.team?.id,
        team_name: tokenData.team?.name,
        app_id: tokenData.app_id,
        authed_user_id: tokenData.authed_user?.id
      }
    );

    const { error: upsertError } = await supabase.from('integrations').upsert(integrationData, {
      onConflict: 'user_id, provider',
    });

    if (upsertError) {
      throw new Error(`Failed to save Slack integration: ${upsertError.message}`)
    }

    return createPopupResponse("success", "slack", "Slack account connected successfully.", baseUrl)
  } catch (e: any) {
    console.error("Slack callback error:", e)
    const message = e.message || "An unexpected error occurred."
    return createPopupResponse("error", "slack", message, baseUrl)
  }
}
