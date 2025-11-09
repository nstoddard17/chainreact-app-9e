import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { getDecryptedAccessToken } from '@/lib/integrations/getDecryptedAccessToken'
import { createAdminClient } from "@/lib/supabase/admin"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    logger.debug('🔍 [GMAIL SIGNATURES] API endpoint called')
    const searchParams = request.nextUrl.searchParams
    const requestedUserId = searchParams.get('userId')

    logger.debug('🔍 [GMAIL SIGNATURES] Request params:', { requestedUserId })

    if (!requestedUserId) {
      logger.debug('❌ [SIGNATURES] No userId provided')
      return errorResponse('Missing userId parameter' , 400)
    }
    
    // Use admin client to verify user exists
    const supabase = createAdminClient()
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', requestedUserId)
      .single()

    if (userError || !userData) {
      logger.debug('❌ [SIGNATURES] User not found:', userError)
      return errorResponse('User not found' , 404)
    }

    const userId = requestedUserId

    // Get Gmail integration to access metadata with custom signature names
    const { data: integration } = await supabase
      .from('integrations')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('provider', 'gmail')
      .single()

    const customSignatureNames = integration?.metadata?.signature_names || {}
    logger.debug('🔍 [GMAIL SIGNATURES] Custom signature names from metadata:', customSignatureNames)

    // Get Gmail access token
    logger.debug('🔍 [GMAIL SIGNATURES] Getting access token for user:', userId)
    let accessToken
    try {
      accessToken = await getDecryptedAccessToken(userId, 'gmail')
      logger.debug('✅ [GMAIL SIGNATURES] Access token retrieved successfully')
    } catch (error) {
      logger.debug('❌ [GMAIL SIGNATURES] Gmail integration not found:', error)
      return errorResponse('Gmail integration not connected', 200, {
        signatures: [],
        needsConnection: true
      })
    }
    
    if (!accessToken) {
      logger.debug('❌ [GMAIL SIGNATURES] Gmail access token missing')
      return errorResponse('Gmail access token missing', 200, {
        signatures: [],
        needsConnection: true
      })
    }

    // Fetch Gmail sendAs settings to get signatures
    logger.debug('🔍 [GMAIL SIGNATURES] Fetching Gmail sendAs settings...')
    const settingsResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!settingsResponse.ok) {
      const errorText = await settingsResponse.text()
      logger.error('❌ [GMAIL SIGNATURES] Gmail sendAs API failed:', settingsResponse.status, errorText)
      return errorResponse('Failed to fetch Gmail signatures', 200, {
        signatures: [],
        needsReconnection: settingsResponse.status === 401
      })
    }

    const settingsData = await settingsResponse.json()
    logger.debug(`✅ [GMAIL SIGNATURES] SendAs API response received:`, JSON.stringify(settingsData, null, 2))
    logger.debug(`🔍 [GMAIL SIGNATURES] Found ${settingsData.sendAs?.length || 0} sendAs settings`)
    
    const signatures = []
    
    if (settingsData.sendAs && Array.isArray(settingsData.sendAs)) {
      settingsData.sendAs.forEach((sendAsSettings: any, index: number) => {
        logger.debug(`🔍 [GMAIL SIGNATURES] Processing sendAs ${index}:`, {
          sendAsEmail: sendAsSettings.sendAsEmail,
          displayName: sendAsSettings.displayName,
          hasSignature: !!sendAsSettings.signature,
          signaturePreview: sendAsSettings.signature?.substring(0, 100) + (sendAsSettings.signature?.length > 100 ? '...' : ''),
          isDefault: sendAsSettings.isDefault
        })
        
        // Create a signature entry for each sendAs identity
        // Use custom name from metadata if available, otherwise use email-based name
        const customName = customSignatureNames[sendAsSettings.sendAsEmail]
        const defaultName = sendAsSettings.displayName
          ? `${sendAsSettings.displayName} <${sendAsSettings.sendAsEmail}>`
          : sendAsSettings.sendAsEmail

        signatures.push({
          id: `gmail-signature-${index}`,
          name: customName || defaultName,
          content: sendAsSettings.signature || '',
          isDefault: sendAsSettings.isDefault || index === 0,
          email: sendAsSettings.sendAsEmail,
          displayName: sendAsSettings.displayName || '',
          hasSignature: !!sendAsSettings.signature
        })
        
        if (sendAsSettings.signature) {
          logger.debug(`✅ [GMAIL SIGNATURES] Found signature for: ${sendAsSettings.displayName || sendAsSettings.sendAsEmail}`)
        } else {
          logger.debug(`⚠️ [GMAIL SIGNATURES] No signature set for: ${sendAsSettings.sendAsEmail}`)
        }
      })
    }

    // Only return signatures that actually have content (filter out empty ones)
    const signaturesWithContent = signatures.filter(sig => sig.hasSignature && sig.content.trim() !== '')

    logger.debug(`✅ [GMAIL SIGNATURES] Returning ${signaturesWithContent.length} signature(s):`,
      signaturesWithContent.map(sig => ({ id: sig.id, name: sig.name, hasSignature: sig.hasSignature })))

    const response = {
      signatures: signaturesWithContent,
      hasSignatures: signaturesWithContent.length > 0,
      totalIdentities: signatures.length,
      signaturesCount: signaturesWithContent.length
    }

    return jsonResponse(response)

  } catch (error) {
    logger.error('Error fetching Gmail signatures:', error)
    return errorResponse('Internal server error', 500, { signatures: []
     })
  }
}

