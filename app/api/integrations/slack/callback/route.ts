import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase URL or service role key")
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  const baseUrl = getBaseUrl()

  if (error) {
    console.error(`Slack OAuth error: ${error} - ${errorDescription}`)
    console.error(`Slack OAuth error details:`, { error, errorDescription, searchParams: Object.fromEntries(searchParams.entries()) })
    
    // Provide specific error messages for common Slack errors
    let userFriendlyMessage = errorDescription || "An unknown error occurred."
    
    if (error === 'invalid_team_for_non_distributed_app') {
      userFriendlyMessage = "This Slack app is configured for a specific workspace. Please contact support to configure the app for your workspace, or try installing the app in the correct workspace."
      console.error("Slack app distribution issue detected. Please verify:")
      console.error("1. App is set to 'Distributed' in Slack App settings")
      console.error("2. App is published to the App Directory (if required)")
      console.error("3. App permissions and scopes are correctly configured")
    } else if (error === 'access_denied') {
      userFriendlyMessage = "Access was denied. Please try again and make sure to authorize all requested permissions."
    } else if (error === 'invalid_client') {
      userFriendlyMessage = "Slack app configuration error. Please contact support."
    } else if (error === 'invalid_scope') {
      userFriendlyMessage = "The requested permissions are not available for this Slack app. Please contact support."
    }
    
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
              <p>${userFriendlyMessage}</p>
              <p>Please try again or contact support if the problem persists.</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'oauth-error',
                    provider: 'slack',
                    error: '${error}',
                    errorDescription: '${userFriendlyMessage}'
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

  if (!code || !state) {
    console.error("Missing code or state in Slack callback")
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

    // Determine which token to use - prefer bot token, fall back to user token
    const accessToken = tokenData.access_token || (tokenData.authed_user && tokenData.authed_user.access_token);
    const refreshToken = tokenData.refresh_token || (tokenData.authed_user && tokenData.authed_user.refresh_token);
    const tokenType = tokenData.access_token ? 'bot' : 'user';
    const scopes = tokenData.scope ? tokenData.scope.split(' ') : [];

    const expiresIn = tokenData.expires_in; // Typically in seconds
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null;

    const { data: existingIntegration, error: fetchError } = await supabase
      .from('integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'slack')
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // Ignore 'not found' error
      throw new Error(`Failed to check for existing integration: ${fetchError.message}`);
    }

    const integrationData = {
      user_id: userId,
      provider: 'slack',
      access_token: accessToken,
      refresh_token: refreshToken,
      scopes: scopes,
      status: 'connected',
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      updated_at: new Date().toISOString(),
      metadata: {
        token_type: tokenType,
        team_id: tokenData.team?.id,
        team_name: tokenData.team?.name,
        app_id: tokenData.app_id,
        authed_user_id: tokenData.authed_user?.id
      }
    };

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
