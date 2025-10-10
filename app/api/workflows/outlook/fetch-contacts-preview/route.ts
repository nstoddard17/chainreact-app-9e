import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(request: NextRequest) {
  try {
    const { integrationId, userId, config } = await request.json()

    if (!integrationId) {
      return NextResponse.json({ error: 'Integration ID is required' }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (!config) {
      return NextResponse.json({ error: 'Config is required' }, { status: 400 })
    }

    // Get integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single()

    if (integrationError || !integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    // Check if the integration belongs to the user
    if (integration.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Validate and refresh token
    const { decrypt } = await import("@/lib/security/encryption")
    const { getSecret } = await import("@/lib/secrets")
    
    const secret = await getSecret("encryption_key")
    if (!secret) {
      return NextResponse.json({ error: 'Encryption secret not configured' }, { status: 500 })
    }

    let accessToken = integration.access_token
    if (accessToken.includes(":")) {
      try {
        accessToken = decrypt(accessToken, secret)
      } catch (decryptError) {
        return NextResponse.json({ error: 'Token decryption failed' }, { status: 500 })
      }
    }

    // Fetch contacts from Microsoft Graph API
    const { limit = 10 } = config
    const maxResults = limit === 'all' ? 100 : parseInt(limit as string, 10)
    
    const apiUrl = `https://graph.microsoft.com/v1.0/me/contacts?$top=${maxResults}&$select=id,displayName,givenName,surname,emailAddresses,businessPhones,jobTitle,companyName`

    console.log('Fetching contacts from:', apiUrl)
    console.log('Access token length:', accessToken?.length || 0)

    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Microsoft Graph API error:', response.status, errorText)
      
      // If it's a 401/403 error, try to refresh the token
      if (response.status === 401 || response.status === 403) {
        console.log('Attempting token refresh due to 401/403 error...')
        
        try {
          const { LegacyTokenRefreshService: TokenRefreshService } = await import("@/src/infrastructure/workflows/legacy-compatibility")
          
          // Decrypt refresh token if needed
          let refreshToken = integration.refresh_token
          if (refreshToken && refreshToken.includes(":")) {
            const { decrypt } = await import("@/lib/security/encryption")
            const { getSecret } = await import("@/lib/secrets")
            const secret = await getSecret("encryption_key")
            if (secret) {
              refreshToken = decrypt(refreshToken, secret)
            }
          }
          
          if (refreshToken) {
            const refreshResult = await TokenRefreshService.refreshTokenForProvider(
              "microsoft-outlook",
              refreshToken,
              integration
            )
            
            if (refreshResult.success && refreshResult.accessToken) {
              console.log('Token refresh successful, retrying API call...')
              
              // Retry the API call with the new token
              const retryResponse = await fetch(apiUrl, {
                headers: {
                  'Authorization': `Bearer ${refreshResult.accessToken}`,
                  'Content-Type': 'application/json'
                }
              })
              
              if (retryResponse.ok) {
                const data = await retryResponse.json()
                
                // Transform the data to match the expected format
                const contacts = data.value.map((contact: any) => ({
                  id: contact.id,
                  displayName: contact.displayName,
                  givenName: contact.givenName,
                  surname: contact.surname,
                  emailAddresses: contact.emailAddresses || [],
                  businessPhones: contact.businessPhones || [],
                  jobTitle: contact.jobTitle,
                  companyName: contact.companyName
                }))

                return NextResponse.json({
                  data: {
                    contacts,
                    totalCount: data['@odata.count'] || contacts.length
                  }
                })
              } 
                const retryErrorText = await retryResponse.text()
                console.error('Retry failed:', retryResponse.status, retryErrorText)
              
            } else {
              console.error('Token refresh failed:', refreshResult.error)
            }
          }
        } catch (refreshError) {
          console.error('Error during token refresh:', refreshError)
        }
      }
      
      return NextResponse.json({ 
        error: `Outlook API error: ${response.status} - ${errorText}` 
      }, { status: response.status })
    }

    const data = await response.json()
    
    // Transform the data to match the expected format
    const contacts = data.value.map((contact: any) => ({
      id: contact.id,
      displayName: contact.displayName,
      givenName: contact.givenName,
      surname: contact.surname,
      emailAddresses: contact.emailAddresses || [],
      businessPhones: contact.businessPhones || [],
      jobTitle: contact.jobTitle,
      companyName: contact.companyName
    }))

    return NextResponse.json({
      data: {
        contacts,
        totalCount: data['@odata.count'] || contacts.length
      }
    })

  } catch (error) {
    console.error('Error fetching contacts preview:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 