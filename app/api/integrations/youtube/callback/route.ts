import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 })
  }

  if (!state) {
    return NextResponse.json({ error: "Missing state" }, { status: 400 })
  }

  // Basic HTML structure with a script to send the code and state to the parent window
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>YouTube Authentication</title>
</head>
<body>
  <h1>YouTube Authentication Successful</h1>
  <p>You can now close this window.</p>
  <script>
    const code = "${code}";
    const state = "${state}";

    // Send the code and state to the parent window
    window.opener.postMessage({ type: 'youtube-auth-code', payload: { code, state } }, '*');

    // Close this window after sending the message
    window.close();
  </script>
</body>
</html>
`

  return new NextResponse(htmlContent, {
    status: 200,
    headers: {
      "Content-Type": "text/html",
    },
  })
}
