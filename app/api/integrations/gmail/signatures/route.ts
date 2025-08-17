import { NextRequest, NextResponse } from 'next/server'
import { getDecryptedAccessToken } from '@/lib/integrations/getDecryptedAccessToken'
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const requestedUserId = searchParams.get('userId')

    if (!requestedUserId) {
      console.log('❌ [SIGNATURES] No userId provided')
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 })
    }
    
    // Use admin client to verify user exists
    const supabase = createAdminClient()
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', requestedUserId)
      .single()

    if (userError || !userData) {
      console.log('❌ [SIGNATURES] User not found:', userError)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userId = requestedUserId

    // Get Gmail access token
    let accessToken
    try {
      accessToken = await getDecryptedAccessToken(userId, 'gmail')
    } catch (error) {
      console.log('🔍 [SIGNATURES] Gmail integration not found')
      return NextResponse.json({ 
        error: 'Gmail integration not connected',
        signatures: [],
        needsConnection: true
      }, { status: 200 })
    }
    
    if (!accessToken) {
      console.log('🔍 [SIGNATURES] Gmail access token missing')
      return NextResponse.json({ 
        error: 'Gmail access token missing',
        signatures: [],
        needsConnection: true
      }, { status: 200 })
    }

    // Get Gmail profile to extract signature
    const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
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

    // Try multiple Gmail API endpoints to find signatures
    const signatures = []
    
    // 1. Try the sendAs settings endpoint (current approach)
    console.log('🔍 [SIGNATURES] Trying Gmail sendAs settings API...')
    const settingsResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (settingsResponse.ok) {
      const settingsData = await settingsResponse.json()
      console.log(`🔍 [SIGNATURES] Found ${settingsData.sendAs?.length || 0} sendAs settings`)
      
      if (settingsData.sendAs && Array.isArray(settingsData.sendAs)) {
        settingsData.sendAs.forEach((sendAsSettings: any, index: number) => {
          
          // Always add the sendAs identity, even if no signature is set
          signatures.push({
            id: `gmail-signature-${index}`,
            name: sendAsSettings.displayName || sendAsSettings.sendAsEmail || 'Default Signature',
            content: sendAsSettings.signature || `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
              <p>Best regards,<br>
              <strong>${sendAsSettings.displayName || sendAsSettings.sendAsEmail?.split('@')[0] || 'User'}</strong><br>
              <a href="mailto:${sendAsSettings.sendAsEmail}" style="color: #1a73e8;">${sendAsSettings.sendAsEmail}</a></p>
            </div>`,
            isDefault: sendAsSettings.isDefault || index === 0,
            email: sendAsSettings.sendAsEmail,
            displayName: sendAsSettings.displayName || sendAsSettings.sendAsEmail?.split('@')[0] || 'User',
            hasCustomSignature: !!sendAsSettings.signature
          })
        })
      } else {
        console.log('🔍 [SIGNATURES] No sendAs array found in response')
      }
    } else {
      const errorText = await settingsResponse.text()
      console.error('🔍 [SIGNATURES] Gmail sendAs API failed:', settingsResponse.status, errorText)
    }

    // Note: The sendAs endpoint is the primary way to get Gmail signatures
    // Other Gmail settings endpoints either don't exist or don't contain signature data

    // If no signatures found in sendAs settings, create a basic signature from profile
    if (signatures.length === 0) {
      console.log('🔍 [SIGNATURES] No Gmail signatures found, creating fallback signature')
      
      if (profile.emailAddress) {
        // Try to get the user's name from profile or other sources
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('full_name, display_name')
          .eq('id', userId)
          .single()

        const displayName = userProfile?.display_name || 
                           userProfile?.full_name || 
                           profile.emailAddress.split('@')[0]

        console.log(`🔍 [SIGNATURES] Created fallback signature for ${displayName}`)

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
      } else {
        console.log('🔍 [SIGNATURES] No email address found in profile')
      }
    }

    console.log(`🔍 [SIGNATURES] Returning ${signatures.length} signature(s)`)

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