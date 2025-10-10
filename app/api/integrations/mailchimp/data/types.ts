/**
 * Mailchimp Integration Data Types
 */

export interface MailchimpIntegration {
  id: string
  user_id: string
  provider: string
  access_token: string
  refresh_token?: string
  status: string
  metadata?: Record<string, any>
  created_at?: string
  updated_at?: string
}

export interface MailchimpAudience {
  id: string
  name: string
  web_id: number
  stats: {
    member_count: number
    unsubscribe_count: number
    cleaned_count: number
  }
}

export interface MailchimpMergeField {
  merge_id: number
  tag: string
  name: string
  type: string
  required: boolean
  default_value?: string
  public: boolean
  display_order: number
  options?: {
    choices?: string[]
  }
  help_text?: string
  list_id: string
}

export interface MailchimpTag {
  id: number
  name: string
}

export interface MailchimpCampaign {
  id: string
  web_id: number
  type: string
  create_time: string
  status: string
  settings: {
    subject_line: string
    title: string
    from_name: string
    reply_to: string
  }
  recipients: {
    list_id: string
    list_name: string
  }
}

export interface MailchimpTemplate {
  id: number
  type: string
  name: string
  thumbnail: string
  date_created: string
  active: boolean
  category: string
}

export interface MailchimpSegment {
  id: number
  name: string
  member_count: number
  type: string
  created_at: string
  updated_at: string
  list_id: string
}

export type MailchimpDataHandler<T = any> = (
  integration: MailchimpIntegration,
  options?: Record<string, any>
) => Promise<T[]>
