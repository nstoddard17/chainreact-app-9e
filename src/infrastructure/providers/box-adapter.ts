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

export class BoxAdapter implements FileProvider {
  readonly providerId = 'box'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 10, window: 1000 },    // 10 requests per second (API rate limits)
      { type: 'requests', limit: 1000, window: 60000 }  // 1000 requests per minute
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
      'versioning',
      'collaborations',
      'comments',
      'tasks',
      'retention_policies'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'box')
      
      // Test Box API access with user info
      const response = await fetch('https://api.box.com/2.0/users/me', {
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
      const accessToken = await getDecryptedAccessToken(userId, 'box')
      
      const formData = new FormData()
      formData.append('attributes', JSON.stringify({
        name: params.filename,
        parent: {
          id: params.folderId || '0' // 0 is root folder in Box
        }
      }))
      formData.append('file', new Blob([params.content]), params.filename)
      
      const response = await fetch('https://upload.box.com/api/2.0/files/content', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        body: formData
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Box API error: ${response.status} - ${errorData.message || response.statusText}`)
      }
      
      const result = await response.json()
      const file = result.entries[0]
      
      return {
        success: true,
        output: {
          fileId: file.id,
          name: file.name,
          size: file.size,
          url: null, // Box doesn't return direct download URLs from upload
          boxResponse: file
        },
        message: 'File uploaded successfully to Box'
      }
    } catch (error: any) {
      console.error('Box upload error:', error)
      return {
        success: false,
        error: error.message || 'Failed to upload file to Box',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async downloadFile(fileId: string, userId: string): Promise<FileContent> {
    const accessToken = await getDecryptedAccessToken(userId, 'box')
    
    const response = await fetch(`https://api.box.com/2.0/files/${fileId}/content`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to download file: ${response.status} - ${errorData.message || response.statusText}`)
    }
    
    const content = Buffer.from(await response.arrayBuffer())
    
    // Get file metadata
    const metaResponse = await fetch(`https://api.box.com/2.0/files/${fileId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    
    const metadata = metaResponse.ok ? await metaResponse.json() : {}
    
    return {
      content,
      metadata: {
        name: metadata.name,
        size: metadata.size,
        createdAt: metadata.created_at,
        modifiedAt: metadata.modified_at,
        description: metadata.description
      }
    }
  }

  async deleteFile(fileId: string, userId: string): Promise<void> {
    const accessToken = await getDecryptedAccessToken(userId, 'box')
    
    const response = await fetch(`https://api.box.com/2.0/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to delete file: ${response.status} - ${errorData.message || response.statusText}`)
    }
  }

  async listFiles(filters?: FileFilters, userId?: string): Promise<FileInfo[]> {
    if (!userId) {
      throw new Error('User ID is required for listFiles')
    }

    try {
      const accessToken = await getDecryptedAccessToken(userId, 'box')
      
      const folderId = filters?.folderId || '0' // 0 is root folder
      const limit = filters?.limit || 100
      
      const url = `https://api.box.com/2.0/folders/${folderId}/items?limit=${limit}&fields=id,name,size,modified_at,type,description`
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to list files from Box')
      }
      
      const data = await response.json()
      
      return (data.entries || [])
        .filter((entry: any) => entry.type === 'file')
        .filter((entry: any) => !filters?.name || entry.name.toLowerCase().includes(filters.name.toLowerCase()))
        .map((entry: any) => ({
          id: entry.id,
          name: entry.name,
          size: entry.size || 0,
          modifiedAt: new Date(entry.modified_at),
          description: entry.description,
          isFolder: false
        }))
    } catch (error: any) {
      console.error('Box list files error:', error)
      return []
    }
  }

  async createFolder(params: FolderConfig, userId: string): Promise<FolderResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'box')
      
      const folderData = {
        name: params.name,
        parent: {
          id: params.parentId || '0' // 0 is root folder in Box
        }
      }
      
      const response = await fetch('https://api.box.com/2.0/folders', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(folderData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to create folder: ${response.status} - ${errorData.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          folderId: result.id,
          name: result.name,
          boxResponse: result
        },
        message: 'Folder created successfully in Box'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create folder in Box',
        output: { error: error.message }
      }
    }
  }

  async shareFile(fileId: string, permissions: SharePermissions, userId: string): Promise<ShareResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'box')
      
      if (permissions.public) {
        // Create shared link
        const shareData = {
          shared_link: {
            access: permissions.type === 'write' ? 'open' : 'open',
            permissions: {
              can_download: permissions.type !== 'read',
              can_preview: true
            }
          }
        }
        
        const response = await fetch(`https://api.box.com/2.0/files/${fileId}?fields=shared_link`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(shareData)
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(`Failed to share file: ${response.status} - ${errorData.message || response.statusText}`)
        }
        
        const result = await response.json()
        
        return {
          success: true,
          output: {
            shareUrl: result.shared_link?.url,
            downloadUrl: result.shared_link?.download_url,
            boxResponse: result.shared_link
          },
          message: 'File shared successfully via Box'
        }
      } else if (permissions.users && permissions.users.length > 0) {
        // Create collaboration
        const collaborationData = {
          item: {
            type: 'file',
            id: fileId
          },
          accessible_by: {
            type: 'user',
            login: permissions.users[0] // Box requires email for collaboration
          },
          role: permissions.type === 'write' ? 'editor' : 'viewer'
        }
        
        const response = await fetch('https://api.box.com/2.0/collaborations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(collaborationData)
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(`Failed to share file: ${response.status} - ${errorData.message || response.statusText}`)
        }
        
        const result = await response.json()
        
        return {
          success: true,
          output: {
            collaborationId: result.id,
            role: result.role,
            boxResponse: result
          },
          message: 'File shared successfully via Box collaboration'
        }
      } else {
        throw new Error('Either public sharing or user list is required')
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to share file via Box',
        output: { error: error.message }
      }
    }
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized') || message.includes('invalid_grant')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('insufficient_scope')) {
      return 'authorization'
    }
    if (message.includes('rate_limited') || message.includes('too_many_requests')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not_found') || message.includes('item_not_found')) {
      return 'notFound'
    }
    if (message.includes('invalid') || message.includes('bad_request')) {
      return 'validation'
    }
    if (message.includes('conflict') || message.includes('item_name_in_use')) {
      return 'validation'
    }
    if (message.includes('storage_limit_exceeded')) {
      return 'authorization'
    }
    
    return 'unknown'
  }
}