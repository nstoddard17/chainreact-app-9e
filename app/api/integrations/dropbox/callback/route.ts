import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import type { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")

  if (code) {
    const supabase = createRouteHandlerClient({ cookies })

    // Exchange the code for the session
    const {
      data: { session },
      error,
    } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error("Error exchanging code for session:", error)
      return NextResponse.redirect(`${requestUrl.origin}/login?error=Could not authenticate`)
    }

    if (!session?.user) {
      console.error("No user found in session")
      return NextResponse.redirect(`${requestUrl.origin}/login?error=Could not authenticate`)
    }

    const { access_token, refresh_token, expires_in, user } = session

    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()
    const userId = user.id

    // Fetch user info from Dropbox API
    const userInfoResponse = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
    })

    if (!userInfoResponse.ok) {
      console.error("Error fetching user info from Dropbox:", userInfoResponse.status, await userInfoResponse.text())
      return NextResponse.redirect(`${requestUrl.origin}/login?error=Could not authenticate`)
    }

    const userInfo = await userInfoResponse.json()

    // Update the database save operation
    const integrationData = {
      user_id: userId,
      provider: "dropbox",
      provider_user_id: userInfo.account_id,
      access_token,
      refresh_token,
      expires_at: expiresAt,
      status: "connected" as const,
      scopes: ["files.content.read", "files.content.write"],
      metadata: {
        account_id: userInfo.account_id,
        name: userInfo.name?.display_name,
        email: userInfo.email,
        connected_at: new Date().toISOString(),
      },
    }

    // Use proper upsert logic
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "dropbox")
      .maybeSingle()

    if (existingIntegration) {
      await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingIntegration.id)
    } else {
      await supabase.from("integrations").insert({
        ...integrationData,
        created_at: new Date().toISOString(),
      })
    }

    // Redirect to home page after successful authentication
    return NextResponse.redirect(`${requestUrl.origin}/`)
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${requestUrl.origin}/login?error=No code provided`)
}
