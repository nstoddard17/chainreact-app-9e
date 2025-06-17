import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")

  let content

  if (error) {
    content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Microsoft Teams Integration Failed</title>
      </head>
      <body>
        <h1>Microsoft Teams Integration Failed</h1>
        <p>Error: ${error}</p>
        <script>
          window.opener.postMessage({
            type: 'oauth-error',
            payload: { error: '${error}' },
          }, '*');
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
        <title>Microsoft Teams Integration Successful</title>
      </head>
      <body>
        <h1>Microsoft Teams Integration Successful</h1>
        <p>Code: ${code}</p>
        <script>
          window.opener.postMessage({
            type: 'oauth-success',
            payload: { code: '${code}' },
          }, '*');
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
        <title>Microsoft Teams Integration</title>
      </head>
      <body>
        <h1>Microsoft Teams Integration</h1>
        <p>No code or error received.</p>
        <script>
          window.opener.postMessage({
            type: 'oauth-error',
            payload: { error: 'No code or error received' },
          }, '*');
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
