import type { NextRequest } from "next/server"
import { GoogleOAuthService } from "@/lib/oauth/google"
import { createAdminSupabaseClient, upsertIntegration, parseOAuthState } from "@/lib/oauth/utils"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    // Handle OAuth errors
    if (error) {
      console.error("OAuth error:", error)

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Connection Failed</title>
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
            <h1>Google Connection Failed</h1>
            <p>OAuth authorization failed</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'google',
                error: 'OAuth authorization failed'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    if (!code) {
      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Connection Failed</title>
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
            <h1>Google Connection Failed</h1>
            <p>No authorization code received</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'google',
                error: 'No authorization code received'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    // Parse state to get user ID
    let userId: string | null = null
    if (state) {
      try {
        const stateData = parseOAuthState(state)
        userId = stateData.userId
      } catch (error) {
        console.error("Failed to parse state:", error)

        const errorHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Google Connection Failed</title>
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
              <h1>Google Connection Failed</h1>
              <p>Invalid state parameter</p>
              <p>This window will close automatically...</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({
                  type: 'oauth-error',
                  provider: 'google',
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
    }

    // Exchange code for tokens
    const tokenData = await GoogleOAuthService.exchangeCodeForTokens(code)

    if (!tokenData.access_token) {
      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Connection Failed</title>
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
            <h1>Google Connection Failed</h1>
            <p>No access token received</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'google',
                error: 'No access token received'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    // Get user info from Google
    const userInfo = await GoogleOAuthService.getUserInfo(tokenData.access_token)

    // Calculate expiry time
    const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null

    // Save integration to database
    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Connection Failed</title>
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
            <h1>Google Connection Failed</h1>
            <p>Failed to create Supabase client</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'google',
                error: 'Failed to create Supabase client'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    // If no userId from state, this is an error
    if (!userId) {
      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Connection Failed</title>
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
            <h1>Google Connection Failed</h1>
            <p>No user ID found in OAuth state</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'google',
                error: 'No user ID found in OAuth state'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    const integrationData = {
      user_id: userId,
      provider: "google",
      provider_user_id: userInfo.id,
      status: "connected" as const,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      metadata: {
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        verified_email: userInfo.verified_email,
      },
    }

    await upsertIntegration(supabase, integrationData)

    // Success! Return HTML that closes the popup
    const successHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Connected Successfully</title>
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
          <h1>Google Connected Successfully!</h1>
          <p>Your Google account has been connected.</p>
          <p>This window will close automatically...</p>
        </div>
        <script>
          // Send success message to parent window
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-success',
              provider: 'google'
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
  } catch (error: any) {
    console.error("Google OAuth callback error:", error)

    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Connection Failed</title>
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
          <h1>Google Connection Failed</h1>
          <p>${error.message || "Integration failed"}</p>
          <p>This window will close automatically...</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-error',
              provider: 'google',
              error: '${(error.message || "Integration failed").replace(/'/g, "\\'")}'
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
