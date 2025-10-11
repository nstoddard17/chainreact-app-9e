/**
 * Discord Users Handler
 */

import { DiscordIntegration, DiscordUser, DiscordDataHandler } from '../types'
import { fetchDiscordWithRateLimit, validateDiscordToken } from '../utils'

export const getDiscordUsers: DiscordDataHandler<DiscordUser> = async (integration: DiscordIntegration, options: any = {}) => {
  // Discord API limitation: Cannot fetch all server members with a user OAuth token.
  // Only the user's own account and their connections (friends/linked accounts) are available.
  try {
    // Validate and get token
    const tokenValidation = await validateDiscordToken(integration)
    
    if (!tokenValidation.success) {
      console.warn("Token validation failed, returning default users")
      // Return some default users instead of failing completely
      return [
        { id: "anyone", name: "Anyone", value: "anyone", username: "anyone", discriminator: "0000" },
        { id: "bot", name: "Discord Bot", value: "bot", username: "bot", discriminator: "0000" }
      ]
    }
    
    const userToken = tokenValidation.token
    if (!userToken) {
      console.warn("User Discord token not available - returning default users")
      return [
        { id: "anyone", name: "Anyone", value: "anyone", username: "anyone", discriminator: "0000" },
        { id: "bot", name: "Discord Bot", value: "bot", username: "bot", discriminator: "0000" }
      ]
    }

    const users: any[] = []

    // Always include the user's own account
    try {
      const userResponse = await fetchDiscordWithRateLimit<any>(() => 
        fetch("https://discord.com/api/v10/users/@me", {
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
        })
      )
      if (userResponse) {
        users.push({
          id: userResponse.id,
          name: `${userResponse.username}#${userResponse.discriminator} (You)`,
          value: userResponse.id,
          username: userResponse.username,
          discriminator: userResponse.discriminator,
          avatar: userResponse.avatar,
          bot: userResponse.bot,
          system: userResponse.system,
          mfa_enabled: userResponse.mfa_enabled,
          verified: userResponse.verified,
          email: userResponse.email,
          flags: userResponse.flags,
          premium_type: userResponse.premium_type,
          public_flags: userResponse.public_flags,
        })
      }
    } catch (error) {
      console.warn("Failed to fetch user info:", error)
    }

    // Try to fetch user's connections (friends/linked accounts)
    try {
      const connectionsResponse = await fetchDiscordWithRateLimit<any[]>(() => 
        fetch("https://discord.com/api/v10/users/@me/connections", {
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
        })
      )
      if (connectionsResponse && connectionsResponse.length > 0) {
        // Add each connection as a selectable user
        users.push(...connectionsResponse.map((conn: any) => ({
          id: conn.id,
          name: `${conn.name} (${conn.type})`,
          value: conn.id,
          username: conn.name,
          discriminator: conn.type || "0000",
          avatar: undefined,
          bot: false,
          system: false,
          mfa_enabled: false,
          verified: conn.verified || false,
          email: undefined,
          flags: undefined,
          premium_type: undefined,
          public_flags: undefined,
        })))
      }
    } catch (error) {
      console.warn("Failed to fetch user connections:", error)
    }

    return users
  } catch (error: any) {
    console.error("Error fetching Discord users:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Discord authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Discord API rate limit exceeded. Please try again later.')
    }
    
    return []
  }
}