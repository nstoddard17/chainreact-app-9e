import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  // Basic error handling
  if (!code) {
    console.error("Twitter callback: Missing code")
    return new NextResponse("Missing code", { status: 400 })
  }

  if (!state) {
    console.error("Twitter callback: Missing state")
    return new NextResponse("Missing state", { status: 400 })
  }

  // HTML content to send back to the popup
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Twitter Authentication</title>
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
    <h1>Twitter Authentication Successful!</h1>
    <p>You can now close this window.</p>
    <script>
      // Notify the opener window that authentication completed
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({
          type: 'oauth-success',
          provider: 'twitter',
          payload: { code: '${code}', state: '${state}' }
        }, window.location.origin);
      }

      // Close the popup after sending the message
      window.addEventListener('load', function() {
        window.setTimeout(function() {
          window.close();
        }, 500); // Close after 0.5 seconds
      });
    </script>
  </div>
</body>
</html>
`

  return new NextResponse(htmlContent, {
    headers: {
      "Content-Type": "text/html",
    },
  })
}
