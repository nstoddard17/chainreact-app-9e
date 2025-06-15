import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code) {
    return new NextResponse("No code provided", { status: 400 })
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Mailchimp Authentication</title>
      </head>
      <body>
        <h1>Mailchimp Authentication</h1>
        <p>You are now authenticated with Mailchimp. Please close this window.</p>
        <script>
          const code = "${code}";
          const state = "${state}";
          window.opener.postMessage({
            type: 'mailchimp',
            payload: {
              code: code,
              state: state,
            },
          }, '*');
          window.close();
        </script>
      </body>
    </html>
  `

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html",
    },
  })
}
