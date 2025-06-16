import { type NextRequest, NextResponse } from "next/server"
import { TwitterOAuthService } from "@/lib/oauth/twitter"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  // Handle OAuth errors
  if (error) {
    console.error("Twitter OAuth error:", error)
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Twitter Authentication Error</title>
  <style>
    body {
      font-family: sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background-color: #f0f0f0;
    }
    .container {
      text-align: center;
      padding: 20px;
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Twitter Authentication Failed</h1>
    <p>There was an error during authentication.</p>
    <script>
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({
          type: 'oauth-error',
          provider: 'twitter',
          error: '${error}'
        }, window.location.origin);
      }
      window.close();
    </script>
  </div>
</body>
</html>
`
    return new NextResponse(htmlContent, {
      headers: { "Content-Type": "text/html" },
    })
  }

  // Basic error handling
  if (!code) {
    console.error("Twitter callback: Missing code")
    return new NextResponse("Missing code", { status: 400 })
  }

  if (!state) {
    console.error("Twitter callback: Missing state")
    return new NextResponse("Missing state", { status: 400 })
  }

  try {
    // Parse state to get user info
    const stateData = JSON.parse(atob(state))
    const { userId, provider } = stateData

    if (!userId) {
      throw new Error("Missing user ID in state")
    }

    if (provider !== "twitter") {
      throw new Error("Invalid provider in state")
    }

    // Get code verifier from cookies
    const cookieStore = cookies()
    const codeVerifier = cookieStore.get(`twitter_code_verifier_${userId}`)?.value

    if (!codeVerifier) {
      throw new Error("Missing code verifier - please try connecting again")
    }

    // Clear the code verifier cookie
    cookieStore.set(`twitter_code_verifier_${userId}`, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    })

    // Create Supabase client
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // Get base URL
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`

    // Create modified state with code verifier
    const modifiedState = btoa(
      JSON.stringify({
        ...stateData,
        codeVerifier,
      }),
    )

    // Process the OAuth callback
    const result = await TwitterOAuthService.handleCallback(code, modifiedState, baseUrl, supabase, userId)

    if (result.success) {
      // Success HTML
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Twitter Authentication Successful</title>
  <style>
    body {
      font-family: sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background-color: #f0f0f0;
    }
    .container {
      text-align: center;
      padding: 20px;
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Twitter Connected Successfully!</h1>
    <p>You can now close this window.</p>
    <script>
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({
          type: 'oauth-success',
          provider: 'twitter'
        }, window.location.origin);
      }
      window.addEventListener('load', function() {
        window.setTimeout(function() {
          window.close();
        }, 500);
      });
    </script>
  </div>
</body>
</html>
`
      return new NextResponse(htmlContent, {
        headers: { "Content-Type": "text/html" },
      })
    } else {
      // Error HTML
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Twitter Authentication Failed</title>
  <style>
    body {
      font-family: sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background-color: #f0f0f0;
    }
    .container {
      text-align: center;
      padding: 20px;
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Twitter Authentication Failed</h1>
    <p>There was an error connecting your Twitter account.</p>
    <script>
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({
          type: 'oauth-error',
          provider: 'twitter',
          error: '${result.error || "Authentication failed"}'
        }, window.location.origin);
      }
      window.close();
    </script>
  </div>
</body>
</html>
`
      return new NextResponse(htmlContent, {
        headers: { "Content-Type": "text/html" },
      })
    }
  } catch (error: any) {
    console.error("Twitter callback processing error:", error)

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Twitter Authentication Error</title>
  <style>
    body {
      font-family: sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background-color: #f0f0f0;
    }
    .container {
      text-align: center;
      padding: 20px;
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Twitter Authentication Error</h1>
    <p>There was an error processing your authentication.</p>
    <script>
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({
          type: 'oauth-error',
          provider: 'twitter',
          error: '${error.message || "Processing failed"}'
        }, window.location.origin);
      }
      window.close();
    </script>
  </div>
</body>
</html>
`
    return new NextResponse(htmlContent, {
      headers: { "Content-Type": "text/html" },
    })
  }
}
