import { BaseProvider, ProviderConfig } from '../provider-sdk'
import { 
  CRMProvider, 
  CRMContact, 
  ContactResult, 
  Deal, 
  DealResult, 
  CRMFilters 
} from '../../domains/integrations/ports/capability-interfaces'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'

import { logger } from '@/lib/utils/logger'

/**
 * Template for CRM Provider integrations
 * 
 * This template provides a starting point for implementing CRM integrations.
 * Copy this file and customize it for your specific CRM API.
 * 
 * INSTRUCTIONS:
 * 1. Replace "Template" with your CRM name (e.g., "Pipedrive", "HubSpot")
 * 2. Update the config object with your API details
 * 3. Implement the abstract methods
 * 4. Customize the API endpoints and data mapping
 * 5. Add any additional CRM-specific methods
 */

export class TemplateCRMAdapter extends BaseProvider implements CRMProvider {
  constructor() {
    const config: ProviderConfig = {
      providerId: 'template-crm', // TODO: Change to your CRM ID
      name: 'Template CRM', // TODO: Change to your CRM name
      version: '1.0.0',
      description: 'Template CRM integration', // TODO: Add description
      capabilities: ['crm'],
      features: [
        'create_contact',
        'update_contact',
        'delete_contact',
        'get_contacts',
        'create_deal',
        'update_deal',
        'get_deals'
      ],
      rateLimits: [
        { type: 'requests', limit: 10, window: 1000 }, // TODO: Adjust based on your API
        { type: 'requests', limit: 1000, window: 60000 }
      ],
      supportsWebhooks: true, // TODO: Set based on your API capabilities
      authType: 'oauth2', // TODO: Change if different (api_key, bearer_token, etc.)
      baseUrl: 'https://api.example-crm.com', // TODO: Change to your API base URL
      apiVersion: 'v1' // TODO: Set your API version
    }
    
    super(config)
  }

