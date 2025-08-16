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

    // Get Outlook access token
    const credentials = await getDecryptedAccessToken(userId, 'microsoft-outlook')
    if (!credentials || !credentials.accessToken) {
      return NextResponse.json({ 
        error: 'Outlook integration not found or access token missing',
        signatures: []
      }, { status: 200 })
    }

    // Get Outlook/Microsoft Graph profile
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
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
        'Authorization': `Bearer ${credentials.accessToken}`,
      },
    })

    const signatures = []

    // Try to get mailbox settings for automatic signature
    try {
      const mailboxResponse = await fetch('https://graph.microsoft.com/v1.0/me/mailboxSettings', {
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
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