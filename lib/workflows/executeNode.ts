import { TokenRefreshService } from "../integrations/tokenRefreshService"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { decrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"
import { createClient } from "@supabase/supabase-js"
import { FileStorageService } from "@/lib/storage/fileStorage"

interface ExecuteActionParams {
  node: any
  input: Record<string, any>
  userId: string
  workflowId: string
}

interface ActionResult {
  success: boolean
  output?: Record<string, any>
  message?: string
  error?: string
  pauseExecution?: boolean
}

async function getDecryptedAccessToken(userId: string, provider: string): Promise<string> {
  try {
    const supabase = await createSupabaseServerClient()
    
    // Get the user's integration
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .single()

    if (error) {
      console.error(`Database error fetching integration for ${provider}:`, error)
      throw new Error(`Database error: ${error.message}`)
    }

    if (!integration) {
      throw new Error(`No integration found for ${provider}`)
    }

    // Check if token needs refresh
    const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
      accessTokenExpiryThreshold: 5 // Refresh if expiring within 5 minutes
    })

    let accessToken = integration.access_token

    if (shouldRefresh.shouldRefresh && integration.refresh_token) {
      console.log(`Refreshing token for ${provider}: ${shouldRefresh.reason}`)
      
      const refreshResult = await TokenRefreshService.refreshTokenForProvider(
        integration.provider,
        integration.refresh_token,
        integration
      )

      if (refreshResult.success && refreshResult.accessToken) {
        accessToken = refreshResult.accessToken
        console.log(`Token refresh successful for ${provider}`)
      } else {
        console.error(`Token refresh failed for ${provider}:`, refreshResult.error)
        throw new Error(`Failed to refresh ${provider} token: ${refreshResult.error}`)
      }
    }

    if (!accessToken) {
      throw new Error(`No valid access token for ${provider}`)
    }

    const secret = await getSecret("encryption_key")
    if (!secret) {
      console.error("Encryption key not found in environment")
      throw new Error("Encryption secret not configured. Please set ENCRYPTION_KEY environment variable.")
    }

    console.log(`Attempting to decrypt access token for ${provider}`)
    console.log(`Token format check:`, {
      hasColon: accessToken.includes(':'),
      tokenLength: accessToken.length,
      tokenPreview: accessToken.substring(0, 20) + '...'
    })
    
    try {
    const decryptedToken = decrypt(accessToken, secret)
    console.log(`Successfully decrypted access token for ${provider}`)
    return decryptedToken
    } catch (decryptError: any) {
      console.error(`Decryption failed for ${provider}:`, {
        error: decryptError.message,
        tokenFormat: accessToken.includes(':') ? 'encrypted' : 'plain',
        tokenLength: accessToken.length
      })
      
      // If the token doesn't have the expected format, it might be stored as plain text
      if (!accessToken.includes(':')) {
        console.log(`Token for ${provider} appears to be stored as plain text, returning as-is`)
        return accessToken
      }
      
      throw new Error(`Failed to decrypt ${provider} access token: ${decryptError.message}`)
    }
  } catch (error: any) {
    console.error(`Error in getDecryptedAccessToken for ${provider}:`, {
      message: error.message,
      stack: error.stack,
      userId,
      provider
    })
    throw error
  }
}

function resolveValue(value: any, input: Record<string, any>): any {
  if (typeof value !== "string") return value
  const match = value.match(/^{{(.*)}}$/)
  if (match) {
    const key = match[1]
    // Basic key access, e.g., {{data.field}}
    // For simplicity, we'll support basic dot notation.
    return key.split(".").reduce((acc: any, part: any) => acc && acc[part], input)
  }
  return value
}