export async function POST(request: NextRequest) {
  try {
    logger.debug('🔍 [GMAIL SIGNATURES] POST endpoint called')
    const body = await request.json()
    const { userId, name, content, isDefault } = body

    logger.debug('🔍 [GMAIL SIGNATURES] Request body:', { userId, name, hasContent: !!content, isDefault })

    if (!userId || !name || !content) {
      logger.debug('❌ [SIGNATURES] Missing required fields')
      return errorResponse('Missing required fields: userId, name, and content are required', 400)
    }

    // Use admin client to verify user exists
    const supabase = createAdminClient()
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .single()

    if (userError || !userData) {
      logger.debug('❌ [SIGNATURES] User not found:', userError)
      return errorResponse('User not found', 404)
    }

    // Get Gmail access token
    logger.debug('🔍 [GMAIL SIGNATURES] Getting access token for user:', userId)
    let accessToken
    try {
      accessToken = await getDecryptedAccessToken(userId, 'gmail')
      logger.debug('✅ [GMAIL SIGNATURES] Access token retrieved successfully')
    } catch (error) {
      logger.debug('❌ [GMAIL SIGNATURES] Gmail integration not found:', error)
      return errorResponse('Gmail integration not connected', 401)
    }

    if (!accessToken) {
      logger.debug('❌ [GMAIL SIGNATURES] Gmail access token missing')
      return errorResponse('Gmail access token missing', 401)
    }

    // First, get the user's email to create/update sendAs settings
    logger.debug('🔍 [GMAIL SIGNATURES] Fetching user profile to get email...')
    const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text()
      logger.error('❌ [GMAIL SIGNATURES] Failed to get user profile:', profileResponse.status, errorText)
      return errorResponse('Failed to get user profile', 500)
    }

    const profileData = await profileResponse.json()
    const userEmail = profileData.emailAddress
    logger.debug('✅ [GMAIL SIGNATURES] User email:', userEmail)

    // Update the sendAs settings to set/update the signature
    logger.debug('🔍 [GMAIL SIGNATURES] Updating sendAs settings with new signature...')
    const updateResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(userEmail)}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signature: content
        })
      }
    )

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      logger.error('❌ [GMAIL SIGNATURES] Failed to update signature:', updateResponse.status, errorText)
      return errorResponse('Failed to create signature in Gmail', 500)
    }

    const updatedSettings = await updateResponse.json()
    logger.debug('✅ [GMAIL SIGNATURES] Signature updated successfully')

    // Store the custom signature name in integration metadata
    const { data: integration } = await supabase
      .from('integrations')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('provider', 'gmail')
      .single()

    if (integration) {
      const metadata = integration.metadata || {}
      const signatureNames = metadata.signature_names || {}

      // Store custom name for this email
      signatureNames[userEmail] = name

      await supabase
        .from('integrations')
        .update({
          metadata: {
            ...metadata,
            signature_names: signatureNames
          }
        })
        .eq('id', integration.id)

      logger.debug('✅ [GMAIL SIGNATURES] Custom signature name stored in metadata')
    }

    // Return success response
    return jsonResponse({
      success: true,
      signature: {
        id: `gmail-signature-0`,
        name: name,
        content: content,
        isDefault: true,
        email: userEmail
      }
    })

  } catch (error) {
    logger.error('Error creating Gmail signature:', error)
    return errorResponse('Internal server error', 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    logger.debug('🔍 [GMAIL SIGNATURES] DELETE endpoint called')
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')
    const email = searchParams.get('email')

    logger.debug('🔍 [GMAIL SIGNATURES] Delete params:', { userId, email })

    if (!userId || !email) {
      logger.debug('❌ [SIGNATURES] Missing required parameters')
      return errorResponse('Missing required parameters: userId and email', 400)
    }

    // Use admin client to verify user exists
    const supabase = createAdminClient()
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .single()

    if (userError || !userData) {
      logger.debug('❌ [SIGNATURES] User not found:', userError)
      return errorResponse('User not found', 404)
    }

    // Get Gmail access token
    logger.debug('🔍 [GMAIL SIGNATURES] Getting access token for user:', userId)
    let accessToken
    try {
      accessToken = await getDecryptedAccessToken(userId, 'gmail')
      logger.debug('✅ [GMAIL SIGNATURES] Access token retrieved successfully')
    } catch (error) {
      logger.debug('❌ [GMAIL SIGNATURES] Gmail integration not found:', error)
      return errorResponse('Gmail integration not connected', 401)
    }

    if (!accessToken) {
      logger.debug('❌ [GMAIL SIGNATURES] Gmail access token missing')
      return errorResponse('Gmail access token missing', 401)
    }

    // Delete the signature by setting it to empty string
    logger.debug('🔍 [GMAIL SIGNATURES] Deleting signature for email:', email)
    const deleteResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(email)}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signature: ''
        })
      }
    )

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text()
      logger.error('❌ [GMAIL SIGNATURES] Failed to delete signature:', deleteResponse.status, errorText)
      return errorResponse('Failed to delete signature from Gmail', 500)
    }

    logger.debug('✅ [GMAIL SIGNATURES] Signature deleted successfully')

    // Remove custom signature name from metadata
    const { data: integration } = await supabase
      .from('integrations')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('provider', 'gmail')
      .single()

    if (integration) {
      const metadata = integration.metadata || {}
      const signatureNames = metadata.signature_names || {}

      // Remove custom name for this email
      delete signatureNames[email]

      await supabase
        .from('integrations')
        .update({
          metadata: {
            ...metadata,
            signature_names: signatureNames
          }
        })
        .eq('id', integration.id)

      logger.debug('✅ [GMAIL SIGNATURES] Custom signature name removed from metadata')
    }

    return jsonResponse({
      success: true,
      message: 'Signature deleted successfully'
    })

  } catch (error) {
    logger.error('Error deleting Gmail signature:', error)
    return errorResponse('Internal server error', 500)
  }
}