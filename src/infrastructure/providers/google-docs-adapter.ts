import { 
  DocumentProvider, 
  DocumentParams, 
  DocumentResult, 
  DocumentUpdate, 
  DocumentInfo, 
  DocumentFilters, 
  ExportFormat, 
  DocumentExport,
  SharePermissions,
  ShareResult 
} from '../../domains/integrations/ports/capability-interfaces'
import { CapabilityDescriptor, ErrorClassification } from '../../domains/integrations/ports/connector-contract'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'
import { google, docs_v1, drive_v3 } from 'googleapis'

import { logger } from '@/lib/utils/logger'

export class GoogleDocsAdapter implements DocumentProvider {
  readonly providerId = 'google-docs'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: false,
    rateLimits: [
      { type: 'requests', limit: 1000, window: 100000 }, // 1000 requests per 100 seconds
      { type: 'reads', limit: 300, window: 60000 }, // 300 read requests per minute
      { type: 'writes', limit: 300, window: 60000 } // 300 write requests per minute
    ],
    supportedFeatures: [
      'create_document',
      'update_document',
      'delete_document',
      'get_document',
      'get_documents',
      'share_document',
      'export_document',
      'insert_text',
      'replace_text',
      'format_text'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const docs = google.docs({ version: 'v1', auth: oauth2Client })
      
      // Try to create a test document to validate permissions
      const response = await docs.documents.create({
        requestBody: {
          title: 'Test Connection'
        }
      })
      
      // Clean up test document
      if (response.data.documentId) {
        const drive = google.drive({ version: 'v3', auth: oauth2Client })
        await drive.files.delete({ fileId: response.data.documentId })
      }
      
      return true
    } catch {
      return false
    }
  }

  async createDocument(params: DocumentParams, userId: string): Promise<DocumentResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const docs = google.docs({ version: 'v1', auth: oauth2Client })
      
      // Create document
      const createResponse = await docs.documents.create({
        requestBody: {
          title: params.title
        }
      })
      
      const documentId = createResponse.data.documentId
      if (!documentId) {
        throw new Error('Failed to create document - no document ID returned')
      }
      
      // Add initial content if provided
      if (params.content) {
        await docs.documents.batchUpdate({
          documentId: documentId,
          requestBody: {
            requests: [{
              insertText: {
                location: {
                  index: 1
                },
                text: params.content
              }
            }]
          }
        })
      }
      
      // Move to parent folder if specified
      if (params.parentId) {
        const drive = google.drive({ version: 'v3', auth: oauth2Client })
        await drive.files.update({
          fileId: documentId,
          addParents: params.parentId,
          removeParents: 'root'
        })
      }
      
      // Get document URL
      const drive = google.drive({ version: 'v3', auth: oauth2Client })
      const fileResponse = await drive.files.get({
        fileId: documentId,
        fields: 'webViewLink'
      })
      
      return {
        success: true,
        output: {
          documentId: documentId,
          title: params.title,
          url: fileResponse.data.webViewLink,
          editUrl: fileResponse.data.webViewLink,
          googleResponse: createResponse.data
        },
        message: 'Google Doc created successfully'
      }
    } catch (error: any) {
      logger.error('Google Docs create document error:', error)
      return {
        success: false,
        error: error.message || 'Failed to create Google Doc',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async updateDocument(documentId: string, updates: DocumentUpdate, userId: string): Promise<DocumentResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const docs = google.docs({ version: 'v1', auth: oauth2Client })
      
      const requests: any[] = []
      
      // Handle title update
      if (updates.title) {
        const drive = google.drive({ version: 'v3', auth: oauth2Client })
        await drive.files.update({
          fileId: documentId,
          requestBody: {
            name: updates.title
          }
        })
      }
      
      // Handle content updates
      if (updates.content) {
        // Replace all content
        const doc = await docs.documents.get({ documentId })
        const contentLength = doc.data.body?.content?.[0]?.endIndex || 1
        
        requests.push({
          deleteContentRange: {
            range: {
              startIndex: 1,
              endIndex: contentLength - 1
            }
          }
        })
        
        requests.push({
          insertText: {
            location: { index: 1 },
            text: updates.content
          }
        })
      } else if (updates.appendContent) {
        // Append content
        const doc = await docs.documents.get({ documentId })
        const contentLength = doc.data.body?.content?.[0]?.endIndex || 1
        
        requests.push({
          insertText: {
            location: { index: contentLength - 1 },
            text: `\n${ updates.appendContent}`
          }
        })
      } else if (updates.insertContent) {
        // Insert content at specific index
        requests.push({
          insertText: {
            location: { index: updates.insertContent.index },
            text: updates.insertContent.text
          }
        })
      } else if (updates.replaceContent) {
        // Replace specific text (simplified implementation)
        const doc = await docs.documents.get({ documentId })
        const content = this.extractTextFromDocument(doc.data)
        
        const searchIndex = content.indexOf(updates.replaceContent.searchText)
        if (searchIndex !== -1) {
          const endIndex = searchIndex + updates.replaceContent.searchText.length
          
          requests.push({
            deleteContentRange: {
              range: {
                startIndex: searchIndex + 1,
                endIndex: endIndex + 1
              }
            }
          })
          
          requests.push({
            insertText: {
              location: { index: searchIndex + 1 },
              text: updates.replaceContent.replaceText
            }
          })
        }
      }
      
      // Execute updates
      if (requests.length > 0) {
        await docs.documents.batchUpdate({
          documentId: documentId,
          requestBody: { requests }
        })
      }
      
      // Get updated document info
      const docInfo = await this.getDocument(documentId, userId)
      
      return {
        success: true,
        output: {
          documentId: documentId,
          title: docInfo.title,
          url: docInfo.url,
          editUrl: docInfo.editUrl
        },
        message: 'Google Doc updated successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to update Google Doc',
        output: { error: error.message }
      }
    }
  }

  async deleteDocument(documentId: string, userId: string): Promise<void> {
    const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    await drive.files.delete({ fileId: documentId })
  }

  async getDocument(documentId: string, userId: string): Promise<DocumentInfo> {
    const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    
    const docs = google.docs({ version: 'v1', auth: oauth2Client })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    
    // Get document content
    const docResponse = await docs.documents.get({ documentId })
    
    // Get file metadata
    const fileResponse = await drive.files.get({
      fileId: documentId,
      fields: 'name, createdTime, modifiedTime, webViewLink, size'
    })
    
    return {
      id: documentId,
      title: fileResponse.data.name || 'Untitled',
      content: this.extractTextFromDocument(docResponse.data),
      createdAt: new Date(fileResponse.data.createdTime || ''),
      modifiedAt: new Date(fileResponse.data.modifiedTime || ''),
      size: fileResponse.data.size ? parseInt(fileResponse.data.size) : undefined,
      url: fileResponse.data.webViewLink || '',
      editUrl: fileResponse.data.webViewLink || ''
    }
  }

  async getDocuments(filters?: DocumentFilters, userId?: string): Promise<DocumentInfo[]> {
    if (!userId) {
      throw new Error('User ID is required for getDocuments')
    }

    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const drive = google.drive({ version: 'v3', auth: oauth2Client })
      
      let query = "mimeType='application/vnd.google-apps.document' and trashed=false"
      
      if (filters?.parentId) {
        query += ` and '${filters.parentId}' in parents`
      }
      
      if (filters?.title) {
        query += ` and name contains '${filters.title}'`
      }
      
      const response = await drive.files.list({
        q: query,
        fields: 'files(id, name, createdTime, modifiedTime, webViewLink, size)',
        pageSize: filters?.limit || 100,
        orderBy: 'modifiedTime desc'
      })
      
      return response.data.files?.map((file: drive_v3.Schema$File) => ({
        id: file.id || '',
        title: file.name || 'Untitled',
        createdAt: new Date(file.createdTime || ''),
        modifiedAt: new Date(file.modifiedTime || ''),
        size: file.size ? parseInt(file.size) : undefined,
        url: file.webViewLink || '',
        editUrl: file.webViewLink || ''
      })) || []
    } catch (error: any) {
      logger.error('Google Docs get documents error:', error)
      return []
    }
  }

  async shareDocument(documentId: string, permissions: SharePermissions, userId: string): Promise<ShareResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const drive = google.drive({ version: 'v3', auth: oauth2Client })
      
      if (permissions.public) {
        // Make document public
        await drive.permissions.create({
          fileId: documentId,
          requestBody: {
            role: permissions.type === 'write' ? 'writer' : 'reader',
            type: 'anyone'
          }
        })
      }
      
      if (permissions.users && permissions.users.length > 0) {
        // Share with specific users
        for (const email of permissions.users) {
          await drive.permissions.create({
            fileId: documentId,
            requestBody: {
              role: permissions.type === 'write' ? 'writer' : permissions.type === 'admin' ? 'owner' : 'reader',
              type: 'user',
              emailAddress: email
            }
          })
        }
      }
      
      // Get shareable link
      const fileResponse = await drive.files.get({
        fileId: documentId,
        fields: 'webViewLink'
      })
      
      return {
        success: true,
        output: {
          shareUrl: fileResponse.data.webViewLink,
          permissions: permissions
        },
        message: 'Document shared successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to share document',
        output: { error: error.message }
      }
    }
  }

  async exportDocument(documentId: string, format: ExportFormat, userId: string): Promise<DocumentExport> {
    const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'html': 'text/html',
      'rtf': 'application/rtf',
      'odt': 'application/vnd.oasis.opendocument.text'
    }
    
    const mimeType = mimeTypes[format.type]
    if (!mimeType) {
      throw new Error(`Unsupported export format: ${format.type}`)
    }
    
    const response = await drive.files.export({
      fileId: documentId,
      mimeType: mimeType
    }, { responseType: 'arraybuffer' })
    
    // Get document name
    const fileInfo = await drive.files.get({
      fileId: documentId,
      fields: 'name'
    })
    
    const filename = `${fileInfo.data.name || 'document'}.${format.type}`
    
    return {
      content: Buffer.from(response.data as ArrayBuffer),
      mimeType: mimeType,
      filename: filename
    }
  }

  private extractTextFromDocument(document: docs_v1.Schema$Document): string {
    if (!document.body?.content) return ''
    
    let text = ''
    
    for (const element of document.body.content) {
      if (element.paragraph?.elements) {
        for (const paragraphElement of element.paragraph.elements) {
          if (paragraphElement.textRun?.content) {
            text += paragraphElement.textRun.content
          }
        }
      }
    }
    
    return text
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized') || message.includes('invalid credentials')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('insufficient permissions')) {
      return 'authorization'
    }
    if (message.includes('quota exceeded') || message.includes('rate limit')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found') || message.includes('document not found')) {
      return 'notFound'
    }
    if (message.includes('invalid') || message.includes('malformed')) {
      return 'validation'
    }
    
    return 'unknown'
  }
}