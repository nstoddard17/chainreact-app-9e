import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  let content

  if (error) {
    content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Dropbox Integration Failed</title>
      </head>
      <body>
        <h1>Dropbox Integration Failed</h1>
        <p>Error: ${error}</p>
        <script>
          window.opener.postMessage({
            type: 'dropbox-integration-error',
            error: '${error}',
          }, window.location.origin);
          window.close();
        </script>
      </body>
      </html>
    `
  } else if (code && state) {
    content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Dropbox Integration Successful</title>
      </head>
      <body>
        <h1>Dropbox Integration Successful</h1>
        <p>Code: ${code}</p>
        <p>State: ${state}</p>
        <script>
          window.opener.postMessage({
            type: 'dropbox-integration-success',
            code: '${code}',
            state: '${state}',
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
        <title>Dropbox Integration</title>
      </head>
      <body>
        <h1>Dropbox Integration</h1>
        <p>Something went wrong.</p>
        <script>
          window.opener.postMessage({
            type: 'dropbox-integration-error',
            error: 'Unknown error during Dropbox integration',
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
