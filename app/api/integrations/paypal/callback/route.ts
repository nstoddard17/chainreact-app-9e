import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')
  const baseUrl = getBaseUrl()
  const provider = 'paypal'

  if (error) {
    console.error(`Error with PayPal OAuth: ${error} - ${errorDescription}`)
    return createPopupResponse('error', provider, errorDescription || `OAuth Error: ${error}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'No code or state provided for PayPal OAuth.', baseUrl)
  }

  try {
    // Verify state parameter to prevent CSRF
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

    const supabase = createAdminClient()

    const clientId = process.env.PAYPAL_CLIENT_ID
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET
    // Use the same registered redirect URI as in the auth URL generation
    // This ensures consistency between authorization request and token exchange
    const redirectUri = process.env.PAYPAL_REDIRECT_URI || "https://chainreact.app/api/integrations/paypal/callback"
    
    // For debugging
    console.log("PayPal callback processing - using redirect URI:", redirectUri)

    if (!clientId || !clientSecret) {
      throw new Error('PayPal client ID or secret not configured')
    }

    // Determine if we're using sandbox credentials
    const isSandbox = clientId.includes('sandbox') || process.env.PAYPAL_SANDBOX === 'true'
    
    // Use the correct token endpoint domain for sandbox or production
    // For v1 token endpoint
    const paypalDomain = isSandbox ? 'api-m.sandbox.paypal.com' : 'api-m.paypal.com'
    
    console.log("Using PayPal domain for token exchange:", paypalDomain)
    console.log("Received code parameter:", !!code)

    const tokenResponse = await fetch(`https://${paypalDomain}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      throw new Error(`PayPal token exchange failed: ${errorData.error_description}`)
    }

    const tokenData = await tokenResponse.json()

    const expiresIn = tokenData.expires_in
    const expiresAt = new Date(new Date().getTime() + expiresIn * 1000)

    // Fetch user information
    let userInfo = null
    try {
      const userInfoResponse = await fetch(`https://${paypalDomain}/v1/identity/openidconnect/userinfo`, {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json'
        },
      })

      if (userInfoResponse.ok) {
        userInfo = await userInfoResponse.json()
        console.log('PayPal user info:', userInfo)
      } else {
        console.error('Failed to fetch PayPal user info:', await userInfoResponse.text())
      }
    } catch (userInfoError) {
      console.error('Error fetching PayPal user info:', userInfoError)
    }

    // Fetch PayPal account verification status and additional attributes
    let paypalAttributes = null
    try {
      const attributesResponse = await fetch(`https://${paypalDomain}/v1/oauth2/token/userinfo`, {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json'
        },
        method: 'GET'
      })

      if (attributesResponse.ok) {
        paypalAttributes = await attributesResponse.json()
        console.log('PayPal attributes:', paypalAttributes)
      } else {
        console.error('Failed to fetch PayPal attributes:', await attributesResponse.text())
      }
    } catch (attributesError) {
      console.error('Error fetching PayPal attributes:', attributesError)
    }

    // Extract user data with fallbacks for different response formats
    let accountId = null
    let email = null
    let name = null
    let verified = false

    // Try to extract from userInfo
    if (userInfo) {
      accountId = userInfo.payer_id || userInfo.sub || null
      email = userInfo.email || null
      name = userInfo.name || userInfo.given_name ? `${userInfo.given_name} ${userInfo.family_name || ''}`.trim() : null
    }

    // Try to extract from paypalAttributes
    if (paypalAttributes) {
      // Handle nested account structure
      if (paypalAttributes.account) {
        accountId = accountId || paypalAttributes.account.payer_id || paypalAttributes.account.account_id || null
        email = email || paypalAttributes.account.email || null
        name = name || paypalAttributes.account.name || null
        verified = paypalAttributes.account.verified === true || paypalAttributes.account.verified === 'true'
      } 
      // Handle flat structure
      else {
        accountId = accountId || paypalAttributes.payer_id || paypalAttributes.account_id || null
        email = email || paypalAttributes.email || null
        name = name || paypalAttributes.name || null
        verified = paypalAttributes.verified === true || paypalAttributes.verified === 'true'
      }
    }

    // Upsert the integration details
    const integrationData = {
      user_id: userId,
      provider: provider,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      status: 'connected',
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        user_info: userInfo,
        paypal_attributes: paypalAttributes,
        account_id: accountId,
        email: email,
        name: name,
        verified: verified
      }
    }

    const { error: upsertError } = await supabase.from('integrations').upsert(integrationData, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      throw new Error(`Failed to save PayPal integration: ${upsertError.message}`)
    }

    return createPopupResponse('success', provider, 'You can now close this window.', baseUrl)
  } catch (e: any) {
    console.error('PayPal callback error:', e)
    return createPopupResponse(
      'error',
      provider,
      e.message || 'An unexpected error occurred.',
      baseUrl,
    )
  }
}
