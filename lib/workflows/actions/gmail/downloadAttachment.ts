import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Downloads attachment(s) from a Gmail message and saves to cloud storage
 * Supports: Google Drive, OneDrive, Dropbox
 */
export async function downloadGmailAttachment(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'gmail')

    // Get configuration
    const messageId = resolveValue(config.messageId, input)
    const attachmentSelection = resolveValue(config.attachmentSelection, input) || 'all'
    const attachmentId = resolveValue(config.attachmentId, input)
    const filename = resolveValue(config.filename, input)
    const filenamePattern = resolveValue(config.filenamePattern, input)
    const storageService = resolveValue(config.storageService, input)
    const folderId = resolveValue(config.folderId, input)
    const filenameConflict = resolveValue(config.filenameConflict, input) || 'rename'
    const createDateFolder = resolveValue(config.createDateFolder, input) || false

    if (!messageId || !messageId.trim()) {
      return {
        success: false,
        message: 'Message ID is required',
      }
    }

    if (!storageService) {
      return {
        success: false,
        message: 'Storage service is required',
      }
    }

    logger.debug(`[Gmail Download Attachment] Configuration:`, {
      messageId,
      attachmentSelection,
      storageService,
      folderId,
      filenameConflict,
      createDateFolder
    })

    // Step 1: Get message details to find attachments
    const messageResponse = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!messageResponse.ok) {
      const error = await messageResponse.json().catch(() => ({ error: { message: messageResponse.statusText } }))
      throw new Error(error.error?.message || `Failed to fetch message: ${messageResponse.status}`)
    }

    const message = await messageResponse.json()

    // Step 2: Extract attachments from message
    const extractAttachments = (parts: any[]): any[] => {
      const attachments: any[] = []
      for (const part of parts || []) {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: parseInt(part.body.size || '0', 10),
            attachmentId: part.body.attachmentId
          })
        }
        if (part.parts) {
          attachments.push(...extractAttachments(part.parts))
        }
      }
      return attachments
    }

    const allAttachments = extractAttachments(message.payload?.parts || [])

    if (allAttachments.length === 0) {
      return {
        success: false,
        message: 'No attachments found in this email',
      }
    }

    logger.debug(`[Gmail Download Attachment] Found ${allAttachments.length} attachments:`,
      allAttachments.map(a => a.filename))

    // Step 3: Filter attachments based on selection mode
    let attachmentsToDownload: any[] = []

    switch (attachmentSelection) {
      case 'id':
        if (!attachmentId || !attachmentId.trim()) {
          return {
            success: false,
            message: 'Attachment ID is required when using "Attachment ID" selection mode',
          }
        }
        attachmentsToDownload = allAttachments.filter(a => a.attachmentId === attachmentId)
        if (attachmentsToDownload.length === 0) {
          return {
            success: false,
            message: `No attachment found with ID: ${attachmentId}`,
          }
        }
        break

      case 'filename':
        if (!filename || !filename.trim()) {
          return {
            success: false,
            message: 'Filename is required when using "Filename" selection mode',
          }
        }
        attachmentsToDownload = allAttachments.filter(a => a.filename === filename)
        if (attachmentsToDownload.length === 0) {
          return {
            success: false,
            message: `No attachment found with filename: ${filename}`,
          }
        }
        break

      case 'pattern':
        if (!filenamePattern || !filenamePattern.trim()) {
          return {
            success: false,
            message: 'Filename pattern is required when using "Filename Pattern" selection mode',
          }
        }
        attachmentsToDownload = allAttachments.filter(a =>
          a.filename.toLowerCase().includes(filenamePattern.toLowerCase())
        )
        if (attachmentsToDownload.length === 0) {
          return {
            success: false,
            message: `No attachments found matching pattern: ${filenamePattern}`,
          }
        }
        break

      case 'all':
      default:
        attachmentsToDownload = allAttachments
        break
    }

    logger.debug(`[Gmail Download Attachment] Will download ${attachmentsToDownload.length} attachment(s)`)

    // Step 4: Download and save each attachment to storage
    const results = []
    const errors = []

    for (const attachment of attachmentsToDownload) {
      try {
        // Download attachment from Gmail
        const attachmentResponse = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachment.attachmentId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        )

        if (!attachmentResponse.ok) {
          throw new Error(`Failed to download ${attachment.filename}: ${attachmentResponse.status}`)
        }

        const attachmentData = await attachmentResponse.json()

        // Convert base64url to base64
        const base64Data = attachmentData.data
          .replace(/-/g, '+')
          .replace(/_/g, '/')

        // Determine final filename based on conflict strategy
        let finalFilename = attachment.filename
        if (filenameConflict === 'rename') {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
          const nameParts = attachment.filename.split('.')
          const ext = nameParts.length > 1 ? nameParts.pop() : ''
          const baseName = nameParts.join('.')
          finalFilename = ext ? `${baseName}_${timestamp}.${ext}` : `${baseName}_${timestamp}`
        }

        // Determine folder path (with optional date subfolder)
        let targetFolderId = folderId
        if (createDateFolder) {
          const now = new Date()
          const year = now.getFullYear()
          const month = String(now.getMonth() + 1).padStart(2, '0')

          // TODO: Create year/month subfolders if they don't exist
          // For now, just use the specified folder
        }

        // Upload to storage service
        const uploadResult = await uploadToStorage({
          storageService,
          userId,
          filename: finalFilename,
          mimeType: attachment.mimeType,
          base64Data,
          folderId: targetFolderId,
          filenameConflict,
          size: attachment.size
        })

        results.push({
          filename: attachment.filename,
          savedAs: finalFilename,
          fileId: uploadResult.fileId,
          fileUrl: uploadResult.fileUrl,
          size: attachment.size,
          mimeType: attachment.mimeType,
          success: true
        })

        logger.debug(`[Gmail Download Attachment] Saved ${attachment.filename} as ${finalFilename}`)

      } catch (error: any) {
        logger.error(`[Gmail Download Attachment] Failed to process ${attachment.filename}:`, error)
        errors.push({
          filename: attachment.filename,
          error: error.message
        })

        // If filenameConflict is 'skip', just continue to next attachment
        if (filenameConflict === 'skip') {
          continue
        }
      }
    }

    // Return results
    const successCount = results.length
    const errorCount = errors.length
    const totalCount = attachmentsToDownload.length

    // Build detailed error message if there are failures
    const errorDetails = errors.map(e => `${e.filename}: ${e.error}`).join('; ')
    const resultMessage = successCount === totalCount
      ? `Successfully saved ${successCount} attachment(s) to ${getStorageServiceName(storageService)}`
      : successCount > 0
      ? `Saved ${successCount} of ${totalCount} attachment(s) to ${getStorageServiceName(storageService)}. ${errorCount} failed: ${errorDetails}`
      : `Failed to save all ${totalCount} attachment(s) to ${getStorageServiceName(storageService)}. Errors: ${errorDetails}`

    logger.info(`[Gmail Download Attachment] Complete: ${successCount}/${totalCount} successful`, {
      errors: errorCount > 0 ? errors : undefined
    })

    return {
      success: successCount > 0,
      output: {
        ...input,
        messageId,
        storageService,
        savedTo: getStorageServiceName(storageService),
        folderPath: folderId || 'root',
        attachmentsDownloaded: successCount,
        attachmentsFailed: errorCount,
        attachmentsTotal: totalCount,
        results,
        errors: errorCount > 0 ? errors : undefined,
        success: successCount > 0,
      },
      message: resultMessage,
    }

  } catch (error: any) {
    logger.error('[Gmail Download Attachment] Error:', error)
    return {
      success: false,
      message: `Failed to download attachments: ${error.message}`,
      error: error.message,
    }
  }
}

/**
 * Upload file to storage service
 */
async function uploadToStorage(params: {
  storageService: string
  userId: string
  filename: string
  mimeType: string
  base64Data: string
  folderId?: string
  filenameConflict: string
  size?: number
}): Promise<{ fileId: string; fileUrl: string }> {
  const { storageService, userId, filename, mimeType, base64Data, folderId, filenameConflict } = params

  // Import the appropriate storage action based on service
  switch (storageService) {
    case 'google_drive': {
      const { uploadGoogleDriveFile } = await import('../googleDrive/uploadFile')
      const result = await uploadGoogleDriveFile(
        {
          sourceType: 'node',
          fileFromNode: {
            data: base64Data,
            fileName: filename,
            mimeType: mimeType
          },
          fileName: filename,
          mimeType,
          folderId: folderId || 'root',
          description: 'Uploaded from Gmail attachment'
        },
        userId,
        {}
      )

      if (!result.success || !result.output) {
        throw new Error(result.message || 'Failed to upload to Google Drive')
      }

      // Extract file info from first uploaded file
      const uploadedFile = result.output.uploadedFiles?.[0]
      if (!uploadedFile) {
        throw new Error('No file information returned from upload')
      }

      return {
        fileId: uploadedFile.fileId,
        fileUrl: uploadedFile.webViewLink || uploadedFile.webContentLink || ''
      }
    }

    case 'onedrive': {
      // TODO: Implement OneDrive upload
      throw new Error('OneDrive upload not yet implemented')
    }

    case 'dropbox': {
      // TODO: Implement Dropbox upload
      throw new Error('Dropbox upload not yet implemented')
    }

    default:
      throw new Error(`Unknown storage service: ${storageService}`)
  }
}

/**
 * Get human-readable storage service name
 */
function getStorageServiceName(storageService: string): string {
  const names: Record<string, string> = {
    'google_drive': 'Google Drive',
    'onedrive': 'OneDrive',
    'dropbox': 'Dropbox'
  }
  return names[storageService] || storageService
}
