import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Adds an attachment to an Airtable record
 * Supports upload, URL, and base64 data sources
 * Can preserve existing attachments or replace them
 */
export async function addAirtableAttachment(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "airtable")

    const baseId = resolveValue(config.baseId, input)
    const tableName = resolveValue(config.tableName, input)
    const recordId = resolveValue(config.recordId, input)
    const attachmentField = resolveValue(config.attachmentField, input)
    const fileSource = resolveValue(config.fileSource, input) || 'url'
    const preserveExisting = resolveValue(config.preserveExisting, input) || false
    const filename = resolveValue(config.filename, input)
    const contentType = resolveValue(config.contentType, input)

    // Validate required fields
    if (!baseId || !tableName || !recordId || !attachmentField) {
      const missingFields = []
      if (!baseId) missingFields.push("Base ID")
      if (!tableName) missingFields.push("Table Name")
      if (!recordId) missingFields.push("Record ID")
      if (!attachmentField) missingFields.push("Attachment Field")

      const message = `Missing required fields: ${missingFields.join(", ")}`
      logger.error(message)
      return { success: false, message }
    }

    if (!filename) {
      return { success: false, message: "Filename is required" }
    }

    // Build the attachment object based on file source
    let attachmentData: any = {
      filename: filename
    }

    if (fileSource === 'url') {
      const fileUrl = resolveValue(config.fileUrl, input)
      if (!fileUrl) {
        return { success: false, message: "File URL is required when using URL source" }
      }
      attachmentData.url = fileUrl
    } else if (fileSource === 'base64') {
      const base64Data = resolveValue(config.base64Data, input)
      if (!base64Data) {
        return { success: false, message: "Base64 data is required when using Base64 source" }
      }
      // Airtable expects data URLs for base64
      const base64Prefix = base64Data.startsWith('data:') ? '' : `data:${contentType || 'application/octet-stream'};base64,`
      attachmentData.url = `${base64Prefix}${base64Data}`
    } else if (fileSource === 'upload') {
      const uploadedFile = resolveValue(config.uploadedFile, input)
      if (!uploadedFile) {
        return { success: false, message: "Uploaded file is required when using upload source" }
      }

      // The uploadedFile should already be a URL (from file upload handling)
      // If it's an object with a url property, extract it
      if (typeof uploadedFile === 'object' && uploadedFile.url) {
        attachmentData.url = uploadedFile.url
      } else if (typeof uploadedFile === 'string') {
        attachmentData.url = uploadedFile
      } else {
        return { success: false, message: "Invalid uploaded file format" }
      }
    } else {
      return { success: false, message: `Unknown file source: ${fileSource}` }
    }

    // Add content type if specified
    if (contentType) {
      attachmentData.contentType = contentType
    }

    logger.debug('[addAirtableAttachment] Processing attachment:', {
      baseId,
      tableName,
      recordId,
      attachmentField,
      fileSource,
      preserveExisting,
      filename,
      hasContentType: !!contentType
    })

    // If preserveExisting is true, fetch the current record to get existing attachments
    let existingAttachments: any[] = []
    if (preserveExisting) {
      logger.debug('[addAirtableAttachment] Fetching existing attachments')

      const getResponse = await fetch(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      )

      if (getResponse.ok) {
        const record = await getResponse.json()
        const currentValue = record.fields?.[attachmentField]

        if (Array.isArray(currentValue)) {
          // Convert existing attachments to the format Airtable expects
          existingAttachments = currentValue.map((att: any) => ({
            url: att.url,
            filename: att.filename
          }))
          logger.debug('[addAirtableAttachment] Found existing attachments:', existingAttachments.length)
        }
      } else {
        logger.warn('[addAirtableAttachment] Could not fetch existing record, will replace attachments')
      }
    }

    // Build the final attachments array
    const finalAttachments = [...existingAttachments, attachmentData]

    // Update the record with the attachment(s)
    const response = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            [attachmentField]: finalAttachments
          }
        })
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to add attachment: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()
    const updatedAttachments = result.fields?.[attachmentField] || []

    // Find the newly added attachment (it will be the last one if we preserved existing)
    const newAttachment = updatedAttachments[updatedAttachments.length - 1] || {}

    logger.debug('[addAirtableAttachment] Attachment added successfully:', {
      recordId: result.id,
      totalAttachments: updatedAttachments.length,
      newAttachmentId: newAttachment.id
    })

    return {
      success: true,
      output: {
        recordId: result.id,
        attachmentId: newAttachment.id || null,
        attachmentUrl: newAttachment.url || null,
        filename: newAttachment.filename || filename
      },
      message: `Successfully added attachment "${filename}" to record ${recordId}`
    }

  } catch (error: any) {
    logger.error("Airtable add attachment error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while adding attachment"
    }
  }
}