async function sendGmail(config: any, userId: string, input: Record<string, any>): Promise<ActionResult> {
  try {
    console.log("Starting Gmail send process", { userId, config: { ...config, body: config.body ? "[CONTENT]" : undefined } })
    
    const accessToken = await getDecryptedAccessToken(userId, "gmail")

    const to = resolveValue(config.to, input)
    const cc = resolveValue(config.cc, input)
    const bcc = resolveValue(config.bcc, input)
    const subject = resolveValue(config.subject, input)
    const body = resolveValue(config.body, input)
    const attachmentIds = config.attachments as string[] | undefined

    console.log("Resolved email values:", { to, cc, bcc, subject, hasBody: !!body, attachmentIds: attachmentIds?.length || 0 })

    if (!to || !subject || !body) {
      const missingFields = []
      if (!to) missingFields.push("To")
      if (!subject) missingFields.push("Subject")
      if (!body) missingFields.push("Body")
      
      const message = `Missing required fields for sending email: ${missingFields.join(", ")}`
      console.error(message)
      return { success: false, message }
    }

    // Generate boundary for multipart message
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    let emailLines = [
      `To: ${to}`,
      cc ? `Cc: ${cc}` : '',
      bcc ? `Bcc: ${bcc}` : '',
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
    ]

    // Remove empty lines
    emailLines = emailLines.filter(line => line !== '')

    // Retrieve attachment files if any
    let attachmentFiles: { fileName: string; content: ArrayBuffer; mimeType: string }[] = []
    if (attachmentIds && attachmentIds.length > 0) {
      try {
        attachmentFiles = await FileStorageService.getFilesFromReferences(attachmentIds, userId)
        console.log(`Retrieved ${attachmentFiles.length} attachment files`)
      } catch (error: any) {
        console.error('Error retrieving attachment files:', error)
        return { success: false, message: `Failed to retrieve attachments: ${error.message}` }
      }
    }

    if (attachmentFiles.length > 0) {
      // Multipart message with attachments
      emailLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
      emailLines.push('')
      emailLines.push(`--${boundary}`)
      emailLines.push('Content-Type: text/plain; charset="UTF-8"')
      emailLines.push('Content-Transfer-Encoding: 7bit')
      emailLines.push('')
      emailLines.push(body)
      emailLines.push('')

      // Add attachments
      for (const attachment of attachmentFiles) {
        try {
          const base64Content = Buffer.from(attachment.content).toString('base64')
          
          emailLines.push(`--${boundary}`)
          emailLines.push(`Content-Type: ${attachment.mimeType || 'application/octet-stream'}`)
          emailLines.push(`Content-Disposition: attachment; filename="${attachment.fileName}"`)
          emailLines.push('Content-Transfer-Encoding: base64')
          emailLines.push('')
          
          // Split base64 content into 76-character lines (RFC standard)
          const base64Lines = base64Content.match(/.{1,76}/g) || []
          emailLines.push(...base64Lines)
          emailLines.push('')
        } catch (attachmentError) {
          console.error(`Error processing attachment ${attachment.fileName}:`, attachmentError)
          return { success: false, message: `Failed to process attachment: ${attachment.fileName}` }
        }
      }

      emailLines.push(`--${boundary}--`)
    } else {
      // Simple text message
      emailLines.push('Content-Type: text/plain; charset="UTF-8"')
      emailLines.push('Content-Transfer-Encoding: 7bit')
      emailLines.push('')
      emailLines.push(body)
    }

    const email = emailLines.join('\n')

    console.log("Making Gmail API request...")
    const response = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: Buffer.from(email).toString("base64url"),
      }),
    })

    console.log("Gmail API response status:", response.status)
    
    const result = await response.json()

    if (!response.ok) {
      console.error("Gmail API error:", {
        status: response.status,
        statusText: response.statusText,
        error: result.error
      })
      
      const errorMessage = result.error?.message || `Failed to send email via Gmail API (${response.status})`
      throw new Error(errorMessage)
    }

    console.log("Gmail send successful:", { messageId: result.id })
    return { 
      success: true, 
      output: { 
        messageId: result.id, 
        status: "sent",
        attachmentCount: attachmentFiles?.length || 0
      } 
    }
  } catch (error: any) {
    console.error("Gmail send error:", {
      message: error.message,
      stack: error.stack,
      userId,
      config: { ...config, body: config.body ? "[CONTENT]" : undefined }
    })
    return { success: false, message: `Gmail action failed: ${error.message}` }
  }
}

async function fetchGmailLabels(accessToken: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  })
  if (!response.ok) throw new Error("Failed to fetch Gmail labels")
  const data = await response.json()
  return data.labels || []
}

async function createGmailLabel(accessToken: string, labelName: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  })
  if (!response.ok) throw new Error("Failed to create Gmail label")
  return await response.json()
}

