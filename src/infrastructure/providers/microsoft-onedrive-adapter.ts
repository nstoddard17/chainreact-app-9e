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
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'

import { logger } from '@/lib/utils/logger'

export class MicrosoftOneDriveAdapter implements FileProvider {
  readonly providerId = 'microsoft-onedrive'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 10000, window: 600000 }, // 10,000 requests per 10 minutes
      { type: 'uploads', limit: 1000, window: 3600000 } // 1,000 uploads per hour
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
      'copy_files',
      'version_history',
      'thumbnail_generation'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-onedrive')
      
      // Test Microsoft Graph API access with a simple drive info call
      const response = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      return response.ok
    } catch {
      return false
    }
  }

  async uploadFile(params: FileUpload, userId: string): Promise<FileResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-onedrive')
      
      // Determine upload path
      const uploadPath = params.folderId 
        ? `https://graph.microsoft.com/v1.0/me/drive/items/${params.folderId}:/${params.filename}:/content`
        : `https://graph.microsoft.com/v1.0/me/drive/root:/${params.filename}:/content`
      
      const response = await fetch(uploadPath, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream'
        },
        body: params.content
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`OneDrive upload error: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          fileId: result.id,
          filename: result.name,
          url: result.webUrl,
          downloadUrl: result['@microsoft.graph.downloadUrl'],
          size: result.size,
          parentId: result.parentReference?.id,
          microsoftResponse: result
        },
        message: 'File uploaded successfully to OneDrive'
      }
    } catch (error: any) {
      logger.error('OneDrive upload error:', error)
      return {
        success: false,
        error: error.message || 'Failed to upload file to OneDrive',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async downloadFile(fileId: string, userId: string): Promise<FileContent> {
    const accessToken = await getDecryptedAccessToken(userId, 'microsoft-onedrive')
    
    // Get file metadata first
    const metadataResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!metadataResponse.ok) {
      throw new Error('Failed to get file metadata from OneDrive')
    }
    
    const metadata = await metadataResponse.json()
    
    // Download file content
    const downloadUrl = metadata['@microsoft.graph.downloadUrl']
    if (!downloadUrl) {
      throw new Error('No download URL available for this file')
    }
    
    const contentResponse = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })
    
    if (!contentResponse.ok) {
      throw new Error('Failed to download file from OneDrive')
    }
    
    const arrayBuffer = await contentResponse.arrayBuffer()
    
    return {
      content: Buffer.from(arrayBuffer),
      metadata: {
        filename: metadata.name,
        mimeType: metadata.file?.mimeType,
        size: metadata.size,
        modifiedAt: metadata.lastModifiedDateTime,
        createdAt: metadata.createdDateTime
      }
    }
  }

  async deleteFile(fileId: string, userId: string): Promise<void> {
    const accessToken = await getDecryptedAccessToken(userId, 'microsoft-onedrive')
    
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to delete file: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }
  }

  async listFiles(filters?: FileFilters, userId?: string): Promise<FileInfo[]> {
    if (!userId) {
      throw new Error('User ID is required for listFiles')
    }

    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-onedrive')
      
      // Determine endpoint based on folder filter
      let url = 'https://graph.microsoft.com/v1.0/me/drive/root/children'
      
      if (filters?.folderId) {
        url = `https://graph.microsoft.com/v1.0/me/drive/items/${filters.folderId}/children`
      }
      
      // Add query parameters
      const params = new URLSearchParams()
      if (filters?.limit) {
        params.append('$top', filters.limit.toString())
      }
      if (filters?.name) {
        params.append('$filter', `startswith(name,'${filters.name}')`)
      }
      params.append('$orderby', 'lastModifiedDateTime desc')
      
      if (params.toString()) {
        url += `?${params.toString()}`
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to list files from OneDrive')
      }
      
      const data = await response.json()
      
      return (data.value || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        size: item.size || 0,
        modifiedAt: new Date(item.lastModifiedDateTime),
        createdAt: new Date(item.createdDateTime),
        mimeType: item.file?.mimeType,
        type: item.folder ? 'folder' : 'file',
        parentId: item.parentReference?.id,
        url: item.webUrl,
        downloadUrl: item['@microsoft.graph.downloadUrl']
      }))
    } catch (error: any) {
      logger.error('OneDrive list files error:', error)
      return []
    }
  }

  async createFolder(params: FolderConfig, userId: string): Promise<FolderResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-onedrive')
      
      // Determine parent path
      let url = 'https://graph.microsoft.com/v1.0/me/drive/root/children'
      
      if (params.parentId) {
        url = `https://graph.microsoft.com/v1.0/me/drive/items/${params.parentId}/children`
      }
      
      const folderPayload = {
        name: params.name,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename'
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(folderPayload)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to create folder: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          folderId: result.id,
          name: result.name,
          url: result.webUrl,
          parentId: result.parentReference?.id,
          microsoftResponse: result
        },
        message: 'Folder created successfully in OneDrive'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create folder in OneDrive',
        output: { error: error.message }
      }
    }
  }

  async shareFile(fileId: string, permissions: SharePermissions, userId: string): Promise<ShareResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-onedrive')
      
      // Create sharing link
      const sharePayload: any = {
        type: permissions.public ? 'view' : 'edit',
        scope: permissions.public ? 'anonymous' : 'organization'
      }
      
      if (permissions.type === 'write') {
        sharePayload.type = 'edit'
      }
      
      const linkResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/createLink`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sharePayload)
      })
      
      if (!linkResponse.ok) {
        const errorData = await linkResponse.json().catch(() => ({}))
        throw new Error(`Failed to create sharing link: ${linkResponse.status} - ${errorData.error?.message || linkResponse.statusText}`)
      }
      
      const linkResult = await linkResponse.json()
      
      // Share with specific users if provided
      if (permissions.users && permissions.users.length > 0) {
        for (const email of permissions.users) {
          const invitePayload = {
            recipients: [{
              email: email
            }],
            message: 'Shared via ChainReact automation',
            requireSignIn: true,
            sendInvitation: true,
            roles: [permissions.type === 'write' ? 'write' : 'read']
          }
          
          await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/invite`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(invitePayload)
          })
        }
      }
      
      return {
        success: true,
        output: {
          shareUrl: linkResult.link.webUrl,
          linkType: linkResult.link.type,
          scope: linkResult.link.scope,
          permissions: permissions,
          microsoftResponse: linkResult
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

  async searchFiles(query: string, userId: string): Promise<FileInfo[]> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-onedrive')
      
      const url = `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(query)}')`
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to search files in OneDrive')
      }
      
      const data = await response.json()
      
      return (data.value || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        size: item.size || 0,
        modifiedAt: new Date(item.lastModifiedDateTime),
        createdAt: new Date(item.createdDateTime),
        mimeType: item.file?.mimeType,
        type: item.folder ? 'folder' : 'file',
        parentId: item.parentReference?.id,
        url: item.webUrl,
        downloadUrl: item['@microsoft.graph.downloadUrl']
      }))
    } catch (error: any) {
      logger.error('OneDrive search error:', error)
      return []
    }
  }

  async moveFile(fileId: string, destinationFolderId: string, userId: string): Promise<FileResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-onedrive')
      
      const movePayload = {
        parentReference: {
          id: destinationFolderId
        }
      }
      
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(movePayload)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to move file: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          fileId: result.id,
          filename: result.name,
          url: result.webUrl,
          parentId: result.parentReference?.id,
          microsoftResponse: result
        },
        message: 'File moved successfully in OneDrive'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to move file in OneDrive',
        output: { error: error.message }
      }
    }
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized') || message.includes('invalid_grant')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('insufficient privileges')) {
      return 'authorization'
    }
    if (message.includes('throttled') || message.includes('rate limit')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found') || message.includes('does not exist')) {
      return 'notFound'
    }
    if (message.includes('bad request') || message.includes('invalid')) {
      return 'validation'
    }
    if (message.includes('quota') || message.includes('storage')) {
      return 'quota'
    }
    
    return 'unknown'
  }
}