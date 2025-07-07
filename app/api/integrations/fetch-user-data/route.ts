import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { decrypt } from "@/lib/security/encryption"
import { fetchAirtableWithRetry, delayBetweenRequests } from "@/lib/integrations/airtableRateLimiter"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

interface DataFetcher {
  [key: string]: (integration: any, options?: any) => Promise<any[]>
}

// Add comprehensive error handling and fix API calls
export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json()
    const { provider, dataType, batchSize = 100, preload = false, ...additionalParams } = requestBody

    if (!provider || !dataType) {
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
    
    console.log(`🔍 API: provider=${provider}, dataType=${dataType}, fetcherKey=${fetcherKey}`)
    console.log(`🔍 Available fetchers:`, Object.keys(dataFetchers))
    
    const fetcher = dataFetchers[fetcherKey]

    if (!fetcher) {
      console.error(`❌ No fetcher found for key: ${fetcherKey}`)
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
    const startTime = Date.now()

    const data = await fetchWithRetry(
        () => fetcher({ ...integration, access_token: validToken }, { batchSize, ...additionalParams }),
      3, // max retries
      2000, // initial delay
    )

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
  } catch (error: any) {
    console.error("💥 Error in fetch-user-data API:", error)

    let errorMessage = "Failed to fetch user data"
    let statusCode = 500

    if (error.message.includes("authentication") || error.message.includes("expired")) {
      errorMessage = error.message
      statusCode = 401
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
        setTimeout(() => reject(new Error("Request timeout")), 15000)
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
      return (data.results || []).map((page: any) => ({
        id: page.id,
        name: getPageTitle(page),
        value: page.id,
        url: page.url,
        created_time: page.created_time,
        last_edited_time: page.last_edited_time,
      }))
    } catch (error: any) {
      console.error("Error fetching Notion pages:", error)
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

  slack_users: async (integration: any) => {
    try {
      const response = await fetch("https://slack.com/api/users.list?limit=1000", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

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

      return (data.members || [])
        .filter((user: any) => !user.deleted && !user.is_bot && user.id !== "USLACKBOT")
        .map((user: any) => ({
          id: user.id,
          name: user.real_name || user.name,
          value: user.id,
          display_name: user.profile?.display_name || user.name,
          email: user.profile?.email,
        }))
    } catch (error: any) {
      console.error("Error fetching Slack users:", error)
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
  trello_boards: async (integration: any) => {
    try {
      const response = await fetch(
        `https://api.trello.com/1/members/me/boards?token=${integration.access_token}&fields=id,name,desc,url,closed`,
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
      // Get videos from uploads playlist
      const videosResp = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${uploadsPlaylistId}`,
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
      const videosData = await videosResp.json()
      return (videosData.items || []).map((item: any) => ({
        id: item.snippet.resourceId.videoId,
        name: item.snippet.title,
        value: item.snippet.resourceId.videoId,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails?.default?.url,
      }))
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
        const errorData = await teamsResponse.json().catch(() => ({}))
        throw new Error(`Teams API error: ${teamsResponse.status} - ${errorData.error?.message || "Unknown error"}`)
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
  "trello_lists": async (integration: any) => {
    try {
      // First get all boards, then get lists for each board
      const boardsResponse = await fetch(
        "https://api.trello.com/1/members/me/boards",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (!boardsResponse.ok) {
        if (boardsResponse.status === 401) {
          throw new Error("Trello authentication expired. Please reconnect your account.")
        }
        const errorData = await boardsResponse.json().catch(() => ({}))
        throw new Error(`Trello API error: ${boardsResponse.status} - ${errorData.message || "Unknown error"}`)
      }
      const boardsData = await boardsResponse.json()
      
      const allLists: any[] = []
      
      for (const board of boardsData) {
        try {
          const listsResponse = await fetch(
            `https://api.trello.com/1/boards/${board.id}/lists`,
            {
              headers: {
                Authorization: `Bearer ${integration.access_token}`,
                "Content-Type": "application/json",
              },
            },
          )
          if (listsResponse.ok) {
            const listsData = await listsResponse.json()
            const boardLists = listsData.map((list: any) => ({
              value: list.id,
              label: `${board.name} - ${list.name}`,
              description: list.name,
            }))
            allLists.push(...boardLists)
          }
        } catch (error) {
          console.warn(`Failed to fetch lists for board ${board.name}:`, error)
        }
      }
      
      return allLists
    } catch (error: any) {
      console.error("Error fetching Trello lists:", error)
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
        throw new Error("Discord bot token not configured")
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
          throw new Error("Bot is not a member of this server. Please add the bot to the server first.")
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
}

// Helper functions
function getPageTitle(page: any): string {
  if (page.properties?.title?.title?.[0]?.plain_text) {
    return page.properties.title.title[0].plain_text
  }
  if (page.properties?.Name?.title?.[0]?.plain_text) {
    return page.properties.Name.title[0].plain_text
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