async function addGmailLabels(config: any, userId: string, input: Record<string, any>): Promise<ActionResult> {
  try {
    console.log("Starting Gmail add labels process", { userId, config })
    console.log("Input context:", input)
    
    const accessToken = await getDecryptedAccessToken(userId, "gmail")

    const messageId = resolveValue(config.messageId, input)
    let labelIdsRaw = resolveValue(config.labelIds, input)
    
    console.log("Resolved values:", { messageId, labelIdsRaw })
    
    // Normalize and filter labelIds to only include non-empty strings
    let labelIds: string[] = []
    if (Array.isArray(labelIdsRaw)) {
      labelIds = labelIdsRaw.map(l => {
        if (typeof l === "string") return l
        if (l && typeof l === "object" && typeof l.value === "string") return l.value
        return undefined
      }).filter((l): l is string => typeof l === "string" && l.trim() !== "")
    } else if (typeof labelIdsRaw === "string" && labelIdsRaw.trim() !== "") {
      labelIds = [labelIdsRaw]
    }
    
    console.log("Filtered labelIds for Gmail add label:", labelIds)
    
    if (!messageId || labelIds.length === 0) {
      const missingFields = []
      if (!messageId) missingFields.push("Message ID")
      if (labelIds.length === 0) missingFields.push("Labels")
      const message = `Missing required fields for adding labels: ${missingFields.join(", ")}`
      console.error(message)
      return { success: false, message }
    }
    
    // Fetch all existing labels
    const existingLabels = await fetchGmailLabels(accessToken)
    const existingLabelIds = new Set(existingLabels.map((l: any) => l.id))
    const existingLabelNames = new Map(existingLabels.map((l: any) => [l.name.toLowerCase(), l.id]))
    
    // For each label, if it's not an ID or name in existingLabels, create it
    const finalLabelIds: string[] = []
    for (const label of labelIds) {
      if (existingLabelIds.has(label)) {
        finalLabelIds.push(label)
      } else if (existingLabelNames.has(label.toLowerCase())) {
        const existingId = existingLabelNames.get(label.toLowerCase())!
        finalLabelIds.push(existingId)
      } else {
        // Create the label
        const newLabel = await createGmailLabel(accessToken, label)
        finalLabelIds.push(newLabel.id)
      }
    }

    console.log("Making Gmail API request to add labels...", { 
      messageId, 
      finalLabelIds,
      url: `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`
    })
    
    const response = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        addLabelIds: finalLabelIds,
      }),
    })

    console.log("Gmail API response status:", response.status)
    
    const result = await response.json()

    if (!response.ok) {
      console.error("Gmail API error:", {
        status: response.status,
        statusText: response.statusText,
        error: result.error
      })
      
      const errorMessage = result.error?.message || `Failed to add labels via Gmail API (${response.status})`
      throw new Error(errorMessage)
    }

    console.log("Gmail add labels successful:", { messageId: result.id, labelsAdded: finalLabelIds })
    return { 
      success: true, 
      output: { 
        messageId: result.id, 
        labelIds: finalLabelIds,
        labelsAdded: finalLabelIds.length,
        status: "labels_added"
      } 
    }
  } catch (error: any) {
    console.error("Gmail add labels error:", {
      message: error.message,
      stack: error.stack,
      userId,
      config
    })
    return { success: false, message: `Gmail add labels action failed: ${error.message}` }
  }
}

