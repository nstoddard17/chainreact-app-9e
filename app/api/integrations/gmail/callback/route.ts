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
    
    // Return a minimal response that immediately closes the popup  
    const script = `
      <script>
        console.log('🔍 Gmail callback script running in window:', window.name || 'unknown window');
        console.log('🔍 Window location:', window.location.href);
        console.log('🔍 Window opener exists:', !!window.opener);
        console.log('🔍 Window parent:', window.parent === window ? 'same' : 'different');
        console.log('🔍 Window top:', window.top === window ? 'top level' : 'nested');
        console.log('🔍 Document title:', document.title);
        
        // Enhanced verification that this is running in a popup, not a new tab
        const isPopup = window.opener && window.opener !== window;
        const isNamedWindow = window.name && window.name.includes('oauth_popup');
        
        console.log('🔍 Is popup window:', isPopup);
        console.log('🔍 Is named OAuth window:', isNamedWindow);
        
        if (isPopup) {
          try {
            // Send success message to parent window
            const message = {
              type: 'oauth-success',
              provider: 'gmail',
              message: 'Connected successfully',
              timestamp: Date.now(),
              windowName: window.name
            };
            
            console.log('📤 Sending message to parent:', message);
            window.opener.postMessage(message, '*');
            console.log('✅ Gmail success message sent to parent');
            
            // Also store in localStorage as backup
            try {
              localStorage.setItem('gmail_oauth_success', JSON.stringify(message));
              console.log('💾 Gmail success stored in localStorage');
            } catch (e) {
              console.warn('⚠️ Could not store in localStorage:', e);
            }
            
          } catch (e) {
            console.error('❌ Error sending message to parent:', e);
          }
        } else {
          console.error('❌ Gmail callback NOT running in popup context');
          console.error('❌ This indicates OAuth broke out of popup containment');
          
          // Try to communicate with any potential parent window
          try {
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'gmail',
                message: 'OAuth callback opened in wrong window context',
                timestamp: Date.now()
              }, '*');
            }
          } catch (e) {
            console.error('❌ Failed to send error message:', e);
          }
        }
        
        // Force close this window after a short delay
        setTimeout(() => {
          try {
            console.log('🔄 Attempting to close Gmail OAuth window');
            window.close();
            
            // If window.close() fails, try alternative methods
            setTimeout(() => {
              if (!window.closed) {
                console.warn('⚠️ Window still open, trying alternative close');
                try {
                  window.opener && window.opener.focus();
                  window.close();
                } catch (e) {
                  console.error('❌ Alternative close failed:', e);
                }
              }
            }, 100);
            
          } catch (e) {
            console.error('❌ Error closing window:', e);
          }
        }, 250);
      </script>
    `
    return new Response(`<html><head><title>Gmail Connected</title></head><body>Connecting Gmail... This window should close automatically.</body>${script}</html>`, {
      headers: { 
        "Content-Type": "text/html",
        "X-Frame-Options": "SAMEORIGIN",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
        "Cross-Origin-Embedder-Policy": "unsafe-none"
      }
    })
  } catch (error) {
    console.error('Error during Gmail OAuth callback:', error)
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return createPopupResponse('error', provider, message, baseUrl)
  }
}
