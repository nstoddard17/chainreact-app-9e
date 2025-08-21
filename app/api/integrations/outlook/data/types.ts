/**
 * Microsoft Outlook Integration Types
 */

export interface OutlookIntegration {
  id: string
  user_id: string
  provider: 'outlook' | 'microsoft-outlook'
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface OutlookFolder {
  id: string
  displayName: string
  parentFolderId?: string
  childFolderCount: number
  unreadItemCount: number
  totalItemCount: number
  sizeInBytes?: number
  isHidden?: boolean
}

export interface OutlookMessage {
  id: string
  subject: string
  bodyPreview: string
  importance: string
  isRead: boolean
  isDraft: boolean
  sentDateTime: string
  receivedDateTime: string
  hasAttachments: boolean
  parentFolderId: string
  from: {
    emailAddress: {
      name: string
      address: string
    }
  }
  toRecipients: Array<{
    emailAddress: {
      name: string
      address: string
    }
  }>
  ccRecipients?: Array<{
    emailAddress: {
      name: string
      address: string
    }
  }>
  webLink?: string
}

export interface OutlookContact {
  id: string
  displayName: string
  emailAddresses: Array<{
    name?: string
    address: string
  }>
  businessPhones?: string[]
  homePhones?: string[]
  mobilePhone?: string
  jobTitle?: string
  companyName?: string
  department?: string
  officeLocation?: string
  businessAddress?: {
    street?: string
    city?: string
    state?: string
    countryOrRegion?: string
    postalCode?: string
  }
  homeAddress?: {
    street?: string
    city?: string
    state?: string
    countryOrRegion?: string
    postalCode?: string
  }
}

export interface OutlookCalendar {
  id: string
  name: string
  color: string
  isDefaultCalendar: boolean
  changeKey: string
  canShare: boolean
  canViewPrivateItems: boolean
  canEdit: boolean
  allowedOnlineMeetingProviders?: string[]
  defaultOnlineMeetingProvider?: string
  isTallyingResponses?: boolean
  isRemovable?: boolean
  owner?: {
    name: string
    address: string
  }
}

export interface OutlookEvent {
  id: string
  subject: string
  body: {
    contentType: string
    content: string
  }
  start: {
    dateTime: string
    timeZone: string
  }
  end: {
    dateTime: string
    timeZone: string
  }
  location?: {
    displayName: string
    address?: any
  }
  attendees?: Array<{
    type: string
    status: {
      response: string
      time: string
    }
    emailAddress: {
      name: string
      address: string
    }
  }>
  organizer?: {
    emailAddress: {
      name: string
      address: string
    }
  }
  isAllDay: boolean
  isCancelled: boolean
  isOrganizer: boolean
  responseRequested: boolean
  sensitivity: string
  showAs: string
  type: string
  webLink: string
  onlineMeetingUrl?: string
  recurrence?: any
  reminderMinutesBeforeStart?: number
  importance: string
}

export interface OutlookSignature {
  id: string
  displayName: string
  content: string
  isDefault: boolean
}

export interface OutlookApiError extends Error {
  status?: number
  code?: string
}

export interface OutlookDataHandler<T = any> {
  (integration: OutlookIntegration, options?: any): Promise<T[]>
}

export interface OutlookHandlerOptions {
  folderId?: string
  calendarId?: string
  startDate?: string
  endDate?: string
  limit?: number
  [key: string]: any
}