async function searchGmailEmails(config: any, userId: string, input: Record<string, any>): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gmail")
    const messageId = resolveValue(config.messageId, input)
    const query = resolveValue(config.query, input)

    // If a specific messageId is provided, fetch that email
    if (messageId) {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return { success: false, message: `Failed to fetch email: ${errorData.error?.message || response.statusText}` }
      }
      const data = await response.json()
      return { success: true, output: { emails: [data] }, message: "Fetched specific email." }
    }

    // Use the search query if provided, otherwise fetch recent emails
    const searchQuery = query || ""
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`
    const listResponse = await fetch(listUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })
    if (!listResponse.ok) {
      const errorData = await listResponse.json().catch(() => ({}))
      return { success: false, message: `Failed to fetch emails: ${errorData.error?.message || listResponse.statusText}` }
    }
    const listData = await listResponse.json()
    const messages = listData.messages || []

    // Fetch details for each message (up to 100)
    const detailedEmails = await Promise.all(
      messages.slice(0, 100).map(async (msg: any) => {
        try {
          const detailResp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          })
          if (detailResp.ok) {
            return await detailResp.json()
          }
        } catch (e) {}
        return null
      })
    )
    return { success: true, output: { emails: detailedEmails.filter(Boolean) }, message: `Fetched ${detailedEmails.length} emails.` }
  } catch (error: any) {
    return { success: false, message: `Gmail search failed: ${error.message}` }
  }
}

async function readGoogleSheetsData(config: any, userId: string, input: Record<string, any>): Promise<ActionResult> {
  try {
    console.log("Starting Google Sheets read data process", { userId, config })
    
    const accessToken = await getDecryptedAccessToken(userId, "google-sheets")

    const spreadsheetId = resolveValue(config.spreadsheetId, input)
    const sheetName = resolveValue(config.sheetName, input)
    const readMode = config.readMode || "all"
    const outputFormat = config.outputFormat || "objects"
    const includeHeaders = config.includeHeaders !== false
    const maxRows = config.maxRows || 0

    console.log("Resolved Google Sheets values:", { 
      spreadsheetId, 
      sheetName, 
      readMode, 
      outputFormat, 
      includeHeaders, 
      maxRows 
    })

    if (!spreadsheetId || !sheetName) {
      const missingFields = []
      if (!spreadsheetId) missingFields.push("Spreadsheet ID")
      if (!sheetName) missingFields.push("Sheet Name")
      
      const message = `Missing required fields for reading Google Sheets data: ${missingFields.join(", ")}`
      console.error(message)
      return { success: false, message }
    }

    let range = sheetName
    
    // Determine the range based on read mode
    if (readMode === "range" && config.range) {
      range = `${sheetName}!${config.range}`
    } else if (readMode === "rows" && config.selectedRows && Array.isArray(config.selectedRows)) {
      // For specific rows, we'll read the entire sheet first and then filter
      range = sheetName
    } else {
      // For "all" mode, read entire sheet
      range = sheetName
    }

    console.log("Reading from Google Sheets range:", range)

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    console.log("Google Sheets API response status:", response.status)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("Google Sheets API error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorData.error
      })
      
      const errorMessage = errorData.error?.message || `Failed to read Google Sheets data (${response.status})`
      throw new Error(errorMessage)
    }

    const result = await response.json()
    let data = result.values || []

    console.log(`Retrieved ${data.length} rows from Google Sheets`)

    // Handle headers
    let headers: string[] = []
    let dataRows = data
    
    if (includeHeaders && data.length > 0) {
      headers = data[0]
      dataRows = data.slice(1)
    }

    // Filter by selected rows if in "rows" mode
    if (readMode === "rows" && config.selectedRows && Array.isArray(config.selectedRows)) {
      const selectedRowIndices = config.selectedRows.map((row: any) => row.rowIndex - (includeHeaders ? 2 : 1)) // Adjust for header and 0-based indexing
      dataRows = dataRows.filter((row: any, index: number) => selectedRowIndices.includes(index))
      console.log(`Filtered to ${dataRows.length} selected rows`)
    }

    // Filter by selected cells if in "cells" mode
    if (readMode === "cells" && config.selectedCells && Array.isArray(config.selectedCells)) {
      // For cells mode, we'll create a structured output with just the selected cells
      const selectedCellsData = config.selectedCells.map((cell: any) => {
        const rowIndex = cell.rowIndex - (includeHeaders ? 2 : 1) // Adjust for header and 0-based indexing
        const row = dataRows[rowIndex]
        return {
          cellReference: cell.cellReference,
          columnName: cell.columnName,
          value: row && row[cell.columnIndex] ? row[cell.columnIndex] : "",
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex
        }
      })
      
      // For cells mode, we'll override the normal data processing
      console.log(`Selected ${selectedCellsData.length} individual cells`)
      
      return { 
        success: true, 
        output: { 
          data: selectedCellsData,
          format: "cells",
          cellsRead: selectedCellsData.length,
          spreadsheetId,
          sheetName,
          readMode,
          readAt: new Date().toISOString()
        },
        message: `Successfully read ${selectedCellsData.length} cells from Google Sheets`
      }
    }

    // Apply max rows limit
    if (maxRows > 0) {
      dataRows = dataRows.slice(0, maxRows)
      console.log(`Limited to ${maxRows} rows`)
    }

    // Apply filter conditions if provided
    if (config.filterConditions) {
      try {
        const filters = JSON.parse(config.filterConditions)
        if (Array.isArray(filters) && filters.length > 0 && headers.length > 0) {
          dataRows = dataRows.filter((row: any[]) => {
            return filters.every((filter: any) => {
              const columnIndex = headers.indexOf(filter.column)
              if (columnIndex === -1) return true // Skip filter if column not found
              
              const cellValue = row[columnIndex] || ""
              const filterValue = filter.value || ""
              
              switch (filter.operator) {
                case "equals":
                  return cellValue.toString().toLowerCase() === filterValue.toString().toLowerCase()
                case "contains":
                  return cellValue.toString().toLowerCase().includes(filterValue.toString().toLowerCase())
                case "not_equals":
                  return cellValue.toString().toLowerCase() !== filterValue.toString().toLowerCase()
                case "greater_than":
                  return parseFloat(cellValue) > parseFloat(filterValue)
                case "less_than":
                  return parseFloat(cellValue) < parseFloat(filterValue)
                default:
                  return true
              }
            })
          })
          console.log(`Applied filters, ${dataRows.length} rows remaining`)
        }
      } catch (error) {
        console.warn("Failed to parse filter conditions:", error)
      }
    }

    // Format output according to outputFormat
    let outputData: any
    
    switch (outputFormat) {
      case "array":
        outputData = includeHeaders ? [headers, ...dataRows] : dataRows
        break
      case "objects":
        if (headers.length > 0) {
          outputData = dataRows.map((row: any[]) => {
            const obj: any = {}
            headers.forEach((header, index) => {
              obj[header] = row[index] || ""
            })
            return obj
          })
        } else {
          outputData = dataRows
        }
        break
      case "csv":
        const csvRows = includeHeaders ? [headers, ...dataRows] : dataRows
        outputData = csvRows.map((row: any[]) => 
          row.map((cell: any) => `"${(cell || "").toString().replace(/"/g, '""')}"`).join(",")
        ).join("\n")
        break
      default:
        outputData = dataRows
    }

    console.log("Google Sheets read data successful:", { 
      rowsRead: dataRows.length, 
      outputFormat,
      hasHeaders: includeHeaders && headers.length > 0
    })

    return { 
      success: true, 
      output: { 
        // Core output fields matching the schema
        data: outputData,
        headers: includeHeaders ? headers : undefined,
        rowsRead: dataRows.length,
        format: outputFormat,
        spreadsheetId,
        sheetName,
        // Additional metadata
        readMode,
        readAt: new Date().toISOString()
      },
      message: `Successfully read ${dataRows.length} rows from Google Sheets`
    }
  } catch (error: any) {
    console.error("Google Sheets read data error:", {
      message: error.message,
      stack: error.stack,
      userId,
      config
    })
    return { success: false, message: `Google Sheets read data action failed: ${error.message}` }
  }
}

