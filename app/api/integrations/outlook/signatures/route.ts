import { NextRequest, NextResponse } from 'next/server'
import { getDecryptedAccessToken } from '@/lib/integrations/getDecryptedAccessToken'
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 [OUTLOOK-SIGNATURES] API called')
    
    const searchParams = request.nextUrl.searchParams
    const requestedUserId = searchParams.get('userId')

    if (!requestedUserId) {
      console.log('❌ [OUTLOOK-SIGNATURES] No userId provided')
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 })
    }

    console.log('🔍 [OUTLOOK-SIGNATURES] Requested userId:', requestedUserId)
    
    // Use admin client to verify user exists
    const supabase = createAdminClient()
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', requestedUserId)
      .single()

    if (userError || !userData) {
      console.log('❌ [OUTLOOK-SIGNATURES] User not found:', userError)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userId = requestedUserId

    // Get Outlook access token
    let accessToken
    try {
      accessToken = await getDecryptedAccessToken(userId, 'microsoft-outlook')
    } catch (error) {
      console.log('🔍 [OUTLOOK-SIGNATURES] Outlook integration not found for user:', userId)
      return NextResponse.json({ 
        error: 'Outlook integration not connected',
        signatures: [],
        needsConnection: true
      }, { status: 200 })
    }
    
    if (!accessToken) {
      console.log('🔍 [OUTLOOK-SIGNATURES] Outlook access token missing for user:', userId)
      return NextResponse.json({ 
        error: 'Outlook access token missing',
        signatures: [],
        needsConnection: true
      }, { status: 200 })
    }

    // Get Outlook/Microsoft Graph profile
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!profileResponse.ok) {
      console.error('Failed to fetch Outlook profile:', await profileResponse.text())
      return NextResponse.json({ 
        error: 'Failed to fetch Outlook profile',
        signatures: []
      }, { status: 200 })
    }

    const profile = await profileResponse.json()

    // Get Outlook mail settings
    const settingsResponse = await fetch('https://graph.microsoft.com/v1.0/me/outlook/masterCategories', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    const signatures = []

    // Try to get mailbox settings for automatic signature
    try {
      const mailboxResponse = await fetch('https://graph.microsoft.com/v1.0/me/mailboxSettings', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      if (mailboxResponse.ok) {
        const mailboxData = await mailboxResponse.json()
        
        if (mailboxData.automaticRepliesSetting?.internalReplyMessage) {
          signatures.push({
            id: 'outlook-signature-auto-reply',
            name: 'Auto Reply Signature',
            content: mailboxData.automaticRepliesSetting.internalReplyMessage,
            isDefault: false,
            email: profile.mail || profile.userPrincipalName,
            displayName: profile.displayName
          })
        }
      }
    } catch (error) {
      console.log('Could not fetch mailbox settings, continuing...')
    }

    // If no signatures found, create a basic signature from profile
    if (signatures.length === 0 && (profile.mail || profile.userPrincipalName)) {
      const displayName = profile.displayName || 
                         profile.mail?.split('@')[0] || 
                         profile.userPrincipalName?.split('@')[0] || 
                         'User'

      const email = profile.mail || profile.userPrincipalName
      const jobTitle = profile.jobTitle || ''
      const companyName = profile.companyName || ''
      const mobilePhone = profile.mobilePhone || ''
      const businessPhone = profile.businessPhones?.[0] || ''

      let signatureContent = `<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; color: #333;">
        <p>Best regards,<br>
        <strong>${displayName}</strong>`

      if (jobTitle) {
        signatureContent += `<br><em>${jobTitle}</em>`
      }

      if (companyName) {
        signatureContent += `<br>${companyName}`
      }

      signatureContent += `<br><a href="mailto:${email}" style="color: #0078d4;">${email}</a>`

      if (businessPhone) {
        signatureContent += `<br>Tel: ${businessPhone}`
      }

      if (mobilePhone && mobilePhone !== businessPhone) {
        signatureContent += `<br>Mobile: ${mobilePhone}`
      }

      signatureContent += `</p></div>`

      signatures.push({
        id: 'outlook-signature-default',
        name: 'Professional Signature',
        content: signatureContent,
        isDefault: true,
        email: email,
        displayName: displayName
      })
    }

    return NextResponse.json({
      signatures,
      profile: {
        emailAddress: profile.mail || profile.userPrincipalName,
        displayName: profile.displayName,
        jobTitle: profile.jobTitle,
        companyName: profile.companyName
      }
    })

  } catch (error) {
    console.error('Error fetching Outlook signatures:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      signatures: []
    }, { status: 500 })
  }
}