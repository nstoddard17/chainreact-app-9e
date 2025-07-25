import { NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

export async function GET() {
  try {
    const baseUrl = getBaseUrl()
    const redirectUri = `${baseUrl}/api/integrations/tiktok/callback`
    
    // Get the TikTok client ID, but only show the first and last 4 characters for security
    const clientId = process.env.TIKTOK_CLIENT_ID || 'not-configured'
    const maskedClientId = clientId.length > 8 
      ? `${clientId.substring(0, 4)}...${clientId.substring(clientId.length - 4)}`
      : 'too-short'
    
    // Check if client secret is configured (don't show the actual value)
    const hasClientSecret = !!process.env.TIKTOK_CLIENT_SECRET
    
    return NextResponse.json({
      status: 'success',
      config: {
        baseUrl,
        redirectUri,
        clientIdConfigured: !!process.env.TIKTOK_CLIENT_ID,
        clientIdMasked: maskedClientId,
        clientSecretConfigured: hasClientSecret,
      },
      tips: [
        "Ensure the redirect URI exactly matches what's in your TikTok developer app settings",
        "Make sure your TikTok app is in Sandbox mode for testing",
        "Add your test user to the TikTok app's allowed testers",
        "Check that your app has the required permissions",
        "Verify that your client_key and client_secret are correct"
      ]
    })
  } catch (error) {
    console.error('Error in TikTok debug endpoint:', error)
    return NextResponse.json({ 
      status: 'error', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
} 