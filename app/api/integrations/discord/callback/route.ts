import { type NextRequest } from "next/server"
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"
import { logger } from '@/lib/utils/logger'

/**
 * Discord OAuth Callback Handler
 *
 * Handles both user OAuth and bot OAuth flows.
 * Bot OAuth (with guild_id) is for adding bot to servers.
 * User OAuth is for user integration with workspace context.
 *
 * Updated: 2025-10-28 - Migrated to use oauth-callback-handler utility
 */

function createBotCallbackResponse(
  type: "success" | "error",
  guildId: string | null,
  baseUrl: string,
) {
  const message = type === "success"
    ? `The bot has been successfully added to your Discord server${guildId ? ` (ID: ${guildId})` : ''}.`
    : "There was an error adding the bot to your Discord server."

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

  // Handle OAuth errors
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

  // If we have a guild_id, this is a bot OAuth flow (not user integration)
  if (guildId) {
    logger.debug("Bot OAuth detected by guild_id:", guildId)
    return createBotCallbackResponse("success", guildId, baseUrl)
  }

  // This is a user OAuth flow - use the centralized handler
  return handleOAuthCallback(request, {
    provider: 'discord',
    tokenEndpoint: 'https://discord.com/api/oauth2/token',
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    getRedirectUri: (baseUrl) => `${baseUrl}/api/integrations/discord/callback`,
    transformTokenData: (tokenData) => {
      const scopes = tokenData.scope ? tokenData.scope.split(" ") : []

      // Check if this is a bot OAuth flow (has bot scope)
      if (scopes.includes("bot")) {
        // This shouldn't happen here since we check guild_id above,
        // but handle it just in case
        logger.debug("Bot OAuth detected by scope")
        throw new Error("Bot OAuth should be handled separately")
      }

      return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        scopes,
        expires_at: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : null,
      }
    },
    additionalIntegrationData: async (tokenData, state) => {
      // Get Discord user info
      const userResponse = await fetch("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      })

      if (!userResponse.ok) {
        logger.error("Failed to get Discord user info")
        return {}
      }

      const userData = await userResponse.json()

      return {
        provider_user_id: userData.id,
      }
    },
  })
}
