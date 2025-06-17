import { type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

// Create a Supabase client with admin privileges
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(request: NextRequest) {
  console.log("YouTube OAuth callback received")

  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")
    const baseUrl = getBaseUrl(request)

    if (error) {
      // Handle error display in the popup
      return new Response(`<h1>Error: ${error}</h1><p>${searchParams.get("error_description") || "An unknown error occurred."}</p><script>setTimeout(window.close, 3000)</script>`, { status: 400, headers: { 'Content-Type': 'text/html' } })
    }
    
    if (!code || !state) {
        return new Response(`<h1>Error: Missing code or state</h1><script>setTimeout(window.close, 3000)</script>`, { status: 400, headers: { 'Content-Type': 'text/html' } })
    }

    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      return new Response(`<h1>Error: Missing userId in state</h1><script>setTimeout(window.close, 3000)</script>`, { status: 400, headers: { 'Content-Type': 'text/html' } })
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${baseUrl}/api/integrations/youtube/callback`,
        grant_type: "authorization_code",
      }),
    })

    if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        return new Response(`<h1>Error exchanging token</h1><p>${errorText}</p><script>setTimeout(window.close, 5000)</script>`, { status: 400, headers: { 'Content-Type': 'text/html' } })
    }

    const tokens = await tokenResponse.json()

    // Get user info from Google
    const userInfoResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    if (!userInfoResponse.ok) {
        const errorText = await userInfoResponse.text()
        return new Response(`<h1>Error fetching channel info</h1><p>${errorText}</p><script>setTimeout(window.close, 5000)</script>`, { status: 400, headers: { 'Content-Type': 'text/html' } })
    }

    const userInfo = await userInfoResponse.json()
    const channel = userInfo.items[0]

    const integrationData = {
      user_id: userId,
      provider: "youtube",
      provider_user_id: channel.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: tokens.scope.split(" "),
      metadata: {
        name: channel.snippet.title,
        picture: channel.snippet.thumbnails.default.url,
      },
      status: "connected",
    }

    // Upsert integration into database
    const { error: dbError } = await supabase
      .from("integrations")
      .upsert(integrationData, { onConflict: "user_id, provider" })

    if (dbError) {
      return new Response(`<h1>Database Error</h1><p>${dbError.message}</p><script>setTimeout(window.close, 5000)</script>`, { status: 500, headers: { 'Content-Type': 'text/html' } })
    }

    // Return a success page that closes itself
    return new Response("<h1>YouTube Connected!</h1><p>You can close this window now.</p><script>if(window.opener){window.opener.postMessage({type:'oauth-success',provider:'youtube'},'*');}setTimeout(window.close, 1000);</script>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    })

  } catch (error: any) {
    console.error("YouTube callback error:", error)
    return new Response(`<h1>An unexpected error occurred</h1><p>${error.message}</p><script>setTimeout(window.close, 5000)</script>`, { status: 500, headers: { 'Content-Type': 'text/html' } })
  }
}
