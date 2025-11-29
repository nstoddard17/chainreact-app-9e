/**
 * ManyChat API Client
 *
 * Handles all API interactions with ManyChat's REST API
 * API Documentation: https://api.manychat.com/swagger
 *
 * Rate Limits: 10 requests/second per chatbot account
 * Authentication: API Key (Bearer token)
 */

import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'

const MANYCHAT_API_BASE = 'https://api.manychat.com'
const REQUEST_TIMEOUT = 8000 // 8 seconds

export interface ManyChatConfig {
  apiKey: string
}

export interface ManyChatSubscriber {
  id: number
  key: string
  page_id: number
  status: string
  first_name?: string
  last_name?: string
  name?: string
  gender?: string
  profile_pic?: string
  locale?: string
  language?: string
  timezone?: number
  live_chat_url?: string
  last_input_text?: string
  optin_phone?: boolean
  phone?: string
  optin_email?: boolean
  email?: string
  subscribed: string // ISO 8601 timestamp
  last_interaction: string // ISO 8601 timestamp
  last_seen: string // ISO 8601 timestamp
  is_followup_enabled: number
  custom_fields?: Record<string, any>
  tags?: Array<{ id: number; name: string }>
}

export interface ManyChatFlow {
  id: number
  name: string
  folder_id?: number
  status: 'active' | 'inactive' | 'draft'
}

export interface ManyChatSequence {
  id: number
  name: string
  folder_id?: number
  status: 'active' | 'inactive'
}

export interface ManyChatTag {
  id: number
  name: string
}

export interface ManyChatCustomField {
  id: number
  name: string
  type: 'text' | 'number' | 'date' | 'datetime' | 'boolean'
  description?: string
}

export interface SendMessageParams {
  subscriber_id: number
  message_tag?: string
  text: string
}

export interface SendFlowParams {
  subscriber_id: number
  flow_ns: string // Flow namespace (e.g., 'content20220101000000_123456')
}

export interface SetCustomFieldParams {
  subscriber_id: number
  field_id: number
  field_value: string | number | boolean
}

export interface ManageTagsParams {
  subscriber_id: number
  tag_id: number
}

export interface SubscribeSequenceParams {
  subscriber_id: number
  sequence_id: number
}

/**
 * ManyChat API Client
 */
export class ManyChatClient {
  private config: ManyChatConfig

  constructor(config: ManyChatConfig) {
    this.config = config
  }

  /**
   * Make authenticated request to ManyChat API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${MANYCHAT_API_BASE}${endpoint}`

    const response = await fetchWithTimeout(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }, REQUEST_TIMEOUT)

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `ManyChat API error: ${response.status}`

      try {
        const errorData = JSON.parse(errorText)
        errorMessage = errorData.message || errorData.error || errorMessage
      } catch {
        errorMessage = errorText || errorMessage
      }

      throw new Error(errorMessage)
    }

    return response.json()
  }

  /**
   * Get subscriber information by ID
   * GET /fb/subscriber/getInfo
   */
  async getSubscriber(subscriberId: number): Promise<ManyChatSubscriber> {
    const response = await this.request<{ data: ManyChatSubscriber }>(
      `/fb/subscriber/getInfo?subscriber_id=${subscriberId}`
    )
    return response.data
  }

  /**
   * Find subscriber by custom field
   * POST /fb/subscriber/findByCustomField
   */
  async findSubscriberByCustomField(
    fieldId: number,
    fieldValue: string
  ): Promise<ManyChatSubscriber[]> {
    const response = await this.request<{ data: ManyChatSubscriber[] }>(
      '/fb/subscriber/findByCustomField',
      {
        method: 'POST',
        body: JSON.stringify({
          field_id: fieldId,
          field_value: fieldValue,
        }),
      }
    )
    return response.data
  }

  /**
   * Find subscriber by system field (name, email, phone)
   * POST /fb/subscriber/findBySystemField
   */
  async findSubscriberBySystemField(
    fieldName: string,
    fieldValue: string
  ): Promise<ManyChatSubscriber[]> {
    const response = await this.request<{ data: ManyChatSubscriber[] }>(
      '/fb/subscriber/findBySystemField',
      {
        method: 'POST',
        body: JSON.stringify({
          field_name: fieldName,
          field_value: fieldValue,
        }),
      }
    )
    return response.data
  }

  /**
   * Send text message to subscriber
   * POST /fb/sending/sendContent
   */
  async sendMessage(params: SendMessageParams): Promise<void> {
    await this.request('/fb/sending/sendContent', {
      method: 'POST',
      body: JSON.stringify({
        subscriber_id: params.subscriber_id,
        data: {
          version: 'v2',
          content: {
            messages: [
              {
                type: 'text',
                text: params.text,
              },
            ],
          },
        },
        message_tag: params.message_tag || 'ACCOUNT_UPDATE',
      }),
    })
  }

