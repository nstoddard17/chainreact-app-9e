import { NextRequest, NextResponse } from 'next/server'
import { getDecryptedAccessToken } from '@/lib/integrations/getDecryptedAccessToken'
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 [GMAIL SIGNATURES] API endpoint called')
    const searchParams = request.nextUrl.searchParams
    const requestedUserId = searchParams.get('userId')

    console.log('🔍 [GMAIL SIGNATURES] Request params:', { requestedUserId })

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
    console.log('🔍 [GMAIL SIGNATURES] Getting access token for user:', userId)
    let accessToken
    try {
      accessToken = await getDecryptedAccessToken(userId, 'gmail')
      console.log('✅ [GMAIL SIGNATURES] Access token retrieved successfully')
    } catch (error) {
      console.log('❌ [GMAIL SIGNATURES] Gmail integration not found:', error)
      return NextResponse.json({ 
        error: 'Gmail integration not connected',
        signatures: [],
        needsConnection: true
      }, { status: 200 })
    }
    
    if (!accessToken) {
      console.log('❌ [GMAIL SIGNATURES] Gmail access token missing')
      return NextResponse.json({ 
        error: 'Gmail access token missing',
        signatures: [],
        needsConnection: true
      }, { status: 200 })
    }

    // Fetch Gmail sendAs settings to get signatures
    console.log('🔍 [GMAIL SIGNATURES] Fetching Gmail sendAs settings...')
    const settingsResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!settingsResponse.ok) {
      const errorText = await settingsResponse.text()
      console.error('❌ [GMAIL SIGNATURES] Gmail sendAs API failed:', settingsResponse.status, errorText)
      console.error('❌ [GMAIL SIGNATURES] Headers sent:', Object.fromEntries(settingsResponse.headers.entries()))
      return NextResponse.json({ 
        error: 'Failed to fetch Gmail signatures',
        signatures: [],
        needsReconnection: settingsResponse.status === 401
      }, { status: 200 })
    }

    const settingsData = await settingsResponse.json()
    console.log(`✅ [GMAIL SIGNATURES] SendAs API response received:`, JSON.stringify(settingsData, null, 2))
    console.log(`🔍 [GMAIL SIGNATURES] Found ${settingsData.sendAs?.length || 0} sendAs settings`)
    
    const signatures = []
    
    if (settingsData.sendAs && Array.isArray(settingsData.sendAs)) {
      settingsData.sendAs.forEach((sendAsSettings: any, index: number) => {
        console.log(`🔍 [GMAIL SIGNATURES] Processing sendAs ${index}:`, {
          sendAsEmail: sendAsSettings.sendAsEmail,
          displayName: sendAsSettings.displayName,
          hasSignature: !!sendAsSettings.signature,
          signaturePreview: sendAsSettings.signature?.substring(0, 100) + (sendAsSettings.signature?.length > 100 ? '...' : ''),
          isDefault: sendAsSettings.isDefault
        })
        
        // Create a signature entry for each sendAs identity
        // Include displayName and sendAsEmail for the UI label
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
          console.log(`✅ [GMAIL SIGNATURES] Found signature for: ${sendAsSettings.displayName || sendAsSettings.sendAsEmail}`)
        } else {
          console.log(`⚠️ [GMAIL SIGNATURES] No signature set for: ${sendAsSettings.sendAsEmail}`)
        }
      })
    } else {
      console.log('⚠️ [GMAIL SIGNATURES] No sendAs array found in response')
    }

    // Log final signature count
    const signaturesWithSignatures = signatures.filter(sig => sig.hasSignature)
    if (signaturesWithSignatures.length === 0) {
      console.log('⚠️ [GMAIL SIGNATURES] No Gmail signatures found for user')
      console.log('💡 [GMAIL SIGNATURES] This is a known Gmail API limitation - signatures set in web interface may not be exposed via API')
      console.log('💡 [GMAIL SIGNATURES] Attempting to sync signatures by refreshing sendAs settings...')
      
      // Try to refresh the sendAs settings by making a PATCH request
      if (settingsData.sendAs && settingsData.sendAs.length > 0) {
        for (const sendAs of settingsData.sendAs) {
          try {
            console.log(`🔄 [GMAIL SIGNATURES] Attempting to refresh sendAs for: ${sendAs.sendAsEmail}`)
            
            const patchResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(sendAs.sendAsEmail)}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                sendAsEmail: sendAs.sendAsEmail,
                displayName: sendAs.displayName || '',
                signature: sendAs.signature || '' // This might trigger a sync
              })
            })
            
            if (patchResponse.ok) {
              const patchData = await patchResponse.json()
              console.log(`✅ [GMAIL SIGNATURES] SendAs refresh successful:`, patchData)
              
              if (patchData.signature && patchData.signature.trim() !== '') {
                console.log(`🎉 [GMAIL SIGNATURES] Found signature after refresh: ${patchData.signature.substring(0, 100)}...`)
                
                // Update the signature in our response
                const existingIndex = signatures.findIndex(sig => sig.email === sendAs.sendAsEmail)
                if (existingIndex >= 0) {
                  signatures[existingIndex].content = patchData.signature
                  signatures[existingIndex].hasSignature = true
                }
              }
            } else {
              const errorText = await patchResponse.text()
              console.log(`⚠️ [GMAIL SIGNATURES] SendAs refresh failed for ${sendAs.sendAsEmail}:`, patchResponse.status, errorText)
            }
          } catch (error) {
            console.error(`❌ [GMAIL SIGNATURES] Error refreshing sendAs for ${sendAs.sendAsEmail}:`, error)
          }
        }
      }
    } else {
      console.log(`✅ [GMAIL SIGNATURES] Found ${signaturesWithSignatures.length} signature(s) out of ${signatures.length} sendAs identities`)
    }

    console.log(`✅ [GMAIL SIGNATURES] Returning ${signatures.length} signature(s):`, 
      signatures.map(sig => ({ id: sig.id, name: sig.name, hasSignature: sig.hasSignature })))

    const response = {
      signatures,
      hasSignatures: signaturesWithSignatures.length > 0,
      totalIdentities: signatures.length,
      signaturesCount: signaturesWithSignatures.length
    }

    console.log(`✅ [GMAIL SIGNATURES] Final response:`, JSON.stringify(response, null, 2))

    return NextResponse.json(response)

  } catch (error) {
    console.error('Error fetching Gmail signatures:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      signatures: []
    }, { status: 500 })
  }
}