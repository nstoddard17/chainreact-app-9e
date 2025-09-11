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
    // Resolve each config field individually to handle nested templates
    const resolvedConfig = {
      title: resolveValue(config.title, input),
      content: resolveValue(config.content, input),
      folderId: resolveValue(config.folderId, input),
      // Sharing options
      enableSharing: resolveValue(config.enableSharing, input),
      shareType: resolveValue(config.shareType, input),
      emails: resolveValue(config.emails, input),
      permission: resolveValue(config.permission, input),
      sendNotification: resolveValue(config.sendNotification, input),
      emailMessage: resolveValue(config.emailMessage, input),
      allowDownload: resolveValue(config.allowDownload, input),
      expirationDate: resolveValue(config.expirationDate, input)
    }
    
    const { title, content, folderId, enableSharing, shareType, emails, 
            permission, sendNotification, emailMessage, allowDownload, expirationDate } = resolvedConfig

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
    let shareResults = { success: true, errors: [] as string[], sharedWith: [] as string[] }

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

    // Handle sharing if enabled
    if (enableSharing && documentId) {
      try {
        // Determine the role based on permission level
        let role = 'reader'
        if (permission === 'editor') role = 'writer'
        else if (permission === 'commenter') role = 'commenter'
        
        if (shareType === 'specific_users' && emails) {
          // Share with specific users
          const emailList = emails.split(',').map((e: string) => e.trim()).filter(Boolean)
          
          if (emailList.length === 0) {
            console.log('No valid email addresses provided for sharing')
          } else {
            for (const email of emailList) {
              try {
                const permissionRequest: any = {
                  fileId: documentId,
                  requestBody: {
                    type: 'user',
                    role: role,
                    emailAddress: email
                  }
                }
                
                // Only add notification settings for specific users
                if (sendNotification !== false) {
                  permissionRequest.sendNotificationEmail = true
                  if (emailMessage) {
                    permissionRequest.emailMessage = emailMessage
                  }
                } else {
                  permissionRequest.sendNotificationEmail = false
                }
                
                await drive.permissions.create(permissionRequest)
                shareResults.sharedWith.push(email)
                console.log(`Successfully shared with ${email}`)
              } catch (error: any) {
                console.error(`Failed to share with ${email}:`, error)
                shareResults.errors.push(`Failed to share with ${email}: ${error.message}`)
                shareResults.success = false
              }
            }
          }
        } else if (shareType === 'anyone_with_link') {
          // Share with anyone with link (no expiration date for this option)
          try {
            await drive.permissions.create({
              fileId: documentId,
              requestBody: {
                type: 'anyone',
                role: role,
                allowFileDiscovery: false
              }
            })
            shareResults.sharedWith.push('anyone with link')
            console.log('Successfully shared with anyone with link')
          } catch (error: any) {
            console.error('Failed to share with anyone with link:', error)
            shareResults.errors.push(`Failed to share with anyone with link: ${error.message}`)
            shareResults.success = false
          }
        } else if (shareType === 'make_public') {
          // Make document public
          try {
            await drive.permissions.create({
              fileId: documentId,
              requestBody: {
                type: 'anyone',
                role: role,
                allowFileDiscovery: true
              }
            })
            shareResults.sharedWith.push('public')
            console.log('Successfully made document public')
          } catch (error: any) {
            console.error('Failed to make document public:', error)
            shareResults.errors.push(`Failed to make document public: ${error.message}`)
            shareResults.success = false
          }
        }

        // Handle download/print/copy restrictions
        if (allowDownload === false) {
          try {
            await drive.files.update({
              fileId: documentId,
              requestBody: {
                copyRequiresWriterPermission: true,
                viewersCanCopyContent: false
              }
            })
            console.log('Successfully set download/print/copy restrictions')
          } catch (error: any) {
            console.error('Failed to set download restrictions:', error)
            shareResults.errors.push(`Failed to set download restrictions: ${error.message}`)
          }
        }

        // Handle expiration date if provided and not "anyone with link"
        if (expirationDate && shareType !== 'anyone_with_link') {
          // Note: Expiration dates require Google Workspace and specific API setup
          // For now, we'll log this as a limitation
          console.log('Note: Expiration dates require Google Workspace Enterprise features')
          // We could potentially store the expiration date in metadata for manual handling
        }
      } catch (shareError: any) {
        console.error('Unexpected sharing error:', shareError)
        shareResults.errors.push(`Unexpected sharing error: ${shareError.message}`)
        shareResults.success = false
      }
    }

    // Build success message with sharing status
    let message = `Document "${title}" created successfully`
    if (enableSharing) {
      if (shareResults.sharedWith.length > 0) {
        message += `. Shared with: ${shareResults.sharedWith.join(', ')}`
      }
      if (shareResults.errors.length > 0) {
        message += `. Sharing errors: ${shareResults.errors.join('; ')}`
      }
    }

    return {
      success: true,
      output: {
        documentId,
        title: createResponse.data.title,
        revisionId: createResponse.data.revisionId,
        documentUrl: `https://docs.google.com/document/d/${documentId}/edit`,
        sharingStatus: shareResults
      },
      message
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
    // Resolve each config field individually
    const documentId = resolveValue(config.documentId, input)
    const insertLocation = resolveValue(config.insertLocation, input) || 'end'
    const searchText = resolveValue(config.searchText, input)
    const content = resolveValue(config.content, input)

    console.log('Google Docs Update - Resolved config:', {
      documentId,
      insertLocation,
      searchText,
      content: content?.substring(0, 50) + '...'
    })

    const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
    
    // Initialize Google APIs
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    
    const docs = google.docs({ version: 'v1', auth: oauth2Client })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Get current document to find its length and content
    const doc = await docs.documents.get({ documentId })
    const documentLength = doc.data.body?.content?.reduce((len, element) => {
      if (element.endIndex) {
        return Math.max(len, element.endIndex)
      }
      return len
    }, 1) || 1

    let requests: any[] = []

    // Handle different insert locations
    switch (insertLocation) {
      case 'end':
        // Append at the end of document
        requests.push({
          insertText: {
            location: { index: documentLength - 1 },
            text: '\n' + content
          }
        })
        break
        
      case 'beginning':
        // Insert at the beginning (after title)
        requests.push({
          insertText: {
            location: { index: 1 },
            text: content + '\n'
          }
        })
        break
        
      case 'replace':
        // Replace all content
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

      case 'after_text':
        // Find text and insert after it
        if (!searchText) {
          throw new Error('Search text is required when inserting after specific text')
        }
        
        // Extract document text to find the search text
        let fullText = ''
        let textMap: Array<{start: number, end: number, text: string}> = []
        
        if (doc.data.body?.content) {
          doc.data.body.content.forEach((element) => {
            if (element.paragraph?.elements) {
              element.paragraph.elements.forEach((elem) => {
                if (elem.textRun?.content && elem.startIndex && elem.endIndex) {
                  fullText += elem.textRun.content
                  textMap.push({
                    start: elem.startIndex,
                    end: elem.endIndex,
                    text: elem.textRun.content
                  })
                }
              })
            }
          })
        }
        
        // Convert search text with wildcards to regex
        const searchPattern = searchText
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars except *
          .replace(/\\\*/g, '.*') // Convert * to regex wildcard
        
        const regex = new RegExp(searchPattern, 'i')
        const match = fullText.match(regex)
        
        if (!match || match.index === undefined) {
          throw new Error(`Text "${searchText}" not found in document`)
        }
        
        // Find the document index for the end of the match
        let documentIndex = 1
        let accumulatedLength = 0
        for (const segment of textMap) {
          if (accumulatedLength + segment.text.length > match.index + match[0].length) {
            documentIndex = segment.start + (match.index + match[0].length - accumulatedLength)
            break
          }
          accumulatedLength += segment.text.length
        }
        
        requests.push({
          insertText: {
            location: { index: documentIndex },
            text: ' ' + content
          }
        })
        break

      case 'before_text':
        // Find text and insert before it
        if (!searchText) {
          throw new Error('Search text is required when inserting before specific text')
        }
        
        // Extract document text to find the search text
        let fullTextBefore = ''
        let textMapBefore: Array<{start: number, end: number, text: string}> = []
        
        if (doc.data.body?.content) {
          doc.data.body.content.forEach((element) => {
            if (element.paragraph?.elements) {
              element.paragraph.elements.forEach((elem) => {
                if (elem.textRun?.content && elem.startIndex && elem.endIndex) {
                  fullTextBefore += elem.textRun.content
                  textMapBefore.push({
                    start: elem.startIndex,
                    end: elem.endIndex,
                    text: elem.textRun.content
                  })
                }
              })
            }
          })
        }
        
        // Convert search text with wildcards to regex
        const searchPatternBefore = searchText
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars except *
          .replace(/\\\*/g, '.*') // Convert * to regex wildcard
        
        const regexBefore = new RegExp(searchPatternBefore, 'i')
        const matchBefore = fullTextBefore.match(regexBefore)
        
        if (!matchBefore || matchBefore.index === undefined) {
          throw new Error(`Text "${searchText}" not found in document`)
        }
        
        // Find the document index for the start of the match
        let documentIndexBefore = 1
        let accumulatedLengthBefore = 0
        for (const segment of textMapBefore) {
          if (accumulatedLengthBefore + segment.text.length > matchBefore.index) {
            documentIndexBefore = segment.start + (matchBefore.index - accumulatedLengthBefore)
            break
          }
          accumulatedLengthBefore += segment.text.length
        }
        
        requests.push({
          insertText: {
            location: { index: documentIndexBefore },
            text: content + ' '
          }
        })
        break

      default:
        throw new Error(`Unknown insert location: ${insertLocation}`)
    }

    // Apply the updates
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests }
    })

    // Get updated document info
    const updatedDoc = await docs.documents.get({ documentId })

    // Build success message
    let successMessage = `Document updated successfully (inserted ${insertLocation === 'end' ? 'at end' : insertLocation === 'beginning' ? 'at beginning' : insertLocation === 'replace' ? 'replacing all content' : insertLocation === 'after_text' ? 'after text' : 'before text'})`

    return {
      success: true,
      output: {
        documentId,
        title: updatedDoc.data.title,
        revisionId: updatedDoc.data.revisionId,
        insertLocation,
        documentUrl: `https://docs.google.com/document/d/${documentId}/edit`
      },
      message: successMessage
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