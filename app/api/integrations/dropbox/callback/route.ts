import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { validateAndUpdateIntegrationScopes } from "@/lib/integrations/scopeValidation"

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const state = searchParams.get("state")

  const baseUrl = getBaseUrl(request)
  const redirectUri = `${getBaseUrl(request)}/api/integrations/dropbox/callback`

  if (error) {
    console.error("Dropbox authentication error:", error)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=dropbox_auth_failed&message=${encodeURIComponent(error)}`,
    )
  }

  if (!code) {
    console.error("No code received from Dropbox")
    return NextResponse.redirect(`${baseUrl}/integrations?error=no_code_received&provider=dropbox`)
  }

  if (!state) {
    console.error("No state received from Dropbox")
    return NextResponse.redirect(`${baseUrl}/integrations?error=no_state_received&provider=dropbox`)
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(`${baseUrl}/integrations?error=invalid_state&provider=dropbox`)
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(`${baseUrl}/integrations?error=no_user_id&provider=dropbox`)
    }

    const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code: code,
        grant_type: "authorization_code",
        client_id: process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID!,
        client_secret: process.env.DROPBOX_CLIENT_SECRET!,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      console.error("Failed to retrieve token from Dropbox:", tokenResponse.status, await tokenResponse.text())
      return NextResponse.redirect(`${baseUrl}/integrations?error=dropbox_token_failed`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token
    const accountId = tokenData.account_id
    let grantedScopes: string[] = []
    if (tokenData.scope) {
      if (typeof tokenData.scope === "string") {
        grantedScopes = tokenData.scope
          .split(/\s+/)
          .map((s: string) => s.trim())
          .filter((s: string) => s)
      } else if (Array.isArray(tokenData.scope)) {
        grantedScopes = tokenData.scope
      }
    }
    if (grantedScopes.length === 0) {
      grantedScopes = ["files.content.read", "files.content.write"]
    }

    if (!accessToken) {
      console.error("No access token received from Dropbox")
      return NextResponse.redirect(`${baseUrl}/integrations?error=no_access_token&provider=dropbox`)
    }

    // Get user info
    const userResponse = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(null),
    })

    if (!userResponse.ok) {
      console.error("Failed to get Dropbox user info:", await userResponse.text())
      return NextResponse.redirect(`${baseUrl}/integrations?error=user_info_failed&provider=dropbox`)
    }

    const userData = await userResponse.json()
    const now = new Date().toISOString()

    // Check if integration exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "dropbox")
      .maybeSingle()

    const integrationData = {
      user_id: userId,
      provider: "dropbox",
      provider_user_id: accountId,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      status: "connected" as const,
      scopes: grantedScopes,
      metadata: {
        email: userData.email,
        name: userData.name.display_name,
        account_id: accountId,
        connected_at: now,
      },
      updated_at: now,
    }

    let integrationId: string | undefined
    if (existingIntegration) {
      const { data, error } = await supabase
        .from("integrations")
        .update(integrationData)
        .eq("id", existingIntegration.id)
        .select("id")
        .single()

      if (error) {
        console.error("Error updating Dropbox integration:", error)
        return NextResponse.redirect(`${baseUrl}/integrations?error=database_update_failed&provider=dropbox`)
      }
      integrationId = data.id
    } else {
      const { data, error } = await supabase
        .from("integrations")
        .insert({
          ...integrationData,
          created_at: now,
        })
        .select("id")
        .single()

      if (error) {
        console.error("Error inserting Dropbox integration:", error)
        return NextResponse.redirect(`${baseUrl}/integrations?error=database_insert_failed&provider=dropbox`)
      }
      integrationId = data.id
    }

    if (integrationId) {
      try {
        await validateAndUpdateIntegrationScopes(integrationId, grantedScopes)
      } catch (err) {
        console.error("Dropbox scope validation failed:", err)
      }
    }

    // Add a delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    return NextResponse.redirect(`${baseUrl}/integrations?success=dropbox_connected&provider=dropbox&t=${Date.now()}`)
  } catch (e: any) {
    console.error("Error during Dropbox authentication:", e)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=dropbox_auth_error&message=${encodeURIComponent(e.message)}`,
    )
  }
}
