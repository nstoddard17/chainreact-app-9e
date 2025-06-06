import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

const notionClientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID
const notionClientSecret = process.env.NOTION_CLIENT_SECRET

if (!notionClientId || !notionClientSecret) {
  throw new Error("NEXT_PUBLIC_NOTION_CLIENT_ID and NOTION_CLIENT_SECRET must be defined")
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Notion OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Notion OAuth error:", error)
    return NextResponse.redirect(
      `https://chainreact.app/integrations?error=oauth_error&message=${encodeURIComponent(error)}&provider=notion`,
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in Notion callback")
    return NextResponse.redirect(`https://chainreact.app/integrations?error=missing_params&provider=notion`)
  }

  try {
    // Parse state to get user ID
    let userId: string
    try {
      const stateData = JSON.parse(atob(state))
      userId = stateData.userId
      if (!userId) {
        throw new Error("No user ID in state")
      }
    } catch (stateError) {
      console.error("Notion: Invalid state parameter:", stateError)
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=invalid_state&provider=notion&message=Invalid+state+parameter`,
      )
    }

    // Initialize Supabase client
    const supabase = createRouteHandlerClient({ cookies })

    console.log("Notion: Processing OAuth for user:", userId)

    // Exchange code for token
    const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(notionClientId + ":" + notionClientSecret).toString("base64")}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: "https://chainreact.app/api/integrations/notion/callback",
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Notion token exchange failed:", errorData)
      throw new Error(`Token exchange failed: ${errorData}`)
    }

    const tokenData = await tokenResponse.json()
    const { access_token, workspace_name, workspace_id, bot_id, owner } = tokenData

    console.log("Notion token data received:", {
      hasToken: !!access_token,
      workspace_name,
      workspace_id,
      bot_id: !!bot_id,
    })

    // Test the token by making a simple API call
    const grantedScopes = ["read_user"]
    try {
      const userResponse = await fetch("https://api.notion.com/v1/users/me", {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Notion-Version": "2022-06-28",
        },
      })

      if (userResponse.ok) {
        grantedScopes.push("read_content")
      }
    } catch (testError) {
      console.warn("Notion token test failed, but proceeding:", testError)
    }

    const now = new Date().toISOString()
    const integrationData = {
      user_id: userId,
      provider: "notion",
      provider_user_id: bot_id || workspace_id || owner?.user?.id || "unknown",
      access_token,
      status: "connected" as const,
      scopes: grantedScopes,
      metadata: {
        workspace_name,
        workspace_id,
        bot_id,
        owner,
        connected_at: now,
      },
      updated_at: now,
    }

    // Check if integration exists and update or insert
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "notion")
      .maybeSingle()

    if (existingIntegration) {
      const { error } = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id)

      if (error) {
        console.error("Error updating Notion integration:", error)
        throw error
      }
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (error) {
        console.error("Error inserting Notion integration:", error)
        throw error
      }
    }

    console.log("Notion integration saved successfully")
    return NextResponse.redirect(`https://chainreact.app/integrations?success=notion_connected&provider=notion`)
  } catch (error: any) {
    console.error("Notion OAuth callback error:", error)
    const errorMessage = encodeURIComponent(error.message || "Unknown error occurred")
    return NextResponse.redirect(
      `https://chainreact.app/integrations?error=callback_failed&provider=notion&message=${errorMessage}`,
    )
  }
}
