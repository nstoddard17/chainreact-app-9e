/**
 * OneNote Integration Types
 */

export interface OneNoteIntegration {
  id: string
  user_id: string
  provider: 'onenote' | 'microsoft-onenote'
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface OneNoteNotebook {
  id: string
  displayName: string
  name?: string
  lastModifiedDateTime?: string
  webUrl?: string
  isDefault?: boolean
  userRole?: string
  isShared?: boolean
  sections?: OneNoteSection[]
  links?: any
}

export interface OneNoteSection {
  id: string
  displayName: string
  name?: string
  parentNotebook?: {
    id: string
    displayName: string
  }
  pages?: OneNotePage[]
  lastModifiedDateTime?: string
  webUrl?: string
}

export interface OneNotePage {
  id: string
  title: string
  contentUrl?: string
  webUrl?: string
  lastModifiedDateTime?: string
  parentSection?: {
    id: string
    displayName: string
  }
}

export interface OneNoteApiError extends Error {
  status?: number
  code?: string
}

export interface OneNoteApiResponse<T = any> {
  data: T[]
  error?: {
    message: string
  }
}

export interface OneNoteDataHandler<T = any> {
  (integration: OneNoteIntegration, options?: any): Promise<OneNoteApiResponse<T>>
}

export interface OneNoteHandlerOptions {
  [key: string]: any
}