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

  // Basic HTML structure with postMessage
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Notion Integration Callback</title>
</head>
<body>
  <h1>Notion Integration Callback</h1>
  <p>You can close this window.</p>
  <script>
    const code = "${code}";
    const state = "${state}";

    // Send the code and state to the parent window
    window.opener.postMessage({
      type: 'notion-integration-callback',
      payload: {
        code: code,
        state: state,
      },
    }, '*');

    // Close this window after sending the message
    window.close();
  </script>
</body>
</html>
`

  return new NextResponse(htmlContent, {
    headers: {
      "Content-Type": "text/html",
    },
  })
}
