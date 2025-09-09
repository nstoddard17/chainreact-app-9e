import { ActionResult } from './core/executeWait'
import { resolveValue } from './core/resolveValue'
import { getDecryptedAccessToken } from './core/getDecryptedAccessToken'
import { google } from 'googleapis'

/**
 * Create a new Google Docs document
 */
export async function createGoogleDocument(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    console.log('📝 createGoogleDocument - Config:', JSON.stringify(config, null, 2))
    console.log('📝 createGoogleDocument - Input keys:', Object.keys(input))
    
    // Debug: Log the full input structure to understand what data is available
    console.log('📝 createGoogleDocument - Full Input:', {
      hasEmails: !!input.emails,
      hasMessages: !!input.messages,
      emailCount: input.emails?.length || 0,
      messageCount: input.messages?.length || 0,
      firstEmail: input.emails?.[0] ? {
        from: input.emails[0].from,
        to: input.emails[0].to,
        subject: input.emails[0].subject,
        bodyLength: input.emails[0].body?.length || 0,
        snippetLength: input.emails[0].snippet?.length || 0
      } : null,
      firstMessage: input.messages?.[0] ? {
        from: input.messages[0].from,
        subject: input.messages[0].subject,
        hasBody: !!input.messages[0].body
      } : null
    })
    
    // Resolve each config field individually to handle nested templates
    console.log('📝 [DEBUG] About to resolve config.content:', config.content)
    console.log('📝 [DEBUG] Input has emails?', !!input.emails, 'count:', input.emails?.length)
    console.log('📝 [DEBUG] Input has messages?', !!input.messages, 'count:', input.messages?.length)
    
    const resolvedConfig = {
      title: resolveValue(config.title, input),
      content: resolveValue(config.content, input),
      folderId: resolveValue(config.folderId, input)
    }
    console.log('📝 createGoogleDocument - Resolved Config:', JSON.stringify(resolvedConfig, null, 2))
    
    const { title, content, folderId } = resolvedConfig

    const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
    
    // Initialize Google Docs API
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    
    const docs = google.docs({ version: 'v1', auth: oauth2Client })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Create the document
    const createResponse = await docs.documents.create({
      requestBody: {
        title: title || 'Untitled Document'
      }
    })

    const documentId = createResponse.data.documentId

    // Add content if provided
    if (content) {
      const requests = [{
        insertText: {
          location: { index: 1 },
          text: content
        }
      }]

      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests }
      })
    }

    // Move to folder if specified
    if (folderId) {
      await drive.files.update({
        fileId: documentId!,
        addParents: folderId,
        fields: 'id, parents'
      })
    }

    return {
      success: true,
      output: {
        documentId,
        title: createResponse.data.title,
        revisionId: createResponse.data.revisionId,
        documentUrl: `https://docs.google.com/document/d/${documentId}/edit`
      },
      message: `Document "${title}" created successfully`
    }
  } catch (error: any) {
    console.error('Create Google Document error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create Google Document'
    }
  }
}

/**
 * Update an existing Google Docs document
 */
