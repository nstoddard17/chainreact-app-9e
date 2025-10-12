import { Buffer } from 'buffer'
import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import {
  deleteTempAttachments,
  scheduleTempAttachmentCleanup,
  uploadTempAttachmentToSupabase
} from './supabaseAttachment'

import { logger } from '@/lib/utils/logger'

export interface UploadContext {
  accessToken: string
  baseId: string
  tableId: string
  tableName: string
}

interface ParsedDataUrl {
  mimeType: string
  base64Data: string
}

export type AirtableAttachment = Record<string, any>

function parseDataUrl(value: string): ParsedDataUrl | null {
  const dataUrlPattern = /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/i
  const match = value.match(dataUrlPattern)
  if (!match) return null

  return {
    mimeType: match[1] || 'application/octet-stream',
    base64Data: match[2]
  }
}

function guessFileExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg'
  if (normalized.includes('png')) return 'png'
  if (normalized.includes('gif')) return 'gif'
  if (normalized.includes('webp')) return 'webp'
  if (normalized.includes('svg')) return 'svg'
  if (normalized.includes('pdf')) return 'pdf'
  if (normalized.includes('json')) return 'json'
  if (normalized.includes('plain')) return 'txt'
  return 'bin'
}

function buildDefaultFilename(fieldName: string, index: number, extension: string): string {
  const safeField = fieldName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
    .replace(/-{2,}/g, '-') || 'attachment'
  return `${safeField}-${Date.now()}-${index}.${extension}`
}

export function ensureArray<T>(value: T | T[]): T[] {
  if (Array.isArray(value)) return value
  return [value]
}

function tryParseJson(value: string): any {
  try {
    return JSON.parse(value)
  } catch (err) {
    return null
  }
}

export function extractAttachmentCandidates(value: any): any[] | null {
  if (!value && value !== 0) return null

  if (Array.isArray(value)) {
    const attachmentLikeEntries = value.filter((entry) => {
      if (!entry && entry !== 0) return false

      if (typeof entry === 'string') {
        const trimmed = entry.trim()
        return (
          trimmed.startsWith('http://') ||
          trimmed.startsWith('https://') ||
          trimmed.startsWith('data:') ||
          trimmed.startsWith('{') ||
          trimmed.startsWith('[')
        )
      }

      if (typeof entry === 'object') {
        if (Array.isArray(entry)) {
          return extractAttachmentCandidates(entry) !== null
        }

        return Boolean(
          entry?.url ||
            entry?.dataUrl ||
            entry?.dataURL ||
            entry?.data ||
            entry?.base64 ||
            entry?.base64Data
        )
      }

      return false
    })

    return attachmentLikeEntries.length > 0 ? attachmentLikeEntries : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
      return [trimmed]
    }

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const parsed = tryParseJson(trimmed)
      if (parsed !== null && parsed !== undefined) {
        return extractAttachmentCandidates(parsed) || ensureArray(parsed)
      }
    }

    return null
  }

  if (typeof value === 'object') {
    if (value === null) return null

    if (Array.isArray(value.attachments)) {
      return value.attachments
    }

    if (
      value.url ||
      value.dataUrl ||
      value.dataURL ||
      value.data ||
      value.base64 ||
      value.base64Data
    ) {
      return [value]
    }
  }

  return null
}

export async function uploadAirtableAttachment(
  dataUrl: string,
  fieldName: string,
  index: number,
  _context: UploadContext,
  cleanupPaths: string[],
  explicitFilename?: string,
  fieldId?: string
): Promise<AirtableAttachment> {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed) {
    throw new Error(`Invalid data URL provided for field "${fieldName}"`)
  }

  const { mimeType, base64Data } = parsed
  const buffer = Buffer.from(base64Data, 'base64')

  if (!buffer.length) {
    throw new Error(`No attachment data found for field "${fieldName}"`)
  }

  const extension = guessFileExtension(mimeType)
  const fileName = explicitFilename || buildDefaultFilename(fieldName, index, extension)

  logger.debug(`📎 [Airtable] Uploading temporary attachment for "${fieldName}" via Supabase`) // eslint-disable-line no-console

  const { url: fileUrl, filePath } = await uploadTempAttachmentToSupabase(buffer, fileName, mimeType)
  cleanupPaths.push(filePath)

  logger.debug(
    `📎 [Airtable] Supabase temporary attachment ready for "${fieldName}" at ${filePath}`
  )

  return {
    url: fileUrl,
    filename: fileName.replace(/\s+/g, '_')
  }
}

