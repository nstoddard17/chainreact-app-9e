/**
 * Trello Integration Types
 */

export interface TrelloIntegration {
  id: string
  user_id: string
  provider: 'trello'
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface TrelloBoard {
  id: string
  name: string
  desc?: string
  url?: string
  closed: boolean
  prefs?: any
  organization?: {
    id: string
    name: string
  }
}

export interface TrelloList {
  id: string
  name: string
  desc?: string
  closed: boolean
  idBoard: string
  pos: number
  subscribed?: boolean
}

export interface TrelloCard {
  id: string
  name: string
  desc?: string
  idList: string
  idBoard: string
  closed: boolean
  pos: number
  labels: TrelloLabel[]
  members?: TrelloMember[]
  due?: string
  url?: string
  shortUrl?: string
}

export interface TrelloLabel {
  id: string
  name: string
  color: string
}

export interface TrelloMember {
  id: string
  username: string
  fullName: string
  avatarUrl?: string
}

export interface TrelloBoardTemplate {
  value: string
  label: string
  description?: string
  url?: string
  closed: boolean
}

export interface TrelloListTemplate {
  value: string
  label: string
  description?: string
  boardId: string
  boardName: string
  closed: boolean
}

export interface TrelloCardTemplate {
  value: string
  label: string
  description?: string
  listId: string
  listName: string
  boardId: string
  boardName: string
  labels: TrelloLabel[]
  closed: boolean
}

export interface TrelloApiError extends Error {
  status?: number
  code?: string
}

export interface TrelloDataHandler<T = any> {
  (integration: TrelloIntegration, options?: any): Promise<T[]>
}

export interface TrelloHandlerOptions {
  boardId?: string
  listId?: string
  [key: string]: any
}