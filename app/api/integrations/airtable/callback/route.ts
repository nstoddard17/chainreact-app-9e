import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code) {
    console.error("No code received")
    return new NextResponse("No code received", { status: 400 })
  }

  if (!state) {
    console.error("No state received")
    return new NextResponse("No state received", { status: 400 })
  }

  // HTML content to send back to the popup
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Airtable Authentication</title>
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
    <h1>Airtable Authentication Successful!</h1>
    <p>You can now close this window.</p>
    <script>
      // Send message to the parent window
      window.opener.postMessage(
        {
          type: 'oauth-success',
          provider: 'airtable'
        },
        window.location.origin
      );

      // Close this window after sending the message
      window.setTimeout(window.close, 1̀500);
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
