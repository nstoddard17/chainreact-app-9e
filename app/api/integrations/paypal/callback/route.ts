import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const error_description = searchParams.get("error_description")

  let content

  if (code) {
    content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>PayPal Authentication</title>
      </head>
      <body>
        <h1>PayPal Authentication Successful!</h1>
        <p>You can now close this window.</p>
        <script>
            // Send success message to parent window
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-success',
                provider: 'paypal'
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
    content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>PayPal Authentication Error</title>
      </head>
      <body>
        <h1>PayPal Authentication Error!</h1>
        <p>Error: ${error}</p>
        <p>Description: ${error_description}</p>
        <script>
          window.opener.postMessage({
            type: 'oauth-error',
            payload: { error: '${error}', error_description: '${error_description}' },
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
        <title>PayPal Authentication</title>
      </head>
      <body>
        <h1>PayPal Authentication</h1>
        <p>Something went wrong. Please try again.</p>
        <script>
          window.opener.postMessage({
            type: 'oauth-error',
            payload: { error: 'Unknown error' },
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
