import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { encrypt } from '@/lib/security/encryption'

interface InstagramBusinessAccount {
  id: string;
  name?: string;
  username?: string;
  profile_picture_url?: string;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorReason = url.searchParams.get('error_reason')
  const errorDescription = url.searchParams.get('error_description')
  
  const baseUrl = getBaseUrl()
  const provider = 'instagram'

  // Handle OAuth errors
  if (error) {
    console.error(`Instagram OAuth error: ${error} - ${errorReason} - ${errorDescription}`)
    return createPopupResponse('error', provider, errorDescription || 'Authorization failed', baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'Missing code or state parameter', baseUrl)
  }

  try {
    // Verify state parameter to prevent CSRF - UPDATED to use pkce_flow table
    const { data: pkceData, error: pkceError } = await createAdminClient()
      .from('pkce_flow')
      .select('*')
      .eq('state', state)
      .single()

    if (pkceError || !pkceData) {
      console.error('Invalid state or PKCE lookup error:', pkceError)
      return createPopupResponse('error', provider, 'Invalid state parameter', baseUrl)
    }

    // Parse state to get user ID
    let stateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch (e) {
      console.error('Failed to parse state:', e);
      return createPopupResponse('error', provider, 'Invalid state format', baseUrl);
    }
    
    const userId = stateData.userId;
    
    if (!userId) {
      return createPopupResponse('error', provider, 'User ID not found in state', baseUrl)
    }

    // Clean up the state
    await createAdminClient()
      .from('pkce_flow')
      .delete()
      .eq('state', state)

    // Get Facebook OAuth credentials (used for Instagram Graph API)
    const clientId = process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID
    const clientSecret = process.env.FACEBOOK_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/instagram/callback`

    if (!clientId || !clientSecret) {
      console.error('Facebook OAuth credentials not configured for Instagram Graph API')
      return createPopupResponse('error', provider, 'Integration configuration error', baseUrl)
    }

    // Exchange code for Facebook access token (which will be used for Instagram)
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    )

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Facebook token exchange failed for Instagram:', tokenResponse.status, errorText)
      return createPopupResponse('error', provider, 'Failed to retrieve access token', baseUrl)
    }

    const tokenData = await tokenResponse.json()
    
    // Default to long-lived token expiration (60 days) if not specified
    const expiresIn = tokenData.expires_in || 60 * 24 * 60 * 60
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    // Step 1: Get user's Facebook Pages
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${tokenData.access_token}`
    )
    
    if (!pagesResponse.ok) {
      console.error('Failed to fetch Facebook Pages:', await pagesResponse.text())
      return createPopupResponse('error', provider, 'Failed to fetch connected Facebook Pages', baseUrl)
    }
    
    const pagesData = await pagesResponse.json()
    
    if (!pagesData.data || pagesData.data.length === 0) {
      console.error('No Facebook Pages found:', pagesData)
      return createPopupResponse('error', provider, 'No Facebook Pages connected to your account. Instagram Business accounts must be linked to a Facebook Page.', baseUrl)
    }
    
    // Step 2: For each Page, check for an Instagram Business account
    let instagramAccount = null
    let pageWithInstagram = null
    
    for (const page of pagesData.data) {
      try {
        const instagramResponse = await fetch(
          `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account{id,name,username,profile_picture_url}&access_token=${tokenData.access_token}`
        )
        
        if (instagramResponse.ok) {
          const pageData = await instagramResponse.json()
          if (pageData.instagram_business_account) {
            instagramAccount = pageData.instagram_business_account
            pageWithInstagram = page
            break
          }
        }
      } catch (error) {
        console.warn(`Error checking Instagram for page ${page.id}:`, error)
      }
    }
    
    if (!instagramAccount) {
      return createPopupResponse('error', provider, 'No Instagram Business account found. Please connect your Instagram account to a Facebook Page.', baseUrl)
    }
    
    console.log('Found Instagram Business account:', instagramAccount.id)

    const encryptionKey = process.env.ENCRYPTION_KEY
    if (!encryptionKey) {
      return createPopupResponse('error', provider, 'Encryption key not configured', baseUrl)
    }

    // Store the integration data
    const supabase = createAdminClient()
    const { error: upsertError } = await supabase.from('integrations').upsert({
      user_id: userId,
      provider,
      access_token: encrypt(tokenData.access_token, encryptionKey),
      refresh_token: tokenData.refresh_token ? encrypt(tokenData.refresh_token, encryptionKey) : null,
      expires_at: expiresAt.toISOString(),
      status: 'connected',
      is_active: true,
      updated_at: new Date().toISOString(),
      metadata: {
        instagram_business_account_id: instagramAccount.id,
        instagram_username: instagramAccount.username,
        facebook_page_id: pageWithInstagram.id,
        facebook_page_name: pageWithInstagram.name
      }
    }, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      console.error('Failed to save Instagram integration:', upsertError)
      return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
    }

    return createPopupResponse('success', provider, 'Instagram Business account connected successfully!', baseUrl)
  } catch (error) {
    console.error('Instagram callback error:', error)
    return createPopupResponse('error', provider, 'An unexpected error occurred', baseUrl)
  }
}
