import FormData from 'form-data'

import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { FileStorageService } from '@/lib/storage/fileStorage'

import { logger } from '@/lib/utils/logger'

/**
 * Create a new ticket in HubSpot
 *
 * API Verification:
 * - Endpoint: POST /crm/v3/objects/tickets
 * - Docs: https://developers.hubspot.com/docs/api/crm/tickets
 * - Scopes: tickets
 */
export async function hubspotCreateTicket(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    // Build properties object
    const properties: any = {}

    // Required fields
    const subject = context.dataFlowManager.resolveVariable(config.subject)
    if (!subject) {
      throw new Error('Ticket subject is required')
    }
    properties.subject = subject

    const pipeline = context.dataFlowManager.resolveVariable(config.hs_pipeline)
    if (!pipeline) {
      throw new Error('Pipeline is required')
    }
    properties.hs_pipeline = pipeline

    const stage = context.dataFlowManager.resolveVariable(config.hs_pipeline_stage)
    if (!stage) {
      throw new Error('Pipeline stage is required')
    }
    properties.hs_pipeline_stage = stage

    const resolvedAttachmentsInput = config.attachments
      ? context.dataFlowManager.resolveVariable(config.attachments)
      : undefined
    const normalizedAttachments = normalizeAttachmentInput(resolvedAttachmentsInput)

    // Optional fields
    const optionalFields = [
      'content', 'hs_ticket_priority', 'hs_ticket_category',
      'hubspot_owner_id', 'source_type', 'hs_ticket_status'
    ]

    optionalFields.forEach(field => {
      const value = context.dataFlowManager.resolveVariable(config[field])
      if (value !== undefined && value !== null && value !== '') {
        properties[field] = value
      }
    })

    // Custom property map support
    const customPropertyValues =
      config.customProperties ??
      config?.customPropertiesGroup?.customProperties ??
      null

    if (customPropertyValues && typeof customPropertyValues === 'object') {
      Object.entries(customPropertyValues).forEach(([key, rawValue]) => {
        const resolvedValue = context.dataFlowManager.resolveVariable(rawValue as any)
        if (hasValue(resolvedValue)) {
          properties[key] = resolvedValue
        }
      })
    }

    // Create ticket
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/tickets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HubSpot API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    // Handle associations if provided
    const associatedContactId = context.dataFlowManager.resolveVariable(config.associatedContactId)
    const associatedCompanyId = context.dataFlowManager.resolveVariable(config.associatedCompanyId)
    const associatedDealId = context.dataFlowManager.resolveVariable(config.associatedDealId)

    const associations = []
    if (associatedContactId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v3/objects/tickets/${data.id}/associations/contacts/${associatedContactId}/ticket_to_contact`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
      )
    }
    if (associatedCompanyId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v3/objects/tickets/${data.id}/associations/companies/${associatedCompanyId}/ticket_to_company`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
      )
    }
    if (associatedDealId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v3/objects/tickets/${data.id}/associations/deals/${associatedDealId}/ticket_to_deal`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
      )
    }

    if (associations.length > 0) {
      await Promise.all(associations)
    }

    let hubspotAttachmentIds: string[] = []
    if (normalizedAttachments.length > 0) {
      hubspotAttachmentIds = await handleTicketAttachments({
        attachments: normalizedAttachments,
        accessToken,
        ticketId: data.id,
        userId: context.userId
      })
    }

    return {
      success: true,
      output: {
        ticketId: data.id,
        ...data.properties,
        createdate: data.createdAt,
        properties: data.properties,
        ...(hubspotAttachmentIds.length > 0
          ? { hubspotAttachmentIds }
          : {})
      },
      message: `Successfully created ticket ${data.id} in HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Create Ticket error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create ticket in HubSpot'
    }
  }
}

function hasValue(value: any): boolean {
  return value !== undefined && value !== null && value !== ''
}

function normalizeAttachmentInput(input: any): any[] {
  if (!input) return []
  if (Array.isArray(input)) {
    return input.filter(Boolean)
  }
  return [input]
}

type AttachmentPayload = {
  buffer: Buffer
  fileName: string
  mimeType: string
}

async function handleTicketAttachments(params: {
  attachments: any[]
  accessToken: string
  ticketId: string
  userId: string
}): Promise<string[]> {
  const { attachments, accessToken, ticketId, userId } = params

  const payloads: AttachmentPayload[] = []

  for (const attachment of attachments) {
    const payload = await resolveAttachmentPayload(attachment, userId)
    if (payload) {
      payloads.push(payload)
    } else {
      logger.warn('[HubSpot] Skipping attachment that could not be resolved')
    }
  }

  if (payloads.length === 0) {
    return []
  }

  const hubspotFileIds: string[] = []

  for (const payload of payloads) {
    const fileId = await uploadFileToHubSpot(payload, accessToken)
    hubspotFileIds.push(fileId)
  }

  await Promise.all(
    hubspotFileIds.map(fileId =>
      associateFileWithTicket(ticketId, fileId, accessToken)
    )
  )

  return hubspotFileIds
}

