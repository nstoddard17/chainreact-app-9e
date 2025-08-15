import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { encrypt } from '@/lib/security/encryption'

export const maxDuration = 30

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const baseUrl = getBaseUrl()
  const provider = 'gmail'
  
  console.log('🔍 Gmail callback called:', { 
    url: url.toString(),
    code: !!code, 
    state: !!state, 
    error,
    userAgent: request.headers.get('user-agent'),
    referer: request.headers.get('referer')
  })

  if (error) {
    console.error(`Error with Gmail OAuth: ${error}`)
    return createPopupResponse('error', provider, `OAuth Error: ${error}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'No code or state provided for Gmail OAuth.', baseUrl)
  }

  try {
    const stateObject = JSON.parse(atob(state))
    const { userId, provider: stateProvider, reconnect, integrationId } = stateObject
    
    if (!userId) {
      return createPopupResponse('error', provider, 'Missing userId in Gmail state.', baseUrl)
    }

    console.log('Gmail OAuth callback state:', { userId, provider: stateProvider, reconnect, integrationId })

    const supabase = createAdminClient()

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    const redirectUri = `${baseUrl}/api/integrations/gmail/callback`
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: '',
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error('Failed to exchange Gmail code for token:', errorData)
      return createPopupResponse(
        'error',
        provider,
        errorData.error_description || 'Failed to get Gmail access token.',
        baseUrl,
      )
    }

    const tokenData = await tokenResponse.json()
    
    console.log('🔍 Gmail token response keys:', Object.keys(tokenData))
    console.log('🔍 Gmail token scopes:', tokenData.scope)
    // Check if token contains sensitive info
    if (tokenData.id_token) {
      console.log('⚠️ Gmail token contains id_token - might have user info')
    }

    const expiresIn = tokenData.expires_in
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    // Encrypt tokens before storing
    const encryptionKey = process.env.ENCRYPTION_KEY
    if (!encryptionKey) {
      return createPopupResponse('error', provider, 'Encryption key not configured', baseUrl)
    }

    const integrationData = {
      user_id: userId,
      provider: 'gmail',
      access_token: encrypt(tokenData.access_token, encryptionKey),
      refresh_token: tokenData.refresh_token ? encrypt(tokenData.refresh_token, encryptionKey) : null,
      scopes: tokenData.scope.split(' '),
      status: 'connected',
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase.from('integrations').upsert(integrationData, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      console.error('Error saving Gmail integration to DB:', upsertError)
      return createPopupResponse('error', provider, `Database Error: ${upsertError.message}`, baseUrl)
    }

    console.log('✅ Gmail integration successfully saved with status: connected')
    
    // For redirect-based OAuth flow, redirect back to the application with success
    const script = `
      <script>
        console.log('🔍 Gmail callback handling redirect-based OAuth');
        
        // Check if this is redirect-based OAuth (no popup context)
        const isRedirectFlow = !window.opener || window.opener === window;
        
        if (isRedirectFlow) {
          console.log('✅ Handling Gmail redirect-based OAuth success');
          
          // Get stored state from sessionStorage
          const storedState = sessionStorage.getItem('gmail_oauth_state');
          let returnUrl = '/dashboard'; // Default fallback
          
          if (storedState) {
            try {
              const stateData = JSON.parse(storedState);
              returnUrl = stateData.returnUrl || '/dashboard';
              console.log('📍 Redirecting back to:', returnUrl);
              
              // Clean up stored state
              sessionStorage.removeItem('gmail_oauth_state');
            } catch (e) {
              console.warn('⚠️ Failed to parse stored state:', e);
            }
          }
          
          // Add success indicator to URL for the frontend to handle
          const urlObj = new URL(returnUrl, window.location.origin);
          urlObj.searchParams.set('gmail_connected', 'true');
          urlObj.searchParams.set('integration_success', 'gmail');
          
          console.log('🔄 Redirecting to:', urlObj.toString());
          window.location.href = urlObj.toString();
          
        } else {
          // Fallback to popup communication if this somehow runs in a popup
          console.log('⚠️ Unexpected popup context, falling back to popup communication');
          
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-success',
              provider: 'gmail',
              message: 'Connected successfully'
            }, '*');
          }
          window.close();
        }
      </script>
    `
    return new Response(`<html><head><title>Gmail Connected</title></head><body><h1>Gmail Connected Successfully!</h1><p>Redirecting you back to the application...</p>${script}</body></html>`, {
      headers: { 
        "Content-Type": "text/html",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    })
  } catch (error) {
    console.error('Error during Gmail OAuth callback:', error)
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return createPopupResponse('error', provider, message, baseUrl)
  }
}
