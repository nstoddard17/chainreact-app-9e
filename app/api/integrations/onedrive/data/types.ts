/**
 * OneDrive Integration Types
 */

export interface OneDriveIntegration {
  id: string
  user_id: string
  provider: 'onedrive' | 'microsoft-onedrive'
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface OneDriveFolder {
  id: string
  name: string
  webUrl?: string
  size?: number
  createdDateTime?: string
  lastModifiedDateTime?: string
  folder?: {
    childCount: number
  }
  parentReference?: {
    id: string
    name: string
    path: string
  }
}

export interface OneDriveFile {
  id: string
  name: string
  size: number
  webUrl?: string
  downloadUrl?: string
  createdDateTime?: string
  lastModifiedDateTime?: string
  file?: {
    mimeType: string
    hashes?: any
  }
  parentReference?: {
    id: string
    name: string
    path: string
  }
}

export interface OneDriveItem {
  id: string
  name: string
  size?: number
  webUrl?: string
  createdDateTime?: string
  lastModifiedDateTime?: string
  folder?: {
    childCount: number
  }
  file?: {
    mimeType: string
  }
  parentReference?: {
    id: string
    name: string
    path: string
  }
}

export interface OneDriveApiError extends Error {
  status?: number
  code?: string
}

export interface OneDriveDataHandler<T = any> {
  (integration: OneDriveIntegration, options?: any): Promise<T[]>
}

export interface OneDriveHandlerOptions {
  folderId?: string
  itemType?: 'files' | 'folders' | 'all'
  [key: string]: any
}