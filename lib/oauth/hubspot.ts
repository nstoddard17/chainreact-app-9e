export interface HubSpotOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class HubSpotOAuthService {
  private config: HubSpotOAuthConfig

  constructor() {
    this.config = {
      clientId: process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID!,
      clientSecret: process.env.HUBSPOT_CLIENT_SECRET!,
      redirectUri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/hubspot/callback`,
      scopes: [
        // Basic required scopes
        "oauth",

        // CRM Object scopes (new format)
        "crm.objects.contacts.read",
        "crm.objects.contacts.write",
        "crm.objects.companies.read",
        "crm.objects.companies.write",
        "crm.objects.deals.read",
        "crm.objects.deals.write",

        // Legacy scopes (for backward compatibility)
        "contacts",
        "content",

        // Additional useful scopes
        "crm.schemas.contacts.read",
        "crm.schemas.companies.read",
        "crm.schemas.deals.read",
      ],
    }
  }

  generateAuthUrl(state: string, customScopes?: string[]): string {
    const scopes = customScopes || this.config.scopes

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: scopes.join(" "),
      response_type: "code",
      state,
    })

    return `https://app.hubspot.com/oauth/authorize?${params.toString()}`
  }

  async exchangeCodeForToken(code: string) {
    const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HubSpot token exchange failed: ${response.status} ${errorText}`)
    }

    return response.json()
  }

  async refreshToken(refreshToken: string) {
    const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HubSpot token refresh failed: ${response.status} ${errorText}`)
    }

    return response.json()
  }

  async getTokenInfo(accessToken: string) {
    const response = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HubSpot token info failed: ${response.status} ${errorText}`)
    }

    return response.json()
  }
}

export const hubspotOAuth = new HubSpotOAuthService()