  /**
   * Send flow to subscriber
   * POST /fb/sending/sendFlow
   */
  async sendFlow(params: SendFlowParams): Promise<void> {
    await this.request('/fb/sending/sendFlow', {
      method: 'POST',
      body: JSON.stringify({
        subscriber_id: params.subscriber_id,
        flow_ns: params.flow_ns,
      }),
    })
  }

  /**
   * Set custom field value for subscriber
   * POST /fb/subscriber/setCustomField
   */
  async setCustomField(params: SetCustomFieldParams): Promise<void> {
    await this.request('/fb/subscriber/setCustomField', {
      method: 'POST',
      body: JSON.stringify({
        subscriber_id: params.subscriber_id,
        field_id: params.field_id,
        field_value: params.field_value,
      }),
    })
  }

  /**
   * Add tag to subscriber
   * POST /fb/subscriber/addTag
   */
  async addTag(params: ManageTagsParams): Promise<void> {
    await this.request('/fb/subscriber/addTag', {
      method: 'POST',
      body: JSON.stringify({
        subscriber_id: params.subscriber_id,
        tag_id: params.tag_id,
      }),
    })
  }

  /**
   * Remove tag from subscriber
   * POST /fb/subscriber/removeTag
   */
  async removeTag(params: ManageTagsParams): Promise<void> {
    await this.request('/fb/subscriber/removeTag', {
      method: 'POST',
      body: JSON.stringify({
        subscriber_id: params.subscriber_id,
        tag_id: params.tag_id,
      }),
    })
  }

  /**
   * Subscribe user to sequence
   * POST /fb/subscriber/addSequence
   */
  async subscribeToSequence(params: SubscribeSequenceParams): Promise<void> {
    await this.request('/fb/subscriber/addSequence', {
      method: 'POST',
      body: JSON.stringify({
        subscriber_id: params.subscriber_id,
        sequence_id: params.sequence_id,
      }),
    })
  }

  /**
   * Unsubscribe user from sequence
   * POST /fb/subscriber/removeSequence
   */
  async unsubscribeFromSequence(params: SubscribeSequenceParams): Promise<void> {
    await this.request('/fb/subscriber/removeSequence', {
      method: 'POST',
      body: JSON.stringify({
        subscriber_id: params.subscriber_id,
        sequence_id: params.sequence_id,
      }),
    })
  }

  /**
   * Get all tags
   * GET /fb/page/getTags
   */
  async getTags(): Promise<ManyChatTag[]> {
    const response = await this.request<{ data: ManyChatTag[] }>('/fb/page/getTags')
    return response.data
  }

  /**
   * Get all custom fields
   * GET /fb/page/getCustomFields
   */
  async getCustomFields(): Promise<ManyChatCustomField[]> {
    const response = await this.request<{ data: ManyChatCustomField[] }>(
      '/fb/page/getCustomFields'
    )
    return response.data
  }

  /**
   * Create subscriber
   * POST /fb/subscriber/createSubscriber
   */
  async createSubscriber(params: {
    first_name?: string
    last_name?: string
    email?: string
    phone?: string
    whatsapp?: string
  }): Promise<ManyChatSubscriber> {
    const response = await this.request<{ data: ManyChatSubscriber }>(
      '/fb/subscriber/createSubscriber',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    )
    return response.data
  }

  /**
   * Send content (card, gallery, list) to subscriber
   * POST /fb/sending/sendContent
   */
  async sendContent(params: {
    subscriber_id: number
    content_type: 'card' | 'gallery' | 'list'
    title: string
    subtitle?: string
    image_url?: string
    button_text?: string
    button_url?: string
  }): Promise<void> {
    await this.request('/fb/sending/sendContent', {
      method: 'POST',
      body: JSON.stringify({
        subscriber_id: params.subscriber_id,
        data: {
          version: 'v2',
          content: {
            messages: [
              {
                type: params.content_type,
                elements: [
                  {
                    title: params.title,
                    subtitle: params.subtitle,
                    image_url: params.image_url,
                    buttons: params.button_text
                      ? [
                          {
                            type: 'url',
                            title: params.button_text,
                            url: params.button_url,
                          },
                        ]
                      : undefined,
                  },
                ],
              },
            ],
          },
        },
      }),
    })
  }

  /**
   * Get bot info (used for connection validation)
   * GET /fb/page/getInfo
   */
  async getBotInfo(): Promise<any> {
    const response = await this.request<{ data: any }>('/fb/page/getInfo')
    return response.data
  }
}

/**
 * Create ManyChat client from integration credentials
 */
export function createManyChatClient(apiKey: string): ManyChatClient {
  return new ManyChatClient({ apiKey })
}