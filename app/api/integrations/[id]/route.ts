import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { validateSession } from "@/lib/oauth/utils"

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const integrationId = params.id

    if (!integrationId) {
      return NextResponse.json({ error: "Integration ID is required" }, { status: 400 })
    }

    // Validate user session
    const userId = await validateSession(request)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Create admin Supabase client
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // First, verify the integration belongs to the user
    const { data: integration, error: fetchError } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .eq("user_id", userId)
      .single()

    if (fetchError || !integration) {
      return NextResponse.json({ error: "Integration not found or access denied" }, { status: 404 })
    }

    // Log the disconnection for audit purposes
    console.log(`Disconnecting ${integration.provider} integration for user ${userId}`)

    // Delete the integration record (this will clear all tokens, scopes, and metadata)
    const { error: deleteError } = await supabase
      .from("integrations")
      .delete()
      .eq("id", integrationId)
      .eq("user_id", userId)

    if (deleteError) {
      console.error("Error deleting integration:", deleteError)
      return NextResponse.json({ error: "Failed to disconnect integration" }, { status: 500 })
    }

    // Optional: Revoke tokens with the provider if they support it
    try {
      await revokeProviderTokens(integration)
    } catch (revokeError) {
      // Log but don't fail the disconnect if token revocation fails
      console.warn(`Failed to revoke tokens for ${integration.provider}:`, revokeError)
    }

    return NextResponse.json({
      success: true,
      message: `${integration.provider} integration disconnected successfully`,
      provider: integration.provider,
    })
  } catch (error: any) {
    console.error("Error in disconnect integration route:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message,
      },
      { status: 500 },
    )
  }
}

/**
 * Attempt to revoke tokens with the OAuth provider
 */
async function revokeProviderTokens(integration: any) {
  const { provider, access_token, refresh_token } = integration

  switch (provider.toLowerCase()) {
    case "google":
    case "gmail":
    case "google-drive":
    case "google-calendar":
    case "google-sheets":
    case "google-docs":
      if (access_token) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${access_token}`, {
          method: "POST",
        })
      }
      break

    case "github":
      if (access_token) {
        // Use server-side environment variables safely
        const githubClientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
        const githubClientSecret = process.env.GITHUB_CLIENT_SECRET

        if (githubClientId && githubClientSecret) {
          const credentials = Buffer.from(`${githubClientId}:${githubClientSecret}`).toString("base64")

          await fetch(`https://api.github.com/applications/${githubClientId}/token`, {
            method: "DELETE",
            headers: {
              Authorization: `Basic ${credentials}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ access_token }),
          })
        }
      }
      break

    case "discord":
      if (access_token) {
        const discordClientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
        const discordClientSecret = process.env.DISCORD_CLIENT_SECRET

        if (discordClientId && discordClientSecret) {
          await fetch("https://discord.com/api/oauth2/token/revoke", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: discordClientId,
              client_secret: discordClientSecret,
              token: access_token,
            }),
          })
        }
      }
      break

    case "teams":
    case "onedrive":
      // Microsoft doesn't provide a simple revoke endpoint
      // The tokens will expire naturally
      break

    case "slack":
      if (access_token) {
        await fetch("https://slack.com/api/auth.revoke", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        })
      }
      break

    default:
      // For providers without revoke endpoints, tokens will expire naturally
      console.log(`No revoke method implemented for ${provider}`)
  }
}
