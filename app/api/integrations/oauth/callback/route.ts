import { type NextRequest, NextResponse } from "next/server"
import { handleCallback } from "@/lib/oauth/oauthUtils"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const provider = searchParams.get("provider")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin

    // Handle OAuth errors
    if (error) {
      console.error(`OAuth error for ${provider}:`, error, errorDescription)
      const errorMessage = errorDescription || error
      return NextResponse.redirect(
        new URL(`/integrations?error=${encodeURIComponent(errorMessage)}&provider=${provider}`, baseUrl),
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL(`/integrations?error=missing_parameters&provider=${provider}`, baseUrl))
    }

    // Extract provider from state if not in query params
    let actualProvider = provider
    let returnUrl = "/integrations"

    if (!actualProvider && state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, "base64").toString())
        actualProvider = stateData.provider
        returnUrl = stateData.returnUrl || "/integrations"
      } catch (e) {
        console.error("Failed to parse state:", e)
      }
    }

    if (!actualProvider) {
      return NextResponse.redirect(new URL(`/integrations?error=missing_provider`, baseUrl))
    }

    try {
      const result = await handleCallback(actualProvider, code, state)

      if (result.success) {
        // Create a success page that sends message to parent and closes
        const successHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Connection Successful</title>
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
        .success-icon { 
          font-size: 3rem; 
          margin-bottom: 1rem; 
        }
        h1 { 
          margin: 0 0 0.5rem 0; 
          font-size: 1.5rem;
        }
        p { 
          margin: 0; 
          opacity: 0.9;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="success-icon">✅</div>
        <h1>Connection Successful!</h1>
        <p>Your ${actualProvider} integration has been connected.</p>
        <p>This window will close automatically...</p>
      </div>
      <script>
        // Send success message to parent window
        if (window.opener) {
          window.opener.postMessage({
            type: 'oauth-success',
            provider: '${actualProvider}'
          }, window.location.origin);
        }
        
        // Close window after a short delay
        setTimeout(() => {
          window.close();
        }, 2000);
      </script>
    </body>
    </html>
  `

        return new Response(successHtml, {
          headers: { "Content-Type": "text/html" },
        })
      } else {
        const errorHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Connection Failed</title>
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
        max-width: 400px;
      }
      .error-icon { 
        font-size: 3rem; 
        margin-bottom: 1rem; 
      }
      h1 { 
        margin: 0 0 0.5rem 0; 
        font-size: 1.5rem;
      }
      p { 
        margin: 0.5rem 0; 
        opacity: 0.9;
        font-size: 0.9rem;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="error-icon">❌</div>
      <h1>Connection Failed</h1>
      <p>${result.error || "Connection failed"}</p>
      <p>This window will close automatically...</p>
    </div>
    <script>
      // Send error message to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'oauth-error',
          provider: '${actualProvider}',
          error: '${result.error || "Connection failed"}'
        }, window.location.origin);
      }
      
      // Close window after a short delay
      setTimeout(() => {
        window.close();
      }, 3000);
    </script>
  </body>
  </html>
`

        return new Response(errorHtml, {
          headers: { "Content-Type": "text/html" },
        })
      }
    } catch (error: any) {
      console.error(`OAuth callback error for ${actualProvider}:`, error)
      const errorUrl = new URL(returnUrl, baseUrl)
      errorUrl.searchParams.set("error", encodeURIComponent(error.message || "Connection failed"))
      errorUrl.searchParams.set("provider", actualProvider)

      return NextResponse.redirect(errorUrl)
    }
  } catch (error: any) {
    console.error("OAuth callback error:", error)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin
    return NextResponse.redirect(new URL(`/integrations?error=callback_failed`, baseUrl))
  }
}
