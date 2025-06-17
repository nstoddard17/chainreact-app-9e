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
        <title>Instagram Authentication</title>
      </head>
      <body>
        <h1>Instagram Authentication Successful!</h1>
        <p>You can now close this window.</p>
        <script>
            // Send success message to parent window
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-success',
                provider: 'instagram'
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
  } else if (error) {
    postMessage = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Instagram Authentication Error</title>
      </head>
      <body>
        <h1>Instagram Authentication Error!</h1>
        <p>Error: ${error}</p>
        <p>Description: ${error_description}</p>
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
        <title>Instagram Authentication Error</title>
      </head>
      <body>
        <h1>Instagram Authentication Error!</h1>
        <p>Unknown error occurred.</p>
        <script>
          window.opener.postMessage({
            type: 'oauth-error',
            payload: { error: 'unknown', error_description: 'Unknown error occurred' }
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
