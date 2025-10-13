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

    const settingsData = await settingsjsonResponse()
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
        signatures.push({
          id: `gmail-signature-${index}`,
          name: sendAsSettings.displayName 
            ? `${sendAsSettings.displayName} <${sendAsSettings.sendAsEmail}>`
            : sendAsSettings.sendAsEmail,
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

    const signaturesWithSignatures = signatures.filter(sig => sig.hasSignature)
    logger.debug(`✅ [GMAIL SIGNATURES] Returning ${signatures.length} signature(s):`, 
      signatures.map(sig => ({ id: sig.id, name: sig.name, hasSignature: sig.hasSignature })))

    const response = {
      signatures,
      hasSignatures: signaturesWithSignatures.length > 0,
      totalIdentities: signatures.length,
      signaturesCount: signaturesWithSignatures.length
    }

    return jsonResponse(response)

  } catch (error) {
    logger.error('Error fetching Gmail signatures:', error)
    return errorResponse('Internal server error', 500, { signatures: []
     })
  }
}