// Condition evaluation helper function
function evaluateCondition(field: any, operator: string, value: any): boolean {
  switch (operator) {
    case "equals":
      return field == value
    case "not_equals":
      return field != value
    case "greater_than":
      return parseFloat(field) > parseFloat(value)
    case "less_than":
      return parseFloat(field) < parseFloat(value)
    case "greater_equal":
      return parseFloat(field) >= parseFloat(value)
    case "less_equal":
      return parseFloat(field) <= parseFloat(value)
    case "contains":
      return String(field).toLowerCase().includes(String(value).toLowerCase())
    case "not_contains":
      return !String(field).toLowerCase().includes(String(value).toLowerCase())
    case "starts_with":
      return String(field).toLowerCase().startsWith(String(value).toLowerCase())
    case "ends_with":
      return String(field).toLowerCase().endsWith(String(value).toLowerCase())
    case "is_empty":
      return !field || field === "" || (Array.isArray(field) && field.length === 0)
    case "is_not_empty":
      return field && field !== "" && (!Array.isArray(field) || field.length > 0)
    case "exists":
      return field !== undefined && field !== null
    case "not_exists":
      return field === undefined || field === null
    default:
      return false
  }
}

async function executeIfThenCondition(config: any, userId: string, input: Record<string, any>): Promise<ActionResult> {
  try {
    console.log("Executing if/then condition", { config, inputKeys: Object.keys(input) })

    const { conditionType, field, operator, value, logicOperator, additionalConditions, advancedExpression, continueOnFalse } = config

    let conditionResult = false

    if (conditionType === "advanced" && advancedExpression) {
      // Advanced expression evaluation
      try {
        // Create a safe evaluation context
        const context = { ...input, data: input.data || input }
        
        // Simple template replacement for safety
        let expression = advancedExpression
                 const templateRegex = /\{\{([^}]+)\}\}/g
         expression = expression.replace(templateRegex, (match: string, key: string) => {
           const value = key.split('.').reduce((obj: any, prop: string) => obj?.[prop], context)
           return JSON.stringify(value)
         })

        console.log("Evaluating advanced expression:", expression)
        
        // Use Function constructor for safer evaluation than eval
        const evaluator = new Function('return ' + expression)
        conditionResult = !!evaluator()
      } catch (error: any) {
        console.error("Error evaluating advanced expression:", error)
        return { 
          success: false, 
          message: `Failed to evaluate advanced expression: ${error.message}` 
        }
      }
    } else {
      // Simple or multiple conditions
      const fieldValue = resolveValue(field, input)
      const compareValue = resolveValue(value, input)
      
      console.log("Evaluating condition:", { fieldValue, operator, compareValue })
      
      conditionResult = evaluateCondition(fieldValue, operator, compareValue)
      
             // Handle additional conditions for multiple condition type
       if (conditionType === "multiple" && additionalConditions) {
         try {
           const additionalConds = Array.isArray(additionalConditions) 
             ? additionalConditions 
             : JSON.parse(typeof additionalConditions === 'string' ? additionalConditions : JSON.stringify(additionalConditions) || "[]")
          
          for (const additionalCond of additionalConds) {
            const addFieldValue = resolveValue(additionalCond.field, input)
            const addCompareValue = resolveValue(additionalCond.value, input)
            const addResult = evaluateCondition(addFieldValue, additionalCond.operator, addCompareValue)
            
            if (logicOperator === "and") {
              conditionResult = conditionResult && addResult
            } else {
              conditionResult = conditionResult || addResult
            }
          }
        } catch (error) {
          console.warn("Failed to parse additional conditions:", error)
        }
      }
    }

    console.log("Condition evaluation result:", conditionResult)

    if (conditionResult) {
      return {
        success: true,
        output: { 
          ...input, 
          conditionMet: true,
          conditionResult: true 
        },
        message: "Condition met, continuing workflow"
      }
    } else {
      if (continueOnFalse) {
        return {
          success: true,
          output: { 
            ...input, 
            conditionMet: false,
            conditionResult: false 
          },
          message: "Condition not met, but continuing workflow"
        }
      } else {
        return {
          success: false,
          output: { 
            ...input, 
            conditionMet: false,
            conditionResult: false 
          },
          message: "Condition not met, stopping workflow"
        }
      }
    }
  } catch (error: any) {
    console.error("If/then condition execution error:", error)
    return { 
      success: false, 
      message: `If/then condition failed: ${error.message}` 
    }
  }
}

