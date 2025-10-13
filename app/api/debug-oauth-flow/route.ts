import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'

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
        baseUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'unknown'
      },
      expectedRedirectUri: `/api/integrations/${provider}/callback`,
      googleCalendarRedirectUri: '/api/integrations/google-calendar/callback',
      googleSignInRedirectUri: '/api/auth/callback'
    }

    // Check if this is a Google service
    if (provider.includes('google')) {
      debugInfo.googleService = {
        isGoogleService: true,
        serviceType: provider,
        expectedScopes: getExpectedScopes(provider)
      }
    }

    return jsonResponse(debugInfo)
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, { timestamp: new Date().toISOString()
     })
  }
}

function getExpectedScopes(provider: string): string[] {
  switch (provider) {
    case 'google-calendar':
      return [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/calendar'
      ]
    case 'gmail':
      return [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/gmail.modify'
      ]
    case 'google-drive':
      return [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/drive'
      ]
    default:
      return []
  }
} 