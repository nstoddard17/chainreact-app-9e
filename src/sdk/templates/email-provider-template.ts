import { BaseProvider, ProviderConfig } from '../provider-sdk'
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
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'

/**
 * Template for Email Provider integrations
 * 
 * This template provides a starting point for implementing email integrations.
 * Copy this file and customize it for your specific email API.
 * 
 * INSTRUCTIONS:
 * 1. Replace "Template" with your email service name (e.g., "SendGrid", "Mailgun")
 * 2. Update the config object with your API details
 * 3. Implement the abstract methods
 * 4. Customize the API endpoints and data mapping
 * 5. Add any additional email-specific methods
 */

export class TemplateEmailAdapter extends BaseProvider implements EmailProvider {
  constructor() {
    const config: ProviderConfig = {
      providerId: 'template-email', // TODO: Change to your email service ID
      name: 'Template Email', // TODO: Change to your email service name
      version: '1.0.0',
      description: 'Template email integration', // TODO: Add description
      capabilities: ['email'],
      features: [
        'send_message',
        'search_messages',
        'get_messages',
        'manage_labels',
        'get_contacts',
        'templates',
        'attachments',
        'scheduling'
      ],
      rateLimits: [
        { type: 'requests', limit: 5, window: 1000 }, // TODO: Adjust based on your API
        { type: 'requests', limit: 1000, window: 60000 }
      ],
      supportsWebhooks: true, // TODO: Set based on your API capabilities
      authType: 'api_key', // TODO: Change if different (oauth2, bearer_token, etc.)
      baseUrl: 'https://api.example-email.com', // TODO: Change to your API base URL
      apiVersion: 'v3' // TODO: Set your API version
    }
    
    super(config)
  }

  /**
   * Validate connection to the Email API
   */
  async validateConnection(userId: string): Promise<boolean> {
    try {
      // TODO: Replace with your API's health check endpoint
      const response = await this.get('/account', userId)
      return !!response
    } catch {
      return false
    }
  }

  /**
   * Get access token for API requests
   */
  protected async getAccessToken(userId: string): Promise<string> {
    return getDecryptedAccessToken(userId, this.config.providerId)
  }