async function executeWaitForTime(config: any, userId: string, input: Record<string, any>, context?: any): Promise<ActionResult> {
  try {
    console.log("Executing wait for time", { config })

    const { 
      waitType, 
      duration, 
      durationUnit, 
      specificTime, 
      specificDate, 
      businessHoursStart, 
      businessHoursEnd, 
      businessDays, 
      customBusinessDays,
      timezone,
      maxWaitTime 
    } = config

    let waitUntil: Date
    const now = new Date()

    // Determine timezone
    let targetTimezone = timezone
    if (timezone === "auto") {
      targetTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    }

    switch (waitType) {
      case "duration":
        const durationMs = convertToMilliseconds(duration || 0, durationUnit || "minutes")
        waitUntil = new Date(now.getTime() + durationMs)
        break

      case "until_time":
        if (!specificTime) {
          return { success: false, message: "Specific time is required for 'until_time' wait type" }
        }
        
        waitUntil = new Date()
        const [hours, minutes] = specificTime.split(':').map(Number)
        waitUntil.setHours(hours, minutes, 0, 0)
        
        // If the time has already passed today, wait until tomorrow
        if (waitUntil <= now) {
          waitUntil.setDate(waitUntil.getDate() + 1)
        }
        break

      case "until_date":
        if (!specificDate) {
          return { success: false, message: "Specific date is required for 'until_date' wait type" }
        }
        
        waitUntil = new Date(specificDate)
        if (waitUntil <= now) {
          return { success: false, message: "Specified date is in the past" }
        }
        break

      case "business_hours":
        waitUntil = calculateBusinessHoursWait(
          now, 
          businessHoursStart || "09:00", 
          businessHoursEnd || "17:00",
          businessDays === "custom" ? customBusinessDays : ["monday", "tuesday", "wednesday", "thursday", "friday"]
        )
        break

      default:
        return { success: false, message: `Invalid wait type: ${waitType}` }
    }

    // Apply maximum wait time limit
    if (maxWaitTime) {
      const maxWaitMs = maxWaitTime * 60 * 60 * 1000 // Convert hours to milliseconds
      const maxWaitUntil = new Date(now.getTime() + maxWaitMs)
      
      if (waitUntil > maxWaitUntil) {
        console.warn(`Wait time exceeds maximum limit of ${maxWaitTime} hours, limiting wait time`)
        waitUntil = maxWaitUntil
      }
    }

    const waitDurationMs = waitUntil.getTime() - now.getTime()
    const waitDurationMinutes = Math.round(waitDurationMs / (1000 * 60))

    console.log("Wait calculation:", {
      waitType,
      waitUntil: waitUntil.toISOString(),
      waitDurationMinutes,
      timezone: targetTimezone
    })

    // Create scheduled execution record for real wait functionality
    console.log(`Scheduling wait for ${waitDurationMinutes} minutes until ${waitUntil.toISOString()}`)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Use provided context or empty object
    const executionContext = context || {}
    
    const scheduledExecution = {
      workflow_execution_id: executionContext.executionId || null,
      workflow_id: executionContext.workflowId || null,
      user_id: userId,
      scheduled_for: waitUntil.toISOString(),
      schedule_type: 'wait' as const,
      current_node_id: executionContext.nodeId || 'unknown',
      next_node_id: executionContext.nextNodeId || null,
      execution_context: {
        ...executionContext,
        waitType,
        timezone: targetTimezone,
        originalInput: input
      },
      input_data: input,
      wait_config: config
    }
    
    const { data: scheduled, error } = await supabase
      .from('scheduled_workflow_executions')
      .insert(scheduledExecution)
      .select()
      .single()
    
    if (error) {
      console.error("❌ Failed to create scheduled execution:", error)
      return {
        success: false,
        message: `Failed to schedule wait: ${error.message}`
      }
    }
    
    console.log(`✅ Created scheduled execution ${scheduled.id} for ${waitUntil.toISOString()}`)
    
    // Update the main workflow execution to indicate it's waiting
    if (executionContext.executionId) {
      await supabase
        .from('workflow_executions')
        .update({ 
          status: 'pending', // Keep as pending since it will resume
          metadata: { 
            ...executionContext.metadata,
            paused_at: new Date().toISOString(),
            scheduled_execution_id: scheduled.id,
            wait_until: waitUntil.toISOString(),
            wait_type: waitType
          }
        })
        .eq('id', executionContext.executionId)
    }
    
    return {
      success: true,
      output: {
        ...input,
        waitScheduled: true,
        scheduledExecutionId: scheduled.id,
        waitType,
        waitUntil: waitUntil.toISOString(),
        waitDurationMinutes,
        timezone: targetTimezone,
        scheduledAt: new Date().toISOString()
      },
      message: `Wait scheduled - execution will resume in ${waitDurationMinutes} minutes at ${waitUntil.toLocaleString()}`,
      // Special flag to indicate this execution should pause here
      pauseExecution: true
    }
  } catch (error: any) {
    console.error("Wait for time execution error:", error)
    return { 
      success: false, 
      message: `Wait for time failed: ${error.message}` 
    }
  }
}

