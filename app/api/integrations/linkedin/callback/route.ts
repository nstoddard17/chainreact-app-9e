import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  // Basic error handling
  if (!code) {
    console.error("LinkedIn callback error: Code missing")
    return new NextResponse("<h1>LinkedIn Callback Error: Code Missing</h1>", {
      status: 400,
      headers: {
        "Content-Type": "text/html",
      },
    })
  }

  if (!state) {
    console.error("LinkedIn callback error: State missing")
    return new NextResponse("<h1>LinkedIn Callback Error: State Missing</h1>", {
      status: 400,
      headers: {
        "Content-Type": "text/html",
      },
    })
  }

  // Construct the HTML response for postMessage
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>LinkedIn Authentication</title>
  <script>
    (function() {
      function receiveMessage(event) {
        if (event.origin !== window.location.origin) {
          return;
        }

        if (event.data === 'handshake') {
          event.source.postMessage({
            type: 'oauth-success',
            code: '${code}',
            state: '${state}',
          }, event.origin);
        }
      }

      window.addEventListener("message", receiveMessage, false);

      window.onload = function(e) {
        window.opener.postMessage("linkedin:ready", "*");
      }
    })();
  </script>
</head>
<body>
  <h1>LinkedIn Authentication Complete</h1>
  <p>You can now close this window.</p>
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
