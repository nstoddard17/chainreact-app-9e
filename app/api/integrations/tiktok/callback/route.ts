import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const error_description = searchParams.get("error_description")

  let postMessage = ""

  if (code) {
    postMessage = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>TikTok Authentication</title>
      </head>
      <body>
        <h1>TikTok Authentication Successful!</h1>
        <p>You can now close this window.</p>
        <script>
          window.opener.postMessage({
            type: 'oauth-success',
            payload: { code: '${code}' }
          }, window.location.origin);
          window.close();
        </script>
      </body>
      </html>
    `
  } else if (error) {
    postMessage = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>TikTok Authentication Error</title>
      </head>
      <body>
        <h1>TikTok Authentication Error!</h1>
        <p>Error: ${error}</p>
        <p>Description: ${error_description || "No description provided."}</p>
        <script>
          window.opener.postMessage({
            type: 'oauth-error',
            payload: { error: '${error}', error_description: '${error_description}' }
          }, window.location.origin);
          window.close();
        </script>
      </body>
      </html>
    `
  } else {
    postMessage = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>TikTok Authentication Issue</title>
      </head>
      <body>
        <h1>TikTok Authentication Issue!</h1>
        <p>No code or error received from TikTok.</p>
        <script>
          window.opener.postMessage({
            type: 'oauth-error',
            payload: { error: 'No code or error received' }
          }, window.location.origin);
          window.close();
        </script>
      </body>
      </html>
    `
  }

  return new NextResponse(postMessage, {
    headers: {
      "Content-Type": "text/html",
    },
  })
}