function convertToMilliseconds(duration: number, unit: string): number {
  switch (unit) {
    case "seconds":
      return duration * 1000
    case "minutes":
      return duration * 60 * 1000
    case "hours":
      return duration * 60 * 60 * 1000
    case "days":
      return duration * 24 * 60 * 60 * 1000
    case "weeks":
      return duration * 7 * 24 * 60 * 60 * 1000
    default:
      return duration * 60 * 1000 // Default to minutes
  }
}

function calculateBusinessHoursWait(
  now: Date, 
  startTime: string, 
  endTime: string, 
  businessDays: string[]
): Date {
  const [startHours, startMinutes] = startTime.split(':').map(Number)
  const [endHours, endMinutes] = endTime.split(':').map(Number)
  
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const businessDayIndices = businessDays.map(day => dayNames.indexOf(day.toLowerCase()))
  
  let checkDate = new Date(now)
  
  // Find the next business day and time
  for (let i = 0; i < 14; i++) { // Check up to 2 weeks ahead
    const dayOfWeek = checkDate.getDay()
    
    if (businessDayIndices.includes(dayOfWeek)) {
      // This is a business day
      const businessStart = new Date(checkDate)
      businessStart.setHours(startHours, startMinutes, 0, 0)
      
      const businessEnd = new Date(checkDate)
      businessEnd.setHours(endHours, endMinutes, 0, 0)
      
      if (checkDate.getTime() === now.getTime()) {
        // Same day as now
        if (now < businessStart) {
          // Before business hours, wait until start
          return businessStart
        } else if (now < businessEnd) {
          // During business hours, continue immediately
          return now
        }
        // After business hours, check next day
      } else {
        // Future business day, wait until business hours start
        return businessStart
      }
    }
    
    // Move to next day
    checkDate.setDate(checkDate.getDate() + 1)
    checkDate.setHours(0, 0, 0, 0)
  }
  
  // Fallback: wait 24 hours
  return new Date(now.getTime() + 24 * 60 * 60 * 1000)
}

