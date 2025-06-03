import { type NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const scope = searchParams.get("scope")

  console.log("=== GOOGLE OAUTH CALLBACK START ===")
  console.log("Callback params:", { code: !!code, state, error, scope })
  console.log("Request URL:", request.url)
  console.log("Request origin:", request.headers.get("origin"))
  console.log("Request referer:", request.headers.get("referer"))

  // Debug cookies before processing
  const cookieStore = cookies()
  const allCookies = cookieStore.getAll()
  const supabaseCookies = allCookies.filter(
    (cookie) => cookie.name.includes("supabase") || cookie.name.includes("sb-") || cookie.name.includes("auth"),
  )

  console.log("=== COOKIE DEBUG ===")
  console.log("Total cookies received:", allCookies.length)
  console.log("Supabase cookies found:", supabaseCookies.length)

  supabaseCookies.forEach((cookie) => {
    console.log(`Cookie: ${cookie.name}`)
    console.log(`Value length: ${cookie.value?.length || 0}`)
    console.log(`Value starts with: ${cookie.value?.substring(0, 20)}...`)
  })

  if (error) {
    console.error("Google OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=google", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Google callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=google", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    console.log("Decoded state data:", stateData)

    if (!provider || (!provider.startsWith("google") && provider !== "gmail" && provider !== "youtube")) {
      throw new Error("Invalid provider in state")
    }

    // Use the hardcoded redirect URI that matches what we're using in the OAuth flow
    const redirectUri = "https://chainreact.app/api/integrations/google/callback"

    // Exchange code for access token
    console.log("Exchanging code for access token...")
    console.log("Using redirect URI:", redirectUri)

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Google token exchange failed:", errorData)
      throw new Error(`Failed to exchange code for token: ${errorData}`)
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in, scope: grantedScope } = tokenData

    console.log("Token exchange successful:", {
      hasAccessToken: !!access_token,
      hasRefreshToken: !!refresh_token,
      expiresIn: expires_in,
      scope: grantedScope,
    })

    if (!access_token) {
      throw new Error("No access token received from Google")
    }

    // Get user info from Google using the OpenID Connect endpoint
    console.log("Fetching user info from Google...")
    const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/json",
      },
    })

    if (!userResponse.ok) {
      const errorData = await userResponse.text()
      console.error("Failed to get user info from Google:", errorData)
      throw new Error(`Failed to get user info: ${errorData}`)
    }

    const userData = await userResponse.json()
    console.log("User info fetched successfully:", { userId: userData.sub, email: userData.email })

    // Get session using server component client
    console.log("=== SESSION RETRIEVAL ===")
    const supabase = createServerComponentClient({ cookies })

    console.log("Attempting to get session...")
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    console.log("Session result:", {
      hasSession: !!sessionData.session,
      hasUser: !!sessionData.session?.user,
      userId: sessionData.session?.user?.id,
      userEmail: sessionData.session?.user?.email,
      error: sessionError?.message,
    })

    if (sessionError) {
      console.error("Session error details:", sessionError)
    }

    // Also try getUser() for comparison
    console.log("Attempting to get user directly...")
    const { data: directUserData, error: userError } = await supabase.auth.getUser()

    console.log("Direct user result:", {
      hasUser: !!directUserData.user,
      userId: directUserData.user?.id,
      userEmail: directUserData.user?.email,
      error: userError?.message,
    })

    const session = sessionData.session

    if (!session) {
      console.error("=== NO SESSION FOUND ===")
      console.error("This means the user is not authenticated when reaching the callback")
      console.error("Possible causes:")
      console.error("1. User not logged in before starting OAuth flow")
      console.error("2. Session cookie not being sent with callback request")
      console.error("3. Cookie domain/SameSite policy issues")
      console.error("4. Session expired during OAuth flow")

      return NextResponse.redirect(new URL(`/integrations?error=no_session&provider=google&debug=true`, request.url))
    }

    console.log("=== SESSION FOUND ===")
    console.log("User ID:", session.user.id)
    console.log("User email:", session.user.email)

    const integrationData = {
      user_id: session.user.id,
      provider: provider,
      provider_user_id: userData.sub,
      status: "connected" as const,
      metadata: {
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        user_name: userData.name,
        user_email: userData.email,
        picture: userData.picture,
        scopes: grantedScope ? grantedScope.split(" ") : [],
        connected_at: new Date().toISOString(),
      },
    }

    console.log("Saving integration to database...", {
      userId: session.user.id,
      provider: provider,
      reconnect,
      integrationId,
    })

    if (reconnect && integrationId) {
      // Update existing integration
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (error) {
        console.error("Error updating integration:", error)
        throw error
      }
      console.log("Integration updated successfully")
    } else {
      // Create new integration
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) {
        console.error("Error inserting integration:", error)
        throw error
      }
      console.log("Integration created successfully")
    }

    console.log("=== GOOGLE OAUTH CALLBACK SUCCESS ===")
    return NextResponse.redirect(new URL(`/integrations?success=${provider}_connected`, request.url))
  } catch (error: any) {
    console.error("=== GOOGLE OAUTH CALLBACK ERROR ===")
    console.error("Error details:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=google&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
