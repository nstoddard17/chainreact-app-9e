import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { getOAuthRedirectUri, OAuthScopes } from "./utils"

export class GmailOAuthService {
  private static clientId: string | undefined = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  private static clientSecret: string | undefined = process.env.GOOGLE_CLIENT_SECRET
  static readonly apiUrl = "https://www.googleapis.com/gmail/v1"

  static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Google OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static getRedirectUri(origin: string): string {
    return getOAuthRedirectUri(origin, "gmail")
  }

  static generateAuthUrl(origin: string, userId: string): string {
    const { clientId } = this.getClientCredentials()
    if (!clientId) {
      throw new Error("Gmail client ID is not configured")
    }

    const redirectUri = this.getRedirectUri(origin)
    console.log("Gmail Auth URL Debug:", {
      origin,
      redirectUri,
      userId,
    })

    const state = JSON.stringify({
      provider: "google",
      service: "gmail",
      userId,
    })

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: OAuthScopes.GMAIL.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  static async handleCallback(
    code: string,
    state: string,
    userId: string,
  ): Promise<Response> {
    const { clientId, clientSecret } = this.getClientCredentials()
    if (!clientId || !clientSecret) {
      throw new Error("Missing Google client credentials")
    }

    // Parse and validate state
    const stateData = parseOAuthState(state)
    validateOAuthState(stateData, "google")

    // Exchange code for token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.getRedirectUri(getBaseUrl()),
      }),
    })

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange code for token")
    }

    const { access_token, refresh_token } = await tokenResponse.json()

    // Get user info
    const userResponse = await fetch(
      `${this.apiUrl}/users/me/profile`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      },
    )

    if (!userResponse.ok) {
      throw new Error("Failed to get user info")
    }

    const user = await userResponse.json()

    // Check for existing integration
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle()

    const integrationData = {
      user_id: userId,
      provider: "google",
      provider_user_id: user.emailAddress,
      access_token,
      refresh_token,
      token_type: "Bearer",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      metadata: {
        email: user.emailAddress,
        display_name: user.displayName,
        photo_url: user.photoLink,
      },
    }

    if (existingIntegration) {
      await supabase
        .from("integrations")
        .update(integrationData)
        .eq("id", existingIntegration.id)
    } else {
      await supabase.from("integrations").insert(integrationData)
    }

    return new Response(null, { status: 200 })
  }

  static async refreshToken(
    refreshToken: string,
    userId: string,
  ): Promise<Response> {
    const { clientId, clientSecret } = this.getClientCredentials()
    if (!clientId || !clientSecret) {
      throw new Error("Missing Google client credentials")
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })

    if (!response.ok) {
      throw new Error("Failed to refresh token")
    }

    const { access_token, expires_in } = await response.json()

    // Update the access token in the database
    await supabase
      .from("integrations")
      .update({
        access_token,
        expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      })
      .eq("user_id", userId)
      .eq("provider", "google")

    return response.json()
  }
}

