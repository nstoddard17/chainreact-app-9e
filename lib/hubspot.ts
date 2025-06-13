export const hubspot = {
  clientId: process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID,
  clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
  redirectUri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/hubspot/callback`,

  getAuthUrl(state: string, scopes: string[] = ["contacts", "content"]) {
    const params = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      state,
    })

    return `https://app.hubspot.com/oauth/authorize?${params.toString()}`
  },

  async exchangeCodeForToken(code: string) {
    const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        redirect_uri: this.redirectUri,
        code,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to exchange code for token: ${response.status} ${errorText}`)
    }

    return response.json()
  },

  async refreshToken(refreshToken: string) {
    const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to refresh token: ${response.status} ${errorText}`)
    }

    return response.json()
  },

  async getTokenInfo(accessToken: string) {
    const response = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`, {
      method: "GET",
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to get token info: ${response.status} ${errorText}`)
    }

    return response.json()
  },

  async getUserInfo(accessToken: string) {
    // Get account info
    const response = await fetch("https://api.hubapi.com/account-info/v3/details", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to get user info: ${response.status} ${errorText}`)
    }

    return response.json()
  },

  async getPortalInfo(accessToken: string) {
    // Get portal/hub info
    const response = await fetch("https://api.hubapi.com/integrations/v1/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to get portal info: ${response.status} ${errorText}`)
    }

    return response.json()
  },
}
