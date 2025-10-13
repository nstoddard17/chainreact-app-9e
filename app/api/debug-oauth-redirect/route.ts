import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

export async function POST(request: NextRequest) {
  try {
    const { provider } = await request.json()
    
    // Debug the OAuth URL generation for the specific provider
    const debugInfo = {
      provider,
      timestamp: new Date().toISOString(),
      environment: {
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET',
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET',
        MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID ? 'SET' : 'NOT SET',
        MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET ? 'SET' : 'NOT SET',
        baseUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'unknown'
      },
      redirectUris: {
        googleCalendar: `/api/integrations/google-calendar/callback`,
        microsoftOutlook: `/api/integrations/microsoft-outlook/callback`
      }
    }

    // Generate test OAuth URLs
    if (provider === 'google-calendar') {
      const baseUrl = getBaseUrl()
      const clientId = process.env.GOOGLE_CLIENT_ID
      if (clientId) {
        const scopes = "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/calendar"
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: `${baseUrl}/api/integrations/google-calendar/callback`,
          response_type: "code",
          scope: scopes,
          state: "test-state",
          access_type: "offline",
          prompt: "consent",
        })
        debugInfo.testUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
      }
    } else if (provider === 'microsoft-outlook') {
      const baseUrl = getBaseUrl()
      const clientId = process.env.MICROSOFT_CLIENT_ID
      if (clientId) {
        const scopes = "openid profile offline_access User.Read Mail.Read Mail.Send"
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: `${baseUrl}/api/integrations/microsoft-outlook/callback`,
          response_type: "code",
          scope: scopes,
          state: "test-state",
          prompt: "consent",
        })
        debugInfo.testUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
      }
    }

    return jsonResponse(debugInfo)
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, { timestamp: new Date().toISOString()
     })
  }
}