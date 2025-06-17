import { type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SlackOAuthService } from "@/lib/oauth/slack"
import { parseOAuthState, validateOAuthState } from "@/lib/oauth/utils"

const slackClientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
const slackClientSecret = process.env.SLACK_CLIENT_SECRET

if (!slackClientId || !slackClientSecret) {
  throw new Error("NEXT_PUBLIC_SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be defined")
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing required environment variables")
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    console.error("Slack OAuth error:", error)

    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Slack Connection Failed</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
          }
          .container { 
            text-align: center; 
            padding: 2rem;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            backdrop-filter: blur(10px);
          }
          .error-icon { font-size: 3rem; margin-bottom: 1rem; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
          p { margin: 0.5rem 0; opacity: 0.9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-icon">❌</div>
          <h1>Slack Connection Failed</h1>
          <p>${error}</p>
          <p>This window will close automatically...</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-error',
              provider: 'slack',
              error: '${error}'
            }, window.location.origin);
          }
          setTimeout(() => window.close(), 2000);
        </script>
      </body>
      </html>
    `

    return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
  }

  if (!code || !state) {
    console.error("Missing code or state in Slack callback")

    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Slack Connection Failed</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
          }
          .container { 
            text-align: center; 
            padding: 2rem;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            backdrop-filter: blur(10px);
          }
          .error-icon { font-size: 3rem; margin-bottom: 1rem; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
          p { margin: 0.5rem 0; opacity: 0.9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-icon">❌</div>
          <h1>Slack Connection Failed</h1>
          <p>Missing required parameters</p>
          <p>This window will close automatically...</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-error',
              provider: 'slack',
              error: 'Missing required parameters'
            }, window.location.origin);
          }
          setTimeout(() => window.close(), 2000);
        </script>
      </body>
      </html>
    `

    return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Slack Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
            }
            .error-icon { font-size: 3rem; margin-bottom: 1rem; }
            h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
            p { margin: 0.5rem 0; opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Slack Connection Failed</h1>
            <p>Invalid state parameter</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'slack',
                error: 'Invalid state parameter'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Slack Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
            }
            .error-icon { font-size: 3rem; margin-bottom: 1rem; }
            h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
            p { margin: 0.5rem 0; opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Slack Connection Failed</h1>
            <p>Missing user ID</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'slack',
                error: 'Missing user ID'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    // Exchange code for token
    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: slackClientId,
        client_secret: slackClientSecret,
        code: code,
        redirect_uri: "https://chainreact.app/api/integrations/slack/callback",
      }),
    })

    const tokenData = await tokenResponse.json()
    console.log("Token response:", JSON.stringify(tokenData, null, 2))

    if (!tokenData.ok) {
      console.error("Slack token exchange error:", tokenData)

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Slack Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
            }
            .error-icon { font-size: 3rem; margin-bottom: 1rem; }
            h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
            p { margin: 0.5rem 0; opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Slack Connection Failed</h1>
            <p>Token exchange failed: ${tokenData.error || "Unknown error"}</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'slack',
                error: '${tokenData.error || "Token exchange failed"}'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    // Slack OAuth v2 returns different token structure
    const botToken = tokenData.access_token // Bot token
    const userToken = tokenData.authed_user?.access_token // User token
    const teamInfo = tokenData.team
    const authedUser = tokenData.authed_user
    const botUserId = tokenData.bot_user_id

    if (!botToken) {
      console.error("No bot token in response")

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Slack Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
            }
            .error-icon { font-size: 3rem; margin-bottom: 1rem; }
            h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
            p { margin: 0.5rem 0; opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Slack Connection Failed</h1>
            <p>Missing bot token</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'slack',
                error: 'Missing bot token'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    // Use bot token to get team/workspace info
    const teamInfoResponse = await fetch("https://slack.com/api/team.info", {
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
    })

    const teamInfoData = await teamInfoResponse.json()

    // Get bot info
    const botInfoResponse = await fetch("https://slack.com/api/auth.test", {
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
    })

    const botInfoData = await botInfoResponse.json()

    if (!botInfoData.ok) {
      console.error("Bot info error:", botInfoData)

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Slack Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
            }
            .error-icon { font-size: 3rem; margin-bottom: 1rem; }
            h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
            p { margin: 0.5rem 0; opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Slack Connection Failed</h1>
            <p>Bot info failed: ${botInfoData.error || "Unknown error"}</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'slack',
                error: '${botInfoData.error || "Bot info failed"}'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    const now = new Date().toISOString()

    // Extract all granted scopes
    const botScopes = tokenData.scope ? tokenData.scope.split(",") : []
    const userScopes = authedUser?.scope ? authedUser.scope.split(",") : []
    const allScopes = [...botScopes, ...userScopes]

    const integrationData = {
      user_id: userId,
      provider: "slack",
      provider_user_id: authedUser?.id || botInfoData.user_id,
      access_token: botToken, // Store bot token as primary
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      status: "connected",
      scopes: allScopes,
      metadata: {
        team_name: teamInfo?.name || teamInfoData?.team?.name || "Unknown Team",
        team_id: teamInfo?.id || teamInfoData?.team?.id || "unknown",
        user_token: userToken, // Store user token in metadata
        bot_user_id: botUserId || botInfoData.user_id,
        connected_at: now,
        app_id: tokenData.app_id,
        is_enterprise_install: tokenData.is_enterprise_install,
      },
      updated_at: now,
    }

    // Check if integration exists and update or insert
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "slack")
      .maybeSingle()

    if (existingIntegration) {
      const { error } = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id)

      if (error) {
        console.error("Error updating Slack integration:", error)

        const errorHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Slack Connection Failed</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                margin: 0;
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                color: white;
              }
              .container { 
                text-align: center; 
                padding: 2rem;
                background: rgba(255,255,255,0.1);
                border-radius: 12px;
                backdrop-filter: blur(10px);
              }
              .error-icon { font-size: 3rem; margin-bottom: 1rem; }
              h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
              p { margin: 0.5rem 0; opacity: 0.9; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="error-icon">❌</div>
              <h1>Slack Connection Failed</h1>
              <p>Database update failed</p>
              <p>This window will close automatically...</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({
                  type: 'oauth-error',
                  provider: 'slack',
                  error: 'Database update failed'
                }, window.location.origin);
              }
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
          </html>
        `

        return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
      }
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (error) {
        console.error("Error inserting Slack integration:", error)

        const errorHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Slack Connection Failed</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                margin: 0;
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                color: white;
              }
              .container { 
                text-align: center; 
                padding: 2rem;
                background: rgba(255,255,255,0.1);
                border-radius: 12px;
                backdrop-filter: blur(10px);
              }
              .error-icon { font-size: 3rem; margin-bottom: 1rem; }
              h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
              p { margin: 0.5rem 0; opacity: 0.9; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="error-icon">❌</div>
              <h1>Slack Connection Failed</h1>
              <p>Database insert failed</p>
              <p>This window will close automatically...</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({
                  type: 'oauth-error',
                  provider: 'slack',
                  error: 'Database insert failed'
                }, window.location.origin);
              }
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
          </html>
        `

        return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
      }
    }

    // Success! Return HTML that closes the popup
    const successHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Slack Connected Successfully</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container { 
            text-align: center; 
            padding: 2rem;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            backdrop-filter: blur(10px);
          }
          .success-icon { font-size: 3rem; margin-bottom: 1rem; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
          p { margin: 0.5rem 0; opacity: 0.9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>Slack Connected Successfully!</h1>
          <p>Your Slack workspace has been connected.</p>
          <p>This window will close automatically...</p>
        </div>
        <script>
          // Send success message to parent window
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-success',
              provider: 'slack'
            }, window.location.origin);
          }
          
          // Close the popup
          setTimeout(() => {
            window.close();
          }, 1500);
        </script>
      </body>
      </html>
    `

    return new Response(successHtml, { headers: { "Content-Type": "text/html" } })
  } catch (error: any) {
    console.error("Error during Slack callback:", error)

    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Slack Connection Failed</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
          }
          .container { 
            text-align: center; 
            padding: 2rem;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            backdrop-filter: blur(10px);
          }
          .error-icon { font-size: 3rem; margin-bottom: 1rem; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
          p { margin: 0.5rem 0; opacity: 0.9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-icon">❌</div>
          <h1>Slack Connection Failed</h1>
          <p>${error.message || "An unexpected error occurred"}</p>
          <p>This window will close automatically...</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-error',
              provider: 'slack',
              error: '${(error.message || "An unexpected error occurred").replace(/'/g, "\\'")}'
            }, window.location.origin);
          }
          setTimeout(() => window.close(), 2000);
        </script>
      </body>
      </html>
    `

    return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
  }
}
