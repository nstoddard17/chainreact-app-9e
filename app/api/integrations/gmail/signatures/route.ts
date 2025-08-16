import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getDecryptedAccessToken } from '@/lib/integrations/getDecryptedAccessToken'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const searchParams = request.nextUrl.searchParams
    const requestedUserId = searchParams.get('userId')

    // Verify the user is requesting their own data
    if (requestedUserId && requestedUserId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get Gmail access token
    const credentials = await getDecryptedAccessToken(userId, 'gmail')
    if (!credentials || !credentials.accessToken) {
      return NextResponse.json({ 
        error: 'Gmail integration not found or access token missing',
        signatures: []
      }, { status: 200 })
    }

    // Get Gmail profile to extract signature
    const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
      },
    })

    if (!profileResponse.ok) {
      console.error('Failed to fetch Gmail profile:', await profileResponse.text())
      return NextResponse.json({ 
        error: 'Failed to fetch Gmail profile',
        signatures: []
      }, { status: 200 })
    }

    const profile = await profileResponse.json()

    // Get Gmail settings to extract signatures
    const settingsResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs', {
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
      },
    })

    const signatures = []

    if (settingsResponse.ok) {
      const settingsData = await settingsResponse.json()
      
      if (settingsData.sendAs && Array.isArray(settingsData.sendAs)) {
        settingsData.sendAs.forEach((sendAsSettings: any, index: number) => {
          if (sendAsSettings.signature) {
            signatures.push({
              id: `gmail-signature-${index}`,
              name: sendAsSettings.displayName || sendAsSettings.sendAsEmail || 'Default Signature',
              content: sendAsSettings.signature,
              isDefault: sendAsSettings.isDefault || index === 0,
              email: sendAsSettings.sendAsEmail,
              displayName: sendAsSettings.displayName
            })
          }
        })
      }
    }

    // If no signatures found in sendAs settings, create a basic signature from profile
    if (signatures.length === 0 && profile.emailAddress) {
      // Try to get the user's name from profile or other sources
      const { data: userProfile } = await supabase
        .from('users')
        .select('full_name, display_name')
        .eq('id', userId)
        .single()

      const displayName = userProfile?.display_name || 
                         userProfile?.full_name || 
                         profile.emailAddress.split('@')[0]

      signatures.push({
        id: 'gmail-signature-default',
        name: 'Default Signature',
        content: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
          <p>Best regards,<br>
          <strong>${displayName}</strong><br>
          <a href="mailto:${profile.emailAddress}" style="color: #1a73e8;">${profile.emailAddress}</a></p>
        </div>`,
        isDefault: true,
        email: profile.emailAddress,
        displayName: displayName
      })
    }

    return NextResponse.json({
      signatures,
      profile: {
        emailAddress: profile.emailAddress,
        messagesTotal: profile.messagesTotal,
        threadsTotal: profile.threadsTotal
      }
    })

  } catch (error) {
    console.error('Error fetching Gmail signatures:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      signatures: []
    }, { status: 500 })
  }
}