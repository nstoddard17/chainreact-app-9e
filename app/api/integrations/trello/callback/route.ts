import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  // Basic HTML structure with postMessage
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Trello Integration Callback</title>
</head>
<body>
  <h1>Trello Integration Callback</h1>
  <p>Please wait, you will be redirected...</p>
  <script>
    const code = "${code}";
    const state = "${state}";

    if (code && state) {
      // Send message to the parent window
      window.opener.postMessage({
        type: 'oauth-success',
        payload: {
          code: code,
          state: state
        }
      }, '*');

      // Close the popup window
      window.close();
    } else {
      document.body.innerHTML = "<p>Error: Code or State missing from Trello callback.</p>";
    }
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
