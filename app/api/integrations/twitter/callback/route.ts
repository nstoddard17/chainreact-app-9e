import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/security/encryption'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  
  console.log('Twitter callback received with code and state:', !!code, !!state)

  if (!code || !state) {
    console.error('Missing code or state in Twitter callback')
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
    
    console.log('PKCE data found:', pkceData.provider, 'code_verifier present:', !!pkceData.code_verifier)

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
    
    console.log('Twitter token exchange request:', {
      redirect_uri: redirectUri,
      code_verifier_length: pkceData.code_verifier.length
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
    console.log('Twitter token received:', {
      access_token_present: !!tokenData.access_token,
      refresh_token_present: !!tokenData.refresh_token,
      expires_in: tokenData.expires_in
    })
    
    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token

    // Set expiry times
    const expiresIn = tokenData.expires_in || 7200 // Default to 2 hours if not provided
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
    const refreshExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days for refresh token

    // Get user ID from state data
    let stateObj;
    try {
      stateObj = JSON.parse(atob(state));
      console.log('State object parsed:', { userId: stateObj.userId });
    } catch (e) {
      console.error('Failed to parse state:', e);
      return NextResponse.json({ error: 'Invalid state format' }, { status: 400 });
    }
    
    const userId = stateObj.userId;

    if (!userId) {
      console.error('User ID not found in state');
      return NextResponse.json({ error: 'User ID not found' }, { status: 400 })
    }

    const encryptionKey = process.env.ENCRYPTION_KEY
    if (!encryptionKey) {
      console.error('Encryption key not configured');
      return NextResponse.json({ error: 'Encryption key not configured' }, { status: 500 })
    }

    const supabase = createAdminClient()
    
    // First check if the integration already exists
    const { data: existingIntegration } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'twitter')
      .single();
      
    console.log('Existing integration found:', !!existingIntegration);
    
    let error;
    let result;
    
    const integrationData = {
      access_token: encrypt(accessToken, encryptionKey),
      refresh_token: refreshToken ? encrypt(refreshToken, encryptionKey) : null,
      expires_at: expiresAt,
      refresh_token_expires_at: refreshExpiresAt,
      is_active: true,
      status: 'connected',
      updated_at: new Date().toISOString(),
    };
    
    if (existingIntegration) {
      // Update existing integration
      result = await supabase
        .from('integrations')
        .update(integrationData)
        .eq('user_id', userId)
        .eq('provider', 'twitter');
        
      error = result.error;
      console.log('Integration update result:', error ? 'Error' : 'Success');
    } else {
      // Insert new integration
      result = await supabase
        .from('integrations')
        .insert({
          user_id: userId,
          provider: 'twitter',
          ...integrationData
        });
      
      error = result.error;
      console.log('Integration insert result:', error ? 'Error' : 'Success');
    }

    if (error) {
      console.error('Error storing Twitter integration:', error)
      return NextResponse.json({ error: 'Failed to store integration' }, { status: 500 })
    }
    
    // Double-check that the integration is properly stored with connected status
    const { data: verifyIntegration, error: verifyError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'twitter')
      .single();
      
    if (verifyError) {
      console.error('Error verifying integration status:', verifyError);
    } else {
      console.log('Integration verified:', {
        is_active: verifyIntegration.is_active,
        status: verifyIntegration.status
      });
    }

    // Return success response with close window script
    return new Response(
      `<html><body>
        <script>
          window.opener.postMessage({
            type: "twitter-auth-success",
            provider: "twitter",
            status: "connected"
          }, "*");
          setTimeout(function() {
            window.close();
          }, 1000);
        </script>
        <div style="text-align: center; font-family: Arial, sans-serif; margin-top: 50px;">
          <h3>Twitter connected successfully!</h3>
          <p>You can close this window now.</p>
        </div>
      </body></html>`,
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