  /**
   * Send an email message
   */
  async sendMessage(params: EmailMessage, userId: string): Promise<EmailResult> {
    try {
      // TODO: Map EmailMessage to your API format
      const messageData = {
        to: params.to,
        cc: params.cc,
        bcc: params.bcc,
        subject: params.subject,
        html: params.body,
        // TODO: Handle attachments based on your API
        attachments: params.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          type: att.contentType
        })),
        // TODO: Add any additional fields your API requires
      }

      // TODO: Replace with your API endpoint
      const result = await this.post('/mail/send', messageData, userId)
      
      return this.createSuccessResult({
        messageId: result.message_id || result.id,
        status: result.status || 'sent',
        emailResponse: result
      }, 'Email sent successfully')

    } catch (error: any) {
      return this.createErrorResult(error)
    }
  }

  /**
   * Search for email messages
   */
  async searchMessages(filters: EmailFilters, userId: string): Promise<EmailMessage[]> {
    try {
      // TODO: Build query parameters based on your API
      const params: Record<string, string> = {}
      
      if (filters.from) {
        params.from = filters.from
      }
      if (filters.to) {
        params.to = filters.to
      }
      if (filters.subject) {
        params.subject = filters.subject
      }
      if (filters.dateRange) {
        params.start_date = filters.dateRange.start.toISOString()
        params.end_date = filters.dateRange.end.toISOString()
      }
      if (filters.limit) {
        params.limit = filters.limit.toString()
      }

      // TODO: Replace with your API endpoint
      const response = await this.get('/messages/search', userId, params)
      
      // TODO: Map your API response to EmailMessage format
      return (response.messages || response.data || []).map((message: any) => ({
        to: message.to || [],
        cc: message.cc || [],
        bcc: message.bcc || [],
        subject: message.subject || '',
        body: message.html || message.text || '',
        attachments: message.attachments?.map((att: any) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.content_type || att.type,
          size: att.size
        })) || [],
        metadata: {
          messageId: message.id,
          timestamp: message.timestamp || message.created_at,
          status: message.status,
          // TODO: Add any additional metadata from your API
        }
      }))

    } catch (error: any) {
      console.error('Email search error:', error)
      return []
    }
  }

  /**
   * Get email messages
   */
  async getMessages(params: GetMessagesParams, userId: string): Promise<EmailMessage[]> {
    try {
      // TODO: Build query parameters based on your API
      const queryParams: Record<string, string> = {}
      
      if (params.limit) {
        queryParams.limit = params.limit.toString()
      }
      if (params.pageToken) {
        queryParams.page_token = params.pageToken
      }

      // TODO: Replace with your API endpoint
      const response = await this.get('/messages', userId, queryParams)
      
      // TODO: Map your API response to EmailMessage format
      return (response.messages || response.data || []).map((message: any) => ({
        to: message.to || [],
        cc: message.cc || [],
        bcc: message.bcc || [],
        subject: message.subject || '',
        body: message.html || message.text || '',
        metadata: {
          messageId: message.id,
          timestamp: message.timestamp || message.created_at,
          // TODO: Add any additional metadata from your API
        }
      }))

    } catch (error: any) {
      console.error('Get messages error:', error)
      return []
    }
  }

  /**
   * Manage labels/folders (if supported by your API)
   */
  async manageLabels(operation: LabelOperation, userId: string): Promise<LabelResult> {
    try {
      switch (operation.type) {
        case 'create':
          if (!operation.labelName) {
            throw new Error('Label name is required for create operation')
          }
          
          // TODO: Replace with your API endpoint for creating labels
          const result = await this.post('/labels', { name: operation.labelName }, userId)
          
          return this.createSuccessResult({
            labelId: result.id,
            name: result.name,
            emailResponse: result
          }, 'Label created successfully')

        case 'delete':
          if (!operation.labelIds || operation.labelIds.length === 0) {
            throw new Error('Label IDs are required for delete operation')
          }
          
          // TODO: Replace with your API endpoint for deleting labels
          for (const labelId of operation.labelIds) {
            await this.delete(`/labels/${labelId}`, userId)
          }
          
          return this.createSuccessResult({
            deletedLabels: operation.labelIds
          }, 'Labels deleted successfully')

        case 'add':
        case 'remove':
          // TODO: Implement label assignment/removal if supported
          throw new Error(`Label operation '${operation.type}' not implemented`)

        default:
          throw new Error(`Unsupported label operation: ${operation.type}`)
      }

    } catch (error: any) {
      return this.createErrorResult(error)
    }
  }

  /**
   * Get contacts from the email service
   */
  async getContacts(filters?: ContactFilters, userId?: string): Promise<Contact[]> {
    if (!userId) {
      throw new Error('User ID is required')
    }

    try {
      // TODO: Build query parameters based on your API
      const params: Record<string, string> = {}
      
      if (filters?.name) {
        params.name = filters.name
      }
      if (filters?.email) {
        params.email = filters.email
      }
      if (filters?.limit) {
        params.limit = filters.limit.toString()
      }

      // TODO: Replace with your API endpoint
      const response = await this.get('/contacts', userId, params)
      
      // TODO: Map your API response to Contact format
      return (response.contacts || response.data || []).map((contact: any) => ({
        id: contact.id,
        name: contact.name || contact.display_name,
        email: contact.email || contact.email_address,
        phone: contact.phone,
        metadata: {
          createdAt: contact.created_at,
          lastActivity: contact.last_activity,
          // TODO: Add any additional metadata from your API
        }
      }))

    } catch (error: any) {
      console.error('Get contacts error:', error)
      return []
    }
  }

  // TODO: Add any additional email-specific methods
  // Examples:
  // - sendTemplate()
  // - scheduleMessage()
  // - getDeliveryStats()
  // - manageBounces()
  // - getUnsubscribes()
  // - createTemplate()
  // - trackOpens()
  // - trackClicks()
}

/**
 * Registration function for this provider
 * Add this to your bootstrap file
 */
export function registerTemplateEmailProvider(): void {
  const adapter = new TemplateEmailAdapter()
  
  // TODO: Update import and registration code in your bootstrap file:
  /*
  import { TemplateEmailAdapter } from '../providers/template-email-adapter'
  
  function registerTemplateEmailProvider(): void {
    const adapter = new TemplateEmailAdapter()
    
    providerRegistry.register(
      adapter,
      ['email'],
      { name: 'Template Email', version: '1.0.0' }
    )

    actionRegistry.registerProvider('template-email', [
      {
        actionType: 'send_email',
        handler: async (config, context) => {
          const provider = providerRegistry.getEmailProvider('template-email')
          if (!provider) throw new Error('Template Email provider not available')
          
          return provider.sendMessage({
            to: config.parameters.to || [],
            cc: config.parameters.cc || [],
            bcc: config.parameters.bcc || [],
            subject: config.parameters.subject,
            body: config.parameters.body || config.parameters.html,
            attachments: config.parameters.attachments || []
          }, context.userId)
        },
        metadata: {
          name: 'Send Email',
          description: 'Send an email via Template Email',
          version: '1.0.0',
          category: 'email'
        }
      },
      {
        actionType: 'search_emails',
        handler: async (config, context) => {
          const provider = providerRegistry.getEmailProvider('template-email')
          if (!provider) throw new Error('Template Email provider not available')
          
          return provider.searchMessages({
            from: config.parameters.from,
            to: config.parameters.to,
            subject: config.parameters.subject,
            limit: config.parameters.limit || 25,
            dateRange: config.parameters.startDate && config.parameters.endDate ? {
              start: new Date(config.parameters.startDate),
              end: new Date(config.parameters.endDate)
            } : undefined
          }, context.userId)
        },
        metadata: {
          name: 'Search Emails',
          description: 'Search emails in Template Email',
          version: '1.0.0',
          category: 'email'
        }
      },
      // TODO: Add more actions as needed
    ])

    console.log('✅ Template Email provider registered')
  }
  */
}