import { ActionResult } from '../core/executeWait'
import { resolveValue } from '../core/resolveValue'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { google } from 'googleapis'
import { FileStorageService } from "@/lib/storage/fileStorage"

/**
 * Export a Google Docs document to various formats and destinations
 */
export async function exportGoogleDocument(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { 
      documentId,
      exportFormat = 'pdf',
      fileName,
      destination = 'drive',
      driveFolder,
      emailTo,
      emailSubject = 'Exported Document',
      emailBody = 'Please find your exported document attached to this email.',
      webhookUrl,
      webhookHeaders
    } = resolvedConfig

    // Get access tokens
    const docsAccessToken = await getDecryptedAccessToken(userId, 'google-docs')
    
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: docsAccessToken })
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    const docs = google.docs({ version: 'v1', auth: oauth2Client })

    // Get document metadata first
    const docMetadata = await docs.documents.get({
      documentId: documentId
    })
    
    const docTitle = docMetadata.data.title || 'Untitled Document'
    const baseFileName = fileName || docTitle
    
    // Determine MIME type for export
    const mimeTypeMap: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
      html: 'text/html',
      rtf: 'application/rtf',
      epub: 'application/epub+zip',
      odt: 'application/vnd.oasis.opendocument.text'
    }
    
    const exportMimeType = mimeTypeMap[exportFormat] || 'application/pdf'
    const fileExtension = exportFormat
    const fullFileName = `${baseFileName}.${fileExtension}`

    // Export the document
    const exportResponse = await drive.files.export({
      fileId: documentId,
      mimeType: exportMimeType
    }, { responseType: 'arraybuffer' })
    
    const fileBuffer = Buffer.from(exportResponse.data as ArrayBuffer)
    const fileSize = fileBuffer.length

    let result: any = {
      fileName: fullFileName,
      fileSize,
      format: exportFormat,
      destination
    }

    // Handle different destinations
    switch (destination) {
      case 'drive':
        // Save to Google Drive
        const createFileResponse = await drive.files.create({
          requestBody: {
            name: fullFileName,
            mimeType: exportMimeType,
            parents: driveFolder ? [driveFolder] : undefined
          },
          media: {
            mimeType: exportMimeType,
            body: fileBuffer
          },
          fields: 'id,name,webViewLink,webContentLink'
        })
        
        result.fileId = createFileResponse.data.id
        result.fileUrl = createFileResponse.data.webViewLink || createFileResponse.data.webContentLink
        result.message = `Document exported to Google Drive as ${fullFileName}`
        break

      case 'email':
        // Send as email attachment
        if (!emailTo) {
          throw new Error('Email recipients are required for email destination')
        }

        // Get Gmail access token
        const gmailAccessToken = await getDecryptedAccessToken(userId, 'gmail')
        const gmailOAuth2Client = new google.auth.OAuth2()
        gmailOAuth2Client.setCredentials({ access_token: gmailAccessToken })
        const gmail = google.gmail({ version: 'v1', auth: gmailOAuth2Client })

        // Create email with attachment
        const boundary = `boundary_${Date.now()}`
        const emailParts = [
          `To: ${emailTo}`,
          `Subject: ${emailSubject}`,
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
          '',
          `--${boundary}`,
          'Content-Type: text/plain; charset=utf-8',
          '',
          emailBody,
          `--${boundary}`,
          `Content-Type: ${exportMimeType}`,
          'Content-Transfer-Encoding: base64',
          `Content-Disposition: attachment; filename="${fullFileName}"`,
          '',
          fileBuffer.toString('base64'),
          `--${boundary}--`
        ]

        const message = emailParts.join('\r\n')
        const encodedMessage = Buffer.from(message).toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '')

        const sendResult = await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage
          }
        })

        result.emailMessageId = sendResult.data.id
        result.emailTo = emailTo
        result.message = `Document emailed to ${emailTo} as ${fullFileName}`
        break

      case 'webhook':
        // Send to webhook
        if (!webhookUrl) {
          throw new Error('Webhook URL is required for webhook destination')
        }

        // Parse headers if provided
        let headers: Record<string, string> = {
          'Content-Type': exportMimeType
        }
        
        if (webhookHeaders) {
          try {
            const parsedHeaders = JSON.parse(webhookHeaders)
            headers = { ...headers, ...parsedHeaders }
          } catch (e) {
            console.warn('Failed to parse webhook headers:', e)
          }
        }

        // Send to webhook
        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: fileBuffer
        })

        if (!webhookResponse.ok) {
          throw new Error(`Webhook failed: ${webhookResponse.status} ${webhookResponse.statusText}`)
        }

        result.webhookStatus = webhookResponse.status
        result.webhookUrl = webhookUrl
        result.message = `Document sent to webhook: ${webhookUrl}`
        break

      case 'workflow':
        // Store in workflow storage for next step
        // Convert buffer to File object
        const blob = new Blob([fileBuffer], { type: exportMimeType })
        const file = new File([blob], fullFileName, { type: exportMimeType })
        
        const storedFile = await FileStorageService.storeFile(
          file,
          userId
        )

        result.fileId = storedFile.id
        result.storageId = storedFile.id
        result.fileUrl = storedFile.url
        result.message = `Document exported and stored for workflow use as ${fullFileName}`
        break

      default:
        throw new Error(`Unknown destination: ${destination}`)
    }

    return {
      success: true,
      output: result,
      message: result.message
    }

  } catch (error: any) {
    console.error('Export Google Document error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to export Google Document'
    }
  }
}