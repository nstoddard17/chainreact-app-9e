import { 
  EmailProvider, 
  EmailMessage, 
  EmailResult, 
  EmailFilters, 
  GetMessagesParams, 
  LabelOperation, 
  LabelResult, 
  ContactFilters, 
  Contact 
} from '../../domains/integrations/ports/capability-interfaces'
import { CapabilityDescriptor, ErrorClassification } from '../../domains/integrations/ports/connector-contract'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'

export class MailchimpAdapter implements EmailProvider {
  readonly providerId = 'mailchimp'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 10, window: 1000 }, // 10 requests per second
      { type: 'requests', limit: 500, window: 60000 } // 500 requests per minute
    ],
    supportedFeatures: [
      'send_campaign',
      'create_campaign',
      'get_campaigns',
      'manage_lists',
      'add_subscriber',
      'update_subscriber',
      'get_subscribers',
      'create_template',
      'automation',
      'reports',
      'segments',
      'tags',
      'merge_fields'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const apiKey = await this.getMailchimpCredentials(userId)
      
      // Test Mailchimp API access with account info
      const response = await fetch(`https://${this.getDataCenter(apiKey.apiKey)}.api.mailchimp.com/3.0/`, {
        headers: {
          'Authorization': `apikey ${apiKey.apiKey}`,
          'Content-Type': 'application/json'
        }
      })
      
      return response.ok
    } catch {
      return false
    }
  }

  async sendMessage(params: EmailMessage, userId: string): Promise<EmailResult> {
    try {
      const credentials = await this.getMailchimpCredentials(userId)
      
      // Mailchimp doesn't send individual emails, it sends campaigns
      // We'll create and send a campaign instead
      
      // First create the campaign
      const campaignData = {
        type: 'regular',
        recipients: {
          list_id: credentials.defaultListId || await this.getDefaultListId(credentials.apiKey)
        },
        settings: {
          subject_line: params.subject,
          title: `Campaign: ${params.subject}`,
          from_name: 'ChainReact App',
          reply_to: 'noreply@chainreact.app'
        }
      }
      
      const createResponse = await fetch(`https://${this.getDataCenter(credentials.apiKey)}.api.mailchimp.com/3.0/campaigns`, {
        method: 'POST',
        headers: {
          'Authorization': `apikey ${credentials.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(campaignData)
      })
      
      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}))
        throw new Error(`Mailchimp campaign creation error: ${createResponse.status} - ${errorData.detail || createResponse.statusText}`)
      }
      
      const campaign = await createResponse.json()
      
      // Set campaign content
      const contentData = {
        html: params.body
      }
      
      const contentResponse = await fetch(`https://${this.getDataCenter(credentials.apiKey)}.api.mailchimp.com/3.0/campaigns/${campaign.id}/content`, {
        method: 'PUT',
        headers: {
          'Authorization': `apikey ${credentials.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(contentData)
      })
      
      if (!contentResponse.ok) {
        throw new Error('Failed to set campaign content')
      }
      
      // Send the campaign
      const sendResponse = await fetch(`https://${this.getDataCenter(credentials.apiKey)}.api.mailchimp.com/3.0/campaigns/${campaign.id}/actions/send`, {
        method: 'POST',
        headers: {
          'Authorization': `apikey ${credentials.apiKey}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!sendResponse.ok) {
        const errorData = await sendResponse.json().catch(() => ({}))
        throw new Error(`Failed to send campaign: ${sendResponse.status} - ${errorData.detail || sendResponse.statusText}`)
      }
      
      return {
        success: true,
        output: {
          messageId: campaign.id,
          campaignId: campaign.id,
          webId: campaign.web_id,
          mailchimpResponse: campaign
        },
        message: 'Campaign created and sent successfully via Mailchimp'
      }
    } catch (error: any) {
      console.error('Mailchimp send error:', error)
      return {
        success: false,
        error: error.message || 'Failed to send campaign via Mailchimp',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async searchMessages(filters: EmailFilters, userId: string): Promise<EmailMessage[]> {
    // Mailchimp doesn't support searching individual messages
    // Instead, we'll return campaigns
    try {
      const credentials = await this.getMailchimpCredentials(userId)
      
      const params = new URLSearchParams()
      params.append('count', (filters.limit || 25).toString())
      
      if (filters.dateRange) {
        params.append('since_send_time', filters.dateRange.start.toISOString())
        params.append('before_send_time', filters.dateRange.end.toISOString())
      }
      
      const response = await fetch(`https://${this.getDataCenter(credentials.apiKey)}.api.mailchimp.com/3.0/campaigns?${params.toString()}`, {
        headers: {
          'Authorization': `apikey ${credentials.apiKey}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get campaigns from Mailchimp')
      }
      
      const data = await response.json()
      
      return (data.campaigns || [])
        .filter((campaign: any) => !filters.subject || campaign.settings.subject_line.toLowerCase().includes(filters.subject.toLowerCase()))
        .map((campaign: any) => ({
          to: [], // Mailchimp campaigns go to lists, not individual emails
          subject: campaign.settings.subject_line,
          body: '', // Would need separate API call to get content
          metadata: {
            campaignId: campaign.id,
            webId: campaign.web_id,
            status: campaign.status,
            sendTime: campaign.send_time,
            recipientsCount: campaign.recipients?.recipient_count
          }
        }))
    } catch (error: any) {
      console.error('Mailchimp search error:', error)
      return []
    }
  }

  async getMessages(params: GetMessagesParams, userId: string): Promise<EmailMessage[]> {
    // Return campaigns instead of individual messages
    return this.searchMessages({ limit: params.limit }, userId)
  }

  async manageLabels(operation: LabelOperation, userId: string): Promise<LabelResult> {
    try {
      const credentials = await this.getMailchimpCredentials(userId)
      
      if (operation.type === 'create' && operation.labelName) {
        // Create a new list (Mailchimp equivalent of label)
        const listData = {
          name: operation.labelName,
          contact: {
            company: 'ChainReact App',
            address1: '',
            city: '',
            state: '',
            zip: '',
            country: 'US'
          },
          permission_reminder: 'You are receiving this email because you opted in to our mailing list.',
          campaign_defaults: {
            from_name: 'ChainReact',
            from_email: 'noreply@chainreact.app',
            subject: '',
            language: 'en'
          },
          email_type_option: false
        }
        
        const response = await fetch(`https://${this.getDataCenter(credentials.apiKey)}.api.mailchimp.com/3.0/lists`, {
          method: 'POST',
          headers: {
            'Authorization': `apikey ${credentials.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(listData)
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(`Failed to create list: ${response.status} - ${errorData.detail || response.statusText}`)
        }
        
        const result = await response.json()
        
        return {
          success: true,
          output: {
            listId: result.id,
            name: result.name,
            mailchimpResponse: result
          },
          message: 'Mailchimp list created successfully'
        }
      } 
        throw new Error('Unsupported label operation for Mailchimp')
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to manage labels in Mailchimp',
        output: { error: error.message }
      }
    }
  }

  async getContacts(filters?: ContactFilters, userId?: string): Promise<Contact[]> {
    if (!userId) {
      throw new Error('User ID is required for getContacts')
    }

    try {
      const credentials = await this.getMailchimpCredentials(userId)
      const listId = credentials.defaultListId || await this.getDefaultListId(credentials.apiKey)
      
      const params = new URLSearchParams()
      params.append('count', (filters?.limit || 100).toString())
      
      const response = await fetch(`https://${this.getDataCenter(credentials.apiKey)}.api.mailchimp.com/3.0/lists/${listId}/members?${params.toString()}`, {
        headers: {
          'Authorization': `apikey ${credentials.apiKey}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get contacts from Mailchimp')
      }
      
      const data = await response.json()
      
      return (data.members || [])
        .filter((member: any) => !filters?.email || member.email_address.toLowerCase().includes(filters.email.toLowerCase()))
        .filter((member: any) => !filters?.name || `${member.merge_fields?.FNAME || ''} ${member.merge_fields?.LNAME || ''}`.toLowerCase().includes(filters.name.toLowerCase()))
        .map((member: any) => ({
          id: member.id,
          name: `${member.merge_fields?.FNAME || ''} ${member.merge_fields?.LNAME || ''}`.trim(),
          email: member.email_address,
          phone: member.merge_fields?.PHONE,
          metadata: {
            status: member.status,
            listId: member.list_id,
            memberRating: member.member_rating,
            lastChanged: member.last_changed
          }
        }))
    } catch (error: any) {
      console.error('Mailchimp get contacts error:', error)
      return []
    }
  }

  private async getMailchimpCredentials(userId: string): Promise<{ apiKey: string; defaultListId?: string }> {
    // Get access token which should contain API key and optionally default list ID
    const accessToken = await getDecryptedAccessToken(userId, 'mailchimp')
    
    // Handle different credential formats
    try {
      const credentials = JSON.parse(accessToken)
      return {
        apiKey: credentials.apiKey || credentials.api_key,
        defaultListId: credentials.defaultListId || credentials.default_list_id
      }
    } catch {
      // Fallback: assume the token is just the API key
      return {
        apiKey: accessToken
      }
    }
  }

  private getDataCenter(apiKey: string): string {
    // Extract data center from API key (format: key-dc)
    const parts = apiKey.split('-')
    return parts.length > 1 ? parts[parts.length - 1] : 'us1'
  }

  private async getDefaultListId(apiKey: string): Promise<string> {
    const response = await fetch(`https://${this.getDataCenter(apiKey)}.api.mailchimp.com/3.0/lists?count=1`, {
      headers: {
        'Authorization': `apikey ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      throw new Error('Failed to get default list from Mailchimp')
    }
    
    const data = await response.json()
    
    if (!data.lists || data.lists.length === 0) {
      throw new Error('No lists found in Mailchimp account')
    }
    
    return data.lists[0].id
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('invalid api key') || message.includes('unauthorized')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('payment required')) {
      return 'authorization'
    }
    if (message.includes('too many requests') || message.includes('rate limit')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found') || message.includes('resource not found')) {
      return 'notFound'
    }
    if (message.includes('invalid') || message.includes('bad request')) {
      return 'validation'
    }
    if (message.includes('compliance') || message.includes('rejected')) {
      return 'validation'
    }
    
    return 'unknown'
  }
}