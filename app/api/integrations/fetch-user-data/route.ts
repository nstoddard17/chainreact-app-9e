import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { decrypt } from "@/lib/security/encryption"
import { fetchAirtableWithRetry, delayBetweenRequests } from "@/lib/integrations/airtableRateLimiter"
import { getTwitterMentionsForDropdown } from '@/lib/integrations/twitter'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

interface DataFetcher {
  [key: string]: (integration: any, options?: any) => Promise<any[] | { data: any[], error?: { message: string } }>
}

// Add comprehensive error handling and fix API calls
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { integrationId, dataType, options = {} } = body;

    if (!integrationId || !dataType) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Get user from authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return Response.json({ error: 'Authorization header required' }, { status: 401 });
    }

    // Extract token and validate user
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return Response.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    // Get integration from database
    console.log(`🔍 Looking for integration with ID: ${integrationId}`);
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single();

    if (integrationError) {
      console.error(`❌ Integration lookup error:`, integrationError);
      return Response.json({ error: 'Integration lookup failed' }, { status: 500 });
    }
    
    if (!integration) {
      console.error(`❌ Integration not found with ID: ${integrationId}`);
      return Response.json({ error: 'Integration not found' }, { status: 404 });
    }
    
    console.log(`✅ Found integration:`, { 
      id: integration.id, 
      provider: integration.provider, 
      status: integration.status,
      userId: integration.user_id 
    });

    // Check if the integration belongs to the user
    if (integration.user_id !== userData.user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Find the data fetcher for the requested data type
    const dataFetcher = dataFetchers[dataType];
    if (!dataFetcher) {
      return Response.json({ error: `Unsupported data type: ${dataType}` }, { status: 400 });
    }

    // Fetch the data
    try {
      const result = await dataFetcher(integration, options);
      
      // If the result is an object with data and error properties
      if (result && typeof result === 'object' && 'data' in result && 'error' in result) {
        return Response.json(result);
      }
      
      // Otherwise, assume it's just the data array
      return Response.json({ data: result });
    } catch (error: any) {
      console.error(`Error fetching ${dataType}:`, error);
      return Response.json({ 
        error: { 
          message: error.message || `Error fetching ${dataType}` 
        },
        data: []
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Error in fetch-user-data route:', error);
    return Response.json({ 
      error: { 
        message: error.message || 'Internal server error' 
      },
      data: []
    }, { status: 500 });
  }
}

// Helper function to validate and refresh token if needed
async function validateAndRefreshToken(integration: any): Promise<{
  success: boolean
  token?: string
  error?: string
}> {
  try {
    // Import required modules
    const { decrypt } = await import("@/lib/security/encryption")
    const { getSecret } = await import("@/lib/secrets")
    
    // Get encryption secret
    const secret = await getSecret("encryption_key")
    if (!secret) {
      console.error("Encryption key not found")
      return {
        success: false,
        error: "Encryption secret not configured",
      }
    }

    // Check if token is expired
    if (integration.expires_at) {
      const expiresAt = new Date(integration.expires_at)
      const now = new Date()
      const timeUntilExpiry = expiresAt.getTime() - now.getTime()

      // If expires within 5 minutes, try to refresh
      if (timeUntilExpiry < 5 * 60 * 1000) {
        console.log(`🔄 Token expiring soon for ${integration.provider}, attempting refresh...`)

        if (integration.refresh_token) {
          try {
            // Decrypt refresh token if needed
            let refreshToken = integration.refresh_token;
            if (refreshToken.includes(":")) {
              try {
                refreshToken = decrypt(refreshToken, secret);
              } catch (decryptError) {
                console.error(`Failed to decrypt refresh token for ${integration.provider}:`, decryptError);
                // Continue with the original token if decryption fails
              }
            }
            
            const { TokenRefreshService } = await import("@/lib/integrations/tokenRefreshService")
            const refreshResult = await TokenRefreshService.refreshTokenForProvider(
              integration.provider,
              refreshToken,
              integration
            )

            if (refreshResult.success && refreshResult.accessToken) {
              console.log(`✅ Token refresh successful for ${integration.provider}`);
              return {
                success: true,
                token: refreshResult.accessToken,
              }
            } else if (refreshResult.needsReauthorization) {
              console.error(`❌ Token refresh failed for ${integration.provider} - reauthorization needed`);
              return {
                success: false,
                error: `${integration.provider} authentication expired. Please reconnect your account.`,
              }
            } else {
              console.error(`❌ Token refresh failed for ${integration.provider} - unknown error`);
              // Fall back to using the current token and hope it still works
            }
          } catch (refreshError) {
            console.error(`❌ Error during token refresh for ${integration.provider}:`, refreshError);
            // Fall back to using the current token and hope it still works
          }
        } else {
          console.warn(`⚠️ No refresh token available for ${integration.provider}`);
          // Continue with the current token
        }
      }
    }

    // Handle the current access token (may already be decrypted)
    if (!integration.access_token) {
      return {
        success: false,
        error: "No access token found",
      }
    }

    // Check if token is already decrypted (doesn't contain ":")
    console.log(`🔍 Checking if token is encrypted...`);
    console.log(`🔍 Token contains ":" : ${integration.access_token.includes(":")}`);
    console.log(`🔍 Token preview: ${integration.access_token.substring(0, 50)}...`);
    
    if (!integration.access_token.includes(":")) {
      // Token is already decrypted
      console.log(`🔍 Token appears to be already decrypted`);
      
      // But let's try to decrypt it anyway in case the encryption format is different
      try {
        console.log(`🔍 Trying decryption anyway to be sure...`);
        const decryptedToken = decrypt(integration.access_token, secret)
        console.log(`✅ Token was actually encrypted, decryption successful`);
        console.log(`🔍 Decrypted token preview: ${decryptedToken.substring(0, 50)}...`);
        return {
          success: true,
          token: decryptedToken,
        }
      } catch (fallbackDecryptError) {
        console.log(`🔍 Fallback decryption failed, using token as-is`);
        return {
          success: true,
          token: integration.access_token,
        }
      }
    }

    // Token is encrypted, decrypt it
    console.log(`🔍 Token appears to be encrypted, attempting decryption...`);
    try {
      const decryptedToken = decrypt(integration.access_token, secret)
      console.log(`✅ Token decryption successful`);
      console.log(`🔍 Decrypted token preview: ${decryptedToken.substring(0, 50)}...`);
      return {
        success: true,
        token: decryptedToken,
      }
    } catch (decryptError: any) {
      console.error(`Failed to decrypt token for ${integration.provider}:`, decryptError)
      
      // Special handling for OneNote/Microsoft tokens
      if (integration.provider === 'microsoft-onenote') {
        console.log('🔍 OneNote token decryption failed, attempting manual refresh...');
        
        // For OneNote, try to refresh the token manually using the approach from the test script
        if (integration.refresh_token) {
          try {
            let refreshToken = integration.refresh_token;
            if (refreshToken.includes(":")) {
              try {
                refreshToken = decrypt(refreshToken, secret);
              } catch (refreshDecryptError) {
                console.error('Failed to decrypt refresh token:', refreshDecryptError);
                // Try using the refresh token as-is
              }
            }
            
            console.log('🔄 Manually refreshing OneNote token...');
            const refreshResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                client_id: process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID!,
                client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
                scope: 'offline_access openid profile email User.Read Notes.ReadWrite.All',
                redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/microsoft-onenote/callback`,
              }),
            });
            
            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              console.log('✅ Manual token refresh successful for OneNote');
              return {
                success: true,
                token: refreshData.access_token,
              }
            } else {
              const errorData = await refreshResponse.json();
              console.error('❌ Manual token refresh failed:', errorData);
            }
          } catch (refreshError) {
            console.error('❌ Error during manual token refresh:', refreshError);
          }
        }
        
        // If manual refresh fails, try to test the token as-is
        try {
          const testResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: {
              'Authorization': `Bearer ${integration.access_token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (testResponse.ok) {
            console.log('⚠️ Token appears to be valid despite decryption failure - using as-is');
            return {
              success: true,
              token: integration.access_token,
            }
          } else {
            console.log('❌ Token test failed with status:', testResponse.status);
          }
        } catch (testError) {
          console.error('❌ Token test failed after decryption failure:', testError);
        }
      }
      
      return {
        success: false,
        error: `Token decryption failed: ${decryptError.message}`,
      }
    }
  } catch (error: any) {
    console.error(`Failed to validate/refresh token for ${integration.provider}:`, error)
    return {
      success: false,
      error: `Token validation failed: ${error.message}`,
    }
  }
}

// Helper function for retry logic
async function fetchWithRetry<T>(fetchFn: () => Promise<T>, maxRetries: number, initialDelay: number): Promise<T> {
  let lastError: any

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Request timeout")), 30000) // 30 seconds
      })

      return await Promise.race([fetchFn(), timeoutPromise])
    } catch (error: any) {
      lastError = error
      console.warn(`Attempt ${attempt}/${maxRetries} failed:`, error.message)

      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt - 1)
        console.log(`Retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

// Discord-specific rate limiting helper
async function fetchDiscordWithRateLimit<T>(
  fetchFn: () => Promise<Response>,
  maxRetries: number = 2,
  defaultWaitTime: number = 2000 // Reduced from 5000ms to 2000ms (2 seconds)
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchFn()
      
      if (response.ok) {
        return await response.json()
      }
      
      // Handle Discord rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After')
        const resetAfter = response.headers.get('X-RateLimit-Reset')
        
        // console.log(`Discord rate limit hit (attempt ${attempt}). Retry-After: ${retryAfter}, Reset-After: ${resetAfter}`)
        
        if (attempt < maxRetries) {
          // Calculate wait time
          let waitTime = defaultWaitTime // Use configurable default
          if (retryAfter) {
            waitTime = parseInt(retryAfter) * 1000
          } else if (resetAfter) {
            const resetTime = parseInt(resetAfter) * 1000
            const now = Date.now()
            waitTime = Math.max(resetTime - now, 1000)
          }
          
          // Cap wait time to prevent excessive delays
          waitTime = Math.min(waitTime, 10000) // Max 10 seconds
          
          // console.log(`Waiting ${waitTime}ms before retry ${attempt + 1}...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }
      }
      
      // For other errors, throw immediately
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Discord API error: ${response.status} - ${errorData.message || response.statusText}`)
      
    } catch (error: any) {
      if (attempt === maxRetries) {
        throw error
      }
      console.warn(`Discord API attempt ${attempt} failed:`, error.message)
    }
  }
  
  throw new Error('Discord API request failed after all retries')
}

// Fix data fetchers with better error handling
const dataFetchers: DataFetcher = {
  notion_pages: async (integration: any) => {
    try {
      // 1. Fetch workspace info
      const workspaceRes = await fetch("https://api.notion.com/v1/users/me", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Notion-Version": "2022-06-28",
        },
      })
      let workspace = { id: "default", name: "My Workspace" }
      if (workspaceRes.ok) {
        const wsData = await workspaceRes.json()
        workspace = { id: wsData.id || "default", name: wsData.name || "My Workspace" }
      }

      // 2. Fetch all top-level pages
      const pagesRes = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          filter: { property: "object", value: "page" },
          page_size: 100,
        }),
      })
      if (!pagesRes.ok) throw new Error("Failed to fetch Notion pages")
      const pagesData = await pagesRes.json()
      const topPages = pagesData.results || []

      // 3. For each page, fetch subpages (child_page blocks)
      async function fetchSubpages(pageId: string) {
        const childrenRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Notion-Version": "2022-06-28",
          },
        })
        if (!childrenRes.ok) return []
        const childrenData = await childrenRes.json()
        return (childrenData.results || [])
          .filter((block: any) => block.type === "child_page")
          .map((block: any) => ({
            id: block.id,
            title: block.child_page?.title || "Untitled",
            icon: block.child_page?.icon?.emoji || undefined,
            url: `https://notion.so/${block.id.replace(/-/g, "")}`,
          }))
      }

      // 4. Build the nested structure
      const resultPages = await Promise.all(topPages.map(async (page: any) => {
        const title = getPageTitle(page) || "Untitled"
        let icon = undefined
        if (page.icon && page.icon.type === "emoji") icon = page.icon.emoji
        const url = page.url
        const subpages = await fetchSubpages(page.id)
        return { id: page.id, title, icon, url, subpages }
      }))

      return [{ workspace, pages: resultPages }]
    } catch (error: any) {
      console.error("Error fetching Notion pages (hierarchical):", error)
      throw error
    }
  },

  notion_workspaces: async (integration: any) => {
    try {
      // Notion doesn't have a direct API for workspaces, but we can get user info
      // which includes workspace information
      const response = await fetch("https://api.notion.com/v1/users/me", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Notion authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Notion API error: ${response.status} - ${errorData.message || response.statusText}`)
      }

      const userData = await response.json()
      
      // For now, return a single workspace since Notion doesn't expose multiple workspaces via API
      // In the future, this could be enhanced to support multiple workspaces if Notion adds that API
      return [{
        id: "default",
        name: "My Workspace",
        value: "default",
        description: "Default Notion workspace",
        user_id: userData.id,
        user_name: userData.name,
      }]
    } catch (error: any) {
      console.error("Error fetching Notion workspaces:", error)
      throw error
    }
  },

  notion_templates: async (integration: any) => {
    try {
      // Search for all pages and filter for templates on the client side
      // Notion API doesn't support filtering by title content in search
      const response = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          filter: { property: "object", value: "page" },
          page_size: 100,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Notion authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Notion API error: ${response.status} - ${errorData.message || response.statusText}`)
      }

      const data = await response.json()
      
      // Filter pages that contain "template" in their title (case insensitive)
      const templatePages = (data.results || []).filter((page: any) => {
        const title = getPageTitle(page).toLowerCase()
        return title.includes('template')
      })
      
      return templatePages.map((template: any) => ({
        id: template.id,
        name: getPageTitle(template),
        value: template.id,
        url: template.url,
        created_time: template.created_time,
        last_edited_time: template.last_edited_time,
      }))
    } catch (error: any) {
      console.error("Error fetching Notion templates:", error)
      throw error
    }
  },

  notion_databases: async (integration: any) => {
    try {
      const response = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          filter: { property: "object", value: "database" },
          page_size: 100,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Notion authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Notion API error: ${response.status} - ${errorData.message || response.statusText}`)
      }

      const data = await response.json()
      return (data.results || []).map((db: any) => ({
        id: db.id,
        name: getDatabaseTitle(db),
        value: db.id,
        url: db.url,
        created_time: db.created_time,
        last_edited_time: db.last_edited_time,
      }))
    } catch (error: any) {
      console.error("Error fetching Notion databases:", error)
      throw error
    }
  },

  notion_users: async (integration: any) => {
    try {
      // Notion API doesn't provide a direct way to get all users in a workspace
      // We'll return a list of common assignee options that users can customize
      return [
        { id: "me", name: "Me", value: "me", description: "Current user" },
        { id: "unassigned", name: "Unassigned", value: "unassigned", description: "No assignee" },
        { id: "team", name: "Team", value: "team", description: "Team members" },
        { id: "anyone", name: "Anyone", value: "anyone", description: "Any workspace member" }
      ]
    } catch (error: any) {
      console.error("Error fetching Notion users:", error)
      throw error
    }
  },

  slack_channels: async (integration: any) => {
    try {
      const response = await fetch(
        "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=1000",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      if (!data.ok) {
        if (data.error === "invalid_auth" || data.error === "token_revoked") {
          throw new Error("Slack authentication expired. Please reconnect your account.")
        }
        throw new Error(`Slack API error: ${data.error}`)
      }

      return (data.channels || [])
        .filter((channel: any) => !channel.is_archived)
        .map((channel: any) => ({
          id: channel.id,
          name: `#${channel.name}`,
          value: channel.id,
          is_private: channel.is_private,
          member_count: channel.num_members,
        }))
    } catch (error: any) {
      console.error("Error fetching Slack channels:", error)
      throw error
    }
  },



  "google-sheets_spreadsheets": async (integration: any) => {
    try {
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&pageSize=100&fields=files(id,name,createdTime,modifiedTime)",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Google Sheets authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Google Drive API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
        )
      }

      const data = await response.json()
      return (data.files || []).map((file: any) => ({
        id: file.id,
        name: file.name,
        value: file.id,
        created_time: file.createdTime,
        modified_time: file.modifiedTime,
      }))
    } catch (error: any) {
      console.error("Error fetching Google Sheets:", error)
      throw error
    }
  },

  "google-sheets_sheets": async (integration: any, options: any) => {
    try {
      const { spreadsheetId } = options || {}
      
      if (!spreadsheetId) {
        throw new Error("Spreadsheet ID is required to fetch sheets")
      }

      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Google Sheets authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Google Sheets API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
        )
      }

      const data = await response.json()
      return (data.sheets || []).map((sheet: any) => ({
        id: sheet.properties.sheetId,
        name: sheet.properties.title,
        value: sheet.properties.title,
        index: sheet.properties.index,
        grid_properties: sheet.properties.gridProperties,
      }))
    } catch (error: any) {
      console.error("Error fetching Google Sheets sheets:", error)
      throw error
    }
  },

  "google-sheets_sheet-preview": async (integration: any, options: any) => {
    try {
      const { spreadsheetId, sheetName } = options || {}
      
      if (!spreadsheetId || !sheetName) {
        throw new Error("Spreadsheet ID and sheet name are required to fetch sheet preview")
      }

      // Get the first 10 rows to show structure and sample data
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:10?majorDimension=ROWS`,
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Google Sheets authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Google Sheets API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
        )
      }

      const data = await response.json()
      const rows = data.values || []
      
      // Extract headers (first row) and sample data
      const headers = rows.length > 0 ? rows[0] : []
      const sampleData = rows.slice(1, 6) // Get up to 5 sample rows
      
      return [{
        headers: headers.map((header: string, index: number) => ({
          column: String.fromCharCode(65 + index), // A, B, C, etc.
          name: header || `Column ${index + 1}`,
          index: index,
        })),
        sampleData: sampleData,
        totalRows: rows.length,
        hasHeaders: headers.length > 0 && headers.some((h: string) => h && h.trim() !== ''),
      }]
    } catch (error: any) {
      console.error("Error fetching Google Sheets sheet preview:", error)
      throw error
    }
  },

  "google-sheets_sheet-data": async (integration: any, options: any) => {
    try {
      const { spreadsheetId, sheetName } = options || {}
      
      if (!spreadsheetId || !sheetName) {
        throw new Error("Spreadsheet ID and sheet name are required to fetch sheet data")
      }

      // Get all rows from the sheet (limit to first 1000 rows for performance)
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1000?majorDimension=ROWS`,
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Google Sheets authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Google Sheets API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
        )
      }

      const data = await response.json()
      const rows = data.values || []
      
      if (rows.length === 0) {
        return [{ headers: [], data: [], totalRows: 0 }]
      }

      // Extract headers (first row) and data rows
      const headers = rows[0] || []
      const dataRows = rows.slice(1)
      
      return [{
        headers: headers.map((header: string, index: number) => ({
          column: String.fromCharCode(65 + index), // A, B, C, etc.
          name: header || `Column ${index + 1}`,
          index: index,
        })),
        data: dataRows.map((row: any[], index: number) => ({
          rowIndex: index + 2, // +2 because we skip header row and convert to 1-based indexing
          values: row,
          // Add a preview of the row for easy identification
          preview: row.slice(0, 3).join(" • ") || `Row ${index + 2}`
        })),
        totalRows: dataRows.length,
      }]
    } catch (error: any) {
      console.error("Error fetching Google Sheets sheet data:", error)
      throw error
    }
  },

  "google-calendars": async (integration: any) => {
    try {
      const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Google Calendar authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Google Calendar API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
        )
      }

      const data = await response.json()
      return (data.items || []).map((calendar: any) => ({
        id: calendar.id,
        name: calendar.summary,
        value: calendar.id,
        description: calendar.description,
        primary: calendar.primary,
        access_role: calendar.accessRole,
      }))
    } catch (error: any) {
      console.error("Error fetching Google Calendar calendars:", error)
      throw error
    }
  },

  gmail_labels: async (integration: any) => {
    try {
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Gmail authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Gmail API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }

      const data = await response.json()
      return (data.labels || [])
        .filter(
          (label: any) =>
            label.type === "user" ||
            ["INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "IMPORTANT", "STARRED"].includes(label.id),
        )
        .map((label: any) => ({
          id: label.id,
          name: label.name,
          value: label.id,
          type: label.type,
          messages_total: label.messagesTotal,
          messages_unread: label.messagesUnread,
        }))
    } catch (error: any) {
      console.error("Error fetching Gmail labels:", error)
      throw error
    }
  },

  gmail_messages: async (integration: any) => {
    try {
      // Fetch all labels
      const labelsResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })
      if (!labelsResponse.ok) throw new Error("Failed to fetch Gmail labels")
      const labelsData = await labelsResponse.json()
      const labels = labelsData.labels || []

      // Helper to fetch up to 100 emails for a label
      const fetchEmailsForLabel = async (labelId: string) => {
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&labelIds=${labelId}`
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        })
        if (!response.ok) return []
        const data = await response.json()
        const messages = data.messages || []
        // Fetch details for each message
        const detailedMessages = await Promise.all(
          messages.slice(0, 100).map(async (message: any) => {
            try {
              const detailResponse = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
                {
                  headers: {
                    Authorization: `Bearer ${integration.access_token}`,
                    "Content-Type": "application/json",
                  },
                }
              )
              if (detailResponse.ok) {
                const detailData = await detailResponse.json()
                const headers = detailData.payload?.headers || []
                const subject = headers.find((h: any) => h.name === "Subject")?.value || "No Subject"
                const from = headers.find((h: any) => h.name === "From")?.value || "Unknown Sender"
                const date = headers.find((h: any) => h.name === "Date")?.value || ""
                return {
                  id: message.id,
                  value: message.id,
                  label: subject,
                  description: `From: ${from}${date ? ` • ${new Date(date).toLocaleDateString()}` : ""}`,
                  subject,
                  from,
                  date,
                  snippet: detailData.snippet || "",
                  labelIds: detailData.labelIds || [],
                }
              }
              return null
            } catch (error) {
              return null
            }
          })
        )
        return detailedMessages.filter(Boolean)
      }

      // Fetch most recent 100 emails from all folders
      const allMailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })
      const allMailData = await allMailResponse.json()
      const allMailMessages = allMailData.messages || []
      const allMailDetailed = await Promise.all(
        allMailMessages.slice(0, 100).map(async (message: any) => {
          try {
            const detailResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
              {
                headers: {
                  Authorization: `Bearer ${integration.access_token}`,
                  "Content-Type": "application/json",
                },
              }
            )
            if (detailResponse.ok) {
              const detailData = await detailResponse.json()
              const headers = detailData.payload?.headers || []
              const subject = headers.find((h: any) => h.name === "Subject")?.value || "No Subject"
              const from = headers.find((h: any) => h.name === "From")?.value || "Unknown Sender"
              const date = headers.find((h: any) => h.name === "Date")?.value || ""
              return {
                id: message.id,
                value: message.id,
                label: subject,
                description: `From: ${from}${date ? ` • ${new Date(date).toLocaleDateString()}` : ""}`,
                subject,
                from,
                date,
                snippet: detailData.snippet || "",
                labelIds: detailData.labelIds || [],
              }
            }
            return null
          } catch (error) {
            return null
          }
        })
      )

      // For each label, fetch up to 100 recent emails
      const labelGroups = await Promise.all(
        labels.map(async (label: any) => {
          try {
            const emails = await fetchEmailsForLabel(label.id)
            return {
              labelId: label.id,
              labelName: label.name,
              emails,
            }
          } catch (error) {
            console.warn(`Failed to fetch emails for label ${label.name}:`, error)
            // Return empty group instead of failing completely
            return {
              labelId: label.id,
              labelName: label.name,
              emails: [],
            }
          }
        })
      )

      // Add the 'All Mail' group at the top
      return [
        {
          labelId: "ALL",
          labelName: "All Mail",
          emails: allMailDetailed.filter(Boolean),
        },
        ...labelGroups,
      ]
    } catch (error: any) {
      console.error("Error fetching Gmail messages:", error)
      throw error
    }
  },

  gmail_recent_senders: async (integration: any) => {
    try {
      // Fetch 100 most recent from INBOX
      const inboxResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&labelIds=INBOX", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })
      const inboxData = await inboxResponse.json()
      const inboxMessages = inboxData.messages || []

      // Fetch 100 most recent from SENT
      const sentResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&labelIds=SENT", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })
      const sentData = await sentResponse.json()
      const sentMessages = sentData.messages || []

      // Extract unique senders from INBOX and recipients from SENT
      const addressMap = new Map<string, { email: string; name: string; count: number; type: string }>()

      // Helper to add or update address in the map
      const addAddress = (email: string, name: string, type: string) => {
        if (!email) return
        if (addressMap.has(email)) {
          addressMap.get(email)!.count++
        } else {
          addressMap.set(email, { email, name, count: 1, type })
        }
      }

      // Process INBOX (senders)
      await Promise.all(
        inboxMessages.slice(0, 100).map(async (message: any) => {
          try {
            const detailResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=From`,
              {
                headers: {
                  Authorization: `Bearer ${integration.access_token}`,
                  "Content-Type": "application/json",
                },
              }
            )
            if (detailResponse.ok) {
              const detailData = await detailResponse.json()
              const headers = detailData.payload?.headers || []
              const fromHeader = headers.find((h: any) => h.name === "From")?.value || ""
              const emailMatch = fromHeader.match(/<(.+?)>/) || fromHeader.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
              const nameMatch = fromHeader.match(/^(.+?)\s*</)
              if (emailMatch) {
                const email = emailMatch[1]
                const name = nameMatch ? nameMatch[1].trim() : email
                addAddress(email, name, "sender")
              }
            }
          } catch {}
        })
      )

      // Process SENT (recipients)
      await Promise.all(
        sentMessages.slice(0, 100).map(async (message: any) => {
          try {
            const detailResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=To`,
              {
                headers: {
                  Authorization: `Bearer ${integration.access_token}`,
                  "Content-Type": "application/json",
                },
              }
            )
            if (detailResponse.ok) {
              const detailData = await detailResponse.json()
              const headers = detailData.payload?.headers || []
              const toHeader = headers.find((h: any) => h.name === "To")?.value || ""
              // Split multiple recipients
              const addresses = toHeader.split(/,|;/).map((addr: string) => addr.trim()).filter(Boolean)
              for (const addr of addresses as string[]) {
                const emailMatch = addr.match(/<(.+?)>/) || addr.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
                const nameMatch = addr.match(/^(.+?)\s*</)
                if (emailMatch) {
                  const email = emailMatch[1]
                  const name = nameMatch ? nameMatch[1].trim() : email
                  addAddress(email, name, "recipient")
                }
              }
            }
          } catch {}
        })
      )

      // Convert to array and sort by frequency
      const addresses = Array.from(addressMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 100)
        .map((addr, index) => ({
          value: addr.email,
          label: addr.name,
          description: `${addr.email} (${addr.count} emails, ${addr.type})`,
          email: addr.email,
          name: addr.name,
          count: addr.count,
          type: addr.type
        }))

      return addresses
    } catch (error: any) {
      console.error("Error fetching Gmail recent senders/recipients:", error)
      throw error
    }
  },

  "gmail-recent-recipients": async (integration: any) => {
    try {
      // Validate integration has access token
      if (!integration.access_token) {
        throw new Error("Gmail authentication required. Please reconnect your account.")
      }

      // Get recent sent messages (last 100)
      const messagesResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=SENT&maxResults=100`,
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        }
      )

      if (!messagesResponse.ok) {
        if (messagesResponse.status === 401) {
          throw new Error("Gmail authentication expired. Please reconnect your account.")
        }
        const errorText = await messagesResponse.text().catch(() => "Unknown error")
        throw new Error(`Gmail API error: ${messagesResponse.status} - ${errorText}`)
      }

      const messagesData = await messagesResponse.json()
      const messages = messagesData.messages || []

      if (messages.length === 0) {
        return []
      }

      // Get detailed information for each message
      const messageDetails = await Promise.all(
        messages.slice(0, 50).map(async (message: { id: string }) => {
          try {
            const response = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc`,
              {
                headers: {
                  Authorization: `Bearer ${integration.access_token}`,
                  "Content-Type": "application/json",
                },
              }
            )

            if (!response.ok) return null
            
            const data = await response.json()
            return data.payload?.headers || []
          } catch (error) {
            console.warn(`Failed to fetch message ${message.id}:`, error)
            return null
          }
        })
      )

      // Extract unique email addresses from To, Cc, Bcc headers
      const emailSet = new Set<string>()
      const emailData: { email: string; name?: string; frequency: number }[] = []

      messageDetails.forEach((headers) => {
        if (!headers || !Array.isArray(headers)) return
        
        headers.forEach((header: { name: string; value: string }) => {
          try {
            if (['To', 'Cc', 'Bcc'].includes(header.name) && header.value && typeof header.value === 'string') {
              const emailAddresses = extractEmailAddresses(header.value)
              emailAddresses.forEach(({ email, name }) => {
                if (email && !emailSet.has(email.toLowerCase())) {
                  emailSet.add(email.toLowerCase())
                  emailData.push({ email, name, frequency: 1 })
                } else if (email) {
                  // Increment frequency for recurring emails
                  const existing = emailData.find(e => e.email.toLowerCase() === email.toLowerCase())
                  if (existing) existing.frequency++
                }
              })
            }
          } catch (error) {
            console.warn(`Failed to process header ${header.name}:`, error)
          }
        })
      })

      // Sort by frequency (most used first) and return formatted results
      return emailData
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 20) // Return top 20 recent recipients
        .map(({ email, name }) => ({
          value: email,
          label: name ? `${name} <${email}>` : email,
          email,
          name
        }))

    } catch (error: any) {
      console.error("Failed to get Gmail recent recipients:", error)
      throw new Error(`Failed to get Gmail recent recipients: ${error.message}`)
    }
  },

  "gmail-enhanced-recipients": async (integration: any) => {
    try {
      // Fetch recent emails to extract unique recipients (both senders and recipients)
      const inboxResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&labelIds=INBOX", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })
      const inboxData = await inboxResponse.json()
      const inboxMessages = inboxData.messages || []

      const sentResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&labelIds=SENT", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })
      const sentData = await sentResponse.json()
      const sentMessages = sentData.messages || []

      // Extract unique addresses from both INBOX and SENT
      const addressMap = new Map<string, { email: string; name: string; count: number; type: string }>()

      const addAddress = (email: string, name: string, type: string) => {
        if (!email) return
        if (addressMap.has(email)) {
          addressMap.get(email)!.count++
        } else {
          addressMap.set(email, { email, name, count: 1, type })
        }
      }

      // Process INBOX (senders)
      await Promise.all(
        inboxMessages.slice(0, 100).map(async (message: any) => {
          try {
            const detailResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=From`,
              {
                headers: {
                  Authorization: `Bearer ${integration.access_token}`,
                  "Content-Type": "application/json",
                },
              }
            )
            if (detailResponse.ok) {
              const detailData = await detailResponse.json()
              const headers = detailData.payload?.headers || []
              const fromHeader = headers.find((h: any) => h.name === "From")?.value || ""
              const emailMatch = fromHeader.match(/<(.+?)>/) || fromHeader.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
              const nameMatch = fromHeader.match(/^(.+?)\s*</)
              if (emailMatch) {
                const email = emailMatch[1]
                const name = nameMatch ? nameMatch[1].trim() : email
                addAddress(email, name, "sender")
              }
            }
          } catch {}
        })
      )

      // Process SENT (recipients)
      await Promise.all(
        sentMessages.slice(0, 100).map(async (message: any) => {
          try {
            const detailResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=To`,
              {
                headers: {
                  Authorization: `Bearer ${integration.access_token}`,
                  "Content-Type": "application/json",
                },
              }
            )
            if (detailResponse.ok) {
              const detailData = await detailResponse.json()
              const headers = detailData.payload?.headers || []
              const toHeader = headers.find((h: any) => h.name === "To")?.value || ""
              const addresses = toHeader.split(/,|;/).map((addr: string) => addr.trim()).filter(Boolean)
              for (const addr of addresses as string[]) {
                const emailMatch = addr.match(/<(.+?)>/) || addr.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
                const nameMatch = addr.match(/^(.+?)\s*</)
                if (emailMatch) {
                  const email = emailMatch[1]
                  const name = nameMatch ? nameMatch[1].trim() : email
                  addAddress(email, name, "recipient")
                }
              }
            }
          } catch {}
        })
      )

      // Convert to array and sort by frequency
      const addresses = Array.from(addressMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 100)
        .map((addr) => ({
          value: addr.email,
          label: addr.name,
          type: addr.type,
          description: `${addr.email} (${addr.count} emails)`
        }))

      return addresses
    } catch (error: any) {
      console.error("Error fetching Gmail enhanced recipients:", error)
      throw error
    }
  },

  "outlook-enhanced-recipients": async (integration: any) => {
    try {
      console.log("🔍 Starting Outlook enhanced recipients fetch...")
      
      // First, try to get contacts as a fallback
      const contactsResponse = await fetch("https://graph.microsoft.com/v1.0/me/contacts?$top=100&$select=id,displayName,emailAddresses", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })
      
      const contacts: Array<{ value: string; label: string; type: string; description: string }> = []
      if (contactsResponse.ok) {
        const contactsData = await contactsResponse.json()
        contactsData.value?.forEach((contact: any) => {
          if (contact.emailAddresses && contact.emailAddresses.length > 0) {
            contact.emailAddresses.forEach((email: any) => {
              if (email.address && isValidEmail(email.address)) {
                contacts.push({
                  value: email.address,
                  label: contact.displayName || email.address,
                  type: "contact",
                  description: `${email.address} (contact)`
                })
              }
            })
          }
        })
      }

      // Try to fetch recent emails
      const inboxResponse = await fetch("https://graph.microsoft.com/v1.0/me/messages?$top=50&$orderby=receivedDateTime desc&$select=id,from,toRecipients,ccRecipients,bccRecipients", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })
      
      const addressMap = new Map<string, { email: string; name: string; count: number; type: string }>()

      const addAddress = (email: string, name: string, type: string) => {
        if (!email || !isValidEmail(email)) return
        if (addressMap.has(email)) {
          addressMap.get(email)!.count++
        } else {
          addressMap.set(email, { email, name, count: 1, type })
        }
      }

      if (inboxResponse.ok) {
        const inboxData = await inboxResponse.json()
        console.log(`📧 Found ${inboxData.value?.length || 0} inbox messages`)
        
        inboxData.value?.forEach((message: any) => {
          if (message.from?.emailAddress) {
            const email = message.from.emailAddress.address
            const name = message.from.emailAddress.name || email
            addAddress(email, name, "sender")
          }
        })
      } else {
        console.log(`⚠️ Inbox fetch failed: ${inboxResponse.status}`)
      }

      // Try to fetch sent emails
      const sentResponse = await fetch("https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$top=50&$orderby=receivedDateTime desc&$select=id,from,toRecipients,ccRecipients,bccRecipients", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })
      
      if (sentResponse.ok) {
        const sentData = await sentResponse.json()
        console.log(`📤 Found ${sentData.value?.length || 0} sent messages`)
        
        sentData.value?.forEach((message: any) => {
          // Process To recipients
          if (message.toRecipients) {
            message.toRecipients.forEach((recipient: any) => {
              if (recipient.emailAddress) {
                const email = recipient.emailAddress.address
                const name = recipient.emailAddress.name || email
                addAddress(email, name, "recipient")
              }
            })
          }
          
          // Process CC recipients
          if (message.ccRecipients) {
            message.ccRecipients.forEach((recipient: any) => {
              if (recipient.emailAddress) {
                const email = recipient.emailAddress.address
                const name = recipient.emailAddress.name || email
                addAddress(email, name, "cc")
              }
            })
          }
          
          // Process BCC recipients
          if (message.bccRecipients) {
            message.bccRecipients.forEach((recipient: any) => {
              if (recipient.emailAddress) {
                const email = recipient.emailAddress.address
                const name = recipient.emailAddress.name || email
                addAddress(email, name, "bcc")
              }
            })
          }
        })
      } else {
        console.log(`⚠️ Sent items fetch failed: ${sentResponse.status}`)
      }

      // Convert to array and sort by frequency
      const addresses = Array.from(addressMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 50)
        .map((addr) => ({
          value: addr.email,
          label: addr.name,
          type: addr.type,
          description: `${addr.email} (${addr.count} emails)`
        }))

      // Combine with contacts and remove duplicates
      const allAddresses = [...contacts, ...addresses]
      const uniqueAddresses = allAddresses.filter((addr, index, self) => 
        index === self.findIndex(a => a.value === addr.value)
      )

      console.log(`✅ Returning ${uniqueAddresses.length} enhanced recipients (${contacts.length} contacts + ${addresses.length} email addresses)`)
      return uniqueAddresses
    } catch (error: any) {
      console.error("Error fetching Outlook enhanced recipients:", error)
      return []
    }
  },

  "hubspot_companies": async (integration: any) => {
    try {
      const response = await fetch(
        "https://api.hubapi.com/crm/v3/objects/companies?limit=100",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("HubSpot authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`HubSpot API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
      const data = await response.json()
      return data.results?.map((company: any) => ({
        value: company.id,
        label: company.properties.name || "Unnamed Company",
        description: company.properties.domain,
      })) || []
    } catch (error: any) {
      console.error("Error fetching HubSpot companies:", error)
      throw error
    }
  },

  "hubspot_contacts": async (integration: any) => {
    try {
      const response = await fetch(
        "https://api.hubapi.com/crm/v3/objects/contacts?limit=100",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("HubSpot authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`HubSpot API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
      const data = await response.json()
      return data.results?.map((contact: any) => ({
        value: contact.id,
        label: `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim() || contact.properties.email || "Unnamed Contact",
        description: contact.properties.email,
      })) || []
    } catch (error: any) {
      console.error("Error fetching HubSpot contacts:", error)
      throw error
    }
  },

  "hubspot_deals": async (integration: any) => {
    try {
      const response = await fetch(
        "https://api.hubapi.com/crm/v3/objects/deals?limit=100",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("HubSpot authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`HubSpot API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
      const data = await response.json()
      return data.results?.map((deal: any) => ({
        value: deal.id,
        label: deal.properties.dealname || "Unnamed Deal",
        description: `$${deal.properties.amount || 0}`,
      })) || []
    } catch (error: any) {
      console.error("Error fetching HubSpot deals:", error)
      throw error
    }
  },

  "hubspot_lists": async (integration: any) => {
    try {
      const response = await fetch(
        "https://api.hubapi.com/contacts/v1/lists?count=100",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("HubSpot authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`HubSpot API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
      const data = await response.json()
      return data.lists?.map((list: any) => ({
        value: list.listId.toString(),
        label: list.name,
        description: `${list.metaData.size || 0} contacts`,
      })) || []
    } catch (error: any) {
      console.error("Error fetching HubSpot lists:", error)
      throw error
    }
  },

  "hubspot_pipelines": async (integration: any) => {
    try {
      const response = await fetch(
        "https://api.hubapi.com/crm/v3/pipelines/deals",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("HubSpot authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`HubSpot API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
      const data = await response.json()
      return data.results?.map((pipeline: any) => ({
        value: pipeline.id,
        label: pipeline.label,
        description: `${pipeline.stages?.length || 0} stages`,
        stages: pipeline.stages,
      })) || []
    } catch (error: any) {
      console.error("Error fetching HubSpot pipelines:", error)
      throw error
    }
  },

  "hubspot_deal_stages": async (integration: any, options?: { pipeline?: string }) => {
    try {
      if (!options?.pipeline) {
        // If no pipeline is selected, return empty array
        return []
      }

      const response = await fetch(
        "https://api.hubapi.com/crm/v3/pipelines/deals",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("HubSpot authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`HubSpot API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
      const data = await response.json()
      
      // Find the selected pipeline
      const selectedPipeline = data.results?.find((pipeline: any) => pipeline.id === options.pipeline)
      if (!selectedPipeline) {
        return []
      }

      return selectedPipeline.stages?.map((stage: any) => ({
        value: stage.id,
        label: stage.label,
        description: stage.probability ? `${stage.probability}% probability` : undefined,
      })) || []
    } catch (error: any) {
      console.error("Error fetching HubSpot deal stages:", error)
      throw error
    }
  },

  "hubspot_job_titles": async (integration: any) => {
    try {
      // Fetch contacts to get unique job titles
      const response = await fetch(
        "https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=jobtitle",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("HubSpot authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`HubSpot API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
      const data = await response.json()
      
      // Extract unique job titles
      const jobTitles = new Set<string>()
      data.results?.forEach((contact: any) => {
        if (contact.properties.jobtitle) {
          jobTitles.add(contact.properties.jobtitle)
        }
      })

      return Array.from(jobTitles).map((jobTitle) => ({
        value: jobTitle,
        label: jobTitle,
      }))
    } catch (error: any) {
      console.error("Error fetching HubSpot job titles:", error)
      throw error
    }
  },

  "hubspot_departments": async (integration: any) => {
    try {
      // Fetch contacts to get unique departments
      const response = await fetch(
        "https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=department",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("HubSpot authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`HubSpot API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
      const data = await response.json()
      
      // Extract unique departments
      const departments = new Set<string>()
      data.results?.forEach((contact: any) => {
        if (contact.properties.department) {
          departments.add(contact.properties.department)
        }
      })

      return Array.from(departments).map((department) => ({
        value: department,
        label: department,
      }))
    } catch (error: any) {
      console.error("Error fetching HubSpot departments:", error)
      throw error
    }
  },

  "hubspot_industries": async (integration: any) => {
    try {
      // Fetch companies to get unique industries
      const response = await fetch(
        "https://api.hubapi.com/crm/v3/objects/companies?limit=100&properties=industry",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("HubSpot authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`HubSpot API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
      const data = await response.json()
      
      // Extract unique industries
      const industries = new Set<string>()
      data.results?.forEach((company: any) => {
        if (company.properties.industry) {
          industries.add(company.properties.industry)
        }
      })

      return Array.from(industries).map((industry) => ({
        value: industry,
        label: industry,
      }))
    } catch (error: any) {
      console.error("Error fetching HubSpot industries:", error)
      throw error
    }
  },

  "hubspot_contact_properties": async (integration: any) => {
    try {
      const response = await fetch(
        "https://api.hubapi.com/crm/v3/properties/contacts",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        }
      )

      if (response.status === 401) {
        throw new Error("HubSpot authentication expired. Please reconnect your account.")
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`HubSpot API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }

      const data = await response.json()
      
      // Filter properties to get form fields that are writable
      const availableProperties = data.results
        .filter((prop: any) => 
          prop.formField === true && 
          prop.hidden !== true && 
          !prop.readOnly && 
          !prop.calculated
        )
        .map((prop: any) => ({
          value: prop.name,
          label: prop.label,
          description: prop.description || `${prop.type} field`,
          type: prop.type,
          fieldType: prop.fieldType,
          groupName: prop.groupName
        }))
        .sort((a: any, b: any) => a.label.localeCompare(b.label))

      return availableProperties
    } catch (error: any) {
      console.error("Error fetching HubSpot contact properties:", error)
      throw error
    }
  },
  "airtable_bases": async (integration: any) => {
    try {
      const response = await fetchAirtableWithRetry(
        "https://api.airtable.com/v0/meta/bases",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        }
      )
      
      const data = await response.json()
      
      const bases = data.bases || []

      
      return bases.map((base: any) => ({
        value: base.id,
        label: base.name,
        description: base.description || "Airtable base"
      }))
    } catch (error: any) {
      console.error("Error fetching Airtable bases:", error)
      throw error
    }
  },

  "airtable_tables": async (integration: any, options?: { baseId?: string }) => {
    try {
      if (!options?.baseId) {
        return []
      }
      
      const response = await fetchAirtableWithRetry(
        `https://api.airtable.com/v0/meta/bases/${options.baseId}/tables`,
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        }
      )
      
      const data = await response.json()
      return data.tables?.map((table: any) => ({
        value: table.name,
        label: table.name,
        description: `${table.fields?.length || 0} fields`,
        fields: table.fields,
      })) || []
    } catch (error: any) {
      console.error("Error fetching Airtable tables:", error)
      throw error
    }
  },

  "airtable_records": async (integration: any, options?: { baseId?: string; tableName?: string; maxRecords?: number }) => {
    try {
      if (!options?.baseId || !options?.tableName) {
        return []
      }
      
      const maxRecords = options.maxRecords || 100
      const response = await fetchAirtableWithRetry(
        `https://api.airtable.com/v0/${options.baseId}/${encodeURIComponent(options.tableName)}?maxRecords=${maxRecords}`,
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        }
      )
      
      const data = await response.json()
      return data.records?.map((record: any) => {
        // Try to find a good display field (Name, Title, or first text field)
        const fields = record.fields || {}
        let label = record.id // fallback to record ID
        
        // Look for common name fields
        if (fields.Name) label = fields.Name
        else if (fields.Title) label = fields.Title
        else if (fields.Subject) label = fields.Subject
        else if (fields.Description) label = fields.Description
        else {
          // Find first text field
          const firstTextField = Object.entries(fields).find(([key, value]) => 
            typeof value === 'string' && value.length > 0
          )
          if (firstTextField) label = firstTextField[1] as string
        }
        
        return {
          value: record.id,
          label: label,
          description: `Record from ${options.tableName}`,
          fields: fields,
        }
      }) || []
    } catch (error: any) {
      console.error("Error fetching Airtable records:", error)
      throw error
    }
  },

  "airtable_feedback_records": async (integration: any, options?: { baseId?: string }) => {
    try {
      if (!options?.baseId) {
        return []
      }
      
      // First, get all tables to find the feedback table
      const tablesResponse = await fetchAirtableWithRetry(
        `https://api.airtable.com/v0/meta/bases/${options.baseId}/tables`,
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        }
      )
      
      const tablesData = await tablesResponse.json()
      const tables = tablesData.tables || []
      
      console.log(`🔍 Available tables in base ${options.baseId}:`, tables.map((t: any) => t.name))
      
      // Look for feedback-related tables
      const feedbackTable = tables.find((table: any) => 
        table.name.toLowerCase().includes('feedback') || 
        table.name.toLowerCase().includes('support') ||
        table.name.toLowerCase().includes('customer')
      )
      
      if (!feedbackTable) {
        console.log("No feedback table found in base")
        return []
      }
      
      // Pagination logic to fetch all records with proper rate limiting
      let allRecords: any[] = []
      let offset: string | undefined = undefined
      
      do {
        const url = new URL(`https://api.airtable.com/v0/${options.baseId}/${encodeURIComponent(feedbackTable.name)}`)
        url.searchParams.set('pageSize', '100')
        if (offset) {
          url.searchParams.set('offset', offset)
        }
        
        const response = await fetchAirtableWithRetry(url.toString(), {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        })
        
        const data = await response.json()
        allRecords = allRecords.concat(data.records || [])
        offset = data.offset
        
        console.log(`📄 Fetched ${data.records?.length || 0} feedback records (total: ${allRecords.length})`)
        
        // Add delay between paginated requests to respect rate limits
        if (offset) {
          await delayBetweenRequests(1500)
        }
        
      } while (offset)
      
      return allRecords.map((record: any) => {
        const fields = record.fields || {}
        let label = record.id
        
        // Look for feedback-specific fields
        if (fields.Title) label = fields.Title
        else if (fields.Subject) label = fields.Subject
        else if (fields.Feedback) label = fields.Feedback
        else if (fields.Name) label = fields.Name
        else if (fields.Description) label = fields.Description
        
        return {
          value: record.id,
          label: label,
          description: `Feedback record from ${feedbackTable.name}`,
          fields: fields,
        }
      })
    } catch (error: any) {
      console.error("Error fetching Airtable feedback records:", error)
      // Return empty array instead of throwing to prevent breaking the UI
      return []
    }
  },

  "airtable_task_records": async (integration: any, options?: { baseId?: string }) => {
    try {
      if (!options?.baseId) {
        return []
      }
      
      // First, get all tables to find the tasks table
      const tablesResponse = await fetchAirtableWithRetry(
        `https://api.airtable.com/v0/meta/bases/${options.baseId}/tables`,
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        }
      )
      
      const tablesData = await tablesResponse.json()
      const tables = tablesData.tables || []
      
      console.log(`🔍 Available tables in base ${options.baseId}:`, tables.map((t: any) => t.name))
      
      // Look for task-related tables
      const taskTable = tables.find((table: any) => 
        table.name.toLowerCase().includes('task') || 
        table.name.toLowerCase().includes('todo') ||
        table.name.toLowerCase().includes('action') ||
        table.name.toLowerCase().includes('work')
      )
      
      if (!taskTable) {
        console.log("No task table found in base")
        return []
      }
      
      // Pagination logic to fetch all records with proper rate limiting
      let allRecords: any[] = []
      let offset: string | undefined = undefined
      
      do {
        const url = new URL(`https://api.airtable.com/v0/${options.baseId}/${encodeURIComponent(taskTable.name)}`)
        url.searchParams.set('pageSize', '100')
        if (offset) {
          url.searchParams.set('offset', offset)
        }
        
        const response = await fetchAirtableWithRetry(url.toString(), {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        })
        
        const data = await response.json()
        allRecords = allRecords.concat(data.records || [])
        offset = data.offset
        
        console.log(`📄 Fetched ${data.records?.length || 0} task records (total: ${allRecords.length})`)
        
        // Add delay between paginated requests to respect rate limits
        if (offset) {
          await delayBetweenRequests(1500)
        }
        
      } while (offset)
      
      return allRecords.map((record: any) => {
        const fields = record.fields || {}
        let label = record.id
        
        // Look for task-specific fields
        if (fields.Task) label = fields.Task
        else if (fields.Name) label = fields.Name
        else if (fields.Title) label = fields.Title
        else if (fields.Description) label = fields.Description
        else if (fields.Subject) label = fields.Subject
        
        return {
          value: record.id,
          label: label,
          description: `Task record from ${taskTable.name}`,
          fields: fields,
        }
      })
    } catch (error: any) {
      console.error("Error fetching Airtable task records:", error)
      // Return empty array instead of throwing to prevent breaking the UI
      return []
    }
  },

  "airtable_project_records": async (integration: any, options?: { baseId?: string }) => {
    try {
      if (!options?.baseId) {
        return []
      }
      
      // First, get all tables to find the projects table
      const tablesResponse = await fetchAirtableWithRetry(
        `https://api.airtable.com/v0/meta/bases/${options.baseId}/tables`,
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        }
      )
      
      const tablesData = await tablesResponse.json()
      const tables = tablesData.tables || []
      
      console.log(`🔍 Available tables in base ${options.baseId}:`, tables.map((t: any) => t.name))
      
      // Look for project-related tables
      const projectTableNames = ['Projects', 'Project', 'Portfolio', 'Initiatives', 'Campaigns']
      let projectTable = null
      
      for (const tableName of projectTableNames) {
        projectTable = tables.find((table: any) => 
          table.name.toLowerCase().includes('project') || 
          table.name.toLowerCase().includes('portfolio') ||
          table.name.toLowerCase().includes('initiative') ||
          table.name.toLowerCase().includes('campaign')
        )
        if (projectTable) break
      }
      
      if (!projectTable) {
        console.log("No project table found in base")
        return []
      }
      
      // Fetch records from the found project table
      const response = await fetchAirtableWithRetry(
        `https://api.airtable.com/v0/${options.baseId}/${encodeURIComponent(projectTable.name)}?maxRecords=100`,
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        }
      )
      
      const data = await response.json()
      return data.records?.map((record: any) => {
        const fields = record.fields || {}
        let label = record.id
        
        // Look for project-specific fields
        if (fields.Project) label = fields.Project
        else if (fields.Name) label = fields.Name
        else if (fields.Title) label = fields.Title
        else if (fields.Description) label = fields.Description
        else if (fields.Subject) label = fields.Subject
        
        return {
          value: record.id,
          label: label,
          description: `Project record from ${projectTable.name}`,
          fields: fields,
        }
      }) || []
    } catch (error: any) {
      console.error("Error fetching Airtable project records:", error)
      // Return empty array instead of throwing to prevent breaking the UI
      return []
    }
  },
  "gumroad_products": async (integration: any) => {
    try {
      const response = await fetch(
        "https://api.gumroad.com/v2/products",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Gumroad authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Gumroad API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
      const data = await response.json()
      return data.products?.map((product: any) => ({
        value: product.id,
        label: product.name,
        description: product.description,
        price: product.price,
      })) || []
    } catch (error: any) {
      console.error("Error fetching Gumroad products:", error)
      throw error
    }
  },
  "blackbaud_constituents": async (integration: any) => {
    try {
      const response = await fetch(
        "https://api.sky.blackbaud.com/constituent/v1/constituents",
        {
          headers: {
            "Bb-Api-Subscription-Key": integration.access_token,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Blackbaud authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Blackbaud API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
      const data = await response.json()
      return data.value?.map((constituent: any) => ({
        value: constituent.id,
        label: `${constituent.first_name} ${constituent.last_name}`,
        description: constituent.email_address,
        type: constituent.type,
      })) || []
    } catch (error: any) {
      console.error("Error fetching Blackbaud constituents:", error)
      throw error
    }
  },
  "trello-boards": async (integration: any) => {
    try {
      const response = await fetch(
        `https://api.trello.com/1/members/me/boards?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${integration.access_token}&fields=id,name,desc,url,closed`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Trello authentication expired. Please reconnect your account.")
        }
        throw new Error(`Trello API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return data
        .filter((board: any) => !board.closed)
        .map((board: any) => ({
          id: board.id,
          name: board.name,
          value: board.id,
          description: board.desc,
          url: board.url,
        }))
    } catch (error: any) {
      console.error("Error fetching Trello boards:", error)
      throw error
    }
  },

  "trello-list-templates": async (integration: any) => {
    try {
      // First, get all boards to find lists that could serve as templates
      const boardsResponse = await fetch(
        `https://api.trello.com/1/members/me/boards?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${integration.access_token}&fields=id,name,desc,url,closed`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      )

      if (!boardsResponse.ok) {
        if (boardsResponse.status === 401) {
          throw new Error("Trello authentication expired. Please reconnect your account.")
        }
        throw new Error(`Trello API error: ${boardsResponse.status} ${boardsResponse.statusText}`)
      }

      const boards = await boardsResponse.json()
      const openBoards = boards.filter((board: any) => !board.closed)
      
      const templates: any[] = []
      
      // For each board, get its lists and look for template-like lists
      for (const board of openBoards) {
        try {
          const listsResponse = await fetch(
            `https://api.trello.com/1/boards/${board.id}/lists?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${integration.access_token}&fields=id,name,desc,closed`,
            {
              headers: {
                "Content-Type": "application/json",
              },
            },
          )
          
          if (listsResponse.ok) {
            const lists = await listsResponse.json()
            const openLists = lists.filter((list: any) => !list.closed)
            
            // Look for lists that could serve as templates (contain "template" in name or description)
            const templateLists = openLists.filter((list: any) => {
              const name = (list.name || '').toLowerCase()
              const desc = (list.desc || '').toLowerCase()
              return name.includes('template') || desc.includes('template') || 
                     name.includes('sprint') || name.includes('backlog') || 
                     name.includes('todo') || name.includes('done') ||
                     name.includes('in progress') || name.includes('review')
            })
            
            // Add template lists with board context
            templateLists.forEach((list: any) => {
              templates.push({
                id: list.id,
                name: `${list.name} (${board.name})`,
                value: list.id,
                description: list.desc || `Template list from ${board.name}`,
                listId: list.id,
                boardId: board.id,
                boardName: board.name,
                originalListName: list.name
              })
            })
          }
        } catch (error) {
          console.warn(`Failed to fetch lists for board ${board.name}:`, error)
        }
      }
      
      // Remove duplicates and return
      const uniqueTemplates = templates.filter((template: any, index: number, self: any[]) => 
        index === self.findIndex((t: any) => t.id === template.id)
      )
      
      return uniqueTemplates
    } catch (error: any) {
      console.error("Error fetching Trello list templates:", error)
      throw error
    }
  },

  "trello-card-templates": async (integration: any, options?: { boardId?: string, listId?: string }) => {
    try {
      console.log(`🔍 Fetching trello-card-templates with options:`, options)
      
      let cardsResponse
      let cards: any[] = []
      
      // If boardId is provided, fetch cards from that specific board
      if (options?.boardId) {
        console.log(`🔍 Fetching cards from board ${options.boardId}`)
        cardsResponse = await fetch(
          `https://api.trello.com/1/boards/${options.boardId}/cards?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${integration.access_token}&fields=id,name,desc,idList,idBoard,labels,closed`,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        )
      } else {
        // Fallback to fetching all cards from the user's account
        console.log(`🔍 Fetching all cards from user's account`)
        cardsResponse = await fetch(
          `https://api.trello.com/1/members/me/cards?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${integration.access_token}&fields=id,name,desc,idList,idBoard,labels,closed`,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        )
      }
      
      if (!cardsResponse.ok) {
        if (cardsResponse.status === 401) {
          throw new Error("Trello authentication expired. Please reconnect your account.")
        }
        throw new Error(`Trello API error: ${cardsResponse.status} ${cardsResponse.statusText}`)
      }

      cards = await cardsResponse.json()
      console.log(`🔍 Found ${cards.length} total cards for Trello card templates`)
      
      // Filter out closed cards
      const openCards = cards.filter((card: any) => !card.closed)
      console.log(`🔍 Found ${openCards.length} open cards`)
      
      // All open cards can be used as templates
      const templateCards = openCards
      
      console.log(`🔍 Found ${templateCards.length} cards available as templates`)
      if (templateCards.length > 0) {
        console.log(`🔍 Available template cards:`, templateCards.map((card: any) => ({
          name: card.name,
          desc: card.desc?.substring(0, 100),
          descLength: card.desc?.length || 0
        })))
      }

      // Filter cards based on provided options
      let filteredCards = templateCards
      
      if (options?.listId) {
        filteredCards = filteredCards.filter((card: any) => card.idList === options.listId)
        console.log(`🔍 Filtered to ${filteredCards.length} cards in list ${options.listId}`)
      }

      // Get board and list information for better display names
      const boardsMap: { [key: string]: string } = {}
      const allLists: { [key: string]: { name: string, idBoard: string } } = {}
      
      if (filteredCards.length > 0) {
        // Get unique board IDs
        const boardIds = [...new Set(filteredCards.map(card => card.idBoard))]
        
        // Fetch board names
        for (const boardId of boardIds) {
          try {
            const boardResponse = await fetch(
              `https://api.trello.com/1/boards/${boardId}?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${integration.access_token}&fields=name`,
              {
                headers: {
                  "Content-Type": "application/json",
                },
              }
            )
            if (boardResponse.ok) {
              const board = await boardResponse.json()
              boardsMap[boardId] = board.name
            }
          } catch (error) {
            console.warn(`Failed to fetch board ${boardId}:`, error)
          }
        }
        
        // Get unique list IDs
        const listIds = [...new Set(filteredCards.map(card => card.idList))]
        
        // Fetch list names
        for (const listId of listIds) {
          try {
            const listResponse = await fetch(
              `https://api.trello.com/1/lists/${listId}?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${integration.access_token}&fields=name,idBoard`,
              {
                headers: {
                  "Content-Type": "application/json",
                },
              }
            )
            if (listResponse.ok) {
              const list = await listResponse.json()
              allLists[listId] = { name: list.name, idBoard: list.idBoard }
            }
          } catch (error) {
            console.warn(`Failed to fetch list ${listId}:`, error)
          }
        }
      }

      // Map template cards to the expected format
      const templates = filteredCards.map((card: any) => {
        const listInfo = allLists[card.idList]
        const boardName = boardsMap[card.idBoard] || 'Unknown Board'
        
        return {
          id: card.id,
          name: `${card.name}${listInfo ? ` (${listInfo.name})` : ''}`,
          value: card.id,
          description: card.desc || 'Template card',
          listId: card.idList,
          boardId: card.idBoard,
          boardName: boardName,
          listName: listInfo?.name || 'Unknown List',
          isCard: true,
          originalCardName: card.name,
          labels: card.labels || []
        }
      })
      
      console.log(`🔍 Returning ${templates.length} template cards`)
      return templates
    } catch (error: any) {
      console.error("Error fetching Trello card templates:", error)
      throw error
    }
  },

  github_repositories: async (integration: any) => {
    try {
      const response = await fetch(
        "https://api.github.com/user/repos?sort=updated&per_page=50",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("GitHub authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`GitHub API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
      const data = await response.json()
      return data.map((repo: any) => ({
        value: repo.full_name,
        label: repo.name,
        description: repo.description,
        private: repo.private,
        language: repo.language,
      })) || []
    } catch (error: any) {
      console.error("Error fetching GitHub repositories:", error)
      throw error
    }
  },

  "google-docs_documents": async (integration: any) => {
    try {
      // Use Google Drive API to list Google Docs files
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.document'&pageSize=100&fields=files(id,name,createdTime,modifiedTime,webViewLink)",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Google Docs authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Google Drive API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
        )
      }

      const data = await response.json()
      return (data.files || []).map((file: any) => ({
        id: file.id,
        name: file.name,
        value: file.id,
        created_time: file.createdTime,
        modified_time: file.modifiedTime,
        web_view_link: file.webViewLink,
        document_url: `https://docs.google.com/document/d/${file.id}/edit`,
      }))
    } catch (error: any) {
      console.error("Error fetching Google Docs documents:", error)
      throw error
    }
  },

  "google-docs_templates": async (integration: any) => {
    try {
      // Use Google Drive API to list Google Docs template files
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.document' and name contains 'Template'&pageSize=50&fields=files(id,name,createdTime,modifiedTime,webViewLink)",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Google Docs authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Google Drive API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
        )
      }

      const data = await response.json()
      return (data.files || []).map((file: any) => ({
        id: file.id,
        name: file.name,
        value: file.id,
        created_time: file.createdTime,
        modified_time: file.modifiedTime,
        web_view_link: file.webViewLink,
        document_url: `https://docs.google.com/document/d/${file.id}/edit`,
        is_template: true,
      }))
    } catch (error: any) {
      console.error("Error fetching Google Docs templates:", error)
      throw error
    }
  },

  "google-docs_recent_documents": async (integration: any) => {
    try {
      // Use Google Drive API to list recently modified Google Docs files
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.document' and trashed=false&pageSize=20&fields=files(id,name,createdTime,modifiedTime,webViewLink)&orderBy=modifiedTime desc",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Google Docs authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Google Drive API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
        )
      }

      const data = await response.json()
      return (data.files || []).map((file: any) => ({
        id: file.id,
        name: file.name,
        value: file.id,
        created_time: file.createdTime,
        modified_time: file.modifiedTime,
        web_view_link: file.webViewLink,
        document_url: `https://docs.google.com/document/d/${file.id}/edit`,
        is_recent: true,
      }))
    } catch (error: any) {
      console.error("Error fetching recent Google Docs documents:", error)
      throw error
    }
  },

  "google-docs_shared_documents": async (integration: any) => {
    try {
      // Use Google Drive API to list shared Google Docs files
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.document' and sharedWithMe=true and trashed=false&pageSize=50&fields=files(id,name,createdTime,modifiedTime,webViewLink,owners)",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Google Docs authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Google Drive API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
        )
      }

      const data = await response.json()
      return (data.files || []).map((file: any) => ({
        id: file.id,
        name: file.name,
        value: file.id,
        created_time: file.createdTime,
        modified_time: file.modifiedTime,
        web_view_link: file.webViewLink,
        document_url: `https://docs.google.com/document/d/${file.id}/edit`,
        owner: file.owners?.[0]?.displayName || "Unknown",
        is_shared: true,
      }))
    } catch (error: any) {
      console.error("Error fetching shared Google Docs documents:", error)
      throw error
    }
  },

  "google-docs_folders": async (integration: any) => {
    try {
      // Use Google Drive API to list folders that contain Google Docs
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&pageSize=100&fields=files(id,name,parents,createdTime,modifiedTime)&orderBy=name",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Google Docs authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Google Drive API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
        )
      }

      const data = await response.json()
      const folders = (data.files || []).map((folder: any) => ({
        id: folder.id,
        name: folder.name,
        value: folder.id,
        parents: folder.parents,
        created_time: folder.createdTime,
        modified_time: folder.modifiedTime,
      }))

      // Add root folder as an option
      folders.unshift({
        id: "root",
        name: "My Drive (Root)",
        value: "root",
        parents: [],
        created_time: null,
        modified_time: null,
      })

      return folders
    } catch (error: any) {
      console.error("Error fetching Google Docs folders:", error)
      throw error
    }
  },

  "youtube_channels": async (integration: any) => {
    try {
      const response = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("YouTube authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`YouTube API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      const data = await response.json()
      return (data.items || []).map((channel: any) => ({
        id: channel.id,
        name: channel.snippet.title,
        value: channel.id,
        description: channel.snippet.description,
        thumbnail: channel.snippet.thumbnails?.default?.url,
      }))
    } catch (error: any) {
      console.error("Error fetching YouTube channels:", error)
      throw error
    }
  },
  "youtube_videos": async (integration: any) => {
    try {
      // Get all videos from all channels (first channel only for now)
      const channelResp = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!channelResp.ok) {
        if (channelResp.status === 401) {
          throw new Error("YouTube authentication expired. Please reconnect your account.")
        }
        const errorData = await channelResp.json().catch(() => ({}))
        throw new Error(`YouTube API error: ${channelResp.status} - ${errorData.error?.message || channelResp.statusText}`)
      }
      const channelData = await channelResp.json()
      const channelId = channelData.items?.[0]?.id
      if (!channelId) return []
      
      // Now get videos from the uploads playlist
      const playlistResp = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}`,
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      const playlistData = await playlistResp.json()
      const uploadsPlaylistId = playlistData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
      if (!uploadsPlaylistId) return []
      
      // Get all videos from uploads playlist with pagination
      let allVideos: any[] = []
      let nextPageToken: string | undefined = undefined
      
      do {
        const videosResp: Response = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${uploadsPlaylistId}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`,
          {
            headers: {
              Authorization: `Bearer ${integration.access_token}`,
              "Content-Type": "application/json",
            },
          },
        )
        if (!videosResp.ok) {
          if (videosResp.status === 401) {
            throw new Error("YouTube authentication expired. Please reconnect your account.")
          }
          const errorData = await videosResp.json().catch(() => ({}))
          throw new Error(`YouTube API error: ${videosResp.status} - ${errorData.error?.message || videosResp.statusText}`)
        }
        const videosData: any = await videosResp.json()
        
        const pageVideos = (videosData.items || []).map((item: any) => ({
          id: item.snippet.resourceId.videoId,
          name: item.snippet.title,
          value: item.snippet.resourceId.videoId,
          description: item.snippet.description,
          publishedAt: item.snippet.publishedAt,
          thumbnail: item.snippet.thumbnails?.default?.url,
        }))
        
        allVideos.push(...pageVideos)
        nextPageToken = videosData.nextPageToken
        
        // Safety check to prevent infinite loops
        if (allVideos.length > 1000) {
          console.warn("YouTube videos fetcher: Stopping at 1000 videos to prevent excessive API usage")
          break
        }
      } while (nextPageToken)
      
      return allVideos
    } catch (error: any) {
      console.error("Error fetching YouTube videos:", error)
      throw error
    }
  },
  "youtube_playlists": async (integration: any) => {
    try {
      const response = await fetch(
        "https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("YouTube authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`YouTube API error: ${response.status} - ${errorData.error?.message || "Unknown error"}`)
      }
      const data = await response.json()
      return data.items?.map((playlist: any) => ({
        value: playlist.id,
        label: playlist.snippet.title,
      })) || []
    } catch (error: any) {
      console.error("Error fetching YouTube playlists:", error)
      throw error
    }
  },
  "teams_chats": async (integration: any) => {
    try {
      // Check if integration has access token
      if (!integration.access_token) {
        throw new Error("Teams integration not connected. Please connect your Teams account first.")
      }

      const response = await fetch(
        "https://graph.microsoft.com/v1.0/me/chats",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Teams authentication expired. Please reconnect your account.")
        }
        if (response.status === 403) {
          throw new Error("Teams access denied. Please check your permissions and reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Teams API error: ${response.status} - ${errorData.error?.message || "Unknown error"}`)
      }
      const data = await response.json()
      return data.value?.map((chat: any) => ({
        value: chat.id,
        label: chat.topic || chat.chatType || "Chat",
      })) || []
    } catch (error: any) {
      console.error("Error fetching Teams chats:", error)
      throw error
    }
  },
  "teams_teams": async (integration: any) => {
    try {
      // Check if integration has access token
      if (!integration.access_token) {
        throw new Error("Teams integration not connected. Please connect your Teams account first.")
      }

      const response = await fetch(
        "https://graph.microsoft.com/v1.0/me/joinedTeams",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Teams authentication expired. Please reconnect your account.")
        }
        if (response.status === 403) {
          throw new Error("Teams access denied. Please check your permissions and reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Teams API error: ${response.status} - ${errorData.error?.message || "Unknown error"}`)
      }
      const data = await response.json()
      return data.value?.map((team: any) => ({
        value: team.id,
        label: team.displayName,
      })) || []
    } catch (error: any) {
      console.error("Error fetching Teams teams:", error)
      throw error
    }
  },
  "teams_channels": async (integration: any) => {
    try {
      // Check if integration has access token
      if (!integration.access_token) {
        throw new Error("Teams integration not connected. Please connect your Teams account first.")
      }

      // First get all teams, then get channels for each team
      const teamsResponse = await fetch(
        "https://graph.microsoft.com/v1.0/me/joinedTeams",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!teamsResponse.ok) {
        if (teamsResponse.status === 401) {
          throw new Error("Teams authentication expired. Please reconnect your account.")
        }
        if (teamsResponse.status === 403) {
          // Try to get more details from the response
          let errorDetails = "Teams access denied. Please check your permissions and reconnect your account."
          try {
            const errorData = await teamsResponse.json()
            if (errorData.error?.message) {
              errorDetails = `Teams access denied: ${errorData.error.message}`
            } else if (errorData.message) {
              errorDetails = `Teams access denied: ${errorData.message}`
            }
          } catch (e) {
            // If we can't parse the response, use the default message
            console.warn("Could not parse Teams 403 error response:", e)
          }
          throw new Error(errorDetails)
        }
        const errorData = await teamsResponse.json().catch(() => ({}))
        throw new Error(`Teams API error: ${teamsResponse.status} - ${errorData.error?.message || errorData.message || "Unknown error"}`)
      }
      const teamsData = await teamsResponse.json()
      
      const allChannels: any[] = []
      
      for (const team of teamsData.value || []) {
        try {
          const channelsResponse = await fetch(
            `https://graph.microsoft.com/v1.0/teams/${team.id}/channels`,
            {
              headers: {
                Authorization: `Bearer ${integration.access_token}`,
                "Content-Type": "application/json",
              },
            },
          )
          if (channelsResponse.ok) {
            const channelsData = await channelsResponse.json()
            const teamChannels = channelsData.value?.map((channel: any) => ({
              value: `${team.id}:${channel.id}`,
              label: `${team.displayName} - ${channel.displayName}`,
            })) || []
            allChannels.push(...teamChannels)
          }
        } catch (error) {
          console.warn(`Failed to fetch channels for team ${team.displayName}:`, error)
        }
      }
      
      return allChannels
    } catch (error: any) {
      console.error("Error fetching Teams channels:", error)
      throw error
    }
  },
  "gitlab_projects": async (integration: any) => {
    try {
      const response = await fetch(
        "https://gitlab.com/api/v4/projects?membership=true&order_by=updated_at&per_page=50",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("GitLab authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`GitLab API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
      const data = await response.json()
      return data.map((project: any) => ({
        value: project.id.toString(),
        label: project.name,
        description: project.description,
        visibility: project.visibility,
        path: project.path_with_namespace,
      })) || []
    } catch (error: any) {
      console.error("Error fetching GitLab projects:", error)
      throw error
    }
  },
  "trello_lists": async (integration: any, options?: { boardId?: string }) => {
    try {
      if (!options?.boardId) {
        throw new Error("Missing boardId for Trello lists fetcher")
      }
      const response = await fetch(
        `https://api.trello.com/1/boards/${options.boardId}/lists?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${integration.access_token}&fields=id,name,closed`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Trello authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Trello API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
      const lists = await response.json()
      return lists.filter((list: any) => !list.closed).map((list: any) => ({
        value: list.id,
        label: list.name,
        description: list.name,
      }))
    } catch (error: any) {
      console.error("Error fetching Trello lists:", error)
      throw error
    }
  },

  "trello_cards": async (integration: any, options?: { boardId?: string }) => {
    try {
      if (!options?.boardId) {
        throw new Error("Missing boardId for Trello cards fetcher")
      }
      const response = await fetch(
        `https://api.trello.com/1/boards/${options.boardId}/cards?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${integration.access_token}&fields=id,name,desc,idList,closed`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      )
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Trello authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Trello API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
      const cards = await response.json()
      
      // Filter out closed cards and map to expected format
      return cards.filter((card: any) => !card.closed).map((card: any) => ({
        value: card.id,
        label: card.name,
        description: card.desc || card.name,
        listId: card.idList,
      }))
    } catch (error: any) {
      console.error("Error fetching Trello cards:", error)
      throw error
    }
  },

  "google-drive-folders": async (integration: any) => {
    try {
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&pageSize=100&fields=files(id,name,parents,createdTime,modifiedTime)&orderBy=name",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Google Drive authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Google Drive API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
        )
      }

      const data = await response.json()
      const folders = (data.files || []).map((folder: any) => ({
        id: folder.id,
        name: folder.name,
        value: folder.id,
        parents: folder.parents,
        created_time: folder.createdTime,
        modified_time: folder.modifiedTime,
      }))

      // Add root folder as an option
      folders.unshift({
        id: "root",
        name: "My Drive (Root)",
        value: "root",
        parents: [],
        created_time: null,
        modified_time: null,
      })

      return folders
    } catch (error: any) {
      console.error("Error fetching Google Drive folders:", error)
      throw error
    }
  },

  "google-drive-files": async (integration: any) => {
    try {
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType!='application/vnd.google-apps.folder' and trashed=false&pageSize=100&fields=files(id,name,mimeType,size,parents,createdTime,modifiedTime,webViewLink)&orderBy=modifiedTime desc",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Google Drive authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Google Drive API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
        )
      }

      const data = await response.json()
      return (data.files || []).map((file: any) => ({
        id: file.id,
        name: file.name,
        value: file.id,
        mimeType: file.mimeType,
        size: file.size,
        parents: file.parents,
        created_time: file.createdTime,
        modified_time: file.modifiedTime,
        web_view_link: file.webViewLink,
      }))
    } catch (error: any) {
      console.error("Error fetching Google Drive files:", error)
      throw error
    }
  },

  "onedrive-folders": async (integration: any) => {
    try {
      // First, let's test if we can access the drive at all
      const driveResponse = await fetch(
        "https://graph.microsoft.com/v1.0/me/drive",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!driveResponse.ok) {
        const errorData = await driveResponse.json().catch(() => ({}))
        console.error("OneDrive drive access error:", errorData)
        if (driveResponse.status === 401) {
          throw new Error("OneDrive authentication expired. Please reconnect your account.")
        }
        throw new Error(
          `OneDrive drive access error: ${driveResponse.status} - ${errorData.error?.message || driveResponse.statusText}`,
        )
      }

      // Now try to get the root children
      const response = await fetch(
        "https://graph.microsoft.com/v1.0/me/drive/root/children",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("OneDrive authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        console.error("OneDrive API error response:", errorData)
        throw new Error(
          `OneDrive API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
        )
      }

      const data = await response.json()
      console.log("OneDrive API response:", JSON.stringify(data, null, 2))
      
      const folders = (data.value || [])
        .filter((item: any) => item.folder) // Ensure it's actually a folder
        .map((folder: any) => ({
          id: folder.id,
          name: folder.name,
          value: folder.id,
          created_time: folder.createdDateTime,
          modified_time: folder.lastModifiedDateTime,
          parent_reference: folder.parentReference,
        }))

      // Add root folder as an option
      folders.unshift({
        id: "root",
        name: "OneDrive (Root)",
        value: "root",
        created_time: null,
        modified_time: null,
        parent_reference: null,
      })

      return folders
    } catch (error: any) {
      console.error("Error fetching OneDrive folders:", error)
      // Return just the root folder as a fallback
      return [
        {
          id: "root",
          name: "OneDrive (Root)",
          value: "root",
          created_time: null,
          modified_time: null,
          parent_reference: null,
        }
      ]
    }
  },

  "dropbox-folders": async (integration: any) => {
    try {
      const response = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: "",
          recursive: false,
          include_media_info: false,
          include_deleted: false,
          include_has_explicit_shared_members: false,
          include_mounted_folders: true,
          include_non_downloadable_files: false,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Dropbox authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Dropbox API error: ${response.status} - ${errorData.error_summary || response.statusText}`,
        )
      }

      const data = await response.json()
      const folders = (data.entries || [])
        .filter((entry: any) => entry[".tag"] === "folder")
        .map((folder: any) => ({
          id: folder.path_lower,
          name: folder.name,
          value: folder.path_lower,
          path: folder.path_lower,
          created_time: null, // Dropbox doesn't provide creation time in list_folder
          modified_time: folder.server_modified,
        }))

      // Add root folder as an option
      folders.unshift({
        id: "",
        name: "Dropbox (Root)",
        value: "",
        path: "",
        created_time: null,
        modified_time: null,
      })

      return folders
    } catch (error: any) {
      console.error("Error fetching Dropbox folders:", error)
      // Return just the root folder as a fallback
      return [
        {
          id: "",
          name: "Dropbox (Root)",
          value: "",
          path: "",
          created_time: null,
          modified_time: null,
        }
      ]
    }
  },

  "box-folders": async (integration: any) => {
    try {
      const response = await fetch(
        "https://api.box.com/2.0/folders/0/items?fields=id,name,type,created_at,modified_at&limit=1000",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Box authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Box API error: ${response.status} - ${errorData.message || response.statusText}`,
        )
      }

      const data = await response.json()
      const folders = (data.entries || [])
        .filter((entry: any) => entry.type === "folder")
        .map((folder: any) => ({
          id: folder.id,
          name: folder.name,
          value: folder.id,
          created_time: folder.created_at,
          modified_time: folder.modified_at,
        }))

      // Add root folder as an option
      folders.unshift({
        id: "0",
        name: "Box (Root)",
        value: "0",
        created_time: null,
        modified_time: null,
      })

      return folders
    } catch (error: any) {
      console.error("Error fetching Box folders:", error)
      // Return just the root folder as a fallback
      return [
        {
          id: "0",
          name: "Box (Root)",
          value: "0",
          created_time: null,
          modified_time: null,
        }
      ]
    }
  },

  "discord_guilds": async (integration: any) => {
    try {
      const data = await fetchDiscordWithRateLimit<any[]>(() => 
        fetch("https://discord.com/api/v10/users/@me/guilds", {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        })
      )

      return (data || []).map((guild: any) => ({
        id: guild.id,
        name: guild.name,
        value: guild.id,
        icon: guild.icon,
        owner: guild.owner,
        permissions: guild.permissions,
      }))
    } catch (error: any) {
      console.error("Error fetching Discord guilds:", error)
      if (error.message.includes("401")) {
        throw new Error("Discord authentication expired. Please reconnect your account.")
      }
      throw error
    }
  },

  "discord_channels": async (integration: any, options: any) => {
    try {
      const { 
        guildId, 
        channelTypes, 
        nameFilter, 
        sortBy = "position", 
        includeArchived = false,
        parentCategory 
      } = options || {}
      
      if (!guildId) {
        throw new Error("Guild ID is required to fetch Discord channels")
      }

      // Use bot token for channel listing (bot must be in the guild)
      const botToken = process.env.DISCORD_BOT_TOKEN
      if (!botToken) {
        console.warn("Discord bot token not configured - returning empty channels list")
        return []
      }

      try {
        const data = await fetchDiscordWithRateLimit<any[]>(() => 
          fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
          })
        )

        let filteredData = (data || [])
          .filter((channel: any) => {
            // For parentId selection, include categories (type 4) and text channels (type 0)
            // For regular channel selection, only include text channels (type 0)
            const isParentIdRequest = options?.context === 'parentId'
            if (isParentIdRequest) {
              return channel.type === 0 || channel.type === 4 // Text channels and categories
            }
            return channel.type === 0 // Only text channels
          })

        // Apply additional filters
        if (channelTypes && Array.isArray(channelTypes) && channelTypes.length > 0) {
          filteredData = filteredData.filter((channel: any) => 
            channelTypes.includes(channel.type.toString())
          )
        }
        
        if (nameFilter && nameFilter.trim()) {
          const filterLower = nameFilter.toLowerCase()
          filteredData = filteredData.filter((channel: any) => 
            channel.name && channel.name.toLowerCase().includes(filterLower)
          )
        }
        
        if (parentCategory) {
          filteredData = filteredData.filter((channel: any) => channel.parent_id === parentCategory)
        }
        
        if (!includeArchived) {
          filteredData = filteredData.filter((channel: any) => !channel.archived)
        }

        // Apply sorting
        switch (sortBy) {
          case "name":
            filteredData.sort((a: any, b: any) => a.name.localeCompare(b.name))
            break
          case "name_desc":
            filteredData.sort((a: any, b: any) => b.name.localeCompare(a.name))
            break
          case "created":
            filteredData.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            break
          case "created_old":
            filteredData.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            break
          case "position":
          default:
            filteredData.sort((a: any, b: any) => a.position - b.position)
            break
        }

        return filteredData.map((channel: any) => ({
          id: channel.id,
          name: channel.type === 4 ? channel.name : `#${channel.name}`,
          value: channel.id,
          type: channel.type,
          position: channel.position,
          parent_id: channel.parent_id,
        }))
      } catch (error: any) {
        // Handle specific Discord API errors
        if (error.message.includes("401")) {
          throw new Error("Discord bot authentication failed. Please check bot configuration.")
        }
        if (error.message.includes("403")) {
          throw new Error("Bot does not have permission to view channels in this server. Please ensure the bot has the 'View Channels' permission and try again.")
        }
        if (error.message.includes("404")) {
          // Bot is not in the server - return empty array instead of throwing error
          console.log(`Bot is not a member of server ${guildId} - returning empty channels list`)
          return []
        }
        throw error
      }
    } catch (error: any) {
      console.error("Error fetching Discord channels:", error)
      throw error
    }
  },

  "discord_categories": async (integration: any, options: any) => {
    try {
      const { 
        guildId, 
        nameFilter, 
        sortBy = "position" 
      } = options || {}
      
      if (!guildId) {
        throw new Error("Guild ID is required to fetch Discord categories")
      }

      // Use bot token for category listing (bot must be in the guild)
      const botToken = process.env.DISCORD_BOT_TOKEN
      if (!botToken) {
        console.warn("Discord bot token not configured - returning empty categories list")
        return []
      }

      try {
        const data = await fetchDiscordWithRateLimit<any[]>(() => 
          fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
          })
        )

        let filteredData = (data || [])
          .filter((channel: any) => channel.type === 4) // Only categories (type 4)

        // Apply name filter
        if (nameFilter && nameFilter.trim()) {
          const filterLower = nameFilter.toLowerCase()
          filteredData = filteredData.filter((category: any) => 
            category.name && category.name.toLowerCase().includes(filterLower)
          )
        }

        // Apply sorting
        switch (sortBy) {
          case "name":
            filteredData.sort((a: any, b: any) => a.name.localeCompare(b.name))
            break
          case "name_desc":
            filteredData.sort((a: any, b: any) => b.name.localeCompare(a.name))
            break
          case "created":
            filteredData.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            break
          case "created_old":
            filteredData.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            break
          case "position":
          default:
            filteredData.sort((a: any, b: any) => a.position - b.position)
            break
        }

        return filteredData.map((category: any) => ({
          id: category.id,
          name: category.name,
          value: category.id,
          type: category.type,
          position: category.position,
        }))
      } catch (error: any) {
        // Handle specific Discord API errors
        if (error.message.includes("401")) {
          throw new Error("Discord bot authentication failed. Please check bot configuration.")
        }
        if (error.message.includes("403")) {
          throw new Error("Bot does not have permission to view channels in this server. Please ensure the bot has the 'View Channels' permission and try again.")
        }
        if (error.message.includes("404")) {
          // Bot is not in the server - return empty array instead of throwing error
          console.log(`Bot is not a member of server ${guildId} - returning empty categories list`)
          return []
        }
        throw error
      }
    } catch (error: any) {
      console.error("Error fetching Discord categories:", error)
      throw error
    }
  },

  "discord_members": async (integration: any, options: any) => {
    try {
      const { guildId } = options || {}
      
      if (!guildId) {
        throw new Error("Guild ID is required to fetch Discord members")
      }

      // Use bot token for member listing (bot must be in the guild)
      const botToken = process.env.DISCORD_BOT_TOKEN
      if (!botToken) {
        console.warn("Discord bot token not configured - returning empty members list")
        return []
      }

      try {
        const data = await fetchDiscordWithRateLimit<any[]>(() => 
          fetch(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000`, {
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
          })
        )

        return (data || [])
          // .filter((member: any) => !member.user?.bot) // Show all users, including bots
          .map((member: any) => ({
            id: member.user.id,
            name: member.nick || member.user.username,
            value: member.user.id,
            username: member.user.username,
            discriminator: member.user.discriminator,
            avatar: member.user.avatar,
            roles: member.roles,
            joined_at: member.joined_at,
            isBot: member.user?.bot || false,
          }))
      } catch (error: any) {
        // Handle specific Discord API errors
        if (error.message.includes("401")) {
          throw new Error("Discord bot authentication failed. Please check bot configuration.")
        }
        if (error.message.includes("403")) {
          throw new Error("Bot does not have permission to view members in this server. Please ensure the bot has the 'View Members' permission and try again.")
        }
        if (error.message.includes("404")) {
          // Bot is not in the server - return empty array instead of throwing error
          console.log(`Bot is not a member of server ${guildId} - returning empty members list`)
          return []
        }
        throw error
      }
    } catch (error: any) {
      console.error("Error fetching Discord members:", error)
      throw error
    }
  },

  "discord_roles": async (integration: any, options: any) => {
    try {
      const { guildId } = options || {}
      
      if (!guildId) {
        throw new Error("Guild ID is required to fetch Discord roles")
      }

      // Use bot token for role listing (bot must be in the guild)
      const botToken = process.env.DISCORD_BOT_TOKEN
      if (!botToken) {
        console.warn("Discord bot token not configured - returning empty roles list")
        return []
      }

      try {
        const data = await fetchDiscordWithRateLimit<any[]>(() => 
          fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
          })
        )

        return (data || [])
          .filter((role: any) => role.name !== "@everyone") // Filter out @everyone role
          .map((role: any) => ({
            id: role.id,
            name: role.name,
            value: role.id,
            color: role.color,
            hoist: role.hoist,
            position: role.position,
            permissions: role.permissions,
            mentionable: role.mentionable,
          }))
      } catch (error: any) {
        // Handle specific Discord API errors
        if (error.message.includes("401")) {
          throw new Error("Discord bot authentication failed. Please check bot configuration.")
        }
        if (error.message.includes("403")) {
          throw new Error("Bot does not have permission to view roles in this server. Please ensure the bot has the 'View Roles' permission and try again.")
        }
        if (error.message.includes("404")) {
          // Bot is not in the server - return empty array instead of throwing error
          console.log(`Bot is not a member of server ${guildId} - returning empty roles list`)
          return []
        }
        throw error
      }
    } catch (error: any) {
      console.error("Error fetching Discord roles:", error)
      throw error
    }
  },

  "discord_messages": async (integration: any, options: any) => {
    try {
      console.log("🔍 Discord messages fetcher called with options:", options)
      const { channelId } = options || {}
      
      if (!channelId) {
        console.error("❌ Channel ID is missing from options")
        throw new Error("Channel ID is required to fetch Discord messages")
      }

      console.log("🔍 Fetching messages for channel:", channelId)

      // Use bot token for server operations
      const botToken = process.env.DISCORD_BOT_TOKEN
      if (!botToken) {
        console.warn("Discord bot token not available - returning empty messages list")
        return []
      }

      console.log("🔍 Bot token available, making Discord API call...")

      try {
        const data = await fetchDiscordWithRateLimit<any[]>(() => 
          fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=50`, {
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
          })
        )

        return (data || [])
          .filter((message: any) => message.type === 0 || message.type === undefined)
          .map((message: any) => {
            let messageName = ""
            if (message.content && message.content.trim()) {
              messageName = message.content.substring(0, 50) + (message.content.length > 50 ? "..." : "")
            } else if (message.embeds && message.embeds.length > 0) {
              const embed = message.embeds[0]
              if (embed.title) {
                messageName = `[Embed] ${embed.title}`
              } else if (embed.description) {
                messageName = `[Embed] ${embed.description.substring(0, 40)}...`
              } else {
                messageName = `[Embed] (no title)`
              }
            } else if (message.attachments && message.attachments.length > 0) {
              const attachment = message.attachments[0]
              messageName = `[File] ${attachment.filename}`
            }
            if (!messageName) {
              const author = message.author?.username || "Unknown"
              const time = message.timestamp ? new Date(message.timestamp).toLocaleString() : message.id
              messageName = `Message by ${author} (${time})`
            }
            return {
              id: message.id,
              name: messageName,
              value: message.id,
              content: message.content,
              author: message.author,
              timestamp: message.timestamp,
              edited_timestamp: message.edited_timestamp,
              attachments: message.attachments,
              embeds: message.embeds,
            }
          })
      } catch (error: any) {
        console.error("🔍 Discord API error:", error.message)
        // Handle specific Discord API errors
        if (error.message.includes("401")) {
          throw new Error("Discord authentication failed. Please reconnect your Discord account.")
        }
        if (error.message.includes("403")) {
          throw new Error("You do not have permission to view messages in this channel. Please ensure you have the 'Read Message History' permission and try again.")
        }
        if (error.message.includes("404")) {
          // Channel not found - return empty array instead of throwing error
          console.log(`Channel ${channelId} not found - returning empty messages list`)
          return []
        }
        throw error
      }
    } catch (error: any) {
      console.error("Error fetching Discord messages:", error)
      throw error
    }
  },

  "discord_reactions": async (integration: any, options: any) => {
    try {
      console.log("🔍 Discord reactions fetcher called with options:", options)
      const { channelId, messageId } = options || {}
      
      if (!channelId || !messageId) {
        console.error("❌ Channel ID and Message ID are required for fetching reactions")
        throw new Error("Channel ID and Message ID are required to fetch Discord reactions")
      }

      console.log("🔍 Fetching reactions for message:", messageId, "in channel:", channelId)

      // Use bot token for server operations
      const botToken = process.env.DISCORD_BOT_TOKEN
      if (!botToken) {
        console.warn("Discord bot token not available - returning empty reactions list")
        return []
      }

      console.log("🔍 Bot token available, making Discord API call...")

      try {
        // First, get the specific message to see its reactions
        console.log(`🔍 Making Discord API call to fetch message ${messageId} in channel ${channelId}`)
        const messageResponse = await fetchDiscordWithRateLimit<any>(() => 
          fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
          })
        )

        console.log("🔍 Discord API response received:", {
          hasMessage: !!messageResponse,
          hasReactions: !!(messageResponse && messageResponse.reactions),
          reactionsCount: messageResponse?.reactions?.length || 0,
          messageContent: messageResponse?.content?.substring(0, 100) + "..." || "No content"
        })

        if (!messageResponse || !messageResponse.reactions) {
          console.log("🔍 No reactions found on this message")
          return []
        }

        // Process reactions from the message
        const reactions = messageResponse.reactions.map((reaction: any) => {
          let emojiDisplay = reaction.emoji.name
          let emojiValue = reaction.emoji.name
          
          // Handle custom emojis (they have an ID)
          if (reaction.emoji.id) {
            emojiDisplay = reaction.emoji.name
            emojiValue = `${reaction.emoji.name}:${reaction.emoji.id}`
          }
          
          return {
            id: emojiValue,
            name: `${emojiDisplay} (${reaction.count} reactions)`,
            value: emojiValue,
            emoji: reaction.emoji.name,
            emojiId: reaction.emoji.id,
            count: reaction.count,
            me: reaction.me || false,
            animated: reaction.emoji.animated || false
          }
        })

        console.log("🔍 Processed reactions:", reactions.length)
        if (reactions.length === 0) {
          console.log("🔍 No reactions found - this is normal if the message has no reactions")
        } else {
          console.log("🔍 Found reactions:", reactions.map((r: any) => `${r.emoji} (${r.count})`))
        }
        return reactions
      } catch (error: any) {
        console.error("🔍 Discord API error:", error.message)
        // Handle specific Discord API errors
        if (error.message.includes("401")) {
          throw new Error("Discord authentication failed. Please reconnect your Discord account.")
        }
        if (error.message.includes("403")) {
          throw new Error("You do not have permission to view reactions in this channel. Please ensure you have the 'Read Message History' permission and try again.")
        }
        if (error.message.includes("404")) {
          // Message not found - return empty array instead of throwing error
          console.log(`Message ${messageId} not found - returning empty reactions list`)
          return []
        }
        throw error
      }
    } catch (error: any) {
      console.error("Error fetching Discord reactions:", error)
      throw error
    }
  },

  "discord_banned_users": async (integration: any, options: any) => {
    try {
      const { guildId } = options || {}
      
      if (!guildId) {
        throw new Error("Guild ID is required to fetch Discord banned users")
      }

      // Use bot token instead of user token for banned users
      const botToken = process.env.DISCORD_BOT_TOKEN
      if (!botToken) {
        console.warn("Discord bot token not configured - returning empty banned users list")
        return []
      }

      try {
        const data = await fetchDiscordWithRateLimit<any[]>(() => 
          fetch(`https://discord.com/api/v10/guilds/${guildId}/bans?limit=1000`, {
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
          })
        )

        return (data || [])
          .map((ban: any) => ({
            id: ban.user.id,
            name: ban.user.username || "Unknown User",
            value: ban.user.id,
            username: ban.user.username || "Unknown",
            discriminator: ban.user.discriminator || "0000",
            avatar: ban.user.avatar,
            reason: ban.reason || "No reason provided",
            label: ban.user.username || `User ${ban.user.id}`
          }))
      } catch (error: any) {
        // Handle specific Discord API errors
        if (error.message.includes("401")) {
          throw new Error("Discord bot token is invalid or expired. Please check your environment variables.")
        }
        if (error.message.includes("403")) {
          throw new Error("Bot doesn't have permission to view bans in this server. Please ensure the bot has the 'Ban Members' permission.")
        }
        if (error.message.includes("404")) {
          // Bot is not in the server - return empty array instead of throwing error
          console.log(`Bot is not a member of server ${guildId} - returning empty banned users list`)
          return []
        }
        throw error
      }
    } catch (error: any) {
      console.error("Error fetching Discord banned users:", error)
      throw error
    }
  },

  "discord_users": async (integration: any, options: any) => {
    // Discord API limitation: Cannot fetch all server members with a user OAuth token.
    // Only the user's own account and their connections (friends/linked accounts) are available.
    try {
      const userToken = integration.access_token
      if (!userToken) {
        console.warn("User Discord token not available - returning empty users list")
        return []
      }

      let users: any[] = []

      // Always include the user's own account
      try {
        const userResponse = await fetchDiscordWithRateLimit<any>(() => 
          fetch("https://discord.com/api/v10/users/@me", {
            headers: {
              Authorization: `Bearer ${userToken}`,
              "Content-Type": "application/json",
            },
          })
        )
        if (userResponse) {
          users.push({
            id: userResponse.id,
            name: `${userResponse.username}#${userResponse.discriminator} (You)` ,
            value: userResponse.id,
            username: userResponse.username,
            discriminator: userResponse.discriminator,
            avatarUrl: userResponse.avatar 
              ? `https://cdn.discordapp.com/avatars/${userResponse.id}/${userResponse.avatar}.png`
              : `https://cdn.discordapp.com/embed/avatars/${parseInt(userResponse.discriminator) % 5}.png`,
            source: "self",
            section: "Your Account"
          })
        }
      } catch (error) {
        console.warn("Failed to fetch user info:", error)
      }

      // Try to fetch user's connections (friends/linked accounts)
      try {
        const connectionsResponse = await fetchDiscordWithRateLimit<any[]>(() => 
          fetch("https://discord.com/api/v10/users/@me/connections", {
            headers: {
              Authorization: `Bearer ${userToken}`,
              "Content-Type": "application/json",
            },
          })
        )
        if (connectionsResponse && connectionsResponse.length > 0) {
          // Add each connection as a selectable user
          users.push(...connectionsResponse.map((conn: any) => ({
            id: conn.id,
            name: `${conn.name} (${conn.type})`,
            value: conn.id,
            username: conn.name,
            discriminator: conn.type,
            avatarUrl: conn.verified ? `https://cdn.discordapp.com/embed/avatars/0.png` : undefined,
            source: "connection",
            section: "Connections"
          })))
        }
      } catch (error) {
        console.warn("Failed to fetch user connections:", error)
      }

      return users
    } catch (error: any) {
      console.error("Error fetching Discord users:", error)
      return []
    }
  },

  "facebook_pages": async (integration: any) => {
    try {
      console.log("🔍 Facebook pages fetcher called with integration:", {
        id: integration.id,
        provider: integration.provider,
        hasToken: !!integration.access_token
      })
      
      // Generate appsecret_proof for server-side calls
      const crypto = require('crypto')
      const appSecret = process.env.FACEBOOK_CLIENT_SECRET
      
      if (!appSecret) {
        console.error("Facebook app secret not configured")
        return []
      }
      
      const appsecretProof = crypto
        .createHmac('sha256', appSecret)
        .update(integration.access_token)
        .digest('hex')

      console.log("🔍 Making Facebook API call with appsecret_proof")
      const response = await fetch(`https://graph.facebook.com/v19.0/me/accounts?appsecret_proof=${appsecretProof}`, {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Facebook authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Facebook API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }

      const data = await response.json()
      console.log("🔍 Facebook API response:", data)
      
      const pages = (data.data || []).map((page: any) => ({
        id: page.id,
        name: page.name,
        value: page.id,
        access_token: page.access_token,
        category: page.category,
        tasks: page.tasks || [],
      }))
      
      console.log("🔍 Processed Facebook pages:", pages)
      return pages
    } catch (error: any) {
      console.error("Error fetching Facebook pages:", error)
      // Return empty array instead of throwing to prevent breaking the UI
      return []
    }
  },

  // Microsoft OneNote data fetchers - Using Microsoft Graph API to access OneNote notebooks
  "onenote_notebooks": async (integration: any, options?: any) => {
    console.log(`🔍 OneNote notebooks fetcher called with:`, {
      integrationId: integration.id,
      provider: integration.provider,
      status: integration.status,
      options
    });
    
    try {
      if (integration.status !== 'connected') {
        console.log(`❌ OneNote integration not connected, status: ${integration.status}`);
        return {
          data: [],
          error: {
            message: "OneNote integration is not connected"
          }
        };
      }
      
      console.log(`🔍 Validating OneNote token...`);
      const tokenResult = await validateAndRefreshToken(integration);
      console.log(`🔍 Token validation result:`, {
        success: tokenResult.success,
        hasToken: !!tokenResult.token,
        tokenLength: tokenResult.token?.length || 0,
        tokenPreview: tokenResult.token ? `${tokenResult.token.substring(0, 20)}...` : 'none',
        error: tokenResult.error
      });
      
      if (!tokenResult.success) {
        console.log(`❌ OneNote token validation failed: ${tokenResult.error}`);
        return {
          data: [],
          error: {
            message: tokenResult.error || "Authentication failed"
          }
        };
      }
      
      // Try the Microsoft Graph API with different parameters to ensure we get all notebooks
      console.log(`🔍 Trying OneNote API with expanded parameters...`);
      
      try {
        // First try with standard endpoint
        const oneNoteResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks?$expand=sections&$top=100', {
          headers: {
            'Authorization': `Bearer ${tokenResult.token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (oneNoteResponse.ok) {
          const oneNoteData = await oneNoteResponse.json();
          console.log(`✅ OneNote API works! Found ${oneNoteData.value?.length || 0} notebooks`);
          
          if (oneNoteData.value && oneNoteData.value.length > 0) {
            console.log(`🔍 OneNote notebooks from API:`, oneNoteData.value.map((notebook: any) => ({
              id: notebook.id,
              displayName: notebook.displayName,
              name: notebook.name,
              lastModifiedDateTime: notebook.lastModifiedDateTime,
              webUrl: notebook.webUrl,
              isDefault: notebook.isDefault,
              userRole: notebook.userRole,
              isShared: notebook.isShared,
              sectionCount: notebook.sections?.length || 0,
              links: notebook.links
            })));
            
            // Return the actual OneNote notebooks from the API
            return {
              data: oneNoteData.value || [],
              error: undefined
            };
          }
        } else {
          const errorText = await oneNoteResponse.text();
          console.log(`❌ OneNote API failed: ${oneNoteResponse.status} ${errorText}`);
        }
      } catch (oneNoteError) {
        console.log(`❌ OneNote API error:`, oneNoteError);
      }
      
      // If standard API call doesn't work, try beta API endpoint
      console.log(`🔍 Standard OneNote API failed, trying beta API endpoint...`);
      
      try {
        const betaResponse = await fetch('https://graph.microsoft.com/beta/me/onenote/notebooks?$expand=sections', {
          headers: {
            'Authorization': `Bearer ${tokenResult.token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (betaResponse.ok) {
          const betaData = await betaResponse.json();
          console.log(`✅ OneNote Beta API works! Found ${betaData.value?.length || 0} notebooks`);
          
          if (betaData.value && betaData.value.length > 0) {
            return {
              data: betaData.value || [],
              error: undefined
            };
          }
        } else {
          const errorText = await betaResponse.text();
          console.log(`❌ OneNote Beta API failed: ${betaResponse.status} ${errorText}`);
        }
      } catch (betaError) {
        console.log(`❌ OneNote Beta API error:`, betaError);
      }
      
      // If both API endpoints fail, fall back to OneDrive API
      console.log(`🔍 Both OneNote API endpoints failed, falling back to OneDrive API...`);
      
      // Use OneDrive API to find OneNote notebooks
      // OneNote notebooks are stored as .onetoc2 files in OneDrive
      console.log(`🔍 Searching for OneNote notebooks in OneDrive...`);
      
      // First, try to find OneNote notebooks in the root directory
      // Look for both files and folders that might be OneNote notebooks
      const rootResponse = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
        headers: {
          'Authorization': `Bearer ${tokenResult.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (rootResponse.ok) {
        const rootData = await rootResponse.json();
        console.log(`✅ Found ${rootData.value?.length || 0} OneNote notebooks in root directory`);
        
        // Log the actual files found for debugging
        if (rootData.value && rootData.value.length > 0) {
          console.log(`🔍 All items found in root:`, rootData.value.map((item: any) => ({
            name: item.name,
            id: item.id,
            size: item.size,
            lastModified: item.lastModifiedDateTime,
            // Log all available properties to see what we have
            allProperties: Object.keys(item),
            displayName: item.displayName,
            title: item.title,
            description: item.description,
            isFolder: !!item.folder,
            isFile: !!item.file,
            // Log the entire item object for detailed inspection
            fullItem: item
          })));
        }
        
        // Filter for OneNote-related items (files and folders)
        const oneNoteItems = (rootData.value || []).filter((item: any) => {
          const name = item.name || '';
          const isOneNoteFile = name.endsWith('.onetoc2') || name.endsWith('.one') || name.endsWith('.onetmp2') || name.endsWith('.onetmp');
          const isOneNoteFolder = item.folder && (name.toLowerCase().includes('onenote') || name.toLowerCase().includes('notebook'));
          const isOneNoteRelated = name.toLowerCase().includes('onenote') || name.toLowerCase().includes('notebook');
          
          // Also check for folders that might contain OneNote notebooks
          const isPotentialOneNoteContainer = item.folder && (
            name.toLowerCase().includes('onenote') || 
            name.toLowerCase().includes('notebook') ||
            name.toLowerCase().includes('notes') ||
            name.toLowerCase().includes('personal')
          );
          
          return isOneNoteFile || isOneNoteFolder || isOneNoteRelated || isPotentialOneNoteContainer;
        });
        
        console.log(`🔍 Filtered ${oneNoteItems.length} OneNote-related items from ${rootData.value?.length || 0} total items`);
        
        // If we found potential OneNote containers (folders), search inside them
        const potentialContainers = oneNoteItems.filter((item: any) => item.folder);
        let allOneNoteItems = [...oneNoteItems];
        
        if (potentialContainers.length > 0) {
          console.log(`🔍 Found ${potentialContainers.length} potential OneNote containers, searching inside...`);
          
          for (const container of potentialContainers) {
            try {
              const containerResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${container.id}/children`, {
                headers: {
                  'Authorization': `Bearer ${tokenResult.token}`,
                  'Content-Type': 'application/json'
                }
              });
              
              if (containerResponse.ok) {
                const containerData = await containerResponse.json();
                console.log(`🔍 Found ${containerData.value?.length || 0} items in container "${container.name}"`);
                
                // Look for OneNote files inside the container
                const oneNoteFilesInContainer = (containerData.value || []).filter((item: any) => {
                  const name = item.name || '';
                  return name.endsWith('.onetoc2') || name.endsWith('.one') || name.endsWith('.onetmp2') || name.endsWith('.onetmp');
                });
                
                if (oneNoteFilesInContainer.length > 0) {
                  console.log(`🔍 Found ${oneNoteFilesInContainer.length} OneNote files in container "${container.name}"`);
                  allOneNoteItems.push(...oneNoteFilesInContainer);
                }
              }
            } catch (containerError) {
              console.log(`⚠️ Error searching container "${container.name}":`, containerError);
            }
          }
        }
        
        console.log(`🔍 Total OneNote items found: ${allOneNoteItems.length}`);
        
        // Transform OneNote items to notebook format
        const notebooks = allOneNoteItems.map((item: any) => {
          // Handle different possible file naming patterns
          let displayName = 'Untitled Notebook';
          
          // Try multiple properties that might contain the notebook name
          const possibleNameSources = [
            item.displayName,
            item.title,
            item.name,
            item.description
          ];
          
          for (const source of possibleNameSources) {
            if (source && typeof source === 'string' && source.trim() !== '') {
              displayName = source.trim();
              break;
            }
          }
          
          // If we still don't have a good name, try to extract it from the file name
          // OneNote files often have patterns like "Notebook Name.onetoc2" or "Notebook Name.one"
          if (!displayName || displayName === 'Untitled Notebook' || displayName.includes('.onetoc2') || displayName.includes('.one')) {
            const fileName = item.name || '';
            
            // Try to extract a meaningful name from the file name
            if (fileName && fileName.trim() !== '') {
              // Remove common OneNote extensions
              let extractedName = fileName;
              const extensions = ['.onetoc2', '.one', '.onetmp2', '.onetmp'];
              for (const ext of extensions) {
                if (extractedName.endsWith(ext)) {
                  extractedName = extractedName.replace(ext, '');
                  break;
                }
              }
              
              // Clean up the name
              extractedName = extractedName.trim();
              
              // If the extracted name looks meaningful (not just a hash or random string)
              if (extractedName && extractedName.length > 0 && !extractedName.match(/^[a-f0-9]{32}$/i)) {
                displayName = extractedName;
                console.log(`🔍 Extracted name from filename: "${fileName}" -> "${displayName}"`);
              }
            }
          }
          
          // If the file name is just an extension (like ".onetoc2"), try to use a more descriptive name
          if (displayName === 'Untitled Notebook' && (item.name === '.onetoc2' || item.name === '.one')) {
            console.log(`🔍 File has no meaningful name, using descriptive fallback...`);
            displayName = 'OneNote Notebook';
          }
          
          // Special handling for .onetoc2 files - these are definitely OneNote notebooks
          if (item.name === '.onetoc2') {
            console.log(`🔍 Found OneNote notebook file: ${item.name}`);
            // If we still don't have a good name, use a better fallback
            if (displayName === 'Untitled Notebook' || displayName === 'OneNote Notebook') {
              displayName = 'My OneNote Notebook';
            }
          }
          
          // Remove common OneNote file extensions
          const extensions = ['.onetoc2', '.one', '.onetmp2', '.onetmp'];
          for (const ext of extensions) {
            if (displayName.endsWith(ext)) {
              displayName = displayName.replace(ext, '');
              break;
            }
          }
          
          // If still empty after removing extension, use a fallback name
          if (!displayName || displayName.trim() === '') {
            displayName = 'Untitled Notebook';
          }
          
          console.log(`🔍 Processing OneNote item: "${item.name}" -> displayName: "${displayName}"`);
          
          return {
            id: item.id,
            displayName: displayName,
            name: displayName,
            lastModifiedDateTime: item.lastModifiedDateTime,
            webUrl: item.webUrl,
            size: item.size,
            createdDateTime: item.createdDateTime,
            // Add OneNote-specific properties
            isDefault: false,
            userRole: 'Owner',
            isShared: false,
            links: {
              oneNoteWebUrl: {
                href: item.webUrl
              },
              oneNoteClientUrl: {
                href: item.webUrl
              }
            }
          };
        });
        
        if (notebooks.length > 0) {
          return {
            data: notebooks,
            error: undefined
          };
        }
      } else {
        console.log(`❌ Failed to search root directory: ${rootResponse.status}`);
      }
      
      // If no notebooks found in root, search in Documents folder
      console.log(`🔍 Searching for OneNote notebooks in Documents folder...`);
      
      try {
        // Get the Documents folder
        const documentsResponse = await fetch('https://graph.microsoft.com/v1.0/me/drive/special/documents/children?$filter=file ne null and endswith(name,\'.onetoc2\')', {
          headers: {
            'Authorization': `Bearer ${tokenResult.token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (documentsResponse.ok) {
          const documentsData = await documentsResponse.json();
          console.log(`✅ Found ${documentsData.value?.length || 0} OneNote notebooks in Documents folder`);
          
          const notebooks = (documentsData.value || []).map((file: any) => {
            // Handle different possible file naming patterns
            let displayName = file.name || 'Untitled Notebook';
            
            // Remove .onetoc2 extension if present
            if (displayName.endsWith('.onetoc2')) {
              displayName = displayName.replace('.onetoc2', '');
            }
            
            // If still empty after removing extension, use a fallback name
            if (!displayName || displayName.trim() === '') {
              displayName = 'Untitled Notebook';
            }
            
            console.log(`🔍 Processing OneNote file from Documents: "${file.name}" -> displayName: "${displayName}"`);
            
            return {
              id: file.id,
              displayName: displayName,
              name: displayName,
              lastModifiedDateTime: file.lastModifiedDateTime,
              webUrl: file.webUrl,
              size: file.size,
              createdDateTime: file.createdDateTime,
              isDefault: false,
              userRole: 'Owner',
              isShared: false,
              links: {
                oneNoteWebUrl: {
                  href: file.webUrl
                },
                oneNoteClientUrl: {
                  href: file.webUrl
                }
              }
            };
          });
          
          if (notebooks.length > 0) {
            return {
              data: notebooks,
              error: undefined
            };
          }
        }
      } catch (documentsError) {
        console.log(`⚠️ Error searching Documents folder:`, documentsError);
      }
      
      // If still no notebooks found, search recursively in all folders
      console.log(`🔍 Searching for OneNote notebooks recursively...`);
      
      try {
        // Search for OneNote files by extension
        const searchQueries = [
          '.onetoc2',
          '.one'
        ];
        
        let foundNotebooks = [];
        
        for (const query of searchQueries) {
          console.log(`🔍 Searching for: "${query}"`);
          const searchResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root/search(q='${query}')`, {
            headers: {
              'Authorization': `Bearer ${tokenResult.token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            console.log(`✅ Found ${searchData.value?.length || 0} items for query "${query}"`);
            
            if (searchData.value && searchData.value.length > 0) {
              // Log what we found for this query
              console.log(`🔍 Items found for "${query}":`, searchData.value.map((item: any) => ({
                name: item.name,
                id: item.id,
                size: item.size,
                isFolder: !!item.folder,
                isFile: !!item.file
              })));
              
              foundNotebooks.push(...searchData.value);
            }
          }
        }
        
        // Remove duplicates based on ID
        const uniqueNotebooks = foundNotebooks.filter((notebook: any, index: number, self: any[]) => 
          index === self.findIndex((n: any) => n.id === notebook.id)
        );
        
        // Ensure only actual OneNote files (not folders) are included
        const oneNoteFiles = uniqueNotebooks.filter((item: any) => {
          const isOneNoteFile = item.name === '.onetoc2' || 
                               item.name?.endsWith('.onetoc2') || 
                               item.name?.endsWith('.one');
          const isFile = item.isFile === true || item.file !== undefined;
          const isNotFolder = item.isFolder !== true && item.folder === undefined;
          
          return isOneNoteFile && isFile && isNotFolder;
        });
        
        console.log(`🔍 Found ${oneNoteFiles.length} OneNote files:`, oneNoteFiles.map((f: any) => ({ name: f.name, id: f.id })));
        
        // Log complete file data for debugging
        console.log(`🔍 Complete OneNote file data:`, JSON.stringify(oneNoteFiles, null, 2));
        
        console.log(`✅ Found ${uniqueNotebooks.length} unique OneNote-related items via search`);
        
        if (oneNoteFiles.length > 0) {
          console.log(`✅ Processing ${oneNoteFiles.length} OneNote files from search`);
          
          const notebooks = oneNoteFiles.map((file: any) => {
            // Log all available properties for this file
            console.log(`🔍 Processing file: ${file.name}`);
            console.log(`🔍 Available properties:`, Object.keys(file));
            console.log(`🔍 File object:`, JSON.stringify(file, null, 2));
            
            // Handle different possible file naming patterns
            let displayName = file.name || 'Untitled Notebook';
            
                      // Special handling for .onetoc2 files - these are definitely OneNote notebooks
          if (file.name === '.onetoc2') {
            console.log(`🔍 Found OneNote notebook file: ${file.name}`);
            
            // For files that are just ".onetoc2" (no meaningful name), try to use parent folder name
            if (file.parentReference?.name) {
              displayName = file.parentReference.name;
              console.log(`🔍 Using parent folder name for .onetoc2 file: "${displayName}"`);
            } else {
              displayName = "OneNote Notebook";
              console.log(`🔍 Using descriptive name for .onetoc2 file: "${displayName}"`);
            }
          } else if (file.name && file.name.endsWith('.onetoc2')) {
            // For files that have a name ending in .onetoc2, try to use parent folder name first
            if (file.parentReference?.name) {
              displayName = file.parentReference.name;
              console.log(`🔍 Using parent folder name for OneNote file: "${file.name}" -> "${displayName}"`);
            } else {
              displayName = file.name.replace('.onetoc2', '');
              console.log(`🔍 Using OneNote file name: "${file.name}" -> "${displayName}"`);
            }
          } else if (file.name && file.name.endsWith('.one')) {
            // For files that have a name ending in .one, use the name without extension
            displayName = file.name.replace('.one', '');
            console.log(`🔍 Using OneNote file name: "${file.name}" -> "${displayName}"`);
          } else {
              // Remove .onetoc2 extension if present
              if (displayName.endsWith('.onetoc2')) {
                displayName = displayName.replace('.onetoc2', '');
              }
              
              // If still empty after removing extension, use a fallback name
              if (!displayName || displayName.trim() === '') {
                displayName = 'Untitled Notebook';
              }
            }
            
            console.log(`🔍 Processing OneNote file from search: "${file.name}" -> displayName: "${displayName}"`);
            
            return {
              id: file.id,
              displayName: displayName,
              name: displayName,
              lastModifiedDateTime: file.lastModifiedDateTime,
              webUrl: file.webUrl,
              size: file.size,
              createdDateTime: file.createdDateTime,
              isDefault: false,
              userRole: 'Owner',
              isShared: false,
              links: {
                oneNoteWebUrl: {
                  href: file.webUrl
                },
                oneNoteClientUrl: {
                  href: file.webUrl
                }
              }
            };
          });
          
          console.log(`✅ Returning ${notebooks.length} OneNote notebooks from search:`, notebooks.map((n: any) => ({ id: n.id, name: n.name, displayName: n.displayName })));
          
          if (notebooks.length > 0) {
            return {
              data: notebooks,
              error: undefined
            };
          }
        }
      } catch (searchError) {
        console.log(`⚠️ Error searching for OneNote notebooks:`, searchError);
      }
      
      // If no OneNote items found in root, try searching for OneNote notebooks in special folders
      console.log(`🔍 No OneNote items found in root, trying special OneNote folders...`);
      
      try {
        // Try to find OneNote notebooks in the Documents folder
        const documentsResponse = await fetch('https://graph.microsoft.com/v1.0/me/drive/special/documents/children', {
          headers: {
            'Authorization': `Bearer ${tokenResult.token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (documentsResponse.ok) {
          const documentsData = await documentsResponse.json();
          console.log(`🔍 Found ${documentsData.value?.length || 0} items in Documents folder`);
          
          // Look for OneNote-related items in Documents
          const oneNoteInDocuments = (documentsData.value || []).filter((item: any) => {
            const name = item.name || '';
            return name.toLowerCase().includes('onenote') || name.toLowerCase().includes('notebook') ||
                   name.endsWith('.onetoc2') || name.endsWith('.one');
          });
          
          if (oneNoteInDocuments.length > 0) {
            console.log(`🔍 Found ${oneNoteInDocuments.length} OneNote items in Documents folder`);
            
            const notebooks = oneNoteInDocuments.map((item: any) => {
              let displayName = 'Untitled Notebook';
              
              // Try multiple properties that might contain the notebook name
              const possibleNameSources = [
                item.displayName,
                item.title,
                item.name,
                item.description
              ];
              
              for (const source of possibleNameSources) {
                if (source && typeof source === 'string' && source.trim() !== '') {
                  displayName = source.trim();
                  break;
                }
              }
              
              // Remove common OneNote file extensions
              const extensions = ['.onetoc2', '.one', '.onetmp2', '.onetmp'];
              for (const ext of extensions) {
                if (displayName.endsWith(ext)) {
                  displayName = displayName.replace(ext, '');
                  break;
                }
              }
              
              console.log(`🔍 Processing OneNote item from Documents: "${item.name}" -> displayName: "${displayName}"`);
              
              return {
                id: item.id,
                displayName: displayName,
                name: displayName,
                lastModifiedDateTime: item.lastModifiedDateTime,
                webUrl: item.webUrl,
                size: item.size,
                createdDateTime: item.createdDateTime,
                isDefault: false,
                userRole: 'Owner',
                isShared: false,
                links: {
                  oneNoteWebUrl: {
                    href: item.webUrl
                  },
                  oneNoteClientUrl: {
                    href: item.webUrl
                  }
                }
              };
            });
            
            if (notebooks.length > 0) {
              return {
                data: notebooks,
                error: undefined
              };
            }
          }
        }
        
        // If still no notebooks found, try a broader search for OneNote files
        console.log(`🔍 No OneNote items found in Documents, trying broader OneNote search...`);
        
        const broaderSearchResponse = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/search(q=\'OneNote\')', {
          headers: {
            'Authorization': `Bearer ${tokenResult.token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (broaderSearchResponse.ok) {
          const broaderData = await broaderSearchResponse.json();
          console.log(`✅ Found ${broaderData.value?.length || 0} OneNote-related files via broader search`);
          
          if (broaderData.value && broaderData.value.length > 0) {
            console.log(`🔍 OneNote-related files found:`, broaderData.value.map((file: any) => ({
              name: file.name,
              id: file.id,
              size: file.size,
              lastModified: file.lastModifiedDateTime
            })));
            
            // Transform any OneNote-related files to notebook format
            const notebooks = broaderData.value.map((file: any) => {
              let displayName = file.name || 'Untitled Notebook';
              
              // Remove common OneNote file extensions
              const extensions = ['.onetoc2', '.one', '.onetmp2', '.onetmp'];
              for (const ext of extensions) {
                if (displayName.endsWith(ext)) {
                  displayName = displayName.replace(ext, '');
                  break;
                }
              }
              
              // If still empty after removing extension, use a fallback name
              if (!displayName || displayName.trim() === '') {
                displayName = 'Untitled Notebook';
              }
              
              console.log(`🔍 Processing OneNote-related file: "${file.name}" -> displayName: "${displayName}"`);
              
              return {
                id: file.id,
                displayName: displayName,
                name: displayName,
                lastModifiedDateTime: file.lastModifiedDateTime,
                webUrl: file.webUrl,
                size: file.size,
                createdDateTime: file.createdDateTime,
                isDefault: false,
                userRole: 'Owner',
                isShared: false,
                links: {
                  oneNoteWebUrl: {
                    href: file.webUrl
                  },
                  oneNoteClientUrl: {
                    href: file.webUrl
                  }
                }
              };
            });
            
            if (notebooks.length > 0) {
              return {
                data: notebooks,
                error: undefined
              };
            }
          }
        }
      } catch (broaderError) {
        console.log(`⚠️ Error during broader OneNote search:`, broaderError);
      }
      
      // If still no OneNote notebooks found, return empty array with helpful message
      console.log(`ℹ️ No OneNote notebooks found in OneDrive`);
      return {
        data: [],
        error: {
          message: "No OneNote notebooks found in your OneDrive. OneNote notebooks are stored as .onetoc2 files in OneDrive."
        }
      };
      
    } catch (error: any) {
      console.error('Error in onenote_notebooks:', error);
      return {
        data: [],
        error: {
          message: error.message || "Error fetching OneNote notebooks"
        }
      };
    }
  },
  "onenote_sections": async (integration: any, options?: any) => {
    try {
      if (integration.status !== 'connected') {
        return {
          data: [],
          error: {
            message: "OneNote integration is not connected"
          }
        };
      }
      
      console.log(`🔍 OneNote sections fetcher called with:`, {
        integrationId: integration.id,
        provider: integration.provider,
        status: integration.status,
        options
      });
      
      const tokenResult = await validateAndRefreshToken(integration);
      if (!tokenResult.success) {
        console.log(`❌ OneNote token validation failed: ${tokenResult.error}`);
        return {
          data: [],
          error: {
            message: tokenResult.error || "Authentication failed"
          }
        };
      }
      
      const { notebookId } = options || {};
      
      // First, try the actual OneNote API to get sections
      console.log(`🔍 Trying OneNote API to fetch sections...`);
      
      try {
        // If notebookId is provided, get sections for that specific notebook
        // Otherwise, get all sections across all notebooks
        const apiUrl = notebookId 
          ? `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${notebookId}/sections`
          : 'https://graph.microsoft.com/v1.0/me/onenote/sections';
        
        console.log(`🔍 Fetching sections from: ${apiUrl}`);
        
        const sectionsResponse = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${tokenResult.token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (sectionsResponse.ok) {
          const sectionsData = await sectionsResponse.json();
          console.log(`✅ OneNote Sections API works! Found ${sectionsData.value?.length || 0} sections`);
          
          if (sectionsData.value && sectionsData.value.length > 0) {
            console.log(`🔍 OneNote sections from API:`, sectionsData.value.map((section: any) => ({
              id: section.id,
              displayName: section.displayName,
              name: section.name,
              parentNotebookId: section.parentNotebook?.id,
              lastModifiedDateTime: section.lastModifiedDateTime,
              createdDateTime: section.createdDateTime
            })));
            
            // Return the actual OneNote sections from the API
            return {
              data: sectionsData.value || [],
              error: undefined
            };
          } else {
            console.log(`⚠️ No sections found for ${notebookId ? `notebook ${notebookId}` : 'any notebook'}`);
            return {
              data: [],
              error: undefined
            };
          }
        } else {
          const errorText = await sectionsResponse.text();
          console.log(`❌ OneNote Sections API failed: ${sectionsResponse.status} ${errorText}`);
        }
      } catch (oneNoteError) {
        console.log(`❌ OneNote Sections API error:`, oneNoteError);
      }
      
      // If OneNote API doesn't work, fall back to OneDrive API (but this is less reliable)
      console.log(`🔍 OneNote Sections API failed, falling back to OneDrive API...`);
      
      // Use OneDrive API to find OneNote sections
      // OneNote sections are stored as .one files in OneDrive
      console.log(`🔍 Searching for OneNote sections in OneDrive...`);
      
      // Search for .one files (OneNote sections)
      const searchResponse = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/search(q=\'.one\')', {
        headers: {
          'Authorization': `Bearer ${tokenResult.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        console.log(`✅ Found ${searchData.value?.length || 0} OneNote section files via search`);
        
        // Transform OneNote section files to section format
        const sections = (searchData.value || []).map((file: any) => ({
          id: file.id,
          displayName: file.name.replace('.one', ''),
          name: file.name.replace('.one', ''),
          lastModifiedDateTime: file.lastModifiedDateTime,
          webUrl: file.webUrl,
          size: file.size,
          createdDateTime: file.createdDateTime,
          // Add OneNote-specific properties
          isDefault: false,
          userRole: 'Owner',
          isShared: false,
          links: {
            oneNoteWebUrl: {
              href: file.webUrl
            },
            oneNoteClientUrl: {
              href: file.webUrl
            }
          }
        }));
        
        console.log(`✅ Successfully processed ${sections.length} OneNote sections from OneDrive`);
        return {
          data: sections,
          error: undefined
        };
      } else {
        console.log(`❌ Failed to search for OneNote sections: ${searchResponse.status}`);
      }
      
      // If search failed, return empty array to prevent UI breaks
      console.log('OneNote sections search failed - returning empty array');
      return {
        data: [],
        error: {
          message: "Could not retrieve OneNote sections"
        }
      };
    } catch (error) {
      console.error('Error in onenote_sections:', error);
      return {
        data: [],
        error: {
          message: "Error retrieving OneNote sections"
        }
      };
    }
  },
  "onenote_pages": async (integration: any, options?: any) => {
    try {
      if (integration.status !== 'connected') {
        return {
          data: [],
          error: {
            message: "OneNote integration is not connected"
          }
        };
      }
      
      console.log(`🔍 OneNote pages fetcher called with:`, {
        integrationId: integration.id,
        provider: integration.provider,
        status: integration.status,
        options
      });
      
      const tokenResult = await validateAndRefreshToken(integration);
      if (!tokenResult.success) {
        console.log(`❌ OneNote token validation failed: ${tokenResult.error}`);
        return {
          data: [],
          error: {
            message: tokenResult.error || "Authentication failed"
          }
        };
      }
      
      const { sectionId } = options || {};
      
      // First, try the actual OneNote API to get pages
      console.log(`🔍 Trying OneNote API to fetch pages...`);
      
      try {
        // If sectionId is provided, get pages for that specific section
        // Otherwise, get all pages across all sections
        const apiUrl = sectionId 
          ? `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}/pages`
          : 'https://graph.microsoft.com/v1.0/me/onenote/pages';
        
        console.log(`🔍 Fetching pages from: ${apiUrl}`);
        
        const pagesResponse = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${tokenResult.token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (pagesResponse.ok) {
          const pagesData = await pagesResponse.json();
          console.log(`✅ OneNote Pages API works! Found ${pagesData.value?.length || 0} pages`);
          
          if (pagesData.value && pagesData.value.length > 0) {
            console.log(`🔍 OneNote pages from API:`, pagesData.value.map((page: any) => ({
              id: page.id,
              title: page.title,
              parentSectionId: page.parentSection?.id,
              lastModifiedDateTime: page.lastModifiedDateTime,
              createdDateTime: page.createdDateTime
            })));
            
            // Return the actual OneNote pages from the API
            return {
              data: pagesData.value || [],
              error: undefined
            };
          } else {
            console.log(`⚠️ No pages found for ${sectionId ? `section ${sectionId}` : 'any section'}`);
            return {
              data: [],
              error: undefined
            };
          }
        } else {
          const errorText = await pagesResponse.text();
          console.log(`❌ OneNote Pages API failed: ${pagesResponse.status} ${errorText}`);
        }
      } catch (oneNoteError) {
        console.log(`❌ OneNote Pages API error:`, oneNoteError);
      }
      
      // If OneNote API doesn't work, fall back to OneDrive API (but this is less reliable)
      console.log(`🔍 OneNote Pages API failed, falling back to OneDrive API...`);
      
      // Use OneDrive API to find OneNote pages
      console.log(`🔍 Searching for OneNote pages in OneDrive...`);
      
      // Search for .one files (OneNote pages)
      const searchResponse = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/search(q=\'.one\')', {
        headers: {
          'Authorization': `Bearer ${tokenResult.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        console.log(`✅ Found ${searchData.value?.length || 0} OneNote page files via search`);
        
        // Transform OneNote page files to page format
        const pages = (searchData.value || []).map((file: any) => ({
          id: file.id,
          title: file.name.replace('.one', ''),
          name: file.name.replace('.one', ''),
          lastModifiedDateTime: file.lastModifiedDateTime,
          webUrl: file.webUrl,
          size: file.size,
          createdDateTime: file.createdDateTime,
          // Add OneNote-specific properties
          userRole: 'Owner',
          isShared: false,
          links: {
            oneNoteWebUrl: {
              href: file.webUrl
            },
            oneNoteClientUrl: {
              href: file.webUrl
            }
          }
        }));
        
        console.log(`✅ Successfully processed ${pages.length} OneNote pages from OneDrive`);
        return {
          data: pages,
          error: undefined
        };
      } else {
        console.log(`❌ Failed to search for OneNote pages: ${searchResponse.status}`);
      }
      
      // If search failed, return empty array to prevent UI breaks
      console.log('OneNote pages search failed - returning empty array');
      return {
        data: [],
        error: {
          message: "Could not retrieve OneNote pages"
        }
      };
    } catch (error) {
      console.error('Error in onenote_pages:', error);
      return {
        data: [],
        error: {
          message: "Error retrieving OneNote pages"
        }
      };
    }
  },

  // Microsoft Outlook data fetchers
  "outlook_folders": async (integration: any) => {
    try {
      console.log("🔍 Outlook folders fetcher called with integration:", {
        id: integration.id,
        provider: integration.provider,
        hasToken: !!integration.access_token,
        tokenLength: integration.access_token?.length
      })
      
      const response = await fetch("https://graph.microsoft.com/v1.0/me/mailFolders", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      console.log("🔍 Outlook API response status:", response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("🔍 Outlook API error response:", errorData)
        
        if (response.status === 401) {
          console.warn("Outlook authentication expired, returning empty array to prevent UI break")
          return []
        }
        console.error(`Microsoft Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
        return []
      }

      const data = await response.json()
      console.log("🔍 Outlook API success response:", data)
      
      const folders = (data.value || []).map((folder: any) => ({
        id: folder.id,
        name: folder.displayName || folder.name || "Untitled Folder",
        value: folder.id,
        totalItemCount: folder.totalItemCount,
        unreadItemCount: folder.unreadItemCount,
        isHidden: folder.isHidden || false,
      }))
      
      console.log("🔍 Processed Outlook folders:", folders)
      return folders
    } catch (error: any) {
      console.error("Error fetching Outlook folders:", error)
      return []
    }
  },

  "outlook_messages": async (integration: any, options: any) => {
    try {
      const { folderId, limit = 50 } = options || {}
      
      let url = "https://graph.microsoft.com/v1.0/me/messages"
      if (folderId) {
        url = `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages`
      }
      
      url += `?$top=${limit}&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,isRead,hasAttachments`

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (response.status === 401) {
          console.warn("Outlook authentication expired, returning empty array to prevent UI break")
          return []
        }
        console.error(`Microsoft Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
        return []
      }

      const data = await response.json()
      return (data.value || []).map((message: any) => ({
        id: message.id,
        name: message.subject || "No Subject",
        value: message.id,
        from: message.from?.emailAddress?.address || "",
        fromName: message.from?.emailAddress?.name || "",
        receivedDateTime: message.receivedDateTime,
        isRead: message.isRead,
        hasAttachments: message.hasAttachments,
        folderId: folderId || "inbox",
      }))
    } catch (error: any) {
      console.error("Error fetching Outlook messages:", error)
      return []
    }
  },

  "outlook_contacts": async (integration: any) => {
    try {
      const response = await fetch("https://graph.microsoft.com/v1.0/me/contacts?$top=100&$orderby=displayName", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (response.status === 401) {
          console.warn("Outlook authentication expired, returning empty array to prevent UI break")
          return []
        }
        console.error(`Microsoft Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
        return []
      }

      const data = await response.json()
      return (data.value || []).map((contact: any) => ({
        id: contact.id,
        name: contact.displayName || `${contact.givenName || ""} ${contact.surname || ""}`.trim() || "Unknown Contact",
        value: contact.id,
        email: contact.emailAddresses?.[0]?.address || "",
        businessPhone: contact.businessPhones?.[0] || "",
        mobilePhone: contact.mobilePhones?.[0] || "",
        company: contact.companyName || "",
        jobTitle: contact.jobTitle || "",
      }))
    } catch (error: any) {
      console.error("Error fetching Outlook contacts:", error)
      return []
    }
  },

  "outlook_calendars": async (integration: any) => {
    try {
      const response = await fetch("https://graph.microsoft.com/v1.0/me/calendars", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (response.status === 401) {
          console.warn("Outlook authentication expired, returning empty array to prevent UI break")
          return []
        }
        console.error(`Microsoft Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
        return []
      }

      const data = await response.json()
      return (data.value || []).map((calendar: any) => ({
        id: calendar.id,
        name: calendar.name || "Untitled Calendar",
        value: calendar.id,
        isDefaultCalendar: calendar.isDefaultCalendar || false,
        color: calendar.color || "auto",
        canEdit: calendar.canEdit || false,
        canShare: calendar.canShare || false,
        canViewPrivateItems: calendar.canViewPrivateItems || false,
      }))
    } catch (error: any) {
      console.error("Error fetching Outlook calendars:", error)
      return []
    }
  },

  "outlook_events": async (integration: any, options: any) => {
    try {
      const { calendarId, startDate, endDate } = options || {}
      
      let url = "https://graph.microsoft.com/v1.0/me/events"
      if (calendarId) {
        url = `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/events`
      }
      
      const params = new URLSearchParams()
      if (startDate) params.append("$filter", `start/dateTime ge '${startDate}'`)
      if (endDate) params.append("$filter", `end/dateTime le '${endDate}'`)
      params.append("$orderby", "start/dateTime")
      params.append("$top", "50")
      
      if (params.toString()) {
        url += `?${params.toString()}`
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (response.status === 401) {
          console.warn("Outlook authentication expired, returning empty array to prevent UI break")
          return []
        }
        console.error(`Microsoft Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
        return []
      }

      const data = await response.json()
      return (data.value || []).map((event: any) => ({
        id: event.id,
        name: event.subject || "Untitled Event",
        value: event.id,
        start: event.start?.dateTime,
        end: event.end?.dateTime,
        isAllDay: event.isAllDay || false,
        location: event.location?.displayName || "",
        attendees: event.attendees?.map((a: any) => a.emailAddress?.address).filter(Boolean) || [],
        calendarId: calendarId || "default",
      }))
    } catch (error: any) {
      console.error("Error fetching Outlook events:", error)
      return []
    }
  },

  "outlook_signatures": async (integration: any) => {
    try {
      // Fetch user's mail settings which includes signatures
      const response = await fetch("https://graph.microsoft.com/v1.0/me/mailboxSettings", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (response.status === 401) {
          console.warn("Outlook authentication expired, returning default signatures")
          return [
            { value: "personal", label: "Personal", content: "Best regards,\nYour Name\nYour Company" },
            { value: "professional", label: "Professional", content: "Sincerely,\nYour Name\nYour Title\nYour Company" },
            { value: "casual", label: "Casual", content: "Thanks!\nYour Name" }
          ]
        }
        console.error(`Microsoft Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
        return []
      }

      const data = await response.json()
      const signatures = []

      // Add default signatures
      signatures.push(
        { value: "personal", label: "Personal", content: "Best regards,\nYour Name\nYour Company" },
        { value: "professional", label: "Professional", content: "Sincerely,\nYour Name\nYour Title\nYour Company" },
        { value: "casual", label: "Casual", content: "Thanks!\nYour Name" }
      )

      // If user has custom signatures, add them
      if (data.signature) {
        signatures.push({
          value: "custom",
          label: "Custom Signature",
          content: data.signature
        })
      }

      return signatures
    } catch (error: any) {
      console.error("Error fetching Outlook signatures:", error)
      // Return default signatures as fallback
      return [
        { value: "personal", label: "Personal", content: "Best regards,\nYour Name\nYour Company" },
        { value: "professional", label: "Professional", content: "Sincerely,\nYour Name\nYour Title\nYour Company" },
        { value: "casual", label: "Casual", content: "Thanks!\nYour Name" }
      ]
    }
  },

  "gmail_signatures": async (integration: any) => {
    try {
      // Fetch user's Gmail settings which includes signatures
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (response.status === 401) {
          console.warn("Gmail authentication expired, returning default signatures")
          return [
            { value: "personal", label: "Personal", content: "Best regards,\nYour Name\nYour Company" },
            { value: "professional", label: "Professional", content: "Sincerely,\nYour Name\nYour Title\nYour Company" },
            { value: "casual", label: "Casual", content: "Thanks!\nYour Name" }
          ]
        }
        console.error(`Gmail API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
        return []
      }

      const data = await response.json()
      const signatures = []

      // Add default signatures
      signatures.push(
        { value: "personal", label: "Personal", content: "Best regards,\nYour Name\nYour Company" },
        { value: "professional", label: "Professional", content: "Sincerely,\nYour Name\nYour Title\nYour Company" },
        { value: "casual", label: "Casual", content: "Thanks!\nYour Name" }
      )

      // If user has custom signatures, add them
      if (data.sendAs && data.sendAs.length > 0) {
        data.sendAs.forEach((sendAs: any) => {
          if (sendAs.signature) {
            signatures.push({
              value: `custom_${sendAs.sendAsEmail}`,
              label: `Custom Signature (${sendAs.sendAsEmail})`,
              content: sendAs.signature
            })
          }
        })
      }

      return signatures
    } catch (error: any) {
      console.error("Error fetching Gmail signatures:", error)
      // Return default signatures as fallback
      return [
        { value: "personal", label: "Personal", content: "Best regards,\nYour Name\nYour Company" },
        { value: "professional", label: "Professional", content: "Sincerely,\nYour Name\nYour Title\nYour Company" },
        { value: "casual", label: "Casual", content: "Thanks!\nYour Name" }
      ]
    }
  },

  slack_workspaces: async (integration: any) => {
    try {
      console.log(`🔍 Slack workspaces fetcher called with integration:`, {
        id: integration.id,
        provider: integration.provider,
        status: integration.status,
        hasToken: !!integration.access_token,
        tokenLength: integration.access_token?.length || 0
      })

      // Slack doesn't have a direct API for multiple workspaces, but we can get team info
      const response = await fetch("https://slack.com/api/team.info", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      console.log(`🔍 Slack API response status:`, response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Slack API error response:`, {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        })
        
        if (response.status === 401) {
          throw new Error("Slack authentication expired. Please reconnect your account.")
        }
        
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch (e) {
          errorData = { error: errorText }
        }
        
        throw new Error(`Slack API error: ${response.status} - ${errorData.error || response.statusText}`)
      }

      const data = await response.json()
      console.log(`🔍 Slack API response data:`, data)
      
      if (!data.ok) {
        console.error(`❌ Slack API returned ok=false:`, data)
        throw new Error(`Slack API error: ${data.error}`)
      }

      // Return the team/workspace info
      const result = [{
        id: data.team.id,
        name: data.team.name,
        value: data.team.id,
        description: `Slack workspace: ${data.team.name}`,
        domain: data.team.domain,
        icon: data.team.icon?.image_132 || undefined,
      }]
      
      console.log(`✅ Slack workspaces fetcher returning:`, result)
      return result
    } catch (error: any) {
      console.error("❌ Error fetching Slack workspaces:", error)
      console.error("❌ Error stack:", error.stack)
      throw error
    }
  },

  slack_users: async (integration: any) => {
    try {
      return await fetchWithRetry(async () => {
        const response = await fetch("https://slack.com/api/users.list", {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        })

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Slack authentication expired. Please reconnect your account.")
          }
          if (response.status === 429) {
            // Rate limited - get retry-after header or use default
            const retryAfter = response.headers.get('retry-after')
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 1000
            console.log(`🚦 Slack API rate limited, waiting ${waitTime}ms before retry`)
            await new Promise(resolve => setTimeout(resolve, waitTime))
            throw new Error(`Slack API rate limited - retrying`)
          }
          const errorData = await response.json().catch(() => ({}))
          throw new Error(`Slack API error: ${response.status} - ${errorData.error || response.statusText}`)
        }

        const data = await response.json()
        
        if (!data.ok) {
          throw new Error(`Slack API error: ${data.error}`)
        }

        // Filter out bots and return active users
        return (data.members || [])
          .filter((user: any) => !user.is_bot && !user.deleted && user.id !== 'USLACKBOT')
          .map((user: any) => ({
            id: user.id,
            name: user.real_name || user.name,
            value: user.id,
            email: user.profile?.email,
            avatar: user.profile?.image_32,
            status: user.profile?.status_text,
          }))
      }, 3, 1000) // 3 retries with 1 second initial delay
    } catch (error: any) {
      console.error("Error fetching Slack users:", error)
      throw error
    }
  },
  twitter_mentions: getTwitterMentionsForDropdown,
}

// Helper functions
function getPageTitle(page: any): string {
  // First, try the standard title property
  if (page.properties?.title?.title?.[0]?.plain_text) {
    return page.properties.title.title[0].plain_text
  }
  
  // Try the Name property (common alternative)
  if (page.properties?.Name?.title?.[0]?.plain_text) {
    return page.properties.Name.title[0].plain_text
  }
  
  // Search through all properties for any title-like field
  if (page.properties) {
    for (const [key, prop] of Object.entries(page.properties)) {
      const typedProp = prop as any
      
      // Check for title arrays
      if (typedProp.title && Array.isArray(typedProp.title) && typedProp.title.length > 0) {
        const titleText = typedProp.title[0].plain_text
        if (titleText && titleText.trim() !== '') {
          return titleText
        }
      }
      
      // Check for rich_text arrays (another common title format)
      if (typedProp.rich_text && Array.isArray(typedProp.rich_text) && typedProp.rich_text.length > 0) {
        const richText = typedProp.rich_text[0].plain_text
        if (richText && richText.trim() !== '') {
          return richText
        }
      }
      
      // Check for name properties
      if (typedProp.name && Array.isArray(typedProp.name) && typedProp.name.length > 0) {
        const nameText = typedProp.name[0].plain_text
        if (nameText && nameText.trim() !== '') {
          return nameText
        }
      }
      
      // Check for text properties
      if (typedProp.text && Array.isArray(typedProp.text) && typedProp.text.length > 0) {
        const textText = typedProp.text[0].plain_text
        if (textText && textText.trim() !== '') {
          return textText
        }
      }
    }
  }
  
  // If we still can't find a title, try to extract from the URL
  if (page.url) {
    const urlParts = page.url.split('/')
    const lastPart = urlParts[urlParts.length - 1]
    if (lastPart && lastPart !== page.id) {
      // Decode URL and replace dashes with spaces
      try {
        const decoded = decodeURIComponent(lastPart.replace(/-/g, ' '))
        if (decoded && decoded.trim() !== '') {
          return decoded
        }
      } catch (e) {
        // If decoding fails, just use the last part with dashes replaced
        const cleaned = lastPart.replace(/-/g, ' ')
        if (cleaned && cleaned.trim() !== '') {
          return cleaned
        }
      }
    }
  }
  
  // Last resort: use the page ID as a fallback
  if (page.id) {
    return `Page ${page.id.slice(0, 8)}...`
  }
  
  return "Untitled"
}

function getDatabaseTitle(database: any): string {
  if (database.title?.[0]?.plain_text) {
    return database.title[0].plain_text
  }
  return "Untitled Database"
}

function extractEmailAddresses(headerValue: string): { email: string; name?: string }[] {
  const emails: { email: string; name?: string }[] = []
  
  try {
    if (!headerValue || typeof headerValue !== 'string') {
      return emails
    }

    // Split by comma and clean up each email
    const parts = headerValue.split(',').map(part => part.trim()).filter(Boolean)
    
    parts.forEach(part => {
      try {
        // Match patterns like "Name <email@domain.com>" or just "email@domain.com"
        const nameEmailMatch = part.match(/^(.+?)\s*<([^>]+)>$/)
        const emailOnlyMatch = part.match(/^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/)
        
        if (nameEmailMatch) {
          const name = nameEmailMatch[1].replace(/['"]/g, '').trim()
          const email = nameEmailMatch[2].trim()
          if (isValidEmail(email)) {
            emails.push({ email, name })
          }
        } else if (emailOnlyMatch) {
          const email = emailOnlyMatch[1].trim()
          if (isValidEmail(email)) {
            emails.push({ email })
          }
        }
      } catch (error) {
        console.warn(`Failed to parse email part: ${part}`, error)
      }
    })
  } catch (error) {
    console.warn(`Failed to extract emails from header: ${headerValue}`, error)
  }
  
  return emails
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return emailRegex.test(email)
}

// Helper function to get Discord status color
function getStatusColor(status: string): string {
  switch (status) {
    case "online":
      return "#43b581"
    case "idle":
      return "#faa61a"
    case "dnd":
      return "#f04747"
    case "offline":
    default:
      return "#747f8d"
  }
}