export async function updateGoogleDocument(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { 
      documentId, 
      operation = 'append',
      content,
      editMode = 'direct',
      versionComment
    } = resolvedConfig

    const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
    
    // Initialize Google APIs
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    
    const docs = google.docs({ version: 'v1', auth: oauth2Client })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Get current document to find its length
    const doc = await docs.documents.get({ documentId })
    const documentLength = doc.data.body?.content?.reduce((len, element) => {
      if (element.endIndex) {
        return Math.max(len, element.endIndex)
      }
      return len
    }, 1) || 1

    let requests: any[] = []

    // Handle different operation types
    switch (operation) {
      case 'append':
        requests.push({
          insertText: {
            location: { index: documentLength - 1 },
            text: '\n' + content
          }
        })
        break
        
      case 'insert':
        requests.push({
          insertText: {
            location: { index: 1 },
            text: content + '\n'
          }
        })
        break
        
      case 'replace':
        // Delete all content except the last newline
        if (documentLength > 1) {
          requests.push({
            deleteContentRange: {
              range: {
                startIndex: 1,
                endIndex: documentLength - 1
              }
            }
          })
        }
        // Insert new content
        requests.push({
          insertText: {
            location: { index: 1 },
            text: content
          }
        })
        break
    }

    // Apply edits based on edit mode
    if (editMode === 'suggestion') {
      // Wrap requests in suggestion mode
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests,
          writeControl: {
            requiredRevisionId: doc.data.revisionId
          }
        },
        // Enable suggestion mode
        suggestionsViewMode: 'SUGGESTIONS_INLINE'
      } as any)
    } else {
      // Direct edit mode
      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests }
      })
    }

    // Add version comment if provided (using Drive API to update description)
    if (versionComment) {
      try {
        // Get current file metadata
        const fileMetadata = await drive.files.get({
          fileId: documentId,
          fields: 'description'
        })
        
        // Append version comment to description with timestamp
        const timestamp = new Date().toISOString()
        const currentDescription = fileMetadata.data.description || ''
        const newDescription = currentDescription 
          ? `${currentDescription}\n\n[${timestamp}] ${versionComment}`
          : `[${timestamp}] ${versionComment}`
        
        // Update file with new description
        await drive.files.update({
          fileId: documentId,
          requestBody: {
            description: newDescription.slice(0, 1000) // Limit to 1000 chars
          }
        })
      } catch (commentError) {
        console.warn('Failed to add version comment:', commentError)
        // Don't fail the entire operation if comment fails
      }
    }

    // Get updated document info
    const updatedDoc = await docs.documents.get({ documentId })

    return {
      success: true,
      output: {
        documentId,
        title: updatedDoc.data.title,
        revisionId: updatedDoc.data.revisionId,
        operation,
        editMode,
        documentUrl: `https://docs.google.com/document/d/${documentId}/edit`
      },
      message: `Document updated successfully (${operation} mode: ${editMode})`
    }
  } catch (error: any) {
    console.error('Update Google Document error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to update Google Document'
    }
  }
}

/**
 * Share a Google Docs document with enhanced features
 */
export async function shareGoogleDocument(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { 
      documentId, 
      shareWith, 
      permission = 'reader', 
      sendNotification = true,
      message,
      makePublic = false,
      publicPermission = 'reader',
      allowDiscovery = false,
      transferOwnership = false
    } = resolvedConfig

    const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
    
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const sharedEmails: string[] = []
    const permissionIds: string[] = []
    const errors: string[] = []

    // Share with specific users if provided
    if (shareWith) {
      // Parse comma-separated emails
      const emails = shareWith.split(',').map((e: string) => e.trim()).filter(Boolean)
      
      for (const email of emails) {
        try {
          // Handle ownership transfer specially
          if (permission === 'owner' && transferOwnership) {
            // Transfer ownership requires special handling
            const permission = await drive.permissions.create({
              fileId: documentId,
              requestBody: {
                type: 'user',
                role: 'owner',
                emailAddress: email
              },
              sendNotificationEmail: sendNotification,
              emailMessage: message,
              transferOwnership: true
            })
            
            sharedEmails.push(email)
            permissionIds.push(permission.data.id || '')
            console.log(`Ownership transferred to ${email}`)
          } else {
            // Regular permission sharing
            const actualRole = permission === 'owner' ? 'writer' : permission // Can't share as owner without transfer
            
            const permissionResult = await drive.permissions.create({
              fileId: documentId,
              requestBody: {
                type: 'user',
                role: actualRole,
                emailAddress: email
              },
              sendNotificationEmail: sendNotification,
              emailMessage: message
            })
            
            sharedEmails.push(email)
            permissionIds.push(permissionResult.data.id || '')
          }
        } catch (error: any) {
          console.error(`Failed to share with ${email}:`, error)
          errors.push(`${email}: ${error.message}`)
        }
      }
    }

    // Make document public if requested
    if (makePublic) {
      try {
        // Create public permission
        const publicRole = publicPermission === 'writer' ? 'writer' : publicPermission
        
        const publicPermissionResult = await drive.permissions.create({
          fileId: documentId,
          requestBody: {
            type: 'anyone',
            role: publicRole,
            allowFileDiscovery: allowDiscovery
          }
        })
        
        permissionIds.push(publicPermissionResult.data.id || '')
        
        console.log(`Document made public with ${publicRole} permission`)
      } catch (error: any) {
        console.error('Failed to make document public:', error)
        errors.push(`Public sharing: ${error.message}`)
      }
    }

    // Get updated document metadata
    const fileResponse = await drive.files.get({
      fileId: documentId,
      fields: 'id,name,webViewLink,permissions'
    })

    const result: any = {
      documentId,
      documentName: fileResponse.data.name,
      documentUrl: fileResponse.data.webViewLink || `https://docs.google.com/document/d/${documentId}/edit`,
      permissionIds,
      sharedWith: sharedEmails,
      isPublic: makePublic,
      publicPermission: makePublic ? publicPermission : null,
      allowsDiscovery: makePublic ? allowDiscovery : false,
      totalPermissions: fileResponse.data.permissions?.length || 0
    }

    if (errors.length > 0) {
      result.errors = errors
    }

    // Determine success message
    let successMessage = 'Document sharing updated successfully'
    if (sharedEmails.length > 0) {
      successMessage = `Document shared with ${sharedEmails.length} user(s)`
    }
    if (makePublic) {
      successMessage += ' and made public'
    }
    if (transferOwnership && permission === 'owner' && sharedEmails.length > 0) {
      successMessage = `Document ownership transferred to ${sharedEmails[0]}`
    }

    return {
      success: true,
      output: result,
      message: successMessage
    }
  } catch (error: any) {
    console.error('Share Google Document error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to share Google Document'
    }
  }
}

/**
 * Get a Google Docs document content
 */
export async function getGoogleDocument(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { documentId } = resolvedConfig

    const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
    
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    
    const docs = google.docs({ version: 'v1', auth: oauth2Client })

    // Get document content
    const doc = await docs.documents.get({ documentId })
    
    // Extract text content
    let textContent = ""
    if (doc.data.body?.content) {
      doc.data.body.content.forEach((element) => {
        if (element.paragraph?.elements) {
          element.paragraph.elements.forEach((elem) => {
            if (elem.textRun?.content) {
              textContent += elem.textRun.content
            }
          })
        }
      })
    }

    return {
      success: true,
      output: {
        documentId,
        title: doc.data.title,
        content: textContent,
        revisionId: doc.data.revisionId,
        documentUrl: `https://docs.google.com/document/d/${documentId}/edit`
      },
      message: `Document "${doc.data.title}" retrieved successfully`
    }
  } catch (error: any) {
    console.error('Get Google Document error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to get Google Document'
    }
  }
}

/**
 * Export a Google Docs document with multiple destination options
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

    const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
    
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    const docs = google.docs({ version: 'v1', auth: oauth2Client })

    // Get document metadata
    const docMetadata = await docs.documents.get({
      documentId: documentId
    })
    
    const docTitle = docMetadata.data.title || 'Untitled Document'
    const baseFileName = fileName || docTitle
    
    // Map format to MIME type
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
    const fullFileName = `${baseFileName}.${exportFormat}`

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

        // Try to get Gmail access token
        let gmailAccessToken
        try {
          gmailAccessToken = await getDecryptedAccessToken(userId, 'gmail')
        } catch (error) {
          // If no Gmail integration, could fall back to using sendmail or other service
          throw new Error('Gmail integration required to send email attachments')
        }

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
          'Content-Type': exportMimeType,
          'X-Document-Name': fullFileName,
          'X-Document-Id': documentId
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
        // Return as base64 for next workflow step
        result.data = fileBuffer.toString('base64')
        result.mimeType = exportMimeType
        result.message = `Document exported for workflow use as ${fullFileName}`
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