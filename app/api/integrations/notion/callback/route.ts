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
    const clientId = process.env.NOTION_CLIENT_ID
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
      
      // Check for specific error types and provide better error messages
      let errorMessage = 'Failed to retrieve access token';
      let isPermissionError = false;
      
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error === 'invalid_grant' && errorData.error_description?.includes('permission')) {
          errorMessage = 'You don\'t have permission to install this integration. Please ask a workspace owner to install it or request to be upgraded as a member.';
          isPermissionError = true;
        } else if (errorData.error_description) {
          errorMessage = errorData.error_description;
        }
      } catch (e) {
        // If we can't parse the error, use the default message
      }
      
      // For permission errors, return a custom response with better status code
      if (isPermissionError) {
        const script = `
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({
                  type: 'oauth-info',
                  provider: 'notion',
                  message: '${errorMessage}',
                  isPermissionError: true
                }, '*');
              }
              setTimeout(() => window.close(), 2000);
            } catch (e) {
              console.error('Error in popup communication:', e);
              setTimeout(() => window.close(), 1000);
            }
          </script>
        `;
        
        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Notion Connection Info</title>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { 
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  display: flex; 
                  align-items: center; 
                  justify-content: center; 
                  height: 100vh; 
                  margin: 0;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: #1a202c;
                  overflow: hidden;
                }
                
                .container { 
                  text-align: center; 
                  padding: 3rem 2rem;
                  background: rgba(255, 255, 255, 0.95);
                  border-radius: 20px;
                  backdrop-filter: blur(20px);
                  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                  border: 1px solid rgba(255, 255, 255, 0.2);
                  max-width: 400px;
                  width: 90%;
                }
                
                .status-icon { 
                  width: 80px;
                  height: 80px;
                  margin: 0 auto 1.5rem;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 2.5rem;
                  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                  color: white;
                  box-shadow: 0 10px 25px -5px rgba(245, 158, 11, 0.4);
                }
                
                h1 { 
                  margin: 0 0 1rem 0; 
                  font-size: 1.75rem; 
                  font-weight: 700;
                  color: #1a202c;
                  line-height: 1.2;
                }
                
                .message { 
                  margin: 1rem 0; 
                  font-size: 1rem;
                  color: #4a5568;
                  line-height: 1.5;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="status-icon">ℹ️</div>
                <h1>Notion Permission Required</h1>
                <p class="message">${errorMessage}</p>
              </div>
              ${script}
            </body>
          </html>
        `;
        
        return new Response(html, { 
          status: 200, // Use 200 instead of 400 for permission issues
          headers: { "Content-Type": "text/html" } 
        });
      }
      
      return createPopupResponse('error', provider, errorMessage, baseUrl)
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

    // Store the integration data - support multiple Notion workspaces in a single record
    const supabase = createAdminClient()
    
    console.log(`🔍 Checking for existing Notion integration for user: ${userId}`)
    console.log(`🔍 Workspace name: ${workspaceName}`)
    console.log(`🔍 Workspace ID: ${workspaceId}`)
    
    // Get existing Notion integration for this user
    const { data: existingIntegrations, error: queryError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
    
    if (queryError) {
      console.error('🔍 Error querying existing integrations:', queryError)
    }
    
    console.log(`🔍 Found ${existingIntegrations?.length || 0} existing Notion integrations`)
    
    // Prepare workspace data
    const workspaceData = {
      workspace_id: workspaceId,
      workspace_name: workspaceName,
      workspace_icon: workspaceIcon,
      bot_id: botId,
      owner_type: tokenData.owner?.type,
      user_info: userInfo,
      duplicate_template_privileges: tokenData.duplicated_template_id ? true : false,
      access_token: encrypt(tokenData.access_token, encryptionKey),
      connected_at: new Date().toISOString()
    }
    
    let integrationData;
    let upsertError;
    
    if (existingIntegrations && existingIntegrations.length > 0) {
      // Update existing integration with new workspace
      const existingIntegration = existingIntegrations[0];
      const existingMetadata = existingIntegration.metadata || {};
      const existingWorkspaces = existingMetadata.workspaces || {};
      
      // Add or update this workspace
      existingWorkspaces[workspaceId] = workspaceData;
      
      // Use the most recent access token as the primary one
      const primaryWorkspaceId = Object.keys(existingWorkspaces).sort((a, b) => 
        new Date(existingWorkspaces[b].connected_at).getTime() - new Date(existingWorkspaces[a].connected_at).getTime()
      )[0];
      
      integrationData = {
        user_id: userId,
        provider,
        access_token: existingWorkspaces[primaryWorkspaceId].access_token,
        refresh_token: null,
        expires_at: expiresAt.toISOString(),
        status: 'connected',
        is_active: true,
        updated_at: new Date().toISOString(),
        metadata: {
          ...existingMetadata,
          workspaces: existingWorkspaces,
          primary_workspace_id: primaryWorkspaceId,
          workspace_count: Object.keys(existingWorkspaces).length
        }
      }
      
      console.log(`🔍 Updating existing integration with ${Object.keys(existingWorkspaces).length} workspaces`)
      const { error } = await supabase
        .from('integrations')
        .update(integrationData)
        .eq('id', existingIntegration.id)
      upsertError = error;
      
      if (error) {
        console.error('🔍 Error updating integration:', error)
      } else {
        console.log('🔍 Successfully updated integration with multiple workspaces')
      }
    } else {
      // Create new integration with this workspace
      integrationData = {
        user_id: userId,
        provider,
        access_token: workspaceData.access_token,
        refresh_token: null,
        expires_at: expiresAt.toISOString(),
        status: 'connected',
        is_active: true,
        updated_at: new Date().toISOString(),
        metadata: {
          workspaces: {
            [workspaceId]: workspaceData
          },
          primary_workspace_id: workspaceId,
          workspace_count: 1
        }
      }
      
      console.log(`🔍 Creating new integration with workspace: ${workspaceName}`)
      const { error } = await supabase
        .from('integrations')
        .insert(integrationData)
      upsertError = error;
      
      if (error) {
        console.error('🔍 Error creating new integration:', error)
      } else {
        console.log('🔍 Successfully created new integration')
      }
    }

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
