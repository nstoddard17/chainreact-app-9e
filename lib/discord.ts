export const discord = {
  clientId: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  redirectUri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/discord/callback`,

  getAuthUrl(state: string) {
    const params = new URLSearchParams({
      client_id: "1378595955212812308",
      redirect_uri: this.redirectUri,
      response_type: "code",
      integration_type: "1",
      scope: "identify guilds email connections relationships.read applications.commands",
      state,
    })

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`
  },

  async exchangeCodeForToken(code: string) {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri,
      }),
    })

    if (!response.ok) {
      throw new Error("Failed to exchange code for token")
    }

    return response.json()
  },

  async getUserInfo(accessToken: string) {
    const response = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error("Failed to get user info")
    }

    return response.json()
  },
}
