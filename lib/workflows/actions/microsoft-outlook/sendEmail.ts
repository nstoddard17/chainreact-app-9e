import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { FileStorageService } from "@/lib/storage/fileStorage"
import { deleteWorkflowTempFiles } from '@/lib/utils/workflowFileCleanup'

import { logger } from '@/lib/utils/logger'

/**
 * Microsoft Outlook send email handler with attachment support
 */
export async function sendOutlookEmail(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  const cleanupPaths = new Set<string>()

  try {
    // Resolve config values if they contain template variables
    const needsResolution = typeof config === 'object' &&
      Object.values(config).some(v =>
        typeof v === 'string' && v.includes('{{') && v.includes('}}')
      )

    const resolvedConfig = needsResolution ? resolveValue(config, { input }) : config
    const {
      to,
      cc,
      bcc,
      subject,
      body,
      importance = 'normal',
      isHtml = false,
      attachments,
      sourceType,
      uploadedFiles,
      fileUrl,
      fileFromNode
    } = resolvedConfig

    // Get the decrypted access token for Microsoft Outlook
    const accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    // Prepare email data for Microsoft Graph API
    const emailData: any = {
      message: {
        subject: subject || '',
        body: {
          contentType: isHtml ? 'HTML' : 'Text',
          content: body || ''
        },
        toRecipients: [],
        ccRecipients: [],
        bccRecipients: [],
        importance: importance.toLowerCase(),
        attachments: [] // Will be populated if there are attachments
      }
    }

    // Process recipients - handle both string and array formats
    const processRecipients = (recipients: string | string[] | undefined) => {
      if (!recipients) return []

      const recipientList = Array.isArray(recipients) ? recipients : [recipients]
      return recipientList.filter(Boolean).map(email => ({
        emailAddress: {
          address: email.trim()
        }
      }))
    }

    emailData.message.toRecipients = processRecipients(to)
    emailData.message.ccRecipients = processRecipients(cc)
    emailData.message.bccRecipients = processRecipients(bcc)

    // Validate that we have at least one recipient
    if (emailData.message.toRecipients.length === 0 &&
        emailData.message.ccRecipients.length === 0 &&
        emailData.message.bccRecipients.length === 0) {
      throw new Error('At least one recipient (to, cc, or bcc) is required')
    }

    // Handle attachments (following Gmail's comprehensive approach)
    let attachmentList: any[] = []

    // Determine attachment source based on sourceType or legacy attachments field
    // Check both uploadedFiles and attachments field (for compatibility)
    if (sourceType === 'file' && (uploadedFiles || attachments)) {
      const fileData = uploadedFiles || attachments

      if (typeof fileData === 'string') {
        // It's a file ID from storage
        attachmentList = [fileData]
      } else if (Array.isArray(fileData)) {
        // It's an array of uploaded files
        attachmentList = fileData
      } else if (fileData && typeof fileData === 'object') {
        // It's a single file object - check if it has content directly
        if (fileData.content && fileData.fileName) {
          // The file already has base64 content, use it directly
          attachmentList = [fileData]
        } else {
          attachmentList = [fileData]
        }
      }
    } else if (sourceType === 'url' && fileUrl) {
      // Handle file from URL
      attachmentList = [{ url: fileUrl }]
    } else if (sourceType === 'node' && fileFromNode) {
      // Handle file from previous node (variable reference)
      if (fileFromNode && typeof fileFromNode === 'object') {
        // Check for various file structures from other nodes
        if (fileFromNode.file && fileFromNode.file.content) {
          attachmentList = [fileFromNode.file]
        } else if (fileFromNode.content) {
          attachmentList = [fileFromNode]
        } else if (fileFromNode.uploadedFiles && Array.isArray(fileFromNode.uploadedFiles)) {
          attachmentList = fileFromNode.uploadedFiles
        } else if (fileFromNode.fileId || fileFromNode.id) {
          attachmentList = [fileFromNode]
        } else if (Array.isArray(fileFromNode)) {
          attachmentList = fileFromNode
        } else {
          attachmentList = [fileFromNode]
        }
      } else if (typeof fileFromNode === 'string') {
        attachmentList = [fileFromNode]
      } else if (Array.isArray(fileFromNode)) {
        attachmentList = fileFromNode
      }
    } else if (uploadedFiles && sourceType === 'file') {
      // Handle uploaded files from attachment upload
      attachmentList = Array.isArray(uploadedFiles) ? uploadedFiles : [uploadedFiles]
    } else if (attachments) {
      // Legacy support for existing workflows using attachments field
      attachmentList = Array.isArray(attachments) ? attachments : [attachments]
    }

    // Process attachments for Microsoft Graph API
    const outlookAttachments: any[] = []
    const fileService = new FileStorageService()

    for (const attachment of attachmentList) {
      try {
        let fileData: any = null

        // Track temporary file paths for cleanup
        if (
          attachment &&
          typeof attachment === 'object' &&
          attachment.isTemporary &&
          typeof attachment.filePath === 'string'
        ) {
          cleanupPaths.add(attachment.filePath)
        }

        // Check if it's an uploaded file object with id (from file upload field)
        if (attachment && typeof attachment === 'object' && attachment.id) {
          try {
            const storedFile = await FileStorageService.getFile(attachment.id, userId)
            if (storedFile) {
              const arrayBuffer = await storedFile.file.arrayBuffer()
              const base64Content = Buffer.from(arrayBuffer).toString('base64')

              fileData = {
                data: base64Content,
                fileName: attachment.fileName || storedFile.fileName || 'attachment',
                mimeType: attachment.fileType || storedFile.fileType || 'application/octet-stream'
              }
            }
          } catch (error) {
            logger.error('📎 [Outlook] Error fetching file from storage:', error)
          }
        } else if (attachment && typeof attachment === 'object' && attachment.content && attachment.fileName) {
          // File with inline content
          fileData = {
            data: attachment.content, // Already base64 encoded
            fileName: attachment.fileName || attachment.name || 'attachment',
            mimeType: attachment.mimeType || attachment.fileType || attachment.type || 'application/octet-stream'
          }
        } else if (attachment && typeof attachment === 'object' && attachment.url) {
          // File from URL
          try {
            const filePath = await fileService.downloadTempFile(attachment.url)
            if (filePath) {
              cleanupPaths.add(filePath)
              const fs = await import('fs')
              const path = await import('path')
              const fileContent = await fs.promises.readFile(filePath)
              const base64Content = fileContent.toString('base64')
              const fileName = path.basename(attachment.url) || 'attachment'

              fileData = {
                data: base64Content,
                fileName: fileName,
                mimeType: 'application/octet-stream'
              }
            }
          } catch (error) {
            logger.error(`Failed to download file from URL: ${error}`)
          }
        } else if (attachment && typeof attachment === 'object' && attachment.name && attachment.filePath) {
          // File uploaded to storage but content not included inline
          try {
            const { createClient } = await import('@supabase/supabase-js')
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
            const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
            const supabase = createClient(supabaseUrl, supabaseServiceKey)

            const { data: storageFile, error } = await supabase.storage
              .from('workflow-files')
              .download(attachment.filePath)

            if (error) {
              logger.error('📎 [Outlook] Error downloading file from storage:', error)
              continue
            }

            if (storageFile) {
              const arrayBuffer = await storageFile.arrayBuffer()
              const base64Content = Buffer.from(arrayBuffer).toString('base64')

              fileData = {
                data: base64Content,
                fileName: attachment.fileName || attachment.name || 'attachment',
                mimeType: attachment.mimeType || attachment.fileType || attachment.type || 'application/octet-stream'
              }
            }
          } catch (error) {
            logger.error('📎 [Outlook] Error fetching file from storage:', error)
            continue
          }
        } else if (attachment && typeof attachment === 'object' && attachment.content) {
          // Direct file object with content
          fileData = {
            data: attachment.content, // Already base64 encoded
            fileName: attachment.filename || attachment.fileName || attachment.name || 'attachment',
            mimeType: attachment.mimeType || attachment.type || 'application/octet-stream'
          }
        } else if (attachment && typeof attachment === 'object' && attachment.file && attachment.file.content) {
          // Nested file object
          fileData = {
            data: attachment.file.content,
            fileName: attachment.file.filename || attachment.file.fileName || attachment.file.name || attachment.fileName || 'attachment',
            mimeType: attachment.file.mimeType || attachment.file.type || 'application/octet-stream'
          }
        } else if (typeof attachment === 'string') {
          // File ID from FileStorageService
          try {
            const storedFile = await FileStorageService.getFile(attachment, userId)
            if (storedFile) {
              const arrayBuffer = await storedFile.file.arrayBuffer()
              const base64Content = Buffer.from(arrayBuffer).toString('base64')

              fileData = {
                data: base64Content,
                fileName: storedFile.fileName || 'attachment',
                mimeType: storedFile.fileType || 'application/octet-stream'
              }
            }
          } catch (error) {
            logger.error('📎 [Outlook] Error fetching file by ID:', error)
          }
        }

        // Add to Outlook attachments if we have file data
        if (fileData) {
          outlookAttachments.push({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: fileData.fileName,
            contentBytes: fileData.data,
            contentType: fileData.mimeType
          })
        }
      } catch (error) {
        logger.error(`Failed to attach file:`, error)
      }
    }

    // Add attachments to email if any
    if (outlookAttachments.length > 0) {
      emailData.message.attachments = outlookAttachments
    }

    // Send the email using Microsoft Graph API
    const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to send email: ${response.statusText}`

      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to send email: ${errorJson.error.message}`
        }
      } catch {
        // If error text is not JSON, use the default message
      }

      throw new Error(errorMessage)
    }

    // Clean up temporary files
    if (cleanupPaths.size > 0) {
      await deleteWorkflowTempFiles(Array.from(cleanupPaths))
    }

    return {
      success: true,
      output: {
        sent: true,
        recipients: {
          to: emailData.message.toRecipients.map((r: any) => r.emailAddress.address),
          cc: emailData.message.ccRecipients.map((r: any) => r.emailAddress.address),
          bcc: emailData.message.bccRecipients.map((r: any) => r.emailAddress.address)
        },
        subject: subject,
        timestamp: new Date().toISOString(),
        attachmentCount: outlookAttachments.length
      }
    }
  } catch (error: any) {
    logger.error('❌ [Outlook] Error sending email:', error)

    // Clean up temporary files on error
    if (cleanupPaths.size > 0) {
      await deleteWorkflowTempFiles(Array.from(cleanupPaths))
    }

    // Check if it's a token error
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      throw new Error('Microsoft Outlook authentication failed. Please reconnect your account.')
    }

    throw error
  }
}