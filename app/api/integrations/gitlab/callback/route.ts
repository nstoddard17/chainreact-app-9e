import { type NextRequest, NextResponse } from "next/server"
import { GitLabOAuthService } from "@/lib/oauth/gitlab"
import { createClient } from "@supabase/supabase-js"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const error_description = searchParams.get("error_description")

  let content

  if (error) {
    content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>GitLab Integration Failed</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            text-align: center;
            background-color: #f5f5f5;
          }
          h1 { color: #e24329; }
          p { color: #333; }
        </style>
      </head>
      <body>
        <h1>GitLab Integration Failed</h1>
        <p>Error: ${error}</p>
        <p>Description: ${error_description}</p>
        <script>
          window.opener.postMessage({
            type: 'gitlab-integration-error',
            error: '${error}',
            error_description: '${error_description}',
          }, window.location.origin);
          setTimeout(() => window.close(), 1000);
        </script>
      </body>
      </html>
    `
  } else if (code && state) {
    try {
      // Create Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // Parse state to get userId and redirectUri
      let stateData
      try {
        stateData = JSON.parse(atob(state))
      } catch (error) {
        console.error("Failed to parse state:", error)
        throw new Error("Invalid state format")
      }

      const { userId, redirectUri } = stateData

      if (!userId) {
        throw new Error("Missing userId in state")
      }

      if (!redirectUri) {
        throw new Error("Missing redirect URI in state")
      }

      console.log("Processing GitLab callback:", {
        hasCode: !!code,
        redirectUri,
        hasUserId: !!userId
      })

      // Process the OAuth callback
      const result = await GitLabOAuthService.handleCallback("gitlab", code, state, userId)

      content = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>GitLab Integration ${result.success ? 'Successful' : 'Failed'}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
              text-align: center;
              background-color: #f5f5f5;
            }
            h1 { color: ${result.success ? '#6e49cb' : '#e24329'}; }
            p { color: #333; }
          </style>
        </head>
        <body>
          <h1>GitLab Integration ${result.success ? 'Successful' : 'Failed'}</h1>
          <p>${result.success ? 'You can now close this window.' : result.error || 'An error occurred.'}</p>
          <script>
            window.opener.postMessage({
              type: 'gitlab-integration-${result.success ? 'success' : 'error'}',
              ${result.success ? `code: '${code}'` : `error: '${result.error}'`}
            }, window.location.origin);
            setTimeout(() => window.close(), 1000);
          </script>
        </body>
        </html>
      `
    } catch (error: any) {
      content = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>GitLab Integration Failed</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
              text-align: center;
              background-color: #f5f5f5;
            }
            h1 { color: #e24329; }
            p { color: #333; }
          </style>
        </head>
        <body>
          <h1>GitLab Integration Failed</h1>
          <p>Error: ${error.message}</p>
          <script>
            window.opener.postMessage({
              type: 'gitlab-integration-error',
              error: '${error.message}'
            }, window.location.origin);
            setTimeout(() => window.close(), 1000);
          </script>
        </body>
        </html>
      `
    }
  } else {
    content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>GitLab Integration</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            text-align: center;
            background-color: #f5f5f5;
          }
          h1 { color: #e24329; }
          p { color: #333; }
        </style>
      </head>
      <body>
        <h1>GitLab Integration</h1>
        <p>Something went wrong. Please try again.</p>
        <script>
          window.opener.postMessage({
            type: 'gitlab-integration-error',
            error: 'unknown',
            error_description: 'Unknown error during GitLab integration.'
          }, window.location.origin);
          setTimeout(() => window.close(), 1000);
        </script>
      </body>
      </html>
    `
  }

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/html",
    },
  })
}
