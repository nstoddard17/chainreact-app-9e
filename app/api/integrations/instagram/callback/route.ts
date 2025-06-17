import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase URL or service role key")
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  const baseUrl = getBaseUrl()

  if (error) {
    console.error(`Instagram OAuth error: ${error} - ${errorDescription}`)
    const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Instagram Connection Failed</title>
            <style>
              body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; }
              .container { max-width: 500px; padding: 20px; border: 1px solid #ccc; border-radius: 8px; }
              h1 { color: #dc3545; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Instagram Connection Failed</h1>
              <p>${errorDescription || "An unknown error occurred."}</p>
              <p>Please try again or contact support if the problem persists.</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'oauth-error',
                    provider: 'instagram',
                    error: '${error}',
                    errorDescription: '${errorDescription || "An unknown error occurred."}'
                  }, '${baseUrl}');
                  setTimeout(() => window.close(), 1000);
                }
              </script>
            </div>
          </body>
        </html>
      `
    return new Response(errorHtml, {
      headers: { "Content-Type": "text/html" },
      status: 400,
    })
  }

  if (!code || !state) {
    console.error("Missing code or state in Instagram callback")
    const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Instagram Connection Failed</title>
             <style>
              body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; }
              .container { max-width: 500px; padding: 20px; border: 1px solid #ccc; border-radius: 8px; }
              h1 { color: #dc3545; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Instagram Connection Failed</h1>
              <p>Authorization code or state parameter is missing.</p>
              <p>Please try again or contact support if the problem persists.</p>
               <script>
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'oauth-error',
                    provider: 'instagram',
                    error: 'Missing code or state'
                  }, '${baseUrl}');
                  setTimeout(() => window.close(), 1000);
                }
              </script>
            </div>
          </body>
        </html>
      `
    return new Response(errorHtml, {
      headers: { "Content-Type": "text/html" },
      status: 400,
    })
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { userId } = stateData

    if (!userId) {
      console.error("Missing userId in Instagram state")
      // Handle error: show an error page and inform the user
      return new Response("User ID is missing from state", { status: 400 })
    }

    const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_CLIENT_ID
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Instagram client ID or secret not configured")
    }

    const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${baseUrl}/api/integrations/instagram/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      throw new Error(`Instagram token exchange failed: ${errorData.error_description}`)
    }

    const tokenData = await tokenResponse.json()

    const expiresIn = tokenData.expires_in
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    // Get user info
    const userResponse = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${tokenData.access_token}`)

    if (!userResponse.ok) {
      throw new Error("Failed to get Instagram user info")
    }

    const userData = await userResponse.json()

    const integrationData = {
      user_id: userId,
      provider: "instagram",
      provider_user_id: userData.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      scopes: tokenData.scope.split(' '),
      status: "connected",
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase.from("integrations").upsert(integrationData, {
      onConflict: "user_id, provider",
    })

    if (upsertError) {
      throw new Error(`Failed to save Instagram integration: ${upsertError.message}`)
    }

    const successHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Instagram Connection Successful</title>
           <style>
              body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; }
              .container { max-width: 500px; padding: 20px; border: 1px solid #ccc; border-radius: 8px; }
              h1 { color: #28a745; }
              p { color: #666; }
            </style>
        </head>
        <body>
          <div class="container">
            <h1>Instagram Connection Successful</h1>
            <p>You can now close this window.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth-success', provider: 'instagram' }, '${baseUrl}');
              setTimeout(() => window.close(), 1000);
            }
          </script>
        </body>
      </html>
    `

    return new Response(successHtml, {
      headers: { "Content-Type": "text/html" },
    })
  } catch (e: any) {
    console.error("Instagram callback error:", e)
    const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Instagram Connection Failed</title>
            <style>
              body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; }
              .container { max-width: 500px; padding: 20px; border: 1px solid #ccc; border-radius: 8px; }
              h1 { color: #dc3545; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
               <h1>Instagram Connection Failed</h1>
              <p>${e.message || "An unexpected error occurred."}</p>
               <p>Please try again or contact support if the problem persists.</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'oauth-error',
                    provider: 'instagram',
                    error: 'Callback processing failed',
                    errorDescription: '${e.message || "An unexpected error occurred."}'
                  }, '${baseUrl}');
                  setTimeout(() => window.close(), 1000);
                }
              </script>
            </div>
          </body>
        </html>
      `
    return new Response(errorHtml, {
      headers: { "Content-Type": "text/html" },
      status: 500,
    })
  }
}
