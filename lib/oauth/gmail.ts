import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { getOAuthRedirectUri, OAuthScopes } from "./utils"

export class GmailOAuthService {
  private static clientId: string | undefined = process.env.GOOGLE_CLIENT_ID
  private static clientSecret: string | undefined = process.env.GOOGLE_CLIENT_SECRET

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri(baseUrl)
    const state = btoa(
      JSON.stringify({
        provider: "gmail",
        userId,
        reconnect,
        integrationId,
        timestamp: Date.now(),
      }),
    )
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.readonly",
      ].join(" "),
      state,
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  static getRedirectUri(origin: string): string {
    const redirectUri = getOAuthRedirectUri(origin, "gmail")
    console.log("Gmail Redirect URI:", {
      origin,
      baseUrl: getBaseUrl(),
      redirectUri,
    })
    return redirectUri
  }

  static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      throw new Error("Missing Google client credentials")
    }
    return { clientId, clientSecret }
  }
}

