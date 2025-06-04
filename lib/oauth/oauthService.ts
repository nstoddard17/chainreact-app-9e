interface OAuthValidationResult {
  valid: boolean
  grantedScopes: string[]
  missingScopes: string[]
  error?: string
  userInfo?: any
}

interface ProviderConfig {
  requiredScopes: string[]
  validateToken: (accessToken: string) => Promise<OAuthValidationResult>
  refreshToken?: (refreshToken: string) => Promise<{ accessToken: string; refreshToken?: string }>
}

export class OAuthService {
  private static providers: Record<string, ProviderConfig> = {
    slack: {
      requiredScopes: [
        "chat:write",
        "chat:write.public",
        "channels:read",
        "channels:join",
        "groups:read",
        "im:read",
        "users:read",
        "team:read",
        "files:write",
        "reactions:write",
      ],
      validateToken: async (accessToken: string): Promise<OAuthValidationResult> => {
        try {
          // Test auth first
          const authResponse = await fetch("https://slack.com/api/auth.test", {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          const authData = await authResponse.json()

          if (!authData.ok) {
            return {
              valid: false,
              grantedScopes: [],
              missingScopes: [],
              error: authData.error || "Token validation failed",
            }
          }

          // Test individual endpoints to determine actual scopes
          const grantedScopes: string[] = []

          // Test chat:write
          const chatTestResponse = await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              channel: "test-nonexistent-channel",
              text: "Test message",
            }),
          })
          const chatTestData = await chatTestResponse.json()
          if (chatTestData.error !== "invalid_auth" && chatTestData.error !== "not_authed") {
            grantedScopes.push("chat:write", "chat:write.public")
          }

          // Test channels:read
          const channelsResponse = await fetch("https://slack.com/api/conversations.list", {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          const channelsData = await channelsResponse.json()
          if (channelsData.ok) {
            grantedScopes.push("channels:read", "channels:join", "groups:read", "im:read")
          }

          // Test users:read
          const usersResponse = await fetch("https://slack.com/api/users.list", {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          const usersData = await usersResponse.json()
          if (usersData.ok) {
            grantedScopes.push("users:read", "team:read")
          }

          // Test files:write
          const filesResponse = await fetch("https://slack.com/api/files.list", {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          const filesData = await filesResponse.json()
          if (filesData.ok) {
            grantedScopes.push("files:write", "reactions:write")
          }

          const requiredScopes = OAuthService.providers.slack.requiredScopes
          const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope))

          return {
            valid: missingScopes.length === 0,
            grantedScopes: [...new Set(grantedScopes)],
            missingScopes,
            userInfo: authData,
          }
        } catch (error: any) {
          return {
            valid: false,
            grantedScopes: [],
            missingScopes: [],
            error: error.message,
          }
        }
      },
    },

    google: {
      requiredScopes: [
        "openid",
        "profile",
        "email",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/drive",
      ],
      validateToken: async (accessToken: string): Promise<OAuthValidationResult> => {
        try {
          // Get token info
          const tokenInfoResponse = await fetch(
            `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`,
          )
          const tokenInfo = await tokenInfoResponse.json()

          if (tokenInfo.error) {
            return {
              valid: false,
              grantedScopes: [],
              missingScopes: [],
              error: tokenInfo.error_description || tokenInfo.error,
            }
          }

          // Get user info
          const userInfoResponse = await fetch(
            `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`,
          )
          const userInfo = await userInfoResponse.json()

          if (userInfo.error) {
            return {
              valid: false,
              grantedScopes: [],
              missingScopes: [],
              error: userInfo.error.message || "User info fetch failed",
            }
          }

          const grantedScopes = tokenInfo.scope ? tokenInfo.scope.split(" ") : []
          const requiredScopes = OAuthService.providers.google.requiredScopes
          const missingScopes = requiredScopes.filter((scope) => {
            // Handle readonly vs full access scopes
            if (scope.includes(".readonly")) {
              const fullAccessScope = scope.replace(".readonly", "")
              return !grantedScopes.includes(scope) && !grantedScopes.includes(fullAccessScope)
            }
            return !grantedScopes.includes(scope)
          })

          return {
            valid: missingScopes.length === 0,
            grantedScopes,
            missingScopes,
            userInfo,
          }
        } catch (error: any) {
          return {
            valid: false,
            grantedScopes: [],
            missingScopes: [],
            error: error.message,
          }
        }
      },
    },

    microsoft: {
      requiredScopes: ["User.Read", "Calendars.ReadWrite", "Chat.ReadWrite", "Files.ReadWrite", "Mail.ReadWrite"],
      validateToken: async (accessToken: string): Promise<OAuthValidationResult> => {
        try {
          // Get user info
          const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
            headers: { Authorization: `Bearer ${accessToken}` },
          })

          if (!userResponse.ok) {
            const error = await userResponse.json()
            return {
              valid: false,
              grantedScopes: [],
              missingScopes: [],
              error: error.error?.message || "Token validation failed",
            }
          }

          const userInfo = await userResponse.json()
          const grantedScopes: string[] = ["User.Read"]

          // Test calendar access
          const calendarResponse = await fetch("https://graph.microsoft.com/v1.0/me/calendar", {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (calendarResponse.ok) {
            grantedScopes.push("Calendars.Read", "Calendars.ReadWrite")
          }

          // Test chat access
          const chatResponse = await fetch("https://graph.microsoft.com/v1.0/me/chats", {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (chatResponse.ok) {
            grantedScopes.push("Chat.Read", "Chat.ReadWrite")
          }

          // Test files access
          const filesResponse = await fetch("https://graph.microsoft.com/v1.0/me/drive/root/children", {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (filesResponse.ok) {
            grantedScopes.push("Files.Read", "Files.ReadWrite")
          }

          // Test mail access
          const mailResponse = await fetch("https://graph.microsoft.com/v1.0/me/messages?$top=1", {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (mailResponse.ok) {
            grantedScopes.push("Mail.Read", "Mail.ReadWrite")
          }

          const requiredScopes = OAuthService.providers.microsoft.requiredScopes
          const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope))

          return {
            valid: missingScopes.length === 0,
            grantedScopes: [...new Set(grantedScopes)],
            missingScopes,
            userInfo,
          }
        } catch (error: any) {
          return {
            valid: false,
            grantedScopes: [],
            missingScopes: [],
            error: error.message,
          }
        }
      },
    },

    github: {
      requiredScopes: ["repo", "user", "workflow"],
      validateToken: async (accessToken: string): Promise<OAuthValidationResult> => {
        try {
          const userResponse = await fetch("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${accessToken}` },
          })

          if (!userResponse.ok) {
            const error = await userResponse.json()
            return {
              valid: false,
              grantedScopes: [],
              missingScopes: [],
              error: error.message || "Token validation failed",
            }
          }

          const userInfo = await userResponse.json()
          const scopesHeader = userResponse.headers.get("X-OAuth-Scopes")
          const grantedScopes = scopesHeader ? scopesHeader.split(", ").map((s) => s.trim()) : []

          const requiredScopes = OAuthService.providers.github.requiredScopes
          const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope))

          return {
            valid: missingScopes.length === 0,
            grantedScopes,
            missingScopes,
            userInfo,
          }
        } catch (error: any) {
          return {
            valid: false,
            grantedScopes: [],
            missingScopes: [],
            error: error.message,
          }
        }
      },
    },

    dropbox: {
      requiredScopes: ["files.content.write", "files.content.read", "sharing.write"],
      validateToken: async (accessToken: string): Promise<OAuthValidationResult> => {
        try {
          const accountResponse = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
          })

          if (!accountResponse.ok) {
            const error = await accountResponse.json()
            return {
              valid: false,
              grantedScopes: [],
              missingScopes: [],
              error: error.error_summary || "Token validation failed",
            }
          }

          const userInfo = await accountResponse.json()
          const grantedScopes: string[] = []

          // Test file read access
          const listResponse = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ path: "" }),
          })
          if (listResponse.ok) {
            grantedScopes.push("files.content.read")
          }

          // Test file write access
          const createResponse = await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              path: "/chainreact_test_" + Date.now(),
              autorename: true,
            }),
          })
          if (createResponse.ok) {
            grantedScopes.push("files.content.write")
          }

          // Test sharing
          const sharingResponse = await fetch("https://api.dropboxapi.com/2/sharing/list_shared_links", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          })
          if (sharingResponse.ok) {
            grantedScopes.push("sharing.write")
          }

          const requiredScopes = OAuthService.providers.dropbox.requiredScopes
          const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope))

          return {
            valid: missingScopes.length === 0,
            grantedScopes: [...new Set(grantedScopes)],
            missingScopes,
            userInfo,
          }
        } catch (error: any) {
          return {
            valid: false,
            grantedScopes: [],
            missingScopes: [],
            error: error.message,
          }
        }
      },
    },

    notion: {
      requiredScopes: ["read_user", "read_content", "update_content", "insert_content"],
      validateToken: async (accessToken: string): Promise<OAuthValidationResult> => {
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
            const userInfo = await userResponse.json()
            grantedScopes.push("read_user")

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

            const requiredScopes = OAuthService.providers.notion.requiredScopes
            const uniqueScopes = [...new Set(grantedScopes)]
            const missingScopes = requiredScopes.filter((scope) => !uniqueScopes.includes(scope))

            return {
              valid: missingScopes.length === 0,
              grantedScopes: uniqueScopes,
              missingScopes,
              userInfo,
            }
          } else {
            return {
              valid: false,
              grantedScopes: [],
              missingScopes: OAuthService.providers.notion.requiredScopes,
              error: "Failed to access user info",
            }
          }
        } catch (error: any) {
          return {
            valid: false,
            grantedScopes: [],
            missingScopes: OAuthService.providers.notion.requiredScopes,
            error: error.message,
          }
        }
      },
    },
  }

  static async validateToken(provider: string, accessToken: string): Promise<OAuthValidationResult> {
    const providerConfig = this.providers[provider]
    if (!providerConfig) {
      return {
        valid: false,
        grantedScopes: [],
        missingScopes: [],
        error: `Unsupported provider: ${provider}`,
      }
    }

    return await providerConfig.validateToken(accessToken)
  }

  static getRequiredScopes(provider: string): string[] {
    return this.providers[provider]?.requiredScopes || []
  }

  static getAllProviders(): string[] {
    return Object.keys(this.providers)
  }
}
