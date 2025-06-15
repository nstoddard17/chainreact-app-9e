import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL

    // Validation checklist
    const validation = {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasBaseUrl: !!baseUrl,
      clientIdFormat: clientId ? /^[a-zA-Z0-9_-]+$/.test(clientId) : false,
      clientIdLength: clientId?.length || 0,
      expectedCallbackUrl: `${baseUrl}/api/integrations/twitter/callback`,
    }

    const issues = []
    if (!validation.hasClientId) issues.push("Missing NEXT_PUBLIC_TWITTER_CLIENT_ID")
    if (!validation.hasClientSecret) issues.push("Missing TWITTER_CLIENT_SECRET")
    if (!validation.hasBaseUrl) issues.push("Missing NEXT_PUBLIC_SITE_URL or NEXT_PUBLIC_APP_URL")
    if (validation.clientIdLength < 10) issues.push("Client ID seems too short")

    return NextResponse.json({
      success: issues.length === 0,
      validation,
      issues,
      instructions: {
        step1: "Go to https://developer.twitter.com/en/portal/dashboard",
        step2: "Select your app or create a new one",
        step3: "Go to App Settings → Authentication settings",
        step4: "Enable OAuth 2.0",
        step5: `Set callback URL to: ${validation.expectedCallbackUrl}`,
        step6: "Set app permissions to 'Read and write'",
        step7: "Copy Client ID and Client Secret to your environment variables",
      },
      troubleshooting: {
        commonError: "Something went wrong - You weren't able to give access to the App",
        causes: [
          "Incorrect callback URL in Twitter app settings",
          "App permissions not set to 'Read and write'",
          "OAuth 2.0 not enabled",
          "Wrong Client ID or Client Secret",
          "App not approved for production use",
        ],
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    )
  }
}
