import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Notion OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Notion OAuth error:", error)
    return NextResponse.redirect(
      new URL(`/integrations?error=oauth_error&message=${encodeURIComponent(error)}&provider=notion`, request.url),
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in Notion callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=notion", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    console.log("Decoded state:", stateData)

    if (provider !== "notion") {
      throw new Error("Invalid provider in state")
    }

    // Use hardcoded redirect URI for Notion
    const redirectUri = "https://chainreact.app/api/integrations/notion/callback"

    console.log("Using redirect URI:", redirectUri)

    // Exchange code for access token
    console.log("Exchanging code for access token...")
    const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          process.env.NEXT_PUBLIC_NOTION_CLIENT_ID + ":" + process.env.NOTION_CLIENT_SECRET,
        ).toString("base64")}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Notion token exchange failed:", errorData)
      throw new Error(`Failed to exchange code for token: ${errorData}`)
    }

    const tokenData = await tokenResponse.json()
    console.log("Token exchange successful:", {
      hasAccessToken: !!tokenData.access_token,
      workspaceName: tokenData.workspace_name,
      workspaceId: tokenData.workspace_id,
      botId: tokenData.bot_id,
    })

    const { access_token, workspace_name, workspace_id, bot_id } = tokenData

    // Get user session using multiple fallback methods
    console.log("Getting user session...")
    let session = null
    let userId = null

    try {
      // Method 1: Try server component client
      const supabase = createServerComponentClient({ cookies })
      const {
        data: { session: serverSession },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (serverSession && !sessionError) {
        session = serverSession
        userId = session.user.id
        console.log("Got session from server component client")
      }
    } catch (serverError) {
      console.log("Server component client failed:", serverError)
    }

    if (!session) {
      try {
        // Method 2: Try regular client
        const regularSupabase = getSupabaseClient()
        const {
          data: { session: fallbackSession },
          error: fallbackError,
        } = await regularSupabase.auth.getSession()

        if (fallbackSession && !fallbackError) {
          session = fallbackSession
          userId = session.user.id
          console.log("Got session from regular client")
        }
      } catch (fallbackError) {
        console.log("Regular client failed:", fallbackError)
      }
    }

    if (!session && reconnect && integrationId) {
      try {
        // Method 3: For reconnection, try to get user from existing integration
        const supabase = getSupabaseClient()
        const { data: existingIntegration } = await supabase
          .from("integrations")
          .select("user_id")
          .eq("id", integrationId)
          .single()

        if (existingIntegration?.user_id) {
          userId = existingIntegration.user_id
          console.log("Got user ID from existing integration for reconnection")
        }
      } catch (integrationError) {
        console.log("Failed to get user from existing integration:", integrationError)
      }
    }

    if (!userId) {
      console.error("No session or user ID found after trying all methods")
      return NextResponse.redirect(
        new URL(
          "/integrations?error=no_session&provider=notion&message=Please%20log%20in%20and%20try%20again",
          request.url,
        ),
      )
    }

    console.log("Session found for user:", userId)

    const integrationData = {
      user_id: userId,
      provider: "notion",
      provider_user_id: bot_id,
      access_token,
      status: "connected" as const,
      scopes: ["read", "write"],
      metadata: {
        workspace_name,
        workspace_id,
        bot_id,
        connected_at: new Date().toISOString(),
      },
    }

    console.log("Saving integration to database...")

    const supabase = getSupabaseClient()

    if (reconnect && integrationId) {
      // Update existing integration
      console.log("Updating existing integration:", integrationId)
      const { error: updateError } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (updateError) {
        console.error("Database update error:", updateError)
        throw updateError
      }
      console.log("Integration updated successfully")
    } else {
      // Create new integration
      console.log("Creating new integration")
      const { error: insertError } = await supabase.from("integrations").insert(integrationData)
      if (insertError) {
        console.error("Database insert error:", insertError)
        throw insertError
      }
      console.log("Integration created successfully")
    }

    console.log("Notion integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=notion_connected", request.url))
  } catch (error: any) {
    console.error("Notion OAuth callback error:", error)
    const errorMessage = encodeURIComponent(error.message || "Unknown error occurred")
    return NextResponse.redirect(
      new URL(`/integrations?error=callback_failed&provider=notion&message=${errorMessage}`, request.url),
    )
  }
}