async function resolveAttachmentPayload(
  attachment: any,
  userId: string
): Promise<AttachmentPayload | null> {
  if (!attachment) return null

  const maybeId =
    typeof attachment === 'string'
      ? attachment
      : attachment.id || attachment.fileId || attachment.file_id

  if (maybeId) {
    try {
      const stored = await FileStorageService.getFile(maybeId, userId)
      if (!stored) {
        logger.warn(`[HubSpot] Attachment ${maybeId} not found in storage`)
        return null
      }
      const buffer = Buffer.from(await stored.file.arrayBuffer())
      return {
        buffer,
        fileName:
          attachment.fileName ||
          stored.metadata.fileName ||
          'attachment',
        mimeType:
          attachment.fileType ||
          stored.metadata.fileType ||
          'application/octet-stream'
      }
    } catch (error) {
      logger.error('[HubSpot] Failed to load stored attachment', error)
      throw error
    }
  }

  const base64Payload = extractBase64Payload(attachment)
  if (base64Payload) {
    const { data, mimeType, fileName } = base64Payload
    const { buffer, detectedMimeType } = decodeBase64(data, mimeType)
    return {
      buffer,
      fileName: fileName || attachment.fileName || 'attachment',
      mimeType: detectedMimeType || attachment.fileType || 'application/octet-stream'
    }
  }

  if (attachment.url && typeof attachment.url === 'string' && attachment.url.startsWith('http')) {
    const response = await fetch(attachment.url)
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText)
      throw new Error(`Failed to download attachment from URL: ${response.status} - ${errorText}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    return {
      buffer,
      fileName: attachment.fileName || deriveFileNameFromUrl(attachment.url),
      mimeType: attachment.fileType || response.headers.get('content-type') || 'application/octet-stream'
    }
  }

  return null
}

function extractBase64Payload(attachment: any): { data: string; mimeType?: string; fileName?: string } | null {
  if (attachment.file?.content) {
    return {
      data: attachment.file.content,
      mimeType: attachment.file.mimeType || attachment.file.fileType,
      fileName: attachment.file.filename || attachment.file.fileName
    }
  }

  if (attachment.content && typeof attachment.content === 'string') {
    return {
      data: attachment.content,
      mimeType: attachment.mimeType || attachment.fileType,
      fileName: attachment.fileName
    }
  }

  if (attachment.url && typeof attachment.url === 'string' && attachment.url.startsWith('data:')) {
    return {
      data: attachment.url,
      fileName: attachment.fileName
    }
  }

  return null
}

function decodeBase64(value: string, explicitMime?: string): { buffer: Buffer; detectedMimeType?: string } {
  if (value.startsWith('data:')) {
    const matches = value.match(/^data:([^;]+);base64,(.+)$/)
    if (matches) {
      const [, mimeType, data] = matches
      return {
        buffer: Buffer.from(data, 'base64'),
        detectedMimeType: explicitMime || mimeType
      }
    }
  }

  return {
    buffer: Buffer.from(value, 'base64'),
    detectedMimeType: explicitMime
  }
}

function deriveFileNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname.split('/').filter(Boolean)
    return pathname[pathname.length - 1] || 'attachment'
  } catch {
    return 'attachment'
  }
}

async function uploadFileToHubSpot(file: AttachmentPayload, accessToken: string): Promise<string> {
  const form = new FormData()
  form.append('file', file.buffer, {
    filename: file.fileName || 'attachment',
    contentType: file.mimeType || 'application/octet-stream',
    knownLength: file.buffer.length
  })

  form.append('options', JSON.stringify({
    access: 'PRIVATE',
    overwrite: false,
    duplicateValidationStrategy: 'NONE',
    duplicateValidationScope: 'EXACT_FOLDER',
    name: file.fileName || 'attachment'
  }))

  const response = await fetch('https://api.hubapi.com/files/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      ...form.getHeaders()
    },
    body: form as any
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(`HubSpot file upload error: ${response.status} - ${errorText}`)
  }

  const uploadResult = await response.json()
  const fileId = uploadResult.id || uploadResult.fileId

  if (!fileId) {
    throw new Error('HubSpot file upload succeeded but no file ID was returned')
  }

  return String(fileId)
}

async function associateFileWithTicket(ticketId: string, fileId: string, accessToken: string): Promise<void> {
  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}/associations/files/${fileId}/ticket_to_file`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(`Failed to associate attachment ${fileId} with ticket ${ticketId}: ${response.status} - ${errorText}`)
  }
}
