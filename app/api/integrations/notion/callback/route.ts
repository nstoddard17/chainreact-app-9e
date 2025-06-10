import { getBaseUrl } from "@/lib/utils/getBaseUrl"
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

  console.log("Notion OAuth callback started:", {
    code: !!code,
    state: !!state,
    error,
    url: request.url,
  })

  if (error) {
    console.error("Notion OAuth error:", error)
    return NextResponse.redirect(
      `${getBaseUrl(request)}/integrations?error=oauth_error&message=${encodeURIComponent(error)}&provider=notion`,
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in Notion callback")
    return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=missing_params&provider=notion`)
  }

  try {
    // Parse state to get user ID
    let userId: string
    let stateData: any
    try {
      stateData = JSON.parse(atob(state))
      userId = stateData.userId
      console.log("Parsed state data:", { userId, stateData })

      if (!userId) {
        throw new Error("No user ID in state")
      }
    } catch (stateError) {
      console.error("Notion: Invalid state parameter:", stateError)
      return NextResponse.redirect(
        `${getBaseUrl(request)}/integrations?error=invalid_state&provider=notion&message=Invalid+state+parameter`,
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
        Accept: "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${getBaseUrl(request)}/api/integrations/notion/callback`,
        client_id: notionClientId,
        client_secret: notionClientSecret,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Notion token exchange failed:", tokenResponse.status, errorData)
      throw new Error(`Token exchange failed: ${errorData}`)
    }

    const tokenData = await tokenResponse.json()
    const { access_token, workspace_name, workspace_id, bot_id, owner } = tokenData

    console.log("Notion token data received:", {
      hasToken: !!access_token,
      workspace_name,
      workspace_id,
      bot_id: !!bot_id,
      owner: !!owner,
    })

    // Test the token by making a simple API call to get user info
    let userData = null
    const grantedScopes = ["read_user"]

    try {
      const userResponse = await fetch("https://api.notion.com/v1/users/me", {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Notion-Version": "2022-06-28",
        },
      })

      if (userResponse.ok) {
        userData = await userResponse.json()
        grantedScopes.push("read_content")
        console.log("Notion user data fetched successfully:", { userId: userData?.id })
      } else {
        console.warn("Failed to fetch Notion user data:", userResponse.status)
      }
    } catch (testError) {
      console.warn("Notion token test failed, but proceeding:", testError)
    }

    const now = new Date().toISOString()

    // Structure the integration data to match Discord format
    const integrationData = {
      user_id: userId,
      provider: "notion",
      provider_user_id: bot_id || workspace_id || owner?.user?.id || userData?.id || "unknown",
      access_token,
      refresh_token: null, // Notion doesn't provide refresh tokens
      expires_at: null, // Notion tokens don't expire
      status: "connected" as const,
      scopes: grantedScopes,
      granted_scopes: grantedScopes, // Add this field for consistency
      missing_scopes: [], // Add this field for consistency
      scope_validation_status: "valid" as const, // Add this field for consistency
      is_active: true, // Add this field for consistency
      metadata: {
        workspace_name,
        workspace_id,
        bot_id,
        owner,
        user_data: userData,
        connected_at: now,
      },
      created_at: now,
      updated_at: now,
    }

    console.log("Preparing to save integration data:", {
      userId: integrationData.user_id,
      provider: integrationData.provider,
      status: integrationData.status,
      provider_user_id: integrationData.provider_user_id,
    })

    // Check if integration exists and update or insert
    const { data: existingIntegration, error: fetchError } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "notion")
      .maybeSingle()

    if (fetchError) {
      console.error("Error fetching existing integration:", fetchError)
      throw fetchError
    }

    console.log("Existing integration check:", { exists: !!existingIntegration, id: existingIntegration?.id })

    if (existingIntegration) {
      const { error: updateError, data: updatedData } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: now,
        })
        .eq("id", existingIntegration.id)
        .select()

      if (updateError) {
        console.error("Error updating Notion integration:", updateError)
        throw updateError
      }

      console.log("Notion integration updated successfully:", { id: existingIntegration.id, data: updatedData })
    } else {
      const { error: insertError, data: insertedData } = await supabase
        .from("integrations")
        .insert(integrationData)
        .select()

      if (insertError) {
        console.error("Error inserting Notion integration:", insertError)
        throw insertError
      }

      console.log("Notion integration inserted successfully:", { data: insertedData })
    }

    console.log("Notion integration saved successfully, redirecting...")
    return NextResponse.redirect(`${getBaseUrl(request)}/integrations?success=true&provider=notion&t=${Date.now()}`)
  } catch (error: any) {
    console.error("Notion OAuth callback error:", error)
    const errorMessage = encodeURIComponent(error.message || "Unknown error occurred")
    return NextResponse.redirect(
      `${getBaseUrl(request)}/integrations?error=callback_failed&provider=notion&message=${errorMessage}`,
    )
  }
}
