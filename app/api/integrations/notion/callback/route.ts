import { type NextRequest, NextResponse } from "next/server"
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

    // Get session using server component client - this is the source of truth
    const supabase = createServerComponentClient({ cookies })
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error("Notion: Error retrieving session:", sessionError)
      throw new Error(`Session error: ${sessionError.message}`)
    }

    if (!sessionData?.session) {
      console.error("Notion: No session found")
      throw new Error("No session found")
    }

    console.log("Notion: Session successfully retrieved for user:", sessionData.session.user.id)

    const integrationData = {
      user_id: sessionData.session.user.id,
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
