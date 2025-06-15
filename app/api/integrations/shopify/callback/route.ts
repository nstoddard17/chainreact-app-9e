import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const shop = searchParams.get("shop")

  if (!code || !shop) {
    return new NextResponse("Missing code or shop parameter", { status: 400 })
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Shopify Integration</title>
</head>
<body>
  <h1>Shopify Integration</h1>
  <p>Successfully authenticated with Shopify. You can now close this window.</p>
  <script>
    (function() {
      function receiveMessage(event) {
        if (event.origin !== window.location.origin) {
          return;
        }

        if (event.data === 'close') {
          window.close();
        }
      }

      window.addEventListener("message", receiveMessage, false);

      window.opener.postMessage(
        {
          type: 'shopify',
          payload: {
            code: '${code}',
            shop: '${shop}'
          }
        },
        window.location.origin
      );
    })()
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
