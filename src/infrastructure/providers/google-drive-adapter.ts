import { 
  FileProvider, 
  FileUpload, 
  FileResult, 
  FileContent, 
  FileInfo, 
  FileFilters, 
  FolderConfig, 
  FolderResult, 
  SharePermissions, 
  ShareResult 
} from '../../domains/integrations/ports/capability-interfaces'
import { CapabilityDescriptor, ErrorClassification } from '../../domains/integrations/ports/connector-contract'
import { getGoogleDriveFiles } from '../../../lib/integrations/google-drive'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'
import { google, drive_v3 } from 'googleapis'

export class GoogleDriveAdapter implements FileProvider {
  readonly providerId = 'google-drive'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 1000, window: 100000 }, // 1000 requests per 100 seconds
      { type: 'uploads', limit: 750, window: 100000 }    // 750 uploads per 100 seconds
    ],
    supportedFeatures: [
      'upload_file',
      'download_file',
      'delete_file',
      'list_files',
      'create_folder',
      'share_file',
      'search_files',
      'move_files',
      'copy_files'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-drive')
      const files = await getGoogleDriveFiles(accessToken)
      return Array.isArray(files)
    } catch {
      return false
    }
  }

  async uploadFile(params: FileUpload, userId: string): Promise<FileResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-drive')
      
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const drive = google.drive({ version: 'v3', auth: oauth2Client })
      
      const fileMetadata: any = {
        name: params.filename
      }
      
      if (params.folderId) {
        fileMetadata.parents = [params.folderId]
      }
      
      const media = {
        body: Buffer.from(params.content),
        mimeType: this.getMimeType(params.filename)
      }
      
      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink, webContentLink, size'
      })
      
      return {
        success: true,
        output: {
          fileId: response.data.id,
          filename: response.data.name,
          url: response.data.webViewLink,
          downloadUrl: response.data.webContentLink,
          size: response.data.size ? parseInt(response.data.size) : undefined,
          googleResponse: response.data
        },
        message: 'File uploaded successfully to Google Drive'
      }
    } catch (error: any) {
      console.error('Google Drive upload error:', error)
      return {
        success: false,
        error: error.message || 'Failed to upload file to Google Drive',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async downloadFile(fileId: string, userId: string): Promise<FileContent> {
    const accessToken = await getDecryptedAccessToken(userId, 'google-drive')
    
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    
    // Get file metadata first
    const fileMetadata = await drive.files.get({
      fileId: fileId,
      fields: 'name, mimeType, size'
    })
    
    // Download file content
    const response = await drive.files.get({
      fileId: fileId,
      alt: 'media'
    }, { responseType: 'arraybuffer' })
    
    return {
      content: Buffer.from(response.data as ArrayBuffer),
      metadata: {
        filename: fileMetadata.data.name,
        mimeType: fileMetadata.data.mimeType,
        size: fileMetadata.data.size ? parseInt(fileMetadata.data.size) : undefined
      }
    }
  }

  async deleteFile(fileId: string, userId: string): Promise<void> {
    const accessToken = await getDecryptedAccessToken(userId, 'google-drive')
    
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    
    await drive.files.delete({
      fileId: fileId
    })
  }

  async listFiles(filters?: FileFilters, userId?: string): Promise<FileInfo[]> {
    if (!userId) {
      throw new Error('User ID is required for listFiles')
    }

    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-drive')
      
      // Use existing implementation for basic listing
      if (!filters || (!filters.name && !filters.folderId)) {
        const files = await getGoogleDriveFiles(accessToken, filters?.folderId)
        return files.map((file: any) => ({
          id: file.id,
          name: file.name,
          size: 0, // Basic implementation doesn't include size
          modifiedAt: new Date(), // Basic implementation doesn't include modified date
          type: file.type,
          mimeType: file.mimeType
        }))
      }
      
      // Enhanced implementation for filtered search
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const drive = google.drive({ version: 'v3', auth: oauth2Client })
      
      let query = "trashed=false"
      
      if (filters.folderId) {
        query += ` and '${filters.folderId}' in parents`
      }
      
      if (filters.name) {
        query += ` and name contains '${filters.name}'`
      }
      
      const response = await drive.files.list({
        q: query,
        fields: 'files(id, name, mimeType, size, modifiedTime, parents)',
        pageSize: filters.limit || 100,
        orderBy: 'modifiedTime desc'
      })
      
      return response.data.files?.map((file: drive_v3.Schema$File) => ({
        id: file.id || '',
        name: file.name || 'Untitled',
        size: file.size ? parseInt(file.size) : 0,
        modifiedAt: file.modifiedTime ? new Date(file.modifiedTime) : new Date(),
        mimeType: file.mimeType,
        type: file.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
        parents: file.parents
      })) || []
    } catch (error: any) {
      console.error('Google Drive list files error:', error)
      return []
    }
  }

  async createFolder(params: FolderConfig, userId: string): Promise<FolderResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-drive')
      
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const drive = google.drive({ version: 'v3', auth: oauth2Client })
      
      const fileMetadata: any = {
        name: params.name,
        mimeType: 'application/vnd.google-apps.folder'
      }
      
      if (params.parentId) {
        fileMetadata.parents = [params.parentId]
      }
      
      const response = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id, name, webViewLink'
      })
      
      return {
        success: true,
        output: {
          folderId: response.data.id,
          name: response.data.name,
          url: response.data.webViewLink,
          googleResponse: response.data
        },
        message: 'Folder created successfully in Google Drive'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create folder in Google Drive',
        output: { error: error.message }
      }
    }
  }

  async shareFile(fileId: string, permissions: SharePermissions, userId: string): Promise<ShareResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-drive')
      
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const drive = google.drive({ version: 'v3', auth: oauth2Client })
      
      if (permissions.public) {
        // Make file public
        await drive.permissions.create({
          fileId: fileId,
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
            fileId: fileId,
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
        fileId: fileId,
        fields: 'webViewLink, webContentLink'
      })
      
      return {
        success: true,
        output: {
          shareUrl: fileResponse.data.webViewLink,
          downloadUrl: fileResponse.data.webContentLink,
          permissions: permissions
        },
        message: 'File shared successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to share file',
        output: { error: error.message }
      }
    }
  }

  private getMimeType(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase()
    
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'txt': 'text/plain',
      'csv': 'text/csv',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'mp4': 'video/mp4',
      'mp3': 'audio/mpeg',
      'zip': 'application/zip',
      'json': 'application/json'
    }
    
    return mimeTypes[extension || ''] || 'application/octet-stream'
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
    if (message.includes('not found')) {
      return 'notFound'
    }
    if (message.includes('invalid') || message.includes('malformed')) {
      return 'validation'
    }
    if (message.includes('storage quota')) {
      return 'quota'
    }
    
    return 'unknown'
  }
}