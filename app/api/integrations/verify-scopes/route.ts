import { NextResponse } from "next/server"

// OAuth provider verification endpoints and scope mappings
const PROVIDER_CONFIGS = {
  google: {
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    tokenInfoUrl: "https://www.googleapis.com/oauth2/v1/tokeninfo",
    scopeMapping: {
      "https://www.googleapis.com/auth/calendar": ["Create Calendar Event", "Update Calendar Event"],
      "https://www.googleapis.com/auth/calendar.events": ["Create Calendar Event", "Update Calendar Event"],
      "https://www.googleapis.com/auth/spreadsheets": ["Append to Sheet", "Read Sheet Data", "Create Spreadsheet"],
      "https://www.googleapis.com/auth/documents": ["Create Document", "Update Document"],
      "https://www.googleapis.com/auth/drive": ["Upload to Drive", "Create Folder", "Share File"],
      "https://www.googleapis.com/auth/gmail.send": ["Send Email"],
      "https://www.googleapis.com/auth/gmail.readonly": ["Read Emails"],
    },
  },
  microsoft: {
    userInfoUrl: "https://graph.microsoft.com/v1.0/me",
    scopeMapping: {
      "https://graph.microsoft.com/Calendars.ReadWrite": ["Create Calendar Event", "Update Calendar Event"],
      "https://graph.microsoft.com/Files.ReadWrite": ["Upload to OneDrive", "Create Folder"],
      "https://graph.microsoft.com/Mail.Send": ["Send Email"],
      "https://graph.microsoft.com/Mail.Read": ["Read Emails"],
    },
  },
  slack: {
    userInfoUrl: "https://slack.com/api/auth.test",
    scopeMapping: {
      "chat:write": ["Send Message", "Post to Channel"],
      "channels:read": ["List Channels"],
      "users:read": ["Get User Info"],
      "files:write": ["Upload File"],
    },
  },
  dropbox: {
    userInfoUrl: "https://api.dropboxapi.com/2/users/get_current_account",
    scopeMapping: {
      "files.content.write": ["Upload File", "Create Folder"],
      "files.content.read": ["Download File", "List Files"],
      "sharing.write": ["Share File", "Create Share Link"],
    },
  },
}

async function verifyGoogleToken(accessToken: string) {
  try {
    const response = await fetch(`${PROVIDER_CONFIGS.google.tokenInfoUrl}?access_token=${accessToken}`)
    const data = await response.json()

    if (data.error) {
      return { valid: false, scopes: [] }
    }

    const scopes = data.scope ? data.scope.split(" ") : []
    return { valid: true, scopes }
  } catch (error) {
    console.error("Error verifying Google token:", error)
    return { valid: false, scopes: [] }
  }
}

async function verifyMicrosoftToken(accessToken: string) {
  try {
    const response = await fetch(PROVIDER_CONFIGS.microsoft.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      return { valid: false, scopes: [] }
    }

    // For Microsoft, we need to check the token's scope claim
    // This is a simplified version - in production, you'd decode the JWT token
    const data = await response.json()
    return { valid: true, scopes: [] } // Would need to extract from token
  } catch (error) {
    console.error("Error verifying Microsoft token:", error)
    return { valid: false, scopes: [] }
  }
}

async function verifySlackToken(accessToken: string) {
  try {
    const response = await fetch(PROVIDER_CONFIGS.slack.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const data = await response.json()

    if (!data.ok) {
      return { valid: false, scopes: [] }
    }

    // Slack doesn't return scopes in auth.test, so we'd need to store them
    return { valid: true, scopes: [] }
  } catch (error) {
    console.error("Error verifying Slack token:", error)
    return { valid: false, scopes: [] }
  }
}

async function verifyDropboxToken(accessToken: string) {
  try {
    const response = await fetch(PROVIDER_CONFIGS.dropbox.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    })

    if (!response.ok) {
      return { valid: false, scopes: [] }
    }

    // Dropbox doesn't return scopes in user info, would need to store them
    return { valid: true, scopes: [] }
  } catch (error) {
    console.error("Error verifying Dropbox token:", error)
    return { valid: false, scopes: [] }
  }
}

function mapScopesToComponents(provider: string, scopes: string[]) {
  const config = PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS]
  if (!config || !config.scopeMapping) return []

  const availableComponents = new Set<string>()

  scopes.forEach((scope) => {
    const components = config.scopeMapping[scope]
    if (components) {
      components.forEach((component) => availableComponents.add(component))
    }
  })

  return Array.from(availableComponents)
}

import { getSupabaseClient } from "@/lib/supabase"

// Simple verification function that doesn't make external API calls
// but uses the stored scopes from the integration metadata
async function verifyIntegrationScopes(integrations: any[]) {
  return integrations.map((integration) => {
    // Extract scopes from metadata
    const scopes = integration.metadata?.scopes || []

    return {
      ...integration,
      verified: true, // Assume valid for now
      verifiedScopes: scopes,
    }
  })
}

export async function GET() {
  try {
    const supabase = getSupabaseClient()
    const { data: sessionData } = await supabase.auth.getSession()

    if (!sessionData?.session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const userId = sessionData.session.user.id

    // Get all integrations for the user
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "connected")

    if (error) {
      console.error("Error fetching integrations:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Verify integrations using the simplified approach
    const verifiedIntegrations = await verifyIntegrationScopes(integrations || [])

    return NextResponse.json({ integrations: verifiedIntegrations })
  } catch (error: any) {
    console.error("Error verifying integration scopes:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
