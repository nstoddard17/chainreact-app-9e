import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const oauthUrl = searchParams.get("oauth_url")

    if (!oauthUrl) {
      return NextResponse.redirect(new URL("/integrations?error=missing_oauth_url", request.url))
    }

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL("/auth/login", request.url))
    }

    // Get the user's existing GitHub integration
    const { data: integration } = await supabase
      .from("integrations")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("provider", "github")
      .eq("status", "connected")
      .single()

    // If there's an existing integration, revoke it first
    if (integration?.access_token) {
      try {
        const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
        const clientSecret = process.env.GITHUB_CLIENT_SECRET

        if (clientId && clientSecret) {
          // Revoke the existing token
          await fetch(`https://api.github.com/applications/${clientId}/token`, {
            method: "DELETE",
            headers: {
              Accept: "application/vnd.github.v3+json",
              Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              access_token: integration.access_token,
            }),
          })

          // Also delete from our database
          await supabase.from("integrations").delete().eq("user_id", user.id).eq("provider", "github")
        }
      } catch (error) {
        console.error("Failed to revoke existing GitHub token:", error)
        // Continue anyway - the OAuth flow will still work
      }
    }

    // Now redirect to the OAuth URL which should show the permissions screen
    return NextResponse.redirect(oauthUrl)
  } catch (error) {
    console.error("GitHub revoke-and-auth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=revoke_failed", request.url))
  }
}
