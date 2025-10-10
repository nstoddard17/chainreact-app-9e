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

export class DropboxAdapter implements FileProvider {
  readonly providerId = 'dropbox'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 10, window: 1000 }, // 10 requests per second
      { type: 'requests', limit: 600, window: 60000 } // 600 requests per minute
    ],
    supportedFeatures: [
      'upload_file',
      'download_file',
      'delete_file',
      'list_files',
      'create_folder',
      'share_file',
      'move_file',
      'copy_file',
      'search_files',
      'get_metadata',
      'thumbnails',
      'paper_docs',
      'team_folders'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'dropbox')
      
      // Test Dropbox API access with account info
      const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
        method: 'POST',
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
      const accessToken = await getDecryptedAccessToken(userId, 'dropbox')
      
      // Use path if folderId is provided, otherwise use root
      const path = params.folderId ? `${params.folderId}/${params.filename}` : `/${params.filename}`
      
      const uploadData = {
        path: path,
        mode: 'add',
        autorename: true,
        mute: false
      }
      
      const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify(uploadData)
        },
        body: params.content
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Dropbox API error: ${response.status} - ${errorData.error_summary || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          fileId: result.id,
          path: result.path_display,
          name: result.name,
          size: result.size,
          url: null, // Dropbox doesn't return direct URLs from upload
          dropboxResponse: result
        },
        message: 'File uploaded successfully to Dropbox'
      }
    } catch (error: any) {
      console.error('Dropbox upload error:', error)
      return {
        success: false,
        error: error.message || 'Failed to upload file to Dropbox',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async downloadFile(fileId: string, userId: string): Promise<FileContent> {
    const accessToken = await getDecryptedAccessToken(userId, 'dropbox')
    
    const downloadData = {
      path: fileId // Dropbox uses path as identifier
    }
    
    const response = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Dropbox-API-Arg': JSON.stringify(downloadData)
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to download file: ${response.status} - ${errorData.error_summary || response.statusText}`)
    }
    
    const content = Buffer.from(await response.arrayBuffer())
    const metadata = JSON.parse(response.headers.get('dropbox-api-result') || '{}')
    
    return {
      content,
      metadata: {
        name: metadata.name,
        size: metadata.size,
        clientModified: metadata.client_modified,
        serverModified: metadata.server_modified
      }
    }
  }

  async deleteFile(fileId: string, userId: string): Promise<void> {
    const accessToken = await getDecryptedAccessToken(userId, 'dropbox')
    
    const deleteData = {
      path: fileId
    }
    
    const response = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(deleteData)
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to delete file: ${response.status} - ${errorData.error_summary || response.statusText}`)
    }
  }

  async listFiles(filters?: FileFilters, userId?: string): Promise<FileInfo[]> {
    if (!userId) {
      throw new Error('User ID is required for listFiles')
    }

    try {
      const accessToken = await getDecryptedAccessToken(userId, 'dropbox')
      
      const listData = {
        path: filters?.folderId || '',
        recursive: false,
        include_media_info: false,
        include_deleted: false,
        include_has_explicit_shared_members: false,
        include_mounted_folders: true,
        limit: filters?.limit || 100
      }
      
      const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(listData)
      })
      
      if (!response.ok) {
        throw new Error('Failed to list files from Dropbox')
      }
      
      const data = await response.json()
      
      return (data.entries || [])
        .filter((entry: any) => entry['.tag'] === 'file')
        .filter((entry: any) => !filters?.name || entry.name.toLowerCase().includes(filters.name.toLowerCase()))
        .map((entry: any) => ({
          id: entry.path_display,
          name: entry.name,
          size: entry.size,
          modifiedAt: new Date(entry.server_modified),
          mimeType: entry.content_hash ? 'application/octet-stream' : undefined,
          isFolder: false
        }))
    } catch (error: any) {
      console.error('Dropbox list files error:', error)
      return []
    }
  }

  async createFolder(params: FolderConfig, userId: string): Promise<FolderResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'dropbox')
      
      const path = params.parentId ? `${params.parentId}/${params.name}` : `/${params.name}`
      
      const folderData = {
        path: path,
        autorename: false
      }
      
      const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(folderData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to create folder: ${response.status} - ${errorData.error_summary || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          folderId: result.metadata.path_display,
          name: result.metadata.name,
          dropboxResponse: result.metadata
        },
        message: 'Folder created successfully in Dropbox'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create folder in Dropbox',
        output: { error: error.message }
      }
    }
  }

  async shareFile(fileId: string, permissions: SharePermissions, userId: string): Promise<ShareResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'dropbox')
      
      if (permissions.public) {
        // Create public shared link
        const shareData = {
          path: fileId,
          settings: {
            audience: 'public',
            access: permissions.type === 'write' ? 'edit' : 'view',
            requested_visibility: 'public'
          }
        }
        
        const response = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(shareData)
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(`Failed to share file: ${response.status} - ${errorData.error_summary || response.statusText}`)
        }
        
        const result = await response.json()
        
        return {
          success: true,
          output: {
            shareUrl: result.url,
            shareId: result.id,
            dropboxResponse: result
          },
          message: 'File shared successfully via Dropbox'
        }
      } 
        throw new Error('User-specific sharing not implemented for Dropbox adapter')
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to share file via Dropbox',
        output: { error: error.message }
      }
    }
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('invalid_access_token') || message.includes('unauthorized')) {
      return 'authentication'
    }
    if (message.includes('insufficient_space') || message.includes('over_quota')) {
      return 'authorization'
    }
    if (message.includes('rate_limit') || message.includes('too_many_requests')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('path_not_found') || message.includes('not_found')) {
      return 'notFound'
    }
    if (message.includes('invalid') || message.includes('malformed')) {
      return 'validation'
    }
    if (message.includes('conflict') || message.includes('already_exists')) {
      return 'validation'
    }
    
    return 'unknown'
  }
}