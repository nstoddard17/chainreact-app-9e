export const discord = {
  clientId: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  redirectUri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/discord/callback`,

  getAuthUrl(state: string) {
    const params = new URLSearchParams({
      client_id: "1378595955212812308",
      redirect_uri: "https://chainreact.app/api/integrations/discord/callback",
      response_type: "code",
      scope: "identify email connections guilds guilds.members.read",
      state,
    })

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`
  },

  // If you have a bot invite function, update it to use permissions=8
  getBotInviteUrl() {
    const params = new URLSearchParams({
      client_id: "1378595955212812308",
      scope: "bot applications.commands",
      permissions: "8"
    })
    return `https://discord.com/oauth2/authorize?${params.toString()}`
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
