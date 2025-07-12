import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { decrypt } from "@/lib/security/encryption"
import { fetchAirtableWithRetry, delayBetweenRequests } from "@/lib/integrations/airtableRateLimiter"
import { getTwitterMentionsForDropdown } from '@/lib/integrations/twitter'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

interface DataFetcher {
  [key: string]: (integration: any, options?: any) => Promise<any[]>
}

// Add comprehensive error handling and fix API calls
export async function POST(request: NextRequest) {
  console.log("🚀 API endpoint called")
  console.log("🔍 Request URL:", request.url)
  console.log("🔍 Request method:", request.method)
  console.log("🔍 Request headers:", Object.fromEntries(request.headers.entries()))
  
  try {
    console.log("📝 Parsing request body...")
    const requestBody = await request.json()
    console.log("🔍 API Request Body:", JSON.stringify(requestBody, null, 2))
    
    const { provider, dataType, batchSize = 100, preload = false, ...additionalParams } = requestBody

    if (!provider || !dataType) {
      console.error("❌ Missing provider or dataType:", { provider, dataType })
      return NextResponse.json(
        {
          success: false,
          error: "Provider and dataType are required",
        },
        { status: 400 },
      )
    }

    // Get user from authorization header
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      return NextResponse.json(
        {
          success: false,
          error: "Authorization header required",
        },
        { status: 401 },
      )
    }

    // Extract token and validate user
    const token = authHeader.replace("Bearer ", "")
    const { data: userData, error: userError } = await supabase.auth.getUser(token)

    if (userError || !userData.user) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid authentication token",
        },
        { status: 401 },
      )
    }

    console.log(`🔍 Fetching ${dataType} for ${provider} (user: ${userData.user.id})`)

    // Get integration for the provider
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userData.user.id)
      .eq("provider", provider)
      .eq("status", "connected")
      .single()

    if (integrationError || !integration) {
      console.log(`❌ No connected integration found for ${provider}`)
      return NextResponse.json(
        {
          success: false,
          error: `${provider} integration not found or not connected`,
        },
        { status: 404 },
      )
    }

    // ------------------------------------------------------------
    // Decrypt stored tokens *before* any validation / API calls
    // ------------------------------------------------------------
    try {
      const encryptionKey = process.env.ENCRYPTION_KEY || ""

      if (integration.access_token && integration.access_token.includes(":")) {
        integration.access_token = decrypt(integration.access_token, encryptionKey)
      }

      if (integration.refresh_token && integration.refresh_token.includes(":")) {
        integration.refresh_token = decrypt(integration.refresh_token, encryptionKey)
      }
    } catch (decryptionError) {
      console.error("❌ Failed to decrypt integration tokens:", decryptionError)
      return NextResponse.json(
        {
          success: false,
          error: "Failed to decrypt integration credentials. Please reconnect your integration.",
        },
        { status: 500 },
      )
    }

    // Validate and refresh token if needed
    const tokenValidation = await validateAndRefreshToken(integration)
    if (!tokenValidation.success) {
      return NextResponse.json(
        {
          success: false,
          error: tokenValidation.error,
        },
        { status: 401 },
      )
    }

    // Use updated token
    const validToken = tokenValidation.token || integration.access_token

    // Get the appropriate data fetcher
    let fetcherKey = dataType
    
    // If dataType doesn't include provider prefix, construct it
    if (!dataType.includes('_') && !dataType.includes('-')) {
      fetcherKey = `${provider}_${dataType}`
    }
    
    // Special case for gmail-recent-recipients
    if (provider === "gmail" && dataType === "gmail-recent-recipients") {
      fetcherKey = "gmail-recent-recipients"
    }
    
    // Special case for gmail-enhanced-recipients
    if (provider === "gmail" && dataType === "gmail-enhanced-recipients") {
      fetcherKey = "gmail-enhanced-recipients"
    }
    
    // Special case for outlook-enhanced-recipients
    if (provider === "microsoft-outlook" && dataType === "outlook-enhanced-recipients") {
      fetcherKey = "outlook-enhanced-recipients"
    }
    
    // Special case for google-calendars
    if (provider === "google-calendar" && dataType === "google-calendars") {
      fetcherKey = "google-calendars"
    }
    
    // Special cases for google-drive
    if (provider === "google-drive" && dataType === "google-drive-folders") {
      fetcherKey = "google-drive-folders"
    }
    
    if (provider === "google-drive" && dataType === "google-drive-files") {
      fetcherKey = "google-drive-files"
    }
    
    // Special cases for Slack
    if (provider === "slack" && dataType === "slack_workspaces") {
      fetcherKey = "slack_workspaces"
    }
    
    if (provider === "slack" && dataType === "slack_users") {
      fetcherKey = "slack_users"
    }
    
    // Special cases for Trello
    if (provider === "trello" && dataType === "trello-boards") {
      fetcherKey = "trello-boards"
    }
    
    if (provider === "trello" && dataType === "trello-list-templates") {
      fetcherKey = "trello-list-templates"
    }
    
    if (provider === "trello" && dataType === "trello_cards") {
      fetcherKey = "trello_cards"
    }
    
    console.log(`🔍 API: provider=${provider}, dataType=${dataType}, fetcherKey=${fetcherKey}`)
    console.log(`🔍 Available fetchers:`, Object.keys(dataFetchers))
    console.log(`🔍 Integration details:`, { id: integration.id, provider: integration.provider, status: integration.status })
    
    const fetcher = dataFetchers[fetcherKey]

    if (!fetcher) {
      console.error(`❌ No fetcher found for key: ${fetcherKey}`)
      console.error(`❌ Available fetcher keys:`, Object.keys(dataFetchers))
      return NextResponse.json(
        {
          success: false,
          error: `No data fetcher found for ${provider} ${dataType} (key: ${fetcherKey})`,
        },
        { status: 400 },
      )
    }

    // Fetch the data with timeout and retry logic
    console.log(`🌐 Fetching ${dataType} for ${provider}${preload ? " (preload)" : ""}`)
    console.log(`🔍 About to call fetcher function for key: ${fetcherKey}`)
    console.log(`🔍 Integration token length: ${validToken ? validToken.length : 0}`)
    const startTime = Date.now()

    try {
      const data = await fetchWithRetry(
          () => fetcher({ ...integration, access_token: validToken }, { batchSize, ...additionalParams }),
        3, // max retries
        2000, // initial delay
      )
      
      console.log(`✅ Fetcher completed successfully, data length: ${data.length}`)
      
      const endTime = Date.now()
      console.log(`✅ Fetched ${data.length} ${dataType} for ${provider} in ${endTime - startTime}ms`)

      return NextResponse.json(
        {
          success: true,
          data,
          count: data.length,
          provider,
          dataType,
          fetchTime: endTime - startTime,
          cached: false,
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
            "Content-Type": "application/json",
          },
        },
      )
    } catch (fetcherError: any) {
      console.error(`💥 Fetcher error for ${fetcherKey}:`, fetcherError)
      console.error(`💥 Fetcher error stack:`, fetcherError.stack)
      throw fetcherError
    }
  } catch (error: any) {
    console.error("💥 Error in fetch-user-data API:", error)
    console.error("💥 Error stack:", error.stack)

    let errorMessage = "Failed to fetch user data"
    let statusCode = 500

    if (error.message.includes("authentication") || error.message.includes("expired")) {
      errorMessage = error.message
      statusCode = 401
    } else if (error.message.includes("Teams access denied") || error.message.includes("403")) {
      errorMessage = error.message
      statusCode = 403
    } else if (error.message.includes("timeout")) {
      errorMessage = "Request timed out. Please try again."
      statusCode = 408
    } else if (error.message.includes("rate limit")) {
      errorMessage = "Rate limit exceeded. Please wait a moment and try again."
      statusCode = 429
    } else if (error.message.includes("not found")) {
      errorMessage = "Resource not found or access denied."
      statusCode = 404
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: statusCode },
    )
  }
}

