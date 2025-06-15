import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing Twitter OAuth credentials",
          details: {
            hasClientId: !!clientId,
            hasClientSecret: !!clientSecret,
          },
        },
        { status: 400 },
      )
    }

    // Test Twitter API connectivity
    try {
      const response = await fetch("https://api.twitter.com/2/users/me", {
        headers: {
          Authorization: `Bearer ${clientSecret}`, // This will fail, but we can check the error
        },
      })

      const result = await response.text()

      return NextResponse.json({
        success: true,
        message: "Twitter API is accessible",
        config: {
          clientId: clientId.substring(0, 10) + "...",
          apiEndpoint: "https://api.twitter.com/2/users/me",
          status: response.status,
          response: result.substring(0, 200),
        },
      })
    } catch (apiError: any) {
      return NextResponse.json({
        success: false,
        error: "Twitter API connection failed",
        details: apiError.message,
      })
    }
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
