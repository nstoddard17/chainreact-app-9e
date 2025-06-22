import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/security/encryption'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  try {
    // Verify state to prevent CSRF
    const { data: pkceData, error: pkceError } = await createAdminClient()
      .from('pkce_flow')
      .select('*')
      .eq('state', state)
      .single()

    if (pkceError || !pkceData) {
      console.error('Invalid state or PKCE lookup error:', pkceError)
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
    }

    // Clean up the state
    await createAdminClient()
      .from('pkce_flow')
      .delete()
      .eq('state', state)

    // Exchange the code for a token
    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET
    const baseUrl = getBaseUrl()
    const redirectUri = `${baseUrl}/api/integrations/twitter/callback`

    if (!clientId || !clientSecret) {
      console.error('Twitter OAuth credentials not configured')
      console.error('Client ID present:', !!clientId)
      console.error('Client Secret present:', !!clientSecret)
      return NextResponse.json({ error: 'OAuth configuration error' }, { status: 500 })
    }

    const tokenEndpoint = 'https://api.twitter.com/2/oauth2/token'
    
    // Create Basic Auth header
    const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    
    const params = new URLSearchParams()
    params.append('code', code)
    params.append('grant_type', 'authorization_code')
    params.append('redirect_uri', redirectUri)
    params.append('code_verifier', pkceData.code_verifier)
    
    console.log('Token exchange params:', {
      code_verifier: pkceData.code_verifier,
      redirect_uri: redirectUri
    })

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': authHeader
      },
      body: params,
    })

    if (!tokenResponse.ok) {
      console.error('Twitter token exchange failed:', tokenResponse.status)
      const errorText = await tokenResponse.text()
      console.error('Error details:', errorText)
      return NextResponse.json({ error: 'Failed to retrieve token' }, { status: 500 })
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token

    // Set expiry times
    const expiresIn = tokenData.expires_in || 7200 // Default to 2 hours if not provided
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
    const refreshExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days for refresh token

    // Get user ID from state data
    const userId = JSON.parse(atob(state)).userId

    if (!userId) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 400 })
    }

    const encryptionKey = process.env.ENCRYPTION_KEY
    if (!encryptionKey) {
      return NextResponse.json({ error: 'Encryption key not configured' }, { status: 500 })
    }

    // Store the integration
    const supabase = createAdminClient()
    const { error } = await supabase.from('integrations').upsert({
      user_id: userId,
      provider: 'twitter',
      access_token: encrypt(accessToken, encryptionKey),
      refresh_token: refreshToken ? encrypt(refreshToken, encryptionKey) : null,
      expires_at: expiresAt,
      refresh_token_expires_at: refreshExpiresAt,
      is_active: true,
      status: 'connected',
      updated_at: new Date().toISOString(),
    })

    if (error) {
      console.error('Error storing Twitter integration:', error)
      return NextResponse.json({ error: 'Failed to store integration' }, { status: 500 })
    }

    // Return success response with close window script
    return new Response(
      `<html><body><script>window.opener.postMessage("twitter-auth-success", "*");window.close();</script></body></html>`,
      {
        headers: {
          'Content-Type': 'text/html',
        },
      }
    )
  } catch (error) {
    console.error('Twitter integration error:', error)
    return NextResponse.json({ error: 'Twitter integration failed' }, { status: 500 })
  }
}
