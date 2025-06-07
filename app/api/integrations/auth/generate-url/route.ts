\
Now
let
's also update the YouTube callback route to use the correct import:

```ts file="app/api/integrations/youtube/callback/route.ts"
[v0-no-op-code-block-prefix]
import { type NextRequest, NextResponse } from "next/server"

import { YouTubeOAuthService } from "@/lib/oauth/youtube"
import { parseOAuthState } from "@/lib/oauth/state"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 })
  }

  try {
    const { baseUrl, userId } = parseOAuthState(state)

    if (!baseUrl || !userId) {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 })
    }

    const tokenData = await YouTubeOAuthService.getToken(code, baseUrl)

    if (!tokenData) {
      return NextResponse.json({ error: "Failed to exchange code for token" }, { status: 500 })
    }

    const redirectUrl = `${baseUrl}/api/integrations/youtube/success?userId=${userId}`
    return NextResponse.redirect(redirectUrl)
  } catch (error: any) {
    console.error("OAuth Callback Error:", error)
    return NextResponse.json({ error: error.message || "OAuth failed" }, { status: 500 })
  }
}
