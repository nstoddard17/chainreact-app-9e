import { 
  CRMProvider, 
  CRMContact, 
  ContactResult, 
  Deal, 
  DealResult, 
  CRMFilters 
} from '../../domains/integrations/ports/capability-interfaces'
import { CapabilityDescriptor, ErrorClassification } from '../../domains/integrations/ports/connector-contract'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'

export class SalesforceAdapter implements CRMProvider {
  readonly providerId = 'salesforce'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 20, window: 1000 },    // 20 requests per second
      { type: 'requests', limit: 100000, window: 86400000 } // 100,000 requests per day
    ],
    supportedFeatures: [
      'create_contact',
      'update_contact',
      'delete_contact',
      'get_contacts',
      'create_lead',
      'update_lead',
      'convert_lead',
      'create_opportunity',
      'update_opportunity',
      'get_opportunities',
      'create_account',
      'update_account',
      'get_accounts',
      'create_case',
      'update_case',
      'get_cases',
      'custom_objects',
      'soql_queries',
      'bulk_operations',
      'reports',
      'dashboards',
      'approval_processes'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const credentials = await this.getSalesforceCredentials(userId)
      
      // Test Salesforce API access with org info
      const response = await fetch(`${credentials.instanceUrl}/services/data/v59.0/`, {
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      return response.ok
    } catch {
      return false
    }
  }

  async createContact(contact: CRMContact, userId: string): Promise<ContactResult> {
    try {
      const credentials = await this.getSalesforceCredentials(userId)
      
      const contactData = {
        FirstName: this.extractFirstName(contact.name),
        LastName: this.extractLastName(contact.name),
        Email: contact.email,
        Phone: contact.phone,
        Company: contact.company || 'Unknown',
        Title: contact.title,
        Description: contact.description
      }
      
      // Remove undefined fields
      Object.keys(contactData).forEach(key => {
        if (contactData[key as keyof typeof contactData] === undefined) {
          delete contactData[key as keyof typeof contactData]
        }
      })
      
      const response = await fetch(`${credentials.instanceUrl}/services/data/v59.0/sobjects/Contact`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(contactData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Salesforce API error: ${response.status} - ${errorData[0]?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          contactId: result.id,
          name: contact.name,
          email: contact.email,
          salesforceResponse: result
        },
        message: 'Contact created successfully in Salesforce'
      }
    } catch (error: any) {
      console.error('Salesforce create contact error:', error)
      return {
        success: false,
        error: error.message || 'Failed to create contact in Salesforce',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async updateContact(contactId: string, updates: Partial<CRMContact>, userId: string): Promise<ContactResult> {
    try {
      const credentials = await this.getSalesforceCredentials(userId)
      
      const updateData: any = {}
      
      if (updates.name) {
        updateData.FirstName = this.extractFirstName(updates.name)
        updateData.LastName = this.extractLastName(updates.name)
      }
      if (updates.email) updateData.Email = updates.email
      if (updates.phone) updateData.Phone = updates.phone
      if (updates.company) updateData.Company = updates.company
      if (updates.title) updateData.Title = updates.title
      if (updates.description) updateData.Description = updates.description
      
      const response = await fetch(`${credentials.instanceUrl}/services/data/v59.0/sobjects/Contact/${contactId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to update contact: ${response.status} - ${errorData[0]?.message || response.statusText}`)
      }
      
      return {
        success: true,
        output: {
          contactId: contactId,
          salesforceResponse: { id: contactId, success: true }
        },
        message: 'Contact updated successfully in Salesforce'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to update contact in Salesforce',
        output: { error: error.message }
      }
    }
  }

  async deleteContact(contactId: string, userId: string): Promise<void> {
    const credentials = await this.getSalesforceCredentials(userId)
    
    const response = await fetch(`${credentials.instanceUrl}/services/data/v59.0/sobjects/Contact/${contactId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to delete contact: ${response.status} - ${errorData[0]?.message || response.statusText}`)
    }
  }

  async getContacts(filters?: CRMFilters, userId?: string): Promise<CRMContact[]> {
    if (!userId) {
      throw new Error('User ID is required for getContacts')
    }

    try {
      const credentials = await this.getSalesforceCredentials(userId)
      
      // Build SOQL query
      let soql = 'SELECT Id, FirstName, LastName, Email, Phone, Company, Title, Description, CreatedDate, LastModifiedDate FROM Contact'
      const conditions: string[] = []
      
      if (filters?.email) {
        conditions.push(`Email LIKE '%${filters.email}%'`)
      }
      if (filters?.company) {
        conditions.push(`Company LIKE '%${filters.company}%'`)
      }
      
      if (conditions.length > 0) {
        soql += ` WHERE ${conditions.join(' AND ')}`
      }
      
      soql += ' ORDER BY LastModifiedDate DESC'
      
      if (filters?.limit) {
        soql += ` LIMIT ${Math.min(filters.limit, 2000)}`
      } else {
        soql += ' LIMIT 200'
      }
      
      const response = await fetch(`${credentials.instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, {
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get contacts from Salesforce')
      }
      
      const data = await response.json()
      
      return (data.records || []).map((record: any) => ({
        id: record.Id,
        name: `${record.FirstName || ''} ${record.LastName || ''}`.trim(),
        email: record.Email,
        phone: record.Phone,
        company: record.Company,
        title: record.Title,
        description: record.Description,
        metadata: {
          createdDate: record.CreatedDate,
          lastModifiedDate: record.LastModifiedDate,
          salesforceId: record.Id
        }
      }))
    } catch (error: any) {
      console.error('Salesforce get contacts error:', error)
      return []
    }
  }

  async createDeal(deal: Deal, userId: string): Promise<DealResult> {
    try {
      const credentials = await this.getSalesforceCredentials(userId)
      
      const opportunityData = {
        Name: deal.title,
        Amount: deal.amount,
        StageName: deal.stage || 'Prospecting',
        CloseDate: deal.closeDate ? deal.closeDate.toISOString().split('T')[0] : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
        Description: deal.description,
        LeadSource: deal.source,
        Type: deal.type
      }
      
      // Remove undefined fields
      Object.keys(opportunityData).forEach(key => {
        if (opportunityData[key as keyof typeof opportunityData] === undefined) {
          delete opportunityData[key as keyof typeof opportunityData]
        }
      })
      
      const response = await fetch(`${credentials.instanceUrl}/services/data/v59.0/sobjects/Opportunity`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(opportunityData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to create opportunity: ${response.status} - ${errorData[0]?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          dealId: result.id,
          title: deal.title,
          amount: deal.amount,
          salesforceResponse: result
        },
        message: 'Opportunity created successfully in Salesforce'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create opportunity in Salesforce',
        output: { error: error.message }
      }
    }
  }

  async updateDeal(dealId: string, updates: Partial<Deal>, userId: string): Promise<DealResult> {
    try {
      const credentials = await this.getSalesforceCredentials(userId)
      
      const updateData: any = {}
      
      if (updates.title) updateData.Name = updates.title
      if (updates.amount) updateData.Amount = updates.amount
      if (updates.stage) updateData.StageName = updates.stage
      if (updates.closeDate) updateData.CloseDate = updates.closeDate.toISOString().split('T')[0]
      if (updates.description) updateData.Description = updates.description
      if (updates.source) updateData.LeadSource = updates.source
      if (updates.type) updateData.Type = updates.type
      
      const response = await fetch(`${credentials.instanceUrl}/services/data/v59.0/sobjects/Opportunity/${dealId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to update opportunity: ${response.status} - ${errorData[0]?.message || response.statusText}`)
      }
      
      return {
        success: true,
        output: {
          dealId: dealId,
          salesforceResponse: { id: dealId, success: true }
        },
        message: 'Opportunity updated successfully in Salesforce'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to update opportunity in Salesforce',
        output: { error: error.message }
      }
    }
  }

  // Additional Salesforce-specific methods

  async createLead(leadData: any, userId: string): Promise<any> {
    try {
      const credentials = await this.getSalesforceCredentials(userId)
      
      const response = await fetch(`${credentials.instanceUrl}/services/data/v59.0/sobjects/Lead`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(leadData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to create lead: ${response.status} - ${errorData[0]?.message || response.statusText}`)
      }
      
      return response.json()
    } catch (error: any) {
      throw error
    }
  }

  async executeSOQL(query: string, userId: string): Promise<any> {
    try {
      const credentials = await this.getSalesforceCredentials(userId)
      
      const response = await fetch(`${credentials.instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`SOQL query failed: ${response.status} - ${errorData[0]?.message || response.statusText}`)
      }
      
      return response.json()
    } catch (error: any) {
      throw error
    }
  }

  async getOpportunities(filters?: any, userId?: string): Promise<Deal[]> {
    if (!userId) {
      throw new Error('User ID is required for getOpportunities')
    }

    try {
      const credentials = await this.getSalesforceCredentials(userId)
      
      let soql = 'SELECT Id, Name, Amount, StageName, CloseDate, Description, CreatedDate, LastModifiedDate FROM Opportunity'
      const conditions: string[] = []
      
      if (filters?.stage) {
        conditions.push(`StageName = '${filters.stage}'`)
      }
      if (filters?.amount) {
        conditions.push(`Amount >= ${filters.amount}`)
      }
      
      if (conditions.length > 0) {
        soql += ` WHERE ${conditions.join(' AND ')}`
      }
      
      soql += ' ORDER BY LastModifiedDate DESC'
      
      if (filters?.limit) {
        soql += ` LIMIT ${Math.min(filters.limit, 2000)}`
      } else {
        soql += ' LIMIT 200'
      }
      
      const response = await fetch(`${credentials.instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, {
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get opportunities from Salesforce')
      }
      
      const data = await response.json()
      
      return (data.records || []).map((record: any) => ({
        id: record.Id,
        title: record.Name,
        amount: record.Amount,
        stage: record.StageName,
        closeDate: record.CloseDate ? new Date(record.CloseDate) : undefined,
        description: record.Description,
        metadata: {
          createdDate: record.CreatedDate,
          lastModifiedDate: record.LastModifiedDate,
          salesforceId: record.Id
        }
      }))
    } catch (error: any) {
      console.error('Salesforce get opportunities error:', error)
      return []
    }
  }

  private async getSalesforceCredentials(userId: string): Promise<{ accessToken: string; instanceUrl: string }> {
    // Get access token which should contain both access token and instance URL
    const accessToken = await getDecryptedAccessToken(userId, 'salesforce')
    
    // Handle different credential formats
    try {
      const credentials = JSON.parse(accessToken)
      return {
        accessToken: credentials.accessToken || credentials.access_token,
        instanceUrl: credentials.instanceUrl || credentials.instance_url
      }
    } catch {
      // Fallback: assume the token contains accessToken|instanceUrl format
      const parts = accessToken.split('|')
      if (parts.length === 2) {
        return {
          accessToken: parts[0],
          instanceUrl: parts[1]
        }
      }
      
      throw new Error('Invalid Salesforce credentials format. Expected JSON or accessToken|instanceUrl format.')
    }
  }

  private extractFirstName(fullName: string): string {
    const parts = fullName.trim().split(' ')
    return parts[0] || ''
  }

  private extractLastName(fullName: string): string {
    const parts = fullName.trim().split(' ')
    return parts.length > 1 ? parts.slice(1).join(' ') : 'Unknown'
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('invalid_grant') || message.includes('unauthorized')) {
      return 'authentication'
    }
    if (message.includes('insufficient_access') || message.includes('insufficient_scope')) {
      return 'authorization'
    }
    if (message.includes('request_limit_exceeded') || message.includes('too_many_requests')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not_found') || message.includes('invalid_id')) {
      return 'notFound'
    }
    if (message.includes('required_field_missing') || message.includes('invalid_field')) {
      return 'validation'
    }
    if (message.includes('duplicate_value') || message.includes('duplicate_username')) {
      return 'validation'
    }
    if (message.includes('storage_limit_exceeded') || message.includes('license_limit_exceeded')) {
      return 'authorization'
    }
    
    return 'unknown'
  }
}