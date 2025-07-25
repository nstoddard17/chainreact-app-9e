import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { prepareIntegrationData } from "@/lib/integrations/tokenUtils"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase URL or service role key")
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

function createPopupResponse(
  type: "success" | "error",
  provider: string,
  message: string,
  baseUrl: string,
) {
  const title = type === "success" ? `${provider} Connection Successful` : `${provider} Connection Failed`
  const header = type === "success" ? `${provider} Connected!` : `Error Connecting ${provider}`
  const status = type === "success" ? 200 : 500
  const script = `
    <script>
      if (window.opener) {
        window.opener.postMessage({
          type: 'oauth-${type}',
          provider: '${provider}',
          message: '${message}'
        }, '${baseUrl}');
      }
      setTimeout(() => window.close(), 1000);
    </script>
  `
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: ${type === "success" ? "linear-gradient(135deg, #24c6dc 0%, #514a9d 100%)" : "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)"};
            color: white;
          }
          .container { 
            text-align: center; 
            padding: 2rem;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            backdrop-filter: blur(10px);
          }
          .icon { font-size: 3rem; margin-bottom: 1rem; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
          p { margin: 0.5rem 0; opacity: 0.9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">${type === "success" ? "✅" : "❌"}</div>
          <h1>${header}</h1>
          <p>${message}</p>
          <p>This window will close automatically...</p>
        </div>
        ${script}
      </body>
    </html>
  `
  return new Response(html, { status, headers: { "Content-Type": "text/html" } })
}

function createBotCallbackResponse(
  type: "success" | "error",
  guildId: string | null,
  baseUrl: string,
) {
  const title = type === "success" ? "Discord Bot Connection Successful" : "Discord Bot Connection Failed"
  const header = type === "success" ? "Bot Connected!" : "Error Connecting Bot"
  const status = type === "success" ? 200 : 500
  const message = type === "success" 
    ? `The bot has been successfully added to your Discord server${guildId ? ` (ID: ${guildId})` : ''}.`
    : "There was an error adding the bot to your Discord server."
  
  const script = `
    <script>
      if (window.opener) {
        window.opener.postMessage({
          type: 'discord-bot-callback',
          status: '${type}',
          data: {
            guildId: '${guildId || ''}',
            success: ${type === "success"}
          },
          timestamp: Date.now()
        }, '*');
      }
      setTimeout(() => window.close(), 2000);
    </script>
  `
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: ${type === "success" ? "linear-gradient(135deg, #24c6dc 0%, #514a9d 100%)" : "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)"};
            color: white;
          }
          .container { 
            text-align: center; 
            padding: 2rem;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            backdrop-filter: blur(10px);
          }
          .icon { font-size: 3rem; margin-bottom: 1rem; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
          p { margin: 0.5rem 0; opacity: 0.9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">${type === "success" ? "✅" : "❌"}</div>
          <h1>${header}</h1>
          <p>${message}</p>
          <p>This window will close automatically...</p>
        </div>
        ${script}
      </body>
    </html>
  `
  return new Response(html, { status, headers: { "Content-Type": "text/html" } })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  const guildId = searchParams.get("guild_id")

  const baseUrl = getBaseUrl()

  if (error) {
    console.error(`Discord OAuth error: ${error} - ${errorDescription}`)
    return createPopupResponse(
      "error",
      "discord",
      errorDescription || "An unknown error occurred.",
      baseUrl,
    )
  }

  if (!code) {
    console.error("Missing code in Discord callback")
    return createPopupResponse(
      "error",
      "discord",
      "Authorization code is missing.",
      baseUrl,
    )
  }

  // Check if this might be a bot OAuth flow by looking for guild_id parameter
  const isLikelyBotOAuth = guildId !== null

  // If we have a guild_id, this is definitely a bot OAuth flow
  if (guildId) {
    console.log("Bot OAuth detected by guild_id:", guildId)
    return createBotCallbackResponse("success", guildId, baseUrl)
  }

  try {
    const clientId = process.env.DISCORD_CLIENT_ID
    const clientSecret = process.env.DISCORD_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Discord client ID or secret not configured")
    }

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${baseUrl}/api/integrations/discord/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      throw new Error(`Discord token exchange failed: ${errorData.error_description}`)
    }

    const tokenData = await tokenResponse.json()
    const scopes = tokenData.scope ? tokenData.scope.split(" ") : []

    // Check if this is a bot OAuth flow (has bot scope)
    if (scopes.includes("bot")) {
      // This is a bot OAuth flow - just return success
      console.log("Bot OAuth successful, guild_id:", guildId)
      return createBotCallbackResponse("success", guildId, baseUrl)
    } else {
      // This is a user OAuth flow - handle user integration
      if (!state) {
        console.error("Missing state in Discord user OAuth callback")
        return createPopupResponse(
          "error",
          "discord",
          "State parameter is missing for user OAuth.",
          baseUrl,
        )
      }

      const stateData = JSON.parse(atob(state))
      const { userId } = stateData

      if (!userId) {
        console.error("Missing userId in Discord state")
        return createPopupResponse("error", "discord", "User ID is missing from state", baseUrl)
      }

      const expiresIn = tokenData.expires_in // Typically in seconds
      const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

      // Get user info
      const userResponse = await fetch("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      })

      if (!userResponse.ok) {
        throw new Error("Failed to get Discord user info")
      }

      const userData = await userResponse.json()

      const integrationData = await prepareIntegrationData(
        userId,
        "discord",
        tokenData.access_token,
        tokenData.refresh_token,
        scopes,
        tokenData.expires_in,
        {
          provider_user_id: userData.id
        }
      )

      const { error: upsertError } = await supabase
        .from("integrations")
        .upsert(integrationData, {
          onConflict: "user_id, provider",
        })

      if (upsertError) {
        throw new Error(`Failed to save Discord integration: ${upsertError.message}`)
      }

      return createPopupResponse(
        "success",
        "discord",
        "Discord account connected successfully.",
        baseUrl,
      )
    }
  } catch (e: any) {
    console.error("Discord callback error:", e)
    return createPopupResponse(
      "error",
      "discord",
      e.message || "An unexpected error occurred.",
      baseUrl,
    )
  }
}
