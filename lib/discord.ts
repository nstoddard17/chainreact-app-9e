import { OAuth2RequestError } from "arctic"

interface DiscordConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

class DiscordOAuth {
  private config: DiscordConfig

  constructor(config: DiscordConfig) {
    this.config = config
  }

  createAuthorizationURL(state: string, scopes: string[] = ["identify", "email"]) {
    const url = new URL("https://discord.com/api/oauth2/authorize")
    url.searchParams.set("client_id", this.config.clientId)
    url.searchParams.set("redirect_uri", this.config.redirectUri)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("state", state)
    url.searchParams.set("scope", scopes.join(" "))
    return url
  }

  async validateAuthorizationCode(code: string) {
    const tokenUrl = "https://discord.com/api/oauth2/token"

    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.redirectUri,
    })

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    })

    if (!response.ok) {
      throw new OAuth2RequestError("Failed to validate authorization code", response.status)
    }

    const tokens = await response.json()
    return tokens
  }

  async getUser(accessToken: string) {
    const response = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error("Failed to fetch Discord user")
    }

    return response.json()
  }
}

export const discord = new DiscordOAuth({
  clientId: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  redirectUri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/discord/callback`,
})
