import type { OAuthProviderAdapter, RefreshTokenResult, OAuthConfig } from "./OAuthProviderAdapter"
import axios from "axios"

export class GoogleOAuthAdapter implements OAuthProviderAdapter {
  /**
   * Refresh a Google OAuth token
   */
  async refreshToken(refreshToken: string): Promise<RefreshTokenResult> {
    try {
      const config = this.getOAuthConfig()

      const response = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      )

      const data = response.data

      return {
        success: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token, // Google may provide a new refresh token
        expiresIn: data.expires_in,
      }
    } catch (error: any) {
      console.error("Google token refresh error:", error.response?.data || error.message)

      return {
        success: false,
        message: error.response?.data?.error_description || error.message,
      }
    }
  }

  /**
   * Validate a Google OAuth token
   */
  async validateToken(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`)

      return response.status === 200
    } catch (error: any) {
      // 400 error means token is invalid
      if (error.response?.status === 400) {
        return false
      }

      // For other errors, log and assume token might still be valid
      console.error("Google token validation error:", error.response?.data || error.message)
      return false
    }
  }

  /**
   * Get Google OAuth configuration
   */
  getOAuthConfig(): OAuthConfig {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      tokenUrl: "https://oauth2.googleapis.com/token",
      authUrl: "https://accounts.google.com/o/oauth2/auth",
      scopes: ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"],
      redirectUri: `${process.env.APP_URL}/api/integrations/google/callback`,
    }
  }
}
