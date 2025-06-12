import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Use direct Supabase client with service role for reliable database operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined")
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
})

const notionClientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID
const notionClientSecret = process.env.NOTION_CLIENT_SECRET

if (!notionClientId || !notionClientSecret) {
  throw new Error("NEXT_PUBLIC_NOTION_CLIENT_ID and NOTION_CLIENT_SECRET must be defined")
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Notion OAuth callback:", { code: !!code, state: !!state, error })

  if (error) {
    console.error("Notion OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=notion", baseUrl))
  }

  if (!code || !state) {
    console.error("Missing code or state in Notion callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=notion", baseUrl))
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
      console.log("Parsed state data:", stateData)
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(new URL("/integrations?error=invalid_state&provider=notion", baseUrl))
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(new URL("/integrations?error=missing_user_id&provider=notion", baseUrl))
    }

    console.log("Notion: Processing OAuth for user:", userId)

    // Exchange code for token using Basic Auth (as per Notion docs)
    const authHeader = Buffer.from(`${notionClientId}:${notionClientSecret}`).toString("base64")

    const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${authHeader}`,
        Accept: "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${getBaseUrl(request)}/api/integrations/notion/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("Notion token exchange failed:", tokenResponse.status, errorText)
      return NextResponse.redirect(
        new URL(
          `/integrations?error=token_exchange_failed&provider=notion&message=${encodeURIComponent(errorText)}`,
          baseUrl,
        ),
      )
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

    // Check if integration exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "notion")
      .maybeSingle()

    // Only include fields that exist in your database schema
    const integrationData = {
      user_id: userId,
      provider: "notion",
      provider_user_id: bot_id || workspace_id || owner?.user?.id || userData?.id || "unknown",
      access_token,
      refresh_token: null, // Notion doesn't provide refresh tokens
      expires_at: null, // Notion tokens don't expire
      status: "connected",
      scopes: grantedScopes,
      metadata: {
        workspace_name,
        workspace_id,
        bot_id,
        owner,
        user_data: userData,
        connected_at: now,
        granted_scopes: grantedScopes, // Store in metadata instead
        missing_scopes: [],
        scope_validation_status: "valid",
      },
      is_active: true,
      updated_at: now,
    }

    console.log("Preparing to save integration data:", {
      userId: integrationData.user_id,
      provider: integrationData.provider,
      status: integrationData.status,
    })

    if (existingIntegration) {
      const { error } = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id)

      if (error) {
        console.error("Error updating Notion integration:", error)
        return NextResponse.redirect(new URL("/integrations?error=database_update_failed&provider=notion", baseUrl))
      }
      console.log("Notion integration updated successfully:", { id: existingIntegration.id })
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (error) {
        console.error("Error inserting Notion integration:", error)
        return NextResponse.redirect(new URL("/integrations?error=database_insert_failed&provider=notion", baseUrl))
      }
      console.log("Notion integration inserted successfully")
    }

    // Add a delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    return NextResponse.redirect(
      new URL(`/integrations?success=notion_connected&provider=notion&t=${Date.now()}`, baseUrl),
    )
  } catch (error: any) {
    console.error("Notion OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=notion&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