// Add other action handlers here e.g. sendSlackMessage, createGoogleDoc etc.

export async function executeAction(params: ExecuteActionParams): Promise<ActionResult> {
  const { node, input, userId } = params
  const { type, config } = node.data

  // Check if environment is properly configured
  const hasSupabaseConfig = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const hasEncryptionKey = process.env.ENCRYPTION_KEY

  if (!hasSupabaseConfig) {
    console.warn("Supabase configuration missing, running in test mode")
    return { 
      success: true, 
      output: { test: true, mockResult: true }, 
      message: `Test mode: ${type} executed successfully (missing Supabase config)` 
    }
  }

  switch (type) {
    case "gmail_action_send_email":
      if (!hasEncryptionKey) {
        console.warn("Encryption key missing, running Gmail action in test mode")
        return { 
          success: true, 
          output: { 
            test: true, 
            to: config?.to || "test@example.com",
            subject: config?.subject || "Test Email",
            messageId: "test_message_" + Date.now()
          }, 
          message: "Test mode: Gmail email sent successfully (missing encryption key)" 
        }
      }
      return sendGmail(config, userId, input)
    case "gmail_action_add_label":
      if (!hasEncryptionKey) {
        console.warn("Encryption key missing, running Gmail add label action in test mode")
        return { 
          success: true, 
          output: { 
            test: true, 
            messageId: config?.messageId || "test_message_id",
            labelIds: config?.labelIds || ["test_label"],
            labelsAdded: config?.labelIds?.length || 1
          }, 
          message: "Test mode: Gmail labels added successfully (missing encryption key)" 
        }
      }
      return addGmailLabels(config, userId, input)
    case "gmail_action_search_email":
      if (!hasEncryptionKey) {
        console.warn("Encryption key missing, running Gmail search email action in test mode")
        return { 
          success: true, 
          output: { test: true, emails: [] }, 
          message: "Test mode: Gmail search email executed (missing encryption key)" 
        }
      }
      return searchGmailEmails(config, userId, input)
    case "google_sheets_action_read_data":
      if (!hasEncryptionKey) {
        console.warn("Encryption key missing, running Google Sheets read data action in test mode")
        return { 
          success: true, 
          output: { 
            test: true, 
            data: [
              { "Name": "John Doe", "Email": "john@example.com", "Status": "Active" },
              { "Name": "Jane Smith", "Email": "jane@example.com", "Status": "Inactive" }
            ],
            format: config?.outputFormat || "objects",
            rowsRead: 2
          }, 
          message: "Test mode: Google Sheets data read successfully (missing encryption key)" 
        }
      }
      return readGoogleSheetsData(config, userId, input)
      
    case "if_then_condition":
      return executeIfThenCondition(config, userId, input)
      
    case "wait_for_time":
      return executeWaitForTime(config, userId, input, { 
        workflowId: params.workflowId,
        nodeId: node.id
      })
      
    // Future actions will be added here
    // case "slack_action_send_message":
    //   return sendSlackMessage(config, userId, input)

    default:
      console.warn(`No execution logic for node type: ${type}`)
      // For unhandled actions, we can choose to continue the flow
      return { success: true, output: input, message: `No action found for ${type}` }
  }
}
