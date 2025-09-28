import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface MicrosoftGraphClientOptions {
  accessToken: string
  decryptionKey?: string
  decryptionCert?: string
}

export class MicrosoftGraphClient {
  private baseUrl = 'https://graph.microsoft.com/v1.0'
  private accessToken: string
  private decryptionKey?: string
  private decryptionCert?: string

  constructor(options: MicrosoftGraphClientOptions) {
    this.accessToken = options.accessToken
    this.decryptionKey = options.decryptionKey
    this.decryptionCert = options.decryptionCert
  }

  /**
   * Make authenticated request to Microsoft Graph API
   */
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('https://') ? endpoint : `${this.baseUrl}${endpoint}`
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Microsoft Graph API error: ${response.status} ${response.statusText} - ${error}`)
    }

    return response.json()
  }

  /**
   * Get OneDrive delta changes
   */
  async getOneDriveDelta(driveId?: string, deltaToken?: string): Promise<OneDriveDeltaResponse> {
    const endpoint = driveId 
      ? `/drives/${driveId}/root/delta${deltaToken ? `?token=${deltaToken}` : ''}`
      : `/me/drive/root/delta${deltaToken ? `?token=${deltaToken}` : ''}`
    
    const response = await this.request<OneDriveDeltaResponse>(endpoint)
    return this.normalizeOneDriveDelta(response)
  }

  /**
   * Get Outlook mail delta changes
   */
  async getMailDelta(deltaToken?: string): Promise<OutlookMailDeltaResponse> {
    const endpoint = `/me/messages/delta${deltaToken ? `?$deltatoken=${deltaToken}` : ''}`
    const response = await this.request<OutlookMailDeltaResponse>(endpoint)
    return this.normalizeMailDelta(response)
  }

  /**
   * Get Calendar events delta
   */
  async getCalendarDelta(deltaToken?: string): Promise<CalendarDeltaResponse> {
    const endpoint = `/me/events/delta${deltaToken ? `?$deltatoken=${deltaToken}` : ''}`
    const response = await this.request<CalendarDeltaResponse>(endpoint)
    return this.normalizeCalendarDelta(response)
  }

  /**
   * Get Teams/Chat messages
   */
  async getTeamsMessages(teamId: string, channelId: string, since?: Date): Promise<TeamsMessagesResponse> {
    const sinceFilter = since ? `&$filter=lastModifiedDateTime ge ${since.toISOString()}` : ''
    const endpoint = `/teams/${teamId}/channels/${channelId}/messages?$top=50${sinceFilter}`
    
    const response = await this.request<TeamsMessagesResponse>(endpoint)
    return this.decryptAndNormalizeTeamsMessages(response)
  }

  /**
   * Get Chat messages
   */
  async getChatMessages(chatId: string, since?: Date): Promise<TeamsMessagesResponse> {
    const sinceFilter = since ? `&$filter=lastModifiedDateTime ge ${since.toISOString()}` : ''
    const endpoint = `/chats/${chatId}/messages?$top=50${sinceFilter}`
    
    const response = await this.request<TeamsMessagesResponse>(endpoint)
    return this.decryptAndNormalizeTeamsMessages(response)
  }

  /**
   * Get OneNote notebooks via OneDrive
   */
  async getOneNoteNotebooks(): Promise<OneNoteNotebooksResponse> {
    const endpoint = '/me/onenote/notebooks'
    const response = await this.request<OneNoteNotebooksResponse>(endpoint)
    return response
  }

  /**
   * Get OneNote pages delta
   */
  async getOneNotePagesDelta(notebookId: string, deltaToken?: string): Promise<OneNotePagesDeltaResponse> {
    // OneNote doesn't have direct delta API, so we use a combination of OneDrive delta for the notebook
    // and direct OneNote API for content
    const endpoint = `/me/onenote/notebooks/${notebookId}/sections`
    const sections = await this.request<OneNoteSectionsResponse>(endpoint)
    
    const pages: OneNotePage[] = []
    for (const section of sections.value) {
      const pagesEndpoint = `/me/onenote/sections/${section.id}/pages`
      const sectionPages = await this.request<OneNotePagesResponse>(pagesEndpoint)
      pages.push(...sectionPages.value)
    }
    
    return {
      value: pages,
      '@odata.deltaLink': '', // OneNote doesn't provide delta tokens
    }
  }

  // Private normalization methods

  private normalizeOneDriveDelta(response: OneDriveDeltaResponse): OneDriveDeltaResponse {
    return {
      ...response,
      value: response.value.map(item => ({
        ...item,
        // Normalize to internal event format
        _normalized: {
          id: item.id,
          type: 'onedrive_item',
          action: item.deleted ? 'deleted' : (item.file ? 'file_updated' : 'folder_updated'),
          name: item.name,
          path: item.parentReference?.path ? `${item.parentReference.path}/${item.name}` : item.name,
          lastModified: item.lastModifiedDateTime,
          createdBy: item.createdBy?.user?.displayName,
          size: item.size,
          webUrl: item.webUrl,
          originalPayload: item
        }
      }))
    }
  }

  private normalizeMailDelta(response: OutlookMailDeltaResponse): OutlookMailDeltaResponse {
    return {
      ...response,
      value: response.value.map(message => ({
        ...message,
        // Normalize to internal event format
        _normalized: {
          id: message.id,
          type: 'outlook_mail',
          action: 'created', // New emails are always "created" events
          subject: message.subject,
          from: message.from?.emailAddress?.address,
          receivedDateTime: message.receivedDateTime,
          importance: message.importance,
          hasAttachments: message.hasAttachments,
          isRead: message.isRead,
          webLink: message.webLink,
          originalPayload: message
        }
      }))
    }
  }

  private normalizeCalendarDelta(response: CalendarDeltaResponse): CalendarDeltaResponse {
    return {
      ...response,
      value: response.value.map(event => ({
        ...event,
        // Normalize to internal event format
        _normalized: {
          id: event.id,
          type: 'outlook_calendar',
          action: event.isCancelled ? 'cancelled' : (event.isNewEvent ? 'created' : 'updated'),
          subject: event.subject,
          start: event.start?.dateTime,
          end: event.end?.dateTime,
          organizer: event.organizer?.emailAddress?.address,
          location: event.location?.displayName,
          webLink: event.webLink,
          originalPayload: event
        }
      }))
    }
  }

  private decryptAndNormalizeTeamsMessages(response: TeamsMessagesResponse): TeamsMessagesResponse {
    return {
      ...response,
      value: response.value.map(message => {
        // Decrypt message content if encrypted and we have keys
        let content = message.body.content
        if (message.body.contentType === 'html' && 
            this.decryptionKey && 
            this.decryptionCert && 
            message.body.content.includes('-----BEGIN ENCRYPTED CONTENT-----')) {
          try {
            content = this.decryptMessage(message.body.content)
          } catch (e) {
            console.error('Failed to decrypt Teams message:', e)
          }
        }

        return {
          ...message,
          body: {
            ...message.body,
            content
          },
          // Normalize to internal event format
          _normalized: {
            id: message.id,
            type: 'teams_message',
            action: message.deletedDateTime ? 'deleted' : (message.lastEditedDateTime ? 'edited' : 'created'),
            content,
            from: message.from?.user?.displayName,
            createdDateTime: message.createdDateTime,
            channelId: message.channelIdentity?.channelId,
            teamId: message.channelIdentity?.teamId,
            originalPayload: message
          }
        }
      })
    }
  }

  private decryptMessage(encryptedContent: string): string {
    if (!this.decryptionKey || !this.decryptionCert) {
      throw new Error('Decryption keys not configured')
    }

    // Extract encrypted content between markers
    const match = encryptedContent.match(/-----BEGIN ENCRYPTED CONTENT-----([\s\S]+?)-----END ENCRYPTED CONTENT-----/)
    if (!match) {
      return encryptedContent // Not encrypted or invalid format
    }

    try {
      // In a real implementation, use crypto APIs to decrypt
      // This is a placeholder for the actual decryption logic
      const crypto = require('crypto')
      // Implementation would use the private key to decrypt
      // const decrypted = crypto.privateDecrypt(this.decryptionKey, Buffer.from(match[1], 'base64'))
      
      // For now, just return a placeholder
      return 'Decrypted content would appear here'
    } catch (e) {
      console.error('Decryption error:', e)
      return `[Encrypted content - decryption failed]`
    }
  }
}

// Type definitions for Microsoft Graph responses

export interface OneDriveDeltaResponse {
  '@odata.deltaLink'?: string
  '@odata.nextLink'?: string
  value: OneDriveItem[]
}

export interface OneDriveItem {
  id: string
  name: string
  size?: number
  webUrl?: string
  createdDateTime?: string
  lastModifiedDateTime?: string
  file?: { mimeType: string }
  folder?: { childCount: number }
  deleted?: { state: string }
  parentReference?: { path: string, driveId: string }
  createdBy?: { user?: { displayName?: string } }
  _normalized?: NormalizedEvent
}

export interface OutlookMailDeltaResponse {
  '@odata.deltaLink'?: string
  '@odata.nextLink'?: string
  value: OutlookMessage[]
}

export interface OutlookMessage {
  id: string
  subject: string
  bodyPreview: string
  importance: string
  conversationId?: string
  isRead: boolean
  isDraft: boolean
  hasAttachments: boolean
  receivedDateTime: string
  sentDateTime: string
  from?: { emailAddress?: { address?: string, name?: string } }
  webLink?: string
  _normalized?: NormalizedEvent
}

export interface CalendarDeltaResponse {
  '@odata.deltaLink'?: string
  '@odata.nextLink'?: string
  value: CalendarEvent[]
}

export interface CalendarEvent {
  id: string
  subject: string
  bodyPreview: string
  importance: string
  start?: { dateTime: string, timeZone: string }
  end?: { dateTime: string, timeZone: string }
  location?: { displayName?: string }
  organizer?: { emailAddress?: { address?: string, name?: string } }
  attendees?: Array<{ emailAddress?: { address?: string, name?: string }, status?: { response?: string } }>
  webLink?: string
  isCancelled?: boolean
  isNewEvent?: boolean
  _normalized?: NormalizedEvent
}

export interface TeamsMessagesResponse {
  '@odata.count'?: number
  '@odata.nextLink'?: string
  value: TeamsMessage[]
}

export interface TeamsMessage {
  id: string
  replyToId?: string
  etag: string
  messageType: string
  createdDateTime: string
  lastModifiedDateTime?: string
  lastEditedDateTime?: string
  deletedDateTime?: string
  subject?: string
  summary?: string
  importance: string
  locale: string
  webUrl?: string
  channelIdentity?: {
    teamId: string
    channelId: string
  }
  from?: {
    user?: {
      id?: string
      displayName?: string
      userIdentityType?: string
    }
  }
  body: {
    contentType: string
    content: string
  }
  attachments?: any[]
  mentions?: any[]
  reactions?: any[]
  _normalized?: NormalizedEvent
}

export interface OneNoteNotebooksResponse {
  value: OneNoteNotebook[]
}

export interface OneNoteNotebook {
  id: string
  displayName: string
  createdDateTime: string
  lastModifiedDateTime: string
  links: {
    oneNoteClientUrl: { href: string }
    oneNoteWebUrl: { href: string }
  }
}

export interface OneNoteSectionsResponse {
  value: OneNoteSection[]
}

export interface OneNoteSection {
  id: string
  displayName: string
  createdDateTime: string
  lastModifiedDateTime: string
}

export interface OneNotePagesResponse {
  value: OneNotePage[]
}

export interface OneNotePage {
  id: string
  title: string
  createdDateTime: string
  lastModifiedDateTime: string
  links: {
    oneNoteClientUrl: { href: string }
    oneNoteWebUrl: { href: string }
  }
}

export interface OneNotePagesDeltaResponse {
  value: OneNotePage[]
  '@odata.deltaLink'?: string
}

export interface NormalizedEvent {
  id: string
  type: 'onedrive_item' | 'outlook_mail' | 'outlook_calendar' | 'teams_message' | 'onenote_page'
  action: string
  [key: string]: any
  originalPayload: any
}
