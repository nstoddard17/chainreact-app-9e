import { NextRequest, NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider') || 'google-calendar'
    
    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) {
      return NextResponse.json({ error: 'Google client ID not configured' }, { status: 500 })
    }

    const baseUrl = getBaseUrl()
    const state = `test-state-${ Date.now()}`
    
    // Generate the OAuth URL exactly like the real implementation
    let scopes = "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"
    
    if (provider === 'google-calendar') {
      scopes += " https://www.googleapis.com/auth/calendar"
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${baseUrl}/api/integrations/${provider}/callback`,
      response_type: "code",
      scope: scopes,
      state,
      access_type: "offline",
      prompt: "consent",
    })

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

    return NextResponse.json({
      provider,
      authUrl,
      debug: {
        clientId: `${clientId.substring(0, 10) }...`,
        baseUrl,
        redirectUri: `${baseUrl}/api/integrations/${provider}/callback`,
        scopes,
        state,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
} 