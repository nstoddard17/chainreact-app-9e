import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

// Create a Supabase client with admin privileges
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(request: NextRequest) {
  console.log("Google Drive OAuth callback received")

  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")
    const baseUrl = getBaseUrl(request)

    console.log("Google Drive callback params:", {
      hasCode: !!code,
      hasState: !!state,
      error,
    })

    if (error) {
      console.error("Google Drive OAuth error:", error)
      const errorDescription = searchParams.get("error_description")

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Drive Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
            }
            .error-icon { font-size: 3rem; margin-bottom: 1rem; }
            h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
            p { margin: 0.5rem 0; opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Google Drive Connection Failed</h1>
            <p>${error}: ${errorDescription || ""}</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'google-drive',
                error: '${error}: ${errorDescription || ""}'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    if (!code || !state) {
      console.error("Missing code or state in Google Drive callback")

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Drive Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
            }
            .error-icon { font-size: 3rem; margin-bottom: 1rem; }
            h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
            p { margin: 0.5rem 0; opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Google Drive Connection Failed</h1>
            <p>Authorization code or state is missing</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'google-drive',
                error: 'Authorization code or state is missing'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    // Parse state
    let stateData
    try {
      stateData = JSON.parse(atob(state))
      console.log("Google Drive parsed state:", stateData)
    } catch (error) {
      console.error("Invalid state parameter in Google Drive callback:", error)

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Drive Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
            }
            .error-icon { font-size: 3rem; margin-bottom: 1rem; }
            h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
            p { margin: 0.5rem 0; opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Google Drive Connection Failed</h1>
            <p>Invalid state parameter</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'google-drive',
                error: 'Invalid state parameter'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    const { userId } = stateData

    if (!userId) {
      console.error("Missing userId in Google Drive state")

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Drive Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
            }
            .error-icon { font-size: 3rem; margin-bottom: 1rem; }
            h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
            p { margin: 0.5rem 0; opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Google Drive Connection Failed</h1>
            <p>User ID is missing from state</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'google-drive',
                error: 'User ID is missing from state'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${baseUrl}/api/integrations/google-drive/callback`,
        grant_type: "authorization_code",
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error("Google Drive token exchange failed:", errorData)
      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Drive Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
            }
            .error-icon { font-size: 3rem; margin-bottom: 1rem; }
            h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
            p { margin: 0.5rem 0; opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Google Drive Connection Failed</h1>
            <p>Token exchange failed: ${errorData.error_description || "Unknown error"}</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'google-drive',
                error: 'Token exchange failed: ${errorData.error_description || "Unknown error"}'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `
      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    const tokens = await tokenResponse.json()
    console.log("Google Drive tokens received:", {
      accessToken: !!tokens.access_token,
      refreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
    })

    // Get user info from Google
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    if (!userInfoResponse.ok) {
      console.error("Failed to get Google Drive user info")
      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Drive Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
            }
            .error-icon { font-size: 3rem; margin-bottom: 1rem; }
            h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
            p { margin: 0.5rem 0; opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Google Drive Connection Failed</h1>
            <p>Could not fetch user information from Google.</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'google-drive',
                error: 'Could not fetch user information from Google.'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `
      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    const userInfo = await userInfoResponse.json()
    console.log("Google Drive user info:", {
      id: userInfo.id,
      email: userInfo.email,
    })

    const integrationData = {
      user_id: userId,
      provider: "google-drive",
      status: "connected",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: tokens.scope.split(" "),
      metadata: {
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      },
    }

    // Upsert integration into database
    const { data: existingIntegration, error: selectError } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "google-drive")
      .single()

    if (selectError && selectError.code !== "PGRST116") { // Ignore 'not found' error
      throw selectError
    }
    
    let dbResponse
    if (existingIntegration) {
      dbResponse = await supabase
        .from("integrations")
        .update(integrationData)
        .eq("id", existingIntegration.id)
        .select()
        .single()
      console.log("Updated existing Google Drive integration:", existingIntegration.id)
    } else {
      const { data: newIntegration, error: insertError } = await supabase
        .from("integrations")
        .insert(integrationData)
        .select()
        .single()
      
      if (insertError) throw insertError
      dbResponse = { data: newIntegration, error: insertError }
      console.log("Created new Google Drive integration:", newIntegration?.id)
    }

    if (dbResponse.error) throw dbResponse.error

    const successHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Drive Connected Successfully</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: linear-gradient(135deg, #24c6dc 0%, #514a9d 100%);
            color: white;
          }
          .container { 
            text-align: center; 
            padding: 2rem;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            backdrop-filter: blur(10px);
          }
          .success-icon { font-size: 3rem; margin-bottom: 1rem; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
          p { margin: 0.5rem 0; opacity: 0.9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>Google Drive Connected Successfully!</h1>
          <p>Your Google Drive account has been connected.</p>
          <p>This window will close automatically...</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'oauth-success', provider: 'google-drive' }, window.location.origin);
          }
          setTimeout(() => window.close(), 1000);
        </script>
      </body>
      </html>
    `
    return new Response(successHtml, { headers: { "Content-Type": "text/html" } })

  } catch (error: any) {
    console.error("Google Drive callback error:", error)
    const errorMessage = error.message || "An unexpected error occurred."
    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Drive Connection Failed</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
          }
          .container { 
            text-align: center; 
            padding: 2rem;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            backdrop-filter: blur(10px);
          }
          .error-icon { font-size: 3rem; margin-bottom: 1rem; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
          p { margin: 0.5rem 0; opacity: 0.9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-icon">❌</div>
          <h1>Google Drive Connection Failed</h1>
          <p>${errorMessage}</p>
          <p>This window will close automatically...</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-error',
              provider: 'google-drive',
              error: '${errorMessage}'
            }, window.location.origin);
          }
          setTimeout(() => window.close(), 2000);
        </script>
      </body>
      </html>
    `
    return new Response(errorHtml, {
      status: 500,
      headers: { "Content-Type": "text/html" },
    })
  }
}
