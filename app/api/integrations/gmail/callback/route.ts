import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

// Create a Supabase client with admin privileges
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(request: NextRequest) {
  console.log("Gmail OAuth callback received")

  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")
    const baseUrl = getBaseUrl(request)

    console.log("Gmail callback params:", {
      hasCode: !!code,
      hasState: !!state,
      error,
    })

    if (error) {
      console.error("Gmail OAuth error:", error)
      const errorDescription = searchParams.get("error_description")

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Gmail Connection Failed</title>
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
            <h1>Gmail Connection Failed</h1>
            <p>${error}: ${errorDescription || ""}</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'gmail',
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
      console.error("Missing code or state in Gmail callback")

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Gmail Connection Failed</title>
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
            <h1>Gmail Connection Failed</h1>
            <p>Authorization code or state is missing</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'gmail',
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
      console.log("Gmail parsed state:", stateData)
    } catch (error) {
      console.error("Invalid state parameter in Gmail callback:", error)

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Gmail Connection Failed</title>
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
            <h1>Gmail Connection Failed</h1>
            <p>Invalid state parameter</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'gmail',
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
      console.error("Missing userId in Gmail state")

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Gmail Connection Failed</title>
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
            <h1>Gmail Connection Failed</h1>
            <p>User ID is missing from state</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'gmail',
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

    // Exchange code for tokens
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
        redirect_uri: `${baseUrl}/api/integrations/gmail/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Gmail token exchange failed:", errorData)

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Gmail Connection Failed</title>
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
            <h1>Gmail Connection Failed</h1>
            <p>Failed to exchange authorization code for tokens</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'gmail',
                error: 'Failed to exchange authorization code for tokens'
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
    console.log("Gmail tokens received:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
    })

    // Get user info
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    })

    if (!userResponse.ok) {
      console.error("Failed to get Gmail user info")

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Gmail Connection Failed</title>
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
            <h1>Gmail Connection Failed</h1>
            <p>Failed to get user information</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'gmail',
                error: 'Failed to get user information'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    const userInfo = await userResponse.json()
    console.log("Gmail user info:", {
      email: userInfo.email,
      name: userInfo.name,
    })

    // Calculate token expiration
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null

    // Save integration to database
    try {
      // Check if integration already exists
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "gmail")
        .single()

      const now = new Date().toISOString()

      if (existingIntegration) {
        // Update existing integration
        await supabase
          .from("integrations")
          .update({
            provider_user_id: userInfo.id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || null,
            expires_at: expiresAt,
            status: "connected",
            scopes: tokens.scope ? tokens.scope.split(" ") : [],
            metadata: {
              email: userInfo.email,
              name: userInfo.name,
              picture: userInfo.picture,
            },
            updated_at: now,
          })
          .eq("id", existingIntegration.id)

        console.log("Updated existing Gmail integration:", existingIntegration.id)
      } else {
        // Create new integration
        const { data: newIntegration, error } = await supabase
          .from("integrations")
          .insert({
            user_id: userId,
            provider: "gmail",
            provider_user_id: userInfo.id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || null,
            expires_at: expiresAt,
            status: "connected",
            scopes: tokens.scope ? tokens.scope.split(" ") : [],
            metadata: {
              email: userInfo.email,
              name: userInfo.name,
              picture: userInfo.picture,
            },
            created_at: now,
            updated_at: now,
          })
          .select("id")
          .single()

        if (error) {
          throw error
        }

        console.log("Created new Gmail integration:", newIntegration?.id)
      }

      // Success! Return HTML that closes the popup
      const successHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Gmail Connected Successfully</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
            <h1>Gmail Connected Successfully!</h1>
            <p>Your Gmail account has been connected.</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            // Send success message to parent window
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-success',
                provider: 'gmail'
              }, window.location.origin);
            }
            
            // Close the popup
            setTimeout(() => {
              window.close();
            }, 1500);
          </script>
        </body>
        </html>
      `

      return new Response(successHtml, { headers: { "Content-Type": "text/html" } })
    } catch (error) {
      console.error("Failed to save Gmail integration to database:", error)

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Gmail Connection Failed</title>
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
            <h1>Gmail Connection Failed</h1>
            <p>Failed to save integration</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'gmail',
                error: 'Failed to save integration'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }
  } catch (error: any) {
    console.error("Gmail callback error:", error)

    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Gmail Connection Failed</title>
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
          <h1>Gmail Connection Failed</h1>
          <p>${(error.message || "An unexpected error occurred").replace(/'/g, "\\'")}</p>
          <p>This window will close automatically...</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-error',
              provider: 'gmail',
              error: '${(error.message || "An unexpected error occurred").replace(/'/g, "\\'")}'
            }, window.location.origin);
          }
          setTimeout(() => window.close(), 2000);
        </script>
      </body>
      </html>
    `

    return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
  }
}
