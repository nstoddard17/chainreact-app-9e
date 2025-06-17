import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { TwitterOAuthService } from "@/lib/oauth/twitter"

const twitterClientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
const twitterClientSecret = process.env.TWITTER_CLIENT_SECRET

if (!twitterClientId || !twitterClientSecret) {
  throw new Error("NEXT_PUBLIC_TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET must be defined")
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined")
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
})

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    console.error("Twitter OAuth error:", error)

    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Twitter Connection Failed</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: linear-gradient(135deg, #1DA1F2 0%, #0D8ECF 100%);
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
          <h1>Twitter Connection Failed</h1>
          <p>${error}</p>
          <p>This window will close automatically...</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-error',
              provider: 'twitter',
              error: '${error}'
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
    console.error("Missing code or state in Twitter callback")

    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Twitter Connection Failed</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: linear-gradient(135deg, #1DA1F2 0%, #0D8ECF 100%);
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
          <h1>Twitter Connection Failed</h1>
          <p>Missing required parameters</p>
          <p>This window will close automatically...</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-error',
              provider: 'twitter',
              error: 'Missing required parameters'
            }, window.location.origin);
          }
          setTimeout(() => window.close(), 2000);
        </script>
      </body>
      </html>
    `

    return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Twitter Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #1DA1F2 0%, #0D8ECF 100%);
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
            <h1>Twitter Connection Failed</h1>
            <p>Invalid state parameter</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'twitter',
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

    const userId = stateData.userId
    if (!userId) {
      console.error("Missing user ID in state")

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Twitter Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #1DA1F2 0%, #0D8ECF 100%);
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
            <h1>Twitter Connection Failed</h1>
            <p>Missing user ID in state</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'twitter',
                error: 'Missing user ID in state'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, { headers: { "Content-Type": "text/html" } })
    }

    // Get base URL
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`

    // Process the OAuth callback
    const result = await TwitterOAuthService.handleCallback(code, state, baseUrl, supabase)

    if (result.success) {
      const successHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Twitter Connected Successfully</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #1DA1F2 0%, #0D8ECF 100%);
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
            <h1>Twitter Connected Successfully!</h1>
            <p>You can now close this window.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-success',
                provider: 'twitter'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `

      return new Response(successHtml, { headers: { "Content-Type": "text/html" } })
    } else {
      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Twitter Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #1DA1F2 0%, #0D8ECF 100%);
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
            <h1>Twitter Connection Failed</h1>
            <p>${result.error || "Authentication failed"}</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'twitter',
                error: '${result.error || "Authentication failed"}'
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
    console.error("Twitter callback processing error:", error)

    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Twitter Connection Failed</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: linear-gradient(135deg, #1DA1F2 0%, #0D8ECF 100%);
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
          <h1>Twitter Connection Failed</h1>
          <p>${error.message || "An unexpected error occurred"}</p>
          <p>This window will close automatically...</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-error',
              provider: 'twitter',
              error: '${error.message || "An unexpected error occurred"}'
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
