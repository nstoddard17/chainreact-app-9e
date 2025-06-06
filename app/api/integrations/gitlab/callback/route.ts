import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { type CookieOptions, createServerClient } from "@supabase/ssr"

const gitlab = {
  clientId: process.env.GITLAB_CLIENT_ID ?? "",
  clientSecret: process.env.GITLAB_CLIENT_SECRET ?? "",
  redirectUri: process.env.GITLAB_REDIRECT_URI ?? "",
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? origin
  if (!code) {
    console.error("No code provided")
    return NextResponse.redirect(`${origin}/login?error=NoCodeProvided`)
  }

  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete({ name, ...options })
        },
      },
    },
  )

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://gitlab.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: gitlab.clientId,
        client_secret: gitlab.clientSecret,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: gitlab.redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      console.error("Token exchange failed:", tokenResponse.statusText)
      return NextResponse.redirect(`${origin}/login?error=TokenExchangeFailed`)
    }

    const tokenData = await tokenResponse.json()
    const access_token = tokenData.access_token
    const refresh_token = tokenData.refresh_token
    const expires_in = tokenData.expires_in

    if (!access_token) {
      console.error("No access token received")
      return NextResponse.redirect(`${origin}/login?error=NoAccessToken`)
    }

    // Fetch user info from GitLab
    const userResponse = await fetch("https://gitlab.com/api/v4/user", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      console.error("Failed to fetch user info:", userResponse.statusText)
      return NextResponse.redirect(`${origin}/login?error=UserInfoFetchFailed`)
    }

    const userInfo = await userResponse.json()

    // Get or create user in Supabase
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.error("No user found in Supabase")
      return NextResponse.redirect(`${origin}/login?error=NoUserFound`)
    }

    const userId = user.id

    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

    // Update the database save operation with proper error handling
    const integrationData = {
      user_id: userId,
      provider: "gitlab",
      provider_user_id: userInfo.id.toString(),
      access_token,
      refresh_token,
      expires_at: expiresAt,
      status: "connected" as const,
      scopes: ["read_user", "read_api", "read_repository", "write_repository"],
      metadata: {
        username: userInfo.username,
        name: userInfo.name,
        email: userInfo.email,
        avatar_url: userInfo.avatar_url,
        connected_at: new Date().toISOString(),
      },
    }

    // Add delay to ensure database operation completes
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const { error: dbError } = await supabase.from("integrations").upsert(integrationData, {
      onConflict: "user_id,provider",
      ignoreDuplicates: false,
    })

    if (dbError) {
      console.error("Database error:", dbError)
      throw dbError
    }

    // Redirect to success page
    return NextResponse.redirect(`${origin}/account`)
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.redirect(`${origin}/login?error=UnexpectedError`)
  }
}
