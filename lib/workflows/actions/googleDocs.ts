import { ActionResult } from './core/executeWait'
import { resolveValue } from './core/resolveValue'
import { getDecryptedAccessToken } from '../executeNode'
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
    const resolvedConfig = resolveValue(config, { input })
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
 * Export a Google Docs document
 */
export async function exportGoogleDocument(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { documentId, exportFormat = 'pdf' } = resolvedConfig

    const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
    
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Map format to MIME type
    const mimeTypeMap: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
      html: 'text/html',
      rtf: 'application/rtf',
      odt: 'application/vnd.oasis.opendocument.text',
      epub: 'application/epub+zip'
    }

    const mimeType = mimeTypeMap[exportFormat] || 'application/pdf'

    // Export the document
    const response = await drive.files.export({
      fileId: documentId,
      mimeType
    }, {
      responseType: 'arraybuffer'
    })

    // Convert to base64 for storage/transfer
    const base64Data = Buffer.from(response.data as ArrayBuffer).toString('base64')

    // Get document metadata
    const fileMetadata = await drive.files.get({
      fileId: documentId,
      fields: 'name'
    })

    return {
      success: true,
      output: {
        documentId,
        fileName: `${fileMetadata.data.name}.${exportFormat}`,
        format: exportFormat,
        mimeType,
        data: base64Data,
        size: (response.data as ArrayBuffer).byteLength
      },
      message: `Document exported as ${exportFormat.toUpperCase()}`
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