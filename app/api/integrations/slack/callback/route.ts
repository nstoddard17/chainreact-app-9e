import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { prepareIntegrationData } from '@/lib/integrations/tokenUtils'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const baseUrl = getBaseUrl()
  const supabase = createAdminClient()

  if (!code || !state) {
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Slack Connection Failed</title>
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; }
            .container { max-width: 500px; padding: 20px; border: 1px solid #ccc; border-radius: 8px; }
            h1 { color: #dc3545; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Slack Connection Failed</h1>
            <p>Authorization code or state parameter is missing.</p>
            <p>Please try again or contact support if the problem persists.</p>
             <script>
              if (window.opener) {
                window.opener.postMessage({
                  type: 'oauth-error',
                  provider: 'slack',
                  error: 'Missing code or state'
                }, '${baseUrl}');
                setTimeout(() => window.close(), 1000);
              }
            </script>
          </div>
        </body>
      </html>
    `
    return new Response(errorHtml, {
      headers: { "Content-Type": "text/html" },
      status: 400,
    })
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { userId } = stateData

    if (!userId) {
      console.error("Missing userId in Slack state")
      // Handle error: show an error page and inform the user
      return new Response("User ID is missing from state", { status: 400 })
    }

    const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
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

    const successHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Slack Connection Successful</title>
           <style>
              body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; }
              .container { max-width: 500px; padding: 20px; border: 1px solid #ccc; border-radius: 8px; }
              h1 { color: #28a745; }
              p { color: #666; }
            </style>
        </head>
        <body>
          <div class="container">
            <h1>Slack Connection Successful</h1>
            <p>You can now close this window.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth-success', provider: 'slack' }, '${baseUrl}');
              setTimeout(() => window.close(), 1000);
            }
          </script>
        </body>
      </html>
    `

    return new Response(successHtml, {
      headers: { "Content-Type": "text/html" },
    })
  } catch (e: any) {
    console.error("Slack callback error:", e)
    const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Slack Connection Failed</title>
            <style>
              body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; }
              .container { max-width: 500px; padding: 20px; border: 1px solid #ccc; border-radius: 8px; }
              h1 { color: #dc3545; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
               <h1>Slack Connection Failed</h1>
              <p>${e.message || "An unexpected error occurred."}</p>
               <p>Please try again or contact support if the problem persists.</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'oauth-error',
                    provider: 'slack',
                    error: 'Callback processing failed',
                    errorDescription: '${e.message || "An unexpected error occurred."}'
                  }, '${baseUrl}');
                  setTimeout(() => window.close(), 1000);
                }
              </script>
            </div>
          </body>
        </html>
      `
    return new Response(errorHtml, {
      headers: { "Content-Type": "text/html" },
      status: 500,
    })
  }
}
