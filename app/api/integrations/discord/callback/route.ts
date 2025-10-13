import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"
import { prepareIntegrationData } from "@/lib/integrations/tokenUtils"

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase URL or service role key")
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)


function createBotCallbackResponse(
  type: "success" | "error",
  guildId: string | null,
  baseUrl: string,
) {
  const message = type === "success" 
    ? `The bot has been successfully added to your Discord server${guildId ? ` (ID: ${guildId})` : ''}.`
    : "There was an error adding the bot to your Discord server."
  
  // Use the shared createPopupResponse for consistency
  return createPopupResponse(type, "Discord Bot", message, baseUrl)
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
    logger.error(`Discord OAuth error: ${error} - ${errorDescription}`)
    return createPopupResponse(
      "error",
      "discord",
      errorDescription || "An unknown error occurred.",
      baseUrl,
    )
  }

  if (!code) {
    logger.error("Missing code in Discord callback")
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
    logger.debug("Bot OAuth detected by guild_id:", guildId)
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
      const errorData = await tokenjsonResponse()
      throw new Error(`Discord token exchange failed: ${errorData.error_description}`)
    }

    const tokenData = await tokenjsonResponse()
    const scopes = tokenData.scope ? tokenData.scope.split(" ") : []

    // Check if this is a bot OAuth flow (has bot scope)
    if (scopes.includes("bot")) {
      // This is a bot OAuth flow - just return success
      logger.debug("Bot OAuth successful, guild_id:", guildId)
      return createBotCallbackResponse("success", guildId, baseUrl)
    } 
      // This is a user OAuth flow - handle user integration
      if (!state) {
        logger.error("Missing state in Discord user OAuth callback")
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
        logger.error("Missing userId in Discord state")
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

      const userData = await userjsonResponse()

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
    
  } catch (e: any) {
    logger.error("Discord callback error:", e)
    return createPopupResponse(
      "error",
      "discord",
      e.message || "An unexpected error occurred.",
      baseUrl,
    )
  }
}
