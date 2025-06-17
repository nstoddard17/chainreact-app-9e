import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const error_description = searchParams.get("error_description")

  let content

  if (error) {
    content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>GitLab Integration Failed</title>
      </head>
      <body>
        <h1>GitLab Integration Failed</h1>
        <p>Error: ${error}</p>
        <p>Description: ${error_description}</p>
        <script>
          window.opener.postMessage({
            type: 'oauth-error',
            error: '${error}',
            error_description: '${error_description}',
          }, window.location.origin);
          window.close();
        </script>
      </body>
      </html>
    `
  } else if (code) {
    content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>GitLab Integration Successful</title>
      </head>
      <body>
        <h1>GitLab Integration Successful</h1>
        <p>You can now close this window.</p>
        <script>
          window.opener.postMessage({
            type: 'oauth-success',
            provider: 'gitlab'
          }, window.location.origin);
          window.close();
        </script>
      </body>
      </html>
    `
  } else {
    content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>GitLab Integration</title>
      </head>
      <body>
        <h1>GitLab Integration</h1>
        <p>Something went wrong. Please try again.</p>
        <script>
          window.opener.postMessage({
            type: 'oauth-error',
            error: 'unknown',
            error_description: 'Unknown error during GitLab integration.'
          }, window.location.origin);
          window.close();
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
