import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export async function GET(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Get base URL that would be used in redirects
    const baseUrl = getBaseUrl()
    
    // Calculate redirect URI
    const redirectUri = `${baseUrl}/api/integrations/paypal/callback`
    
    // Check PayPal client ID
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
    const isSandbox = clientId?.includes('sandbox') || process.env.PAYPAL_SANDBOX === 'true'
    
    // Check both callback domains
    const standardDomain = "api.paypal.com"
    const sandboxDomain = "api.sandbox.paypal.com"
    const authDomain = isSandbox ? "www.sandbox.paypal.com" : "www.paypal.com"
    
    return NextResponse.json({
      userId: user.id,
      baseUrl,
      redirectUri,
      clientIdExists: !!clientId,
      clientIdMasked: clientId ? `${clientId.substring(0, 5)}...${clientId.substring(clientId.length - 5)}` : null,
      isSandbox,
      authDomain,
      callbackDomain: isSandbox ? sandboxDomain : standardDomain,
      allEnvVars: {
        APP_URL: process.env.NEXT_PUBLIC_APP_URL || null,
        VERCEL_URL: process.env.VERCEL_URL || null,
        PAYPAL_SANDBOX: process.env.PAYPAL_SANDBOX || null,
      }
    })
  } catch (error: any) {
    console.error("Debug endpoint error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
} 