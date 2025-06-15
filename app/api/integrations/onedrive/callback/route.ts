import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const error_description = searchParams.get("error_description")

  let postMessage = ""

  if (code) {
    postMessage = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>OneDrive Authentication</title>
      </head>
      <body>
        <script>
          window.onload = function() {
            window.opener.postMessage({
              type: 'onedrive-auth-success',
              code: '${code}',
              state: '${state}'
            }, window.location.origin);
            window.close();
          };
        </script>
      </body>
      </html>
    `
  } else {
    const errorMessage = error_description ? decodeURIComponent(error_description) : error || "Unknown error"
    postMessage = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>OneDrive Authentication Failed</title>
      </head>
      <body>
        <h1>Authentication Failed</h1>
        <p>Error: ${errorMessage}</p>
        <script>
          window.onload = function() {
            window.opener.postMessage({
              type: 'onedrive-auth-error',
              error: '${errorMessage}',
              state: '${state}'
            }, window.location.origin);
            window.close();
          };
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
