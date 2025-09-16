import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

/**
 * Creates a new record in an Airtable table
 *
 * For attachment fields (images, files, etc.):
 * - Supports base64 data URLs (automatically uploads to Airtable, max 5MB)
 * - Supports direct URLs to hosted files
 * - Airtable will store the file in their system
 *
 * Attachment field format:
 * - Base64 data URL: "data:image/png;base64,..."
 * - URL string: "https://example.com/file.pdf"
 * - Or pre-formatted array: [{ url: "https://...", filename: "file.pdf" }]
 */

/**
 * Uploads a file to Airtable's attachment service
 */
async function uploadAttachmentToAirtable(
  accessToken: string,
  base64Data: string,
  fieldName: string
): Promise<{ url: string; filename: string } | null> {
  try {
    // Parse the base64 data URL
    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/)
    if (!matches) {
      console.error(`📊 [Airtable] Invalid base64 format for field "${fieldName}"`)
      return null
    }

    const mimeType = matches[1]
    const base64Content = matches[2]

    // Convert base64 to binary
    const binaryString = atob(base64Content)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Check file size (5MB limit)
    const fileSizeMB = bytes.length / (1024 * 1024)
    if (fileSizeMB > 5) {
      console.error(`📊 [Airtable] File for field "${fieldName}" is ${fileSizeMB.toFixed(2)}MB, exceeds 5MB limit`)
      return null
    }

    console.log(`📊 [Airtable] Uploading attachment for field "${fieldName}" (${fileSizeMB.toFixed(2)}MB)...`)

    // Determine file extension from MIME type
    const extension = mimeType.split('/')[1] || 'bin'
    const filename = `upload_${Date.now()}.${extension}`

    // Create FormData for multipart upload
    const formData = new FormData()
    const blob = new Blob([bytes], { type: mimeType })
    formData.append('file', blob, filename)

    // Upload to Airtable's attachment endpoint
    const uploadResponse = await fetch('https://content.airtable.com/v0/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      body: formData
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      console.error(`📊 [Airtable] Upload failed for field "${fieldName}": ${uploadResponse.status} - ${errorText}`)
      return null
    }

    const uploadResult = await uploadResponse.json()
    console.log(`📊 [Airtable] Upload successful for field "${fieldName}"`)

    // Return the attachment object format Airtable expects
    return {
      url: uploadResult.url || uploadResult.signedUrl,
      filename: filename
    }
  } catch (error: any) {
    console.error(`📊 [Airtable] Error uploading attachment for field "${fieldName}":`, error.message)
    return null
  }
}
export async function createAirtableRecord(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Only log essential info, not the entire config
    console.log("📊 [Airtable] Creating record...")

    // Validate config object
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid configuration provided')
    }

    const accessToken = await getDecryptedAccessToken(userId, "airtable")

    const baseId = resolveValue(config.baseId, input)
    const tableName = resolveValue(config.tableName, input)

    // Extract fields from config - they may be stored as airtable_field_* keys
    const fields: Record<string, any> = {}
    let fieldCount = 0

    try {
      for (const [key, value] of Object.entries(config)) {
        if (key.startsWith('airtable_field_')) {
          // Remove the airtable_field_ prefix to get the actual field name
          // The field name includes spaces (e.g., "Draft Name" not "Draft_Name")
          const fieldName = key.replace('airtable_field_', '')
          // Only store primitive values or simple objects, not functions or complex objects
          if (value !== undefined && typeof value !== 'function') {
            fields[fieldName] = value
            fieldCount++
          }
        }
      }
    } catch (err) {
      console.error("Error extracting fields from config:", err)
    }

    // Also check for a direct fields object (fallback to old structure)
    const directFields = config.fields || {}
    if (Object.keys(directFields).length > 0) {
      Object.assign(fields, directFields)
      fieldCount += Object.keys(directFields).length
    }

    console.log(`📊 [Airtable] Found ${fieldCount} fields to process`)

    if (!baseId || !tableName) {
      const missingFields = []
      if (!baseId) missingFields.push("Base ID")
      if (!tableName) missingFields.push("Table Name")

      const message = `Missing required fields for creating record: ${missingFields.join(", ")}`
      console.error(message)
      return { success: false, message }
    }

    // Resolve field values using template variables
    const resolvedFields: Record<string, any> = {}
    const attachmentFields: string[] = []
    const skippedFields: string[] = []

    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
        const resolved = resolveValue(fieldValue, input)

        // Check if this is likely an attachment field
        const lowerFieldName = fieldName.toLowerCase()
        const isLikelyAttachment =
          lowerFieldName.includes('image') ||
          lowerFieldName.includes('photo') ||
          lowerFieldName.includes('attachment') ||
          lowerFieldName.includes('file') ||
          lowerFieldName.includes('document') ||
          lowerFieldName.includes('draft image') // Specific to your use case

        // Handle attachment fields
        if (isLikelyAttachment && resolved) {
          // If it's a base64 data URL, upload it to Airtable
          if (typeof resolved === 'string' && resolved.startsWith('data:')) {
            const uploadedAttachment = await uploadAttachmentToAirtable(accessToken, resolved, fieldName)

            if (uploadedAttachment) {
              // Add the uploaded attachment to the fields
              resolvedFields[fieldName] = [uploadedAttachment]
              attachmentFields.push(fieldName)
              console.log(`📊 [Airtable] Uploaded and attached file for field "${fieldName}"`)
            } else {
              console.log(`📊 [Airtable] Failed to upload attachment for field "${fieldName}" - skipping`)
              skippedFields.push(fieldName)
            }
            continue
          }

          // If it's a URL, format it properly for Airtable
          if (typeof resolved === 'string' && (resolved.startsWith('http://') || resolved.startsWith('https://'))) {
            // Airtable expects an array of attachment objects
            resolvedFields[fieldName] = [{
              url: resolved,
              filename: resolved.split('/').pop() || 'attachment'
            }]
            attachmentFields.push(fieldName)
            console.log(`📊 [Airtable] Formatted attachment field "${fieldName}" with URL: ${resolved}`)
            continue
          }

          // If it's already an array (pre-formatted), use as-is
          if (Array.isArray(resolved)) {
            resolvedFields[fieldName] = resolved
            attachmentFields.push(fieldName)
            continue
          }

          // Skip any other large data that might be attachment
          if (typeof resolved === 'string' && resolved.length > 1000) {
            console.log(`📊 [Airtable] Skipping field "${fieldName}" - unrecognized large data format`)
            skippedFields.push(fieldName)
            continue
          }
        }

        // Regular fields - add non-empty resolved values
        if (resolved !== undefined && resolved !== null && resolved !== '') {
          resolvedFields[fieldName] = resolved
        }
      }
    }

    if (attachmentFields.length > 0) {
      console.log(`📊 [Airtable] Processed ${attachmentFields.length} attachment fields: ${attachmentFields.join(', ')}`);
    }
    if (skippedFields.length > 0) {
      console.log(`📊 [Airtable] Skipped ${skippedFields.length} fields: ${skippedFields.join(', ')}`);
    }
    console.log(`📊 [Airtable] Sending ${Object.keys(resolvedFields).length} fields to API`)


    // Create the record in Airtable
    const requestBody = {
      fields: resolvedFields,
    }

    console.log(`📊 [Airtable] Sending request to table: ${tableName}`)

    const response = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to create record: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()
    console.log(`📊 [Airtable] Record created successfully with ID: ${result.id}`)

    return {
      success: true,
      output: {
        recordId: result.id,
        fields: result.fields,
        createdTime: result.createdTime,
        tableName: tableName,
        baseId: baseId
      },
      message: `Successfully created record in ${tableName}`
    }

  } catch (error: any) {
    console.error("Airtable create record error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while creating the record"
    }
  }
} 