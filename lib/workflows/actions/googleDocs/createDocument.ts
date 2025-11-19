import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { google } from 'googleapis'

/**
 * Creates a new Google Document with customizable content and sharing options
 */
export async function createGoogleDocument(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'google-docs')

    // Get configuration values
    const title = resolveValue(config.title, input)
    const contentSource = resolveValue(config.contentSource, input) || 'manual'
    const content = resolveValue(config.content, input) || ''
    const uploadedFile = resolveValue(config.uploadedFile, input)
    const folderId = resolveValue(config.folderId, input)
    const enableSharing = resolveValue(config.enableSharing, input) || false
    const shareType = resolveValue(config.shareType, input) || 'specific_users'
    const emails = resolveValue(config.emails, input)
    const permission = resolveValue(config.permission, input) || 'viewer'
    const sendNotification = resolveValue(config.sendNotification, input) !== false
    const emailMessage = resolveValue(config.emailMessage, input)
    const allowDownload = resolveValue(config.allowDownload, input) !== false
    const expirationDate = resolveValue(config.expirationDate, input)

    if (!title) {
      return {
        success: false,
        message: 'Document title is required',
      }
    }

    logger.debug(`[Google Docs] Creating document: "${title}"`)

    // Setup OAuth2 client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })

    const docs = google.docs({ version: 'v1', auth: oauth2Client })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    let documentId: string
    let documentUrl: string

    // Step 1: Create the document based on content source
    if (contentSource === 'file_upload' && uploadedFile) {
      // Handle file upload - upload the file to Google Drive with the specified title
      logger.debug('[Google Docs] Uploading file to Google Drive')

      // uploadedFile should be an array with file object containing base64 data
      const fileArray = Array.isArray(uploadedFile) ? uploadedFile : [uploadedFile]
      if (!fileArray.length || !fileArray[0]) {
        return {
          success: false,
          message: 'No file uploaded',
        }
      }

      const file = fileArray[0]

      if (!file.url || typeof file.url !== 'string') {
        return {
          success: false,
          message: 'Invalid file data',
        }
      }

      // Remove data URL prefix if present (data:mime/type;base64,...)
      const base64Data = file.url.includes(',') ? file.url.split(',')[1] : file.url
      const fileBuffer = Buffer.from(base64Data, 'base64')

      logger.debug(`[Google Docs] Uploading ${file.name} (${file.size} bytes, ${file.type})`)

      // Upload file to Google Drive with the user-specified title
      const uploadResponse = await drive.files.create({
        requestBody: {
          name: title, // Use the user-specified title, not the original filename
          mimeType: file.type,
          parents: folderId ? [folderId] : undefined,
        },
        media: {
          mimeType: file.type,
          body: Buffer.from(fileBuffer),
        },
        fields: 'id, name, mimeType, webViewLink',
      })

      documentId = uploadResponse.data.id!
      documentUrl = uploadResponse.data.webViewLink || `https://drive.google.com/file/d/${documentId}/view`

      logger.debug(`[Google Docs] File uploaded successfully with ID: ${documentId}`)
    } else {
      // Create a new Google Docs document with manual content
      const createResponse = await docs.documents.create({
        requestBody: {
          title: title,
        },
      })

      documentId = createResponse.data.documentId!
      documentUrl = `https://docs.google.com/document/d/${documentId}/edit`

      logger.debug(`[Google Docs] Document created with ID: ${documentId}`)

      // Add content if provided
      if (content && content.trim()) {
        await docs.documents.batchUpdate({
          documentId: documentId,
          requestBody: {
            requests: [
              {
                insertText: {
                  location: {
                    index: 1, // Insert at the beginning of the document
                  },
                  text: content,
                },
              },
            ],
          },
        })
        logger.debug(`[Google Docs] Inserted ${content.length} characters of content`)
      }

      // Move to folder if specified (only needed for manual content, file upload handles this above)
      if (folderId) {
        await drive.files.update({
          fileId: documentId,
          addParents: folderId,
          fields: 'id, parents',
        })
        logger.debug(`[Google Docs] Moved document to folder: ${folderId}`)
      }
    }

    // Step 2: Handle sharing if enabled
    const sharedWith: string[] = []
    if (enableSharing) {
      logger.debug(`[Google Docs] Configuring sharing: ${shareType}`)

      if (shareType === 'anyone_with_link') {
        await drive.permissions.create({
          fileId: documentId,
          requestBody: {
            role: permission,
            type: 'anyone',
          },
        })
        logger.debug('[Google Docs] Document shared with anyone with the link')
      } else if (shareType === 'make_public') {
        await drive.permissions.create({
          fileId: documentId,
          requestBody: {
            role: 'reader',
            type: 'anyone',
          },
        })
        logger.debug('[Google Docs] Document made public')
      } else if (shareType === 'specific_users' && emails) {
        const emailList = Array.isArray(emails)
          ? emails
          : typeof emails === 'string'
            ? emails.split(',').map(e => e.trim())
            : []

        for (const email of emailList) {
          if (email) {
            const permissionRequest: any = {
              role: permission,
              type: 'user',
              emailAddress: email,
            }

            if (expirationDate) {
              permissionRequest.expirationTime = new Date(expirationDate).toISOString()
            }

            await drive.permissions.create({
              fileId: documentId,
              requestBody: permissionRequest,
              sendNotificationEmail: sendNotification,
              emailMessage: emailMessage || undefined,
            })

            sharedWith.push(email)
            logger.debug(`[Google Docs] Shared with ${email} as ${permission}`)
          }
        }
      }

      // Set download/print/copy restrictions
      if (!allowDownload) {
        await drive.files.update({
          fileId: documentId,
          requestBody: {
            copyRequiresWriterPermission: true,
          },
        })
        logger.debug('[Google Docs] Download/print/copy disabled')
      }
    }

    const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`

    logger.debug(`[Google Docs] Document created successfully: ${documentUrl}`)

    return {
      success: true,
      output: {
        ...input,
        documentId: documentId,
        documentUrl: documentUrl,
        title: title,
        createdAt: new Date().toISOString(),
        folderId: folderId || null,
        sharedWith: sharedWith,
        permissionLevel: enableSharing ? permission : null,
      },
      message: `Document "${title}" created successfully`,
    }
  } catch (error: any) {
    logger.error('[Google Docs] Error creating document:', error)
    return {
      success: false,
      message: `Failed to create document: ${error.message}`,
      error: error.message,
    }
  }
}