export async function resolveTableId(
  baseId: string,
  tableName: string,
  explicitTableId: string | undefined,
  accessToken: string
): Promise<string | null> {
  if (explicitTableId) {
    return explicitTableId
  }

  if (!tableName) {
    return null
  }

  try {
    const response = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      logger.warn(
        `⚠️ [Airtable] Failed to resolve table ID for ${tableName}: ${response.status} - ${errorPayload.error?.message || response.statusText}`
      )
      return null
    }

    const data = await response.json()
    const tables: Array<{ id: string; name: string }> = data?.tables || []
    const match = tables.find((table) => table.name.toLowerCase() === tableName.toLowerCase())

    if (match?.id) {
      return match.id
    }

    logger.warn(`⚠️ [Airtable] Unable to locate table ID for name "${tableName}" in base ${baseId}`)
  } catch (error) {
    logger.error(`❌ [Airtable] Error resolving table ID for ${tableName}:`, error)
  }

  return null
}

export async function resolveAttachmentEntry(
  entry: any,
  fieldName: string,
  index: number,
  context: UploadContext,
  cleanupPaths: string[]
): Promise<AirtableAttachment | null> {
  if (!entry) return null

  // Handle strings (URL, data URL, or JSON string)
  if (typeof entry === 'string') {
    const trimmed = entry.trim()

    if (!trimmed) return null

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const filename = trimmed.split('/').pop() || 'attachment'
      return { url: trimmed, filename }
    }

    if (trimmed.startsWith('data:')) {
      return uploadAirtableAttachment(trimmed, fieldName, index, context, cleanupPaths)
    }

    if ((trimmed.startsWith('{') || trimmed.startsWith('['))) {
      const parsed = tryParseJson(trimmed)
      if (parsed) {
        return resolveAttachmentEntry(parsed, fieldName, index, context, cleanupPaths)
      }
    }

    return null
  }

  // Handle plain objects
  if (typeof entry === 'object') {
    if (Array.isArray(entry)) {
      // Flatten nested arrays
      for (const nested of entry) {
        const resolved = await resolveAttachmentEntry(nested, fieldName, index, context, cleanupPaths)
        if (resolved) return resolved
      }
      return null
    }

    if (entry.url) {
      const urlString = String(entry.url).trim()

      if (urlString.startsWith('data:')) {
        return uploadAirtableAttachment(
          urlString,
          fieldName,
          index,
          context,
          cleanupPaths,
          entry.filename || entry.name,
          entry.fieldId
        )
      }

      const attachment: AirtableAttachment = {
        url: urlString,
        filename: entry.filename || entry.name || entry.title || urlString.split('/').pop() || 'attachment'
      }

      if (entry.type) attachment.type = entry.type
      if (entry.size) attachment.size = entry.size
      if (entry.id) attachment.id = entry.id
      if (entry.thumbnails) attachment.thumbnails = entry.thumbnails
      if (entry.expirationTime) attachment.expirationTime = entry.expirationTime
      if (entry.expiration_time) attachment.expirationTime = entry.expiration_time

      return attachment
    }

    const dataUrl = entry.dataUrl || entry.dataURL || entry.data || entry.base64 || entry.base64Data
    if (typeof dataUrl === 'string') {
      if (dataUrl.startsWith('data:')) {
        return uploadAirtableAttachment(
          dataUrl,
          fieldName,
          index,
          context,
          cleanupPaths,
          entry.filename || entry.name,
          entry.fieldId
        )
      }

      const mime = entry.contentType || entry.mimeType || entry.type
      const trimmed = dataUrl.trim()
      if (mime && /^[a-z0-9+/=]+$/i.test(trimmed.replace(/\s+/g, ''))) {
        const normalized = trimmed.replace(/\s+/g, '')
        const constructedDataUrl = `data:${mime};base64,${normalized}`
        return uploadAirtableAttachment(
          constructedDataUrl,
          fieldName,
          index,
          context,
          cleanupPaths,
          entry.filename || entry.name,
          entry.fieldId
        )
      }
    }

    // If object already looks like an Airtable attachment, return as-is
    if (entry.id && entry.type && entry.size && entry.url) {
      return entry
    }
  }

  return null
}

/**
 * Creates a new record in an Airtable table
 *
 * For attachment fields (images, files, etc.):
 * - Supports direct URLs to hosted files
 * - Supports data URLs/base64 strings via Airtable's attachment upload endpoint
 *
 * Attachment field format:
 * - URL string: "https://example.com/file.pdf"
 * - Base64/data URL string: "data:image/png;base64,iVBOR..."
 * - Object with url/filename or dataUrl/base64 fields
 * - Pre-formatted array: [{ url: "https://...", filename: "file.pdf" }]
 */


export async function createAirtableRecord(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  const cleanupPaths: string[] = []
  let recordCreated = false

  try {
    // Only log essential info, not the entire config
    logger.debug("📊 [Airtable] Creating record...")

    // Validate config object
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid configuration provided')
    }

    const accessToken = await getDecryptedAccessToken(userId, "airtable")

    const baseId = resolveValue(config.baseId, input)
    const tableName = resolveValue(config.tableName, input)
    const tableId = resolveValue(config.tableId, input)

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
      logger.error("Error extracting fields from config:", err)
    }

    // Also check for a direct fields object (fallback to old structure)
    const directFields = config.fields || {}
    if (Object.keys(directFields).length > 0) {
      Object.assign(fields, directFields)
      fieldCount += Object.keys(directFields).length
    }

    logger.debug(`📊 [Airtable] Found ${fieldCount} fields to process`)

    if (!baseId || !tableName) {
      const missingFields = []
      if (!baseId) missingFields.push("Base ID")
      if (!tableName) missingFields.push("Table Name")

      const message = `Missing required fields for creating record: ${missingFields.join(", ")}`
      logger.error(message)
      return { success: false, message }
    }

    const resolvedTableId = await resolveTableId(baseId, tableName, tableId, accessToken)

    if (resolvedTableId) {
      logger.debug(
        `📎 [Airtable] Using tableId ${resolvedTableId} for table "${tableName}" in base ${baseId}`
      )
    } else {
      logger.debug('📎 [Airtable] Proceeding without resolved tableId for attachment upload context')
    }

    // Resolve field values using template variables
    const resolvedFields: Record<string, any> = {}
    const attachmentFields: string[] = []
    const attachmentErrors: string[] = []
    const skippedFields: string[] = []

    const uploadContext: UploadContext = {
      accessToken,
      baseId,
      tableId: resolvedTableId || tableId || tableName,
      tableName: tableName
    }

    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
        const resolved = resolveValue(fieldValue, input)

        // Check if this is likely an attachment field
        // Need to handle field names with spaces properly
        const normalizedFieldName = fieldName.replace(/_/g, ' ').toLowerCase()
        const isLikelyAttachment =
          normalizedFieldName.includes('image') ||
          normalizedFieldName.includes('photo') ||
          normalizedFieldName.includes('attachment') ||
          normalizedFieldName.includes('file') ||
          normalizedFieldName.includes('document') ||
          normalizedFieldName.includes('picture') ||
          normalizedFieldName.includes('media')

        // Handle attachment fields
        const candidateEntries = extractAttachmentCandidates(resolved)

        if ((isLikelyAttachment || candidateEntries) && resolved) {
          logger.debug(
            `📊 [Airtable] Processing attachment field "${fieldName}" (${Array.isArray(candidateEntries) ? candidateEntries.length : 1} value(s))`
          )

          const entries = candidateEntries ?? ensureArray(resolved)
          const attachments: AirtableAttachment[] = []
          let hadAttachmentIssue = false

          for (let index = 0; index < entries.length; index++) {
            const entry = entries[index]
            try {
              const attachment = await resolveAttachmentEntry(
                entry,
                fieldName,
                index,
                uploadContext,
                cleanupPaths
              )
              if (attachment) {
                attachments.push(attachment)
              } else {
                logger.debug(`📊 [Airtable] Ignored attachment entry ${index + 1} for field "${fieldName}" (unrecognized format)`)
              }
            } catch (attachmentError) {
              hadAttachmentIssue = true
              attachmentErrors.push(fieldName)
              logger.error(`❌ [Airtable] Error processing attachment for field "${fieldName}":`, attachmentError)
            }
          }

          if (attachments.length > 0) {
            resolvedFields[fieldName] = attachments
            attachmentFields.push(fieldName)
            logger.debug(
              `📊 [Airtable] Prepared ${attachments.length} attachment(s) for field "${fieldName}"`
            )
            continue
          }

          if (hadAttachmentIssue) {
            skippedFields.push(fieldName)
            logger.debug(`📊 [Airtable] Skipping field "${fieldName}" due to attachment processing errors`)
            continue
          }

        }

        // Regular fields - add non-empty resolved values
        if (resolved !== undefined && resolved !== null && resolved !== '') {
          // Final safety check: if this is base64 data that wasn't detected as an attachment field,
          // skip it to prevent API errors
          if (typeof resolved === 'string' && resolved.startsWith('data:') && resolved.includes('base64,')) {
            logger.debug(`📊 [Airtable] Field "${fieldName}" contains base64 data but was not recognized as attachment`)
            logger.debug(`📊 [Airtable] Skipping to prevent invalid payload. Please rename field or verify configuration.`)
            skippedFields.push(fieldName)
            continue
          }

          // Additional check for very large string data that might cause issues
          if (typeof resolved === 'string' && resolved.length > 100000) {
            logger.debug(`📊 [Airtable] Field "${fieldName}" contains very large data (${(resolved.length / 1024).toFixed(1)}KB) - skipping`)
            skippedFields.push(fieldName)
            continue
          }

          resolvedFields[fieldName] = resolved
        }
      }
    }

    if (attachmentFields.length > 0) {
      logger.debug(`📊 [Airtable] Prepared attachment fields: ${attachmentFields.join(', ')}`)
    }
    if (attachmentErrors.length > 0) {
      logger.debug(`📊 [Airtable] Encountered attachment issues with: ${[...new Set(attachmentErrors)].join(', ')}`)
    }
    if (skippedFields.length > 0) {
      logger.debug(`📊 [Airtable] Skipped fields: ${skippedFields.join(', ')}`)
    }
    logger.debug(`📊 [Airtable] Sending ${Object.keys(resolvedFields).length} fields to API`)


    // Create the record in Airtable
    const requestBody = {
      fields: resolvedFields,
    }

    logger.debug(`📊 [Airtable] Sending request to table: ${tableName}`)

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
    logger.debug(`📊 [Airtable] Record created successfully with ID: ${result.id}`)
    recordCreated = true

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
    logger.error("Airtable create record error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while creating the record"
    }
  } finally {
    if (cleanupPaths.length > 0) {
      if (recordCreated) {
        logger.debug(
          `🧹 [Airtable] Scheduling cleanup for ${cleanupPaths.length} temporary attachment(s)`
        )
        scheduleTempAttachmentCleanup(cleanupPaths)
      } else {
        try {
          await deleteTempAttachments(cleanupPaths)
          logger.debug(
            `🧹 [Airtable] Removed ${cleanupPaths.length} temporary attachment(s) after failure`
          )
        } catch (cleanupError) {
          logger.error('❌ [Airtable] Failed to remove temporary attachments:', cleanupError)
        }
      }
    }
  }
}
