export class LinearOAuthService {
  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const clientId = process.env.NEXT_PUBLIC_LINEAR_CLIENT_ID
    if (!clientId) {
      throw new Error("Missing NEXT_PUBLIC_LINEAR_CLIENT_ID environment variable")
    }

    const redirectUri = `${baseUrl}/api/integrations/linear/callback`
    const scopes = ["read", "write"].join(",")

    const state = JSON.stringify({
      reconnect,
      integrationId,
      userId,
      timestamp: Date.now(),
    })

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state: encodeURIComponent(state),
      response_type: "code",
    })

    return `https://linear.app/oauth/authorize?${params.toString()}`
  }

  static getRedirectUri(): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
    return `${baseUrl}/api/integrations/linear/callback`
  }
}
