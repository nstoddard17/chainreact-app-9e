import { getAbsoluteBaseUrl } from "./utils"

export const GoogleDocsOAuthService = {
  generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
      throw new Error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID environment variable for Google Docs OAuth configuration")
    }

    const redirectUri = `${getAbsoluteBaseUrl(baseUrl)}/api/integrations/google-docs/callback`

    const scopes = [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive.file",
    ]

    const state = btoa(
      JSON.stringify({
        provider: "google-docs",
        userId,
        reconnect,
        integrationId,
        timestamp: Date.now(),
      }),
    )

    const params = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  },

  getRedirectUri(): string {
    return "/api/integrations/google-docs/callback"
  },
}