// Helper function to validate and refresh token if needed
async function validateAndRefreshToken(integration: any): Promise<{
  success: boolean
  token?: string
  error?: string
}> {
  try {
    // Check if token is expired
    if (integration.expires_at) {
      const expiresAt = new Date(integration.expires_at)
      const now = new Date()
      const timeUntilExpiry = expiresAt.getTime() - now.getTime()

      // If expires within 5 minutes, try to refresh
      if (timeUntilExpiry < 5 * 60 * 1000) {
        console.log(`🔄 Token expiring soon for ${integration.provider}, attempting refresh...`)

        if (integration.refresh_token) {
          const { TokenRefreshService } = await import("@/lib/integrations/tokenRefreshService")
          const refreshResult = await TokenRefreshService.refreshTokenForProvider(
            integration.provider,
            integration.refresh_token,
            integration
          )

          if (refreshResult.success && refreshResult.accessToken) {
            return {
              success: true,
              token: refreshResult.accessToken,
            }
          } else if (refreshResult.needsReauthorization) {
            return {
              success: false,
              error: `${integration.provider} authentication expired. Please reconnect your account.`,
            }
          }
        } else {
          return {
            success: false,
            error: `${integration.provider} token expired and no refresh token available. Please reconnect.`,
          }
        }
      }
    }

    return {
      success: true,
      token: integration.access_token,
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
      const response = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Discord authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Discord API error: ${response.status} - ${errorData.message || response.statusText}`)
      }

      const data = await response.json()
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
      throw error
    }
  },

  "discord_channels": async (integration: any, options: any) => {
    try {
      const { guildId } = options || {}
      
      if (!guildId) {
        throw new Error("Guild ID is required to fetch Discord channels")
      }

      // Use bot token for channel listing (bot must be in the guild)
      const botToken = process.env.DISCORD_BOT_TOKEN
      if (!botToken) {
        console.warn("Discord bot token not configured - returning empty channels list")
        return []
      }

      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Discord bot authentication failed. Please check bot configuration.")
        }
        if (response.status === 403) {
          throw new Error("Bot does not have permission to view channels in this server. Please ensure the bot has the 'View Channels' permission and try again.")
        }
        if (response.status === 404) {
          // Bot is not in the server - return empty array instead of throwing error
          console.log(`Bot is not a member of server ${guildId} - returning empty channels list`)
          return []
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Discord API error: ${response.status} - ${errorData.message || response.statusText}`)
      }

      const data = await response.json()
      return (data || [])
        .filter((channel: any) => channel.type === 0) // Only text channels (type 0)
        .map((channel: any) => ({
          id: channel.id,
          name: `#${channel.name}`,
          value: channel.id,
          type: channel.type,
          position: channel.position,
          parent_id: channel.parent_id,
        }))
    } catch (error: any) {
      console.error("Error fetching Discord channels:", error)
      throw error
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

  // Microsoft OneNote data fetchers
  "onenote_notebooks": async (integration: any) => {
    try {
      console.log("🔍 OneNote notebooks fetcher called with integration:", {
        id: integration.id,
        provider: integration.provider,
        hasToken: !!integration.access_token,
        tokenLength: integration.access_token?.length
      })
      
      const response = await fetch("https://graph.microsoft.com/v1.0/me/onenote/notebooks", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      console.log("🔍 OneNote API response status:", response.status, response.statusText)
      console.log("🔍 OneNote API response headers:", Object.fromEntries(response.headers.entries()))

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("🔍 OneNote API error response:", errorData)
        
        if (response.status === 401) {
          console.warn("OneNote authentication expired, returning empty array to prevent UI break")
          // Return empty array instead of throwing to prevent breaking the entire modal
          return []
        }
        console.error(`Microsoft Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
        // Return empty array for other errors too to maintain UI stability
        return []
      }

      const data = await response.json()
      console.log("🔍 OneNote API success response:", data)
      
      const notebooks = (data.value || []).map((notebook: any) => ({
        id: notebook.id,
        name: notebook.displayName || notebook.name || "Untitled Notebook",
        value: notebook.id,
        created_time: notebook.createdDateTime,
        modified_time: notebook.lastModifiedDateTime,
        sections_url: notebook.sectionsUrl,
        is_default: notebook.isDefault || false,
      }))
      
      console.log("🔍 Processed OneNote notebooks:", notebooks)
      return notebooks
    } catch (error: any) {
      console.error("Error fetching OneNote notebooks:", error)
      // Return empty array instead of throwing to prevent breaking the UI
      return []
    }
  },

  "onenote_sections": async (integration: any, options: any) => {
    try {
      const { notebookId } = options || {}
      
      if (!notebookId) {
        console.error("Notebook ID is required to fetch OneNote sections")
        return []
      }

      const response = await fetch(`https://graph.microsoft.com/v1.0/me/onenote/notebooks/${notebookId}/sections`, {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (response.status === 401) {
          console.warn("OneNote authentication expired, returning empty array to prevent UI break")
          return []
        }
        console.error(`Microsoft Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
        return []
      }

      const data = await response.json()
      return (data.value || []).map((section: any) => ({
        id: section.id,
        name: section.displayName || section.name || "Untitled Section",
        value: section.id,
        created_time: section.createdDateTime,
        modified_time: section.lastModifiedDateTime,
        pages_url: section.pagesUrl,
        notebook_id: notebookId,
      }))
    } catch (error: any) {
      console.error("Error fetching OneNote sections:", error)
      return []
    }
  },

  "onenote_pages": async (integration: any, options: any) => {
    try {
      const { sectionId } = options || {}
      
      if (!sectionId) {
        console.error("Section ID is required to fetch OneNote pages")
        return []
      }

      const response = await fetch(`https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}/pages`, {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (response.status === 401) {
          console.warn("OneNote authentication expired, returning empty array to prevent UI break")
          return []
        }
        console.error(`Microsoft Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
        return []
      }

      const data = await response.json()
      return (data.value || []).map((page: any) => ({
        id: page.id,
        name: page.title || "Untitled Page",
        value: page.id,
        created_time: page.createdDateTime,
        modified_time: page.lastModifiedDateTime,
        content_url: page.contentUrl,
        links: page.links,
        section_id: sectionId,
      }))
    } catch (error: any) {
      console.error("Error fetching OneNote pages:", error)
      return []
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
