import { BaseOAuthService } from "../lib/oauth/BaseOAuthService"

export class OneDriveOAuthService extends BaseOAuthService {
  constructor() {
    super("onedrive")
  }

  generateAuthUrl(state: string): string {
    const clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
    const redirectUri = `${this.getBaseUrl()}/api/integrations/onedrive/callback`

    // Use fully qualified Microsoft Graph scope URLs
    const scopes = [
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Files.ReadWrite.All",
      "offline_access",
    ]

    const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize")
    url.searchParams.append("client_id", clientId!)
    url.searchParams.append("response_type", "code")
    url.searchParams.append("redirect_uri", redirectUri)
    url.searchParams.append("scope", scopes.join(" "))
    url.searchParams.append("state", state)
    url.searchParams.append("prompt", "consent")
    url.searchParams.append("response_mode", "query")

    return url.toString()
  }

  private getBaseUrl(): string {
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      return process.env.NEXT_PUBLIC_SITE_URL
    }

    if (process.env.NEXT_PUBLIC_APP_URL) {
      return process.env.NEXT_PUBLIC_APP_URL
    }

    return "http://localhost:3000"
  }
}

// Make sure we have the named export;
