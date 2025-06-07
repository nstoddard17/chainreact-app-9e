import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const baseUrl = new URL(request.url).origin
    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET

    const debugInfo = {
      baseUrl,
      hasClientId: !!clientId,
      clientIdLength: clientId?.length || 0,
      hasClientSecret: !!clientSecret,
      clientSecretLength: clientSecret?.length || 0,
      redirectUri: `${baseUrl}/api/integrations/twitter/callback`,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    }

    console.log("Twitter OAuth Debug Info:", debugInfo)

    return NextResponse.json(debugInfo)
  } catch (error: any) {
    console.error("Twitter debug error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
