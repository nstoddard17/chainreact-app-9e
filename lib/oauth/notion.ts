import { getBaseUrl } from "@/lib/utils/getBaseUrl"
interface NotionOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class NotionOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID
    const clientSecret = process.env.NOTION_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Notion OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  // Define required scopes for Notion
  static getRequiredScopes() {
    return ["read_user", "read_content", "update_content", "insert_content"]
  }

  // Validate scopes against required scopes
  static validateScopes(grantedCapabilities: string[]): { valid: boolean; missing: string[] } {
    const requiredScopes = ["read_user", "read_content"]
    const optionalScopes = ["update_content", "insert_content"]

    // Convert Notion capabilities to our scope format
    const grantedScopes: string[] = []

    // Check for user access
    if (grantedCapabilities.some((cap) => cap.includes("read_user") || cap.includes("user"))) {
      grantedScopes.push("read_user")
    }

    // Check for content read access
    if (
      grantedCapabilities.some(
        (cap) =>
          cap.includes("read_content") ||
          cap.includes("read_database") ||
          cap.includes("read_page") ||
          cap.includes("read_block"),
      )
    ) {
      grantedScopes.push("read_content")
    }

    // Check for content update access
    if (
      grantedCapabilities.some(
        (cap) =>
          cap.includes("update_content") ||
          cap.includes("update_database") ||
          cap.includes("update_page") ||
          cap.includes("update_block"),
      )
    ) {
      grantedScopes.push("update_content")
    }

    // Check for content creation access
    if (
      grantedCapabilities.some(
        (cap) =>
          cap.includes("insert_content") ||
          cap.includes("create_page") ||
          cap.includes("create_database") ||
          cap.includes("create_block"),
      )
    ) {
      grantedScopes.push("insert_content")
    }

    const missing = requiredScopes.filter((scope) => !grantedScopes.includes(scope))

    console.log("Notion scope validation:", {
      grantedCapabilities,
      grantedScopes,
      requiredScopes,
      missing,
    })

    return {
      valid: missing.length === 0,
      missing,
    }
  }

  // Validate token by making API calls to test permissions
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

        const searchData = await searchResponse.json()

        // If we have databases, test update and insert permissions
        if (searchData.results && searchData.results.length > 0) {
          const databaseId = searchData.results[0].id

          // Test database query (read content)
          const queryResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Notion-Version": "2022-06-28",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ page_size: 1 }),
          })

          if (queryResponse.ok) {
            // Test create page (insert content)
            const createPageResponse = await fetch("https://api.notion.com/v1/pages", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                parent: { database_id: databaseId },
                properties: {
                  title: {
                    title: [{ text: { content: "Test Page - ChainReact" } }],
                  },
                },
              }),
            })

            // Check if we can create (even if it fails due to schema, a 400 with validation error means we have permission)
            if (createPageResponse.ok || createPageResponse.status === 400) {
              grantedScopes.push("insert_content")

              // If page was created successfully, test update
              if (createPageResponse.ok) {
                const pageData = await createPageResponse.json()
                const pageId = pageData.id

                const updateResponse = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
                  method: "PATCH",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Notion-Version": "2022-06-28",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    properties: {
                      title: {
                        title: [{ text: { content: "Updated Test Page - ChainReact" } }],
                      },
                    },
                  }),
                })

                if (updateResponse.ok) {
                  grantedScopes.push("update_content")
                }

                // Clean up test page
                await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
                  method: "PATCH",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Notion-Version": "2022-06-28",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ archived: true }),
                })
              }
            }
          }
        }
      }

      const uniqueScopes = [...new Set(grantedScopes)]
      return {
        valid: uniqueScopes.length >= 2, // At minimum need read_user and read_content
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
    const { clientId } = this.getClientCredentials()
    const redirectUri = `${getBaseUrl()}/api/integrations/notion/callback`

    const state = btoa(
      JSON.stringify({
        provider: "notion",
        userId,
        reconnect,
        integrationId,
        requireFullScopes: false, // Changed to false to allow partial scopes
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
    return `${getBaseUrl()}/api/integrations/notion/callback`
  }

  static async handleCallback(code: string, state: string, supabase: any, userId: string): Promise<NotionOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "notion") {
        throw new Error("Invalid provider in state")
      }

      // Clear any existing tokens before requesting new ones
      if (reconnect && integrationId) {
        const { error: clearError } = await supabase
          .from("integrations")
          .update({
            access_token: null,
            refresh_token: null,
            status: "reconnecting",
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId)

        if (clearError) {
          console.error("Error clearing existing tokens:", clearError)
        }
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
          redirect_uri: `${getBaseUrl()}/api/integrations/notion/callback`,
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, workspace_name, workspace_id, bot_id, owner } = tokenData

      // Validate token and get actual granted scopes
      const tokenValidation = await this.validateToken(access_token)

      // Validate scopes and get missing ones
      const scopeValidation = this.validateScopes(tokenValidation.grantedScopes || [])

      const integrationData = {
        user_id: userId,
        provider: "notion",
        provider_user_id: bot_id || workspace_id,
        access_token,
        status: "connected" as const,
        scopes: tokenValidation.grantedScopes || ["read_user"],
        granted_scopes: tokenValidation.grantedScopes || ["read_user"],
        missing_scopes: scopeValidation.missing || [],
        scope_validation_status: scopeValidation.valid ? "valid" : "partial",
        metadata: {
          workspace_name,
          workspace_id,
          bot_id,
          owner,
          connected_at: new Date().toISOString(),
          validated_scopes: tokenValidation.grantedScopes || [],
          token_validation_error: tokenValidation.error,
          scope_validation: scopeValidation,
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
          console.error("Error updating Notion integration:", updateError)
          throw updateError
        }
      } else {
        const { error: insertError } = await supabase.from("integrations").insert(integrationData)
        if (insertError) {
          console.error("Error inserting Notion integration:", insertError)
          throw insertError
        }
      }

      return {
        success: true,
        redirectUrl: `${getBaseUrl()}/integrations?success=notion_connected&provider=notion`,
      }
    } catch (error: any) {
      console.error("Notion OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=notion&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
