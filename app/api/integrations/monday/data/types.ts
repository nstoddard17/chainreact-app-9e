/**
 * Monday.com Data API Types
 */

export interface MondayIntegration {
  id: string
  user_id: string
  provider: string
  access_token: string
  refresh_token?: string
  scopes?: string[]
  status: string
  metadata?: any
  created_at: string
  updated_at: string
}

export interface MondayBoard {
  id: string
  name: string
  label: string
  value: string
  description?: string
  board_kind?: string
  state?: string
}

export interface MondayGroup {
  id: string
  title: string
  label: string
  value: string
  color?: string
  position?: string
}

export interface MondayColumn {
  id: string
  title: string
  label: string
  value: string
  type: string
  settings_str?: string
}

export type MondayDataHandler<T = any> = (
  integration: MondayIntegration,
  options?: Record<string, any>
) => Promise<T[]>
