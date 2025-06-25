import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { encrypt } from '@/lib/security/encryption'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')
  
  const baseUrl = getBaseUrl()
  const provider = 'notion'

  // Handle OAuth errors
  if (error) {
    console.error(`Notion OAuth error: ${error} - ${errorDescription}`)
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

    // Get Notion OAuth credentials
    const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID
    const clientSecret = process.env.NOTION_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/notion/callback`

    if (!clientId || !clientSecret) {
      console.error('Notion OAuth credentials not configured')
      return createPopupResponse('error', provider, 'Integration configuration error', baseUrl)
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Notion token exchange failed:', tokenResponse.status, errorText)
      return createPopupResponse('error', provider, 'Failed to retrieve access token', baseUrl)
    }

    const tokenData = await tokenResponse.json()
    
    // Notion tokens don't expire by default
    // We'll set a nominal expiration for safety
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    
    // Get workspace details from token data
    const workspaceId = tokenData.workspace_id
    const workspaceName = tokenData.workspace_name
    const workspaceIcon = tokenData.workspace_icon
    const botId = tokenData.bot_id

    const encryptionKey = process.env.ENCRYPTION_KEY

    if (!encryptionKey) {
      return createPopupResponse('error', provider, 'Encryption key not configured', baseUrl)
    }

    // Attempt to fetch user information if not included in token response
    let userInfo = {}
    if (tokenData.access_token) {
      try {
        const usersResponse = await fetch('https://api.notion.com/v1/users', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Notion-Version': '2022-06-28'
          }
        })
        
        if (usersResponse.ok) {
          const usersData = await usersResponse.json()
          if (usersData.results && usersData.results.length > 0) {
            // Find the bot user
            const botUser = usersData.results.find((user: any) => user.type === 'bot' && user.bot?.owner?.type === 'workspace')
            if (botUser) {
              userInfo = {
                bot_owner: botUser.bot?.owner?.workspace
              }
            }
          }
        } else {
          console.warn('Failed to fetch Notion users:', await usersResponse.text())
        }
      } catch (userError) {
        console.warn('Error fetching Notion users:', userError)
      }
    }

    // Store the integration data
    const supabase = createAdminClient()
    const { error: upsertError } = await supabase.from('integrations').upsert({
      user_id: userId,
      provider,
      access_token: encrypt(tokenData.access_token, encryptionKey),
      refresh_token: null, // Notion doesn't provide refresh tokens
      expires_at: expiresAt.toISOString(),
      status: 'connected',
      is_active: true,
      updated_at: new Date().toISOString(),
      metadata: {
        workspace_id: workspaceId,
        workspace_name: workspaceName,
        workspace_icon: workspaceIcon,
        bot_id: botId,
        owner_type: tokenData.owner?.type,
        user_info: userInfo,
        duplicate_template_privileges: tokenData.duplicated_template_id ? true : false
      }
    }, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      console.error('Failed to save Notion integration:', upsertError)
      return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
    }

    return createPopupResponse('success', provider, 'Notion connected successfully!', baseUrl)
  } catch (error) {
    console.error('Notion callback error:', error)
    return createPopupResponse('error', provider, 'An unexpected error occurred', baseUrl)
  }
}
