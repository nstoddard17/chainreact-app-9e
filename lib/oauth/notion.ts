interface NotionOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class NotionOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID
    const clientSecret = process.env.NOTION_CLIENT_SECRET

    if (!clientId) {
      throw new Error("Missing NEXT_PUBLIC_NOTION_CLIENT_ID environment variable")
    }
    if (!clientSecret) {
      throw new Error("Missing NOTION_CLIENT_SECRET environment variable")
    }

    return { clientId, clientSecret }
  }

  static getRequiredScopes() {
    return ["read_user", "read_content", "update_content", "insert_content"]
  }

  static validateScopes(grantedCapabilities: string[]): { valid: boolean; missing: string[] } {
    const requiredScopes = this.getRequiredScopes()
    const scopeMapping: Record<string, string[]> = {
      read_user: ["read_user"],
      read_content: ["read_content", "read_database", "read_page"],
      update_content: ["update_content", "update_database", "update_page"],
      insert_content: ["insert_content", "create_page", "create_database"],
    }

    const grantedScopes: string[] = []
    grantedCapabilities.forEach((capability) => {
      Object.entries(scopeMapping).forEach(([scope, capabilities]) => {
        if (capabilities.some((cap) => capability.includes(cap))) {
          grantedScopes.push(scope)
        }
      })
    })

    const missing = requiredScopes.filter((scope) => !grantedScopes.includes(scope))
    return {
      valid: missing.length === 0,
      missing,
    }
  }

  static async validateToken(
    accessToken: string,
  ): Promise<{ valid: boolean; grantedScopes: string[]; error?: string }> {
    try {
      const grantedScopes: string[] = []

      // Test user read access
      const userResponse = await fetch("https://api.notion.com/v1/users/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
        },
      })

      if (userResponse.ok) {
        grantedScopes.push("read_user")
      }

      // Test database search (read content)
      const searchResponse = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "",
          filter: { property: "object", value: "database" },
          page_size: 1,
        }),
      })

      if (searchResponse.ok) {
        grantedScopes.push("read_content")
        grantedScopes.push("update_content")
        grantedScopes.push("insert_content")
      }

      const uniqueScopes = [...new Set(grantedScopes)]
      return {
        valid: uniqueScopes.length >= 1,
        grantedScopes: uniqueScopes,
      }
    } catch (error: any) {
      console.error("Notion token validation error:", error)
      return {
        valid: false,
        grantedScopes: [],
        error: error.message,
      }
    }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    if (!userId) {
      throw new Error("User ID is required for Notion OAuth")
    }

    const { clientId } = this.getClientCredentials()
    const redirectUri = "https://chainreact.app/api/integrations/notion/callback"

    const state = btoa(
      JSON.stringify({
        provider: "notion",
        userId,
        reconnect,
        integrationId,
        requireFullScopes: false,
        timestamp: Date.now(),
      }),
    )

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      owner: "user",
      state,
    })

    return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`
  }

  static getRedirectUri(): string {
    return "https://chainreact.app/api/integrations/notion/callback"
  }

  static async handleCallback(code: string, state: string, supabase: any, userId: string): Promise<NotionOAuthResult> {
    try {
      if (!code) {
        throw new Error("Missing authorization code from Notion")
      }

      if (!state) {
        throw new Error("Missing state parameter from Notion")
      }

      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "notion") {
        throw new Error("Invalid provider in state")
      }

      if (!userId) {
        throw new Error("User ID is required")
      }

      const { clientId, clientSecret } = this.getClientCredentials()

      const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(clientId + ":" + clientSecret).toString("base64")}`,
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://chainreact.app/api/integrations/notion/callback",
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Notion token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, workspace_name, workspace_id, bot_id, owner } = tokenData

      if (!access_token) {
        throw new Error("No access token received from Notion")
      }

      const tokenValidation = await this.validateToken(access_token)

      const integrationData = {
        user_id: userId,
        provider: "notion",
        provider_user_id: bot_id || workspace_id,
        access_token,
        status: "connected" as const,
        scopes: tokenValidation.grantedScopes || ["read_user"],
        metadata: {
          workspace_name,
          workspace_id,
          bot_id,
          owner,
          connected_at: new Date().toISOString(),
          validated_scopes: tokenValidation.grantedScopes || [],
          token_validation_error: tokenValidation.error,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (reconnect && integrationId) {
        const { error: updateError } = await supabase
          .from("integrations")
          .update({
            ...integrationData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId)

        if (updateError) {
          throw updateError
        }
      } else {
        const { error: insertError } = await supabase.from("integrations").insert(integrationData)
        if (insertError) {
          throw insertError
        }
      }

      return {
        success: true,
        redirectUrl: `https://chainreact.app/integrations?success=notion_connected&provider=notion`,
      }
    } catch (error: any) {
      console.error("Notion OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `https://chainreact.app/integrations?error=callback_failed&provider=notion&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
