import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    const debugInfo = {
      environment: process.env.NODE_ENV,
      baseUrl,
      redirectUri: `${baseUrl}/api/integrations/twitter/callback`,
      credentials: {
        hasClientId: !!clientId,
        clientIdLength: clientId?.length || 0,
        clientIdPrefix: clientId?.substring(0, 10) || "none",
        hasClientSecret: !!clientSecret,
        clientSecretLength: clientSecret?.length || 0,
      },
      requiredEnvVars: {
        NEXT_PUBLIC_TWITTER_CLIENT_ID: !!process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID,
        TWITTER_CLIENT_SECRET: !!process.env.TWITTER_CLIENT_SECRET,
        NEXT_PUBLIC_SITE_URL: !!process.env.NEXT_PUBLIC_SITE_URL,
        NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL,
      },
      twitterAppConfiguration: {
        expectedCallbackUrl: `${baseUrl}/api/integrations/twitter/callback`,
        requiredScopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
        oauthVersion: "2.0",
        pkceRequired: true,
      },
    }

    return NextResponse.json({
      success: true,
      debug: debugInfo,
      recommendations: [
        "Ensure your Twitter App has the correct callback URL configured",
        "Verify that your Twitter App has the required permissions (Read and Write)",
        "Check that your Twitter App is using OAuth 2.0 with PKCE",
        "Make sure your environment variables are properly set",
      ],
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        debug: {
          hasClientId: !!process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID,
          hasClientSecret: !!process.env.TWITTER_CLIENT_SECRET,
        },
      },
      { status: 500 },
    )
  }
}