  /**
   * Validate connection to the CRM API
   */
  async validateConnection(userId: string): Promise<boolean> {
    try {
      // TODO: Replace with your API's health check endpoint
      const response = await this.get('/user/me', userId)
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
   * Create a new contact in the CRM
   */
  async createContact(contact: CRMContact, userId: string): Promise<ContactResult> {
    try {
      // TODO: Map CRMContact to your API format
      const contactData = {
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
        title: contact.title,
        notes: contact.description,
        // TODO: Add any additional fields your API requires
      }

      // TODO: Replace with your API endpoint
      const result = await this.post('/contacts', contactData, userId)
      
      return this.createSuccessResult({
        contactId: result.id, // TODO: Adjust based on your API response
        name: result.name,
        email: result.email,
        crmResponse: result
      }, 'Contact created successfully')

    } catch (error: any) {
      return this.createErrorResult(error)
    }
  }

  /**
   * Update an existing contact
   */
  async updateContact(contactId: string, updates: Partial<CRMContact>, userId: string): Promise<ContactResult> {
    try {
      // TODO: Map updates to your API format
      const updateData = {
        ...(updates.name && { name: updates.name }),
        ...(updates.email && { email: updates.email }),
        ...(updates.phone && { phone: updates.phone }),
        ...(updates.company && { company: updates.company }),
        ...(updates.title && { title: updates.title }),
        ...(updates.description && { notes: updates.description }),
      }

      // TODO: Replace with your API endpoint
      const result = await this.put(`/contacts/${contactId}`, updateData, userId)
      
      return this.createSuccessResult({
        contactId: result.id,
        crmResponse: result
      }, 'Contact updated successfully')

    } catch (error: any) {
      return this.createErrorResult(error)
    }
  }

  /**
   * Delete a contact
   */
  async deleteContact(contactId: string, userId: string): Promise<void> {
    // TODO: Replace with your API endpoint
    await this.delete(`/contacts/${contactId}`, userId)
  }

  /**
   * Get contacts with optional filtering
   */
  async getContacts(filters?: CRMFilters, userId?: string): Promise<CRMContact[]> {
    if (!userId) {
      throw new Error('User ID is required')
    }

    try {
      // TODO: Build query parameters based on your API
      const params: Record<string, string> = {}
      
      if (filters?.company) {
        params.company = filters.company
      }
      if (filters?.email) {
        params.email = filters.email
      }
      if (filters?.limit) {
        params.limit = filters.limit.toString()
      }

      // TODO: Replace with your API endpoint
      const response = await this.get('/contacts', userId, params)
      
      // TODO: Map your API response to CRMContact format
      return (response.contacts || response.data || []).map((contact: any) => ({
        id: contact.id,
        name: contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
        email: contact.email,
        phone: contact.phone,
        company: contact.company || contact.organization,
        title: contact.title || contact.job_title,
        description: contact.notes || contact.description,
        metadata: {
          createdAt: contact.created_at,
          updatedAt: contact.updated_at,
          // TODO: Add any additional metadata from your API
        }
      }))

    } catch (error: any) {
      logger.error('CRM get contacts error:', error)
      return []
    }
  }

  /**
   * Create a new deal/opportunity
   */
  async createDeal(deal: Deal, userId: string): Promise<DealResult> {
    try {
      // TODO: Map Deal to your API format
      const dealData = {
        title: deal.title,
        value: deal.amount,
        stage: deal.stage,
        contact_id: deal.contactId,
        description: deal.description,
        close_date: deal.closeDate?.toISOString(),
        // TODO: Add any additional fields your API requires
      }

      // TODO: Replace with your API endpoint
      const result = await this.post('/deals', dealData, userId)
      
      return this.createSuccessResult({
        dealId: result.id,
        title: result.title,
        amount: result.value,
        crmResponse: result
      }, 'Deal created successfully')

    } catch (error: any) {
      return this.createErrorResult(error)
    }
  }

  /**
   * Update an existing deal
   */
  async updateDeal(dealId: string, updates: Partial<Deal>, userId: string): Promise<DealResult> {
    try {
      // TODO: Map updates to your API format
      const updateData = {
        ...(updates.title && { title: updates.title }),
        ...(updates.amount && { value: updates.amount }),
        ...(updates.stage && { stage: updates.stage }),
        ...(updates.description && { description: updates.description }),
        ...(updates.closeDate && { close_date: updates.closeDate.toISOString() }),
      }

      // TODO: Replace with your API endpoint
      const result = await this.put(`/deals/${dealId}`, updateData, userId)
      
      return this.createSuccessResult({
        dealId: result.id,
        crmResponse: result
      }, 'Deal updated successfully')

    } catch (error: any) {
      return this.createErrorResult(error)
    }
  }

  // TODO: Add any additional CRM-specific methods
  // Examples:
  // - getDeals()
  // - createCompany()
  // - getActivities()
  // - createTask()
  // - getCustomFields()
  // - createNote()
}

/**
 * Registration function for this provider
 * Add this to your bootstrap file
 */
export function registerTemplateCRMProvider(): void {
  const adapter = new TemplateCRMAdapter()
  
  // TODO: Update import and registration code in your bootstrap file:
  /*
  import { TemplateCRMAdapter } from '../providers/template-crm-adapter'
  
  function registerTemplateCRMProvider(): void {
    const adapter = new TemplateCRMAdapter()
    
    providerRegistry.register(
      adapter,
      ['crm'],
      { name: 'Template CRM', version: '1.0.0' }
    )

    actionRegistry.registerProvider('template-crm', [
      {
        actionType: 'create_contact',
        handler: async (config, context) => {
          const provider = providerRegistry.getCRMProvider('template-crm')
          if (!provider) throw new Error('Template CRM provider not available')
          
          return provider.createContact({
            name: config.parameters.name,
            email: config.parameters.email,
            phone: config.parameters.phone,
            company: config.parameters.company,
            title: config.parameters.title,
            description: config.parameters.description
          }, context.userId)
        },
        metadata: {
          name: 'Create Contact',
          description: 'Create a new contact in Template CRM',
          version: '1.0.0',
          category: 'crm'
        }
      },
      // TODO: Add more actions as needed
    ])

    logger.debug('✅ Template CRM provider registered')
  }
  */
}