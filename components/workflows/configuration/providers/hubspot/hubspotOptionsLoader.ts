/**
 * HubSpot Options Loader
 * Handles dynamic option loading for HubSpot fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types'

import { logger } from '@/lib/utils/logger'
import { parseErrorAndHandleReconnection } from '@/lib/utils/integration-reconnection'

export const hubspotOptionsLoader: ProviderOptionsLoader = {
  canHandle(fieldName: string, providerId: string): boolean {
    // Check if this is a HubSpot provider
    if (providerId !== 'hubspot') {
      return false
    }
    
    // List of fields this loader can handle
    // NOTE: 'listId' is now handled by hubspotDynamicOptionsLoader for better handling
    const supportedFields = [
      'associatedCompanyId',
      'associatedContactId',
      'associatedDealId',
      'contactId',
      'companyId',
      'dealId',
      'ticketId',
      'jobtitle',
      'department',
      'industry',
      'filterByOwner',
      'hubspot_owner_id',
      'propertyName',
      'filterProperty',
      'filterPipeline',
      'filterStage',
      'filterByPipeline',
      'hs_pipeline',
      'hs_pipeline_stage',
      'hs_lead_status',
      'selectedProperties'
    ]
    
    return supportedFields.includes(fieldName)
  },
  
  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, integrationId, searchQuery } = params
    
    logger.debug('🔍 HubSpot options loader called with params:', { 
      fieldName, 
      integrationId,
      integrationIdType: typeof integrationId,
      integrationIdValue: integrationId,
      hasIntegrationId: !!integrationId,
      searchQuery,
      allParams: JSON.stringify(params)
    })
    
    if (!integrationId) {
      logger.error('❌ [HubSpot Loader] No integration ID provided. Please connect your HubSpot account first.')
      // Return message to user about needing to connect
      return [{
        value: '',
        label: 'Please connect your HubSpot account to load lists',
        disabled: true
      }]
    }
    
    // Map field names to their data types
    const fieldToDataType: Record<string, string> = {
      listId: 'hubspot_lists',
      associatedCompanyId: 'hubspot_companies',
      associatedContactId: 'hubspot_contacts',
      associatedDealId: 'hubspot_deals',
      contactId: 'hubspot_contacts',
      companyId: 'hubspot_companies',
      dealId: 'hubspot_deals',
      ticketId: 'hubspot_tickets',
      jobtitle: 'hubspot_job_titles',
      department: 'hubspot_departments',
      industry: 'hubspot_industries',
      filterByOwner: 'hubspot_owners',
      hubspot_owner_id: 'hubspot_owners',
      propertyName: 'hubspot_contact_properties', // Default to contact properties
      filterProperty: 'hubspot_contact_properties', // Default to contact properties until nodeType inspected
      filterPipeline: 'hubspot_ticket_pipelines',
      filterStage: 'hubspot_ticket_stages',
      filterByPipeline: 'hubspot_pipelines',
      hs_pipeline: 'hubspot_ticket_pipelines',
      hs_pipeline_stage: 'hubspot_ticket_stages',
      hs_lead_status: 'hubspot_lead_status_options',
      selectedProperties: 'hubspot_contact_properties',
    }

    const resolvePropertyDataType = (nodeType?: string) => {
      if (!nodeType) return 'hubspot_contact_properties'
      const normalized = nodeType.toLowerCase()

      if (normalized.includes('deal')) {
        return 'hubspot_deal_properties'
      }

      if (normalized.includes('company')) {
        return 'hubspot_company_properties'
      }

      if (normalized.includes('ticket')) {
        return 'hubspot_ticket_properties'
      }

      return 'hubspot_contact_properties'
    }

    // Special handling: determine if propertyName is for contacts, deals, or companies based on provider context
    // We need to check the node type to determine which properties to load
    let dataType = fieldToDataType[fieldName]

    // If it's propertyName or filterProperty field, detect which object type is in use
    if ((fieldName === 'propertyName' || fieldName === 'filterProperty')) {
      dataType = resolvePropertyDataType(params.nodeType)
    }
    if (!dataType) {
      logger.warn(`No data type mapping for HubSpot field: ${fieldName}`)
      return []
    }
    
    try {
      // Special handling for fields that depend on parent values
      const options: any = { searchQuery }

      // For ticket stages, we need the pipeline parameter
      if ((fieldName === 'hs_pipeline_stage' || fieldName === 'filterStage') && params.dependsOnValue) {
        options.pipeline = params.dependsOnValue
      }

      const requestBody = {
        integrationId,
        dataType,
        options
      }
      
      logger.debug('📡 [HubSpot Loader] Making API request:', {
        integrationId,
        dataType,
        fieldName,
        requestBody: JSON.stringify(requestBody),
        bodyToSend: JSON.stringify(requestBody)
      })
      
      // Make sure we have valid data before making the request
      if (!integrationId || typeof integrationId !== 'string') {
        logger.error('❌ [HubSpot Loader] Invalid integration ID:', integrationId)
        return []
      }
      
      const response = await fetch('/api/integrations/hubspot/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      })
      
      if (!response) {
        logger.error('❌ [HubSpot Loader] No response received')
        throw new Error('No response from server')
      }
      
      if (!response.ok) {
        let errorText = ''
        try {
          errorText = await response.text()
        } catch (e) {
          logger.error('❌ [HubSpot Loader] Could not read error text:', e)
        }
        
        logger.error('❌ [HubSpot Loader] API error:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText || '(empty error response)',
          dataType,
          integrationId,
          integrationIdType: typeof integrationId,
          hasIntegrationId: !!integrationId
        })
        
        // Parse error and handle reconnection if needed
        const errorMessage = await parseErrorAndHandleReconnection(
          errorText,
          'hubspot',
          `Failed to fetch HubSpot ${dataType}`
        )

        throw new Error(errorMessage)
      }
      
      const result = await response.json()
      logger.debug('✅ [HubSpot Loader] API response:', {
        dataType,
        dataLength: result.data?.length || 0,
        success: result.success
      })
      
      // Format the response based on data type
      if (dataType === 'hubspot_lists') {
        // Filter to only show manual lists (not dynamic lists)
        const manualLists = (result.data || []).filter((list: any) => 
          list.listType === 'MANUAL' || list.listType === 'STATIC'
        )
        
        return manualLists.map((list: any) => ({
          value: list.listId.toString(),
          label: `${list.name} (${list.size || 0} contacts)`
        }))
      }
      
      if (dataType === 'hubspot_companies') {
        return (result.data || []).map((company: any) => ({
          value: company.id,
          label: company.properties?.name || `Company ${company.id}`
        }))
      }
      
      if (dataType === 'hubspot_contacts') {
        return (result.data || []).map((contact: any) => {
          const name = [contact.properties?.firstname, contact.properties?.lastname]
            .filter(Boolean)
            .join(' ') || contact.properties?.email || `Contact ${contact.id}`
          return {
            value: contact.id,
            label: contact.properties?.email ? `${name} (${contact.properties.email})` : name
          }
        })
      }
      
      if (dataType === 'hubspot_deals') {
        return (result.data || []).map((deal: any) => ({
          value: deal.id,
          label: deal.properties?.dealname || `Deal ${deal.id}`
        }))
      }

      if (dataType === 'hubspot_owners') {
        return (result.data || []).map((owner: any) => ({
          value: owner.id,
          label: owner.email ? `${owner.firstName || ''} ${owner.lastName || ''} (${owner.email})`.trim() :
                 `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || `Owner ${owner.id}`
        }))
      }

      if (dataType === 'hubspot_contact_properties') {
        return (result.data || []).map((property: any) => ({
          value: property.name,
          label: property.label ? `${property.label} (${property.name})` : property.name,
          raw: property
        }))
      }

      if (dataType === 'hubspot_deal_properties') {
        return (result.data || []).map((property: any) => ({
          value: property.name,
          label: property.label ? `${property.label} (${property.name})` : property.name,
          raw: property
        }))
      }

      if (dataType === 'hubspot_company_properties') {
        return (result.data || []).map((property: any) => ({
          value: property.name,
          label: property.label ? `${property.label} (${property.name})` : property.name,
          raw: property
        }))
      }

      if (dataType === 'hubspot_ticket_properties') {
        return (result.data || []).map((property: any) => ({
          value: property.name,
          label: property.label ? `${property.label} (${property.name})` : property.name,
          raw: property
        }))
      }

      if (dataType === 'hubspot_pipelines') {
        return (result.data || []).map((pipeline: any) => ({
          value: pipeline.id,
          label: pipeline.label || pipeline.name || `Pipeline ${pipeline.id}`,
          raw: pipeline
        }))
      }

      if (dataType === 'hubspot_ticket_pipelines') {
        return (result.data || []).map((pipeline: any) => ({
          value: pipeline.id,
          label: pipeline.label || pipeline.name || `Pipeline ${pipeline.id}`,
          raw: pipeline
        }))
      }

      if (dataType === 'hubspot_ticket_stages') {
        return (result.data || []).map((stage: any) => ({
          value: stage.id,
          label: stage.label || stage.name || `Stage ${stage.id}`,
          raw: stage
        }))
      }

      if (dataType === 'hubspot_tickets') {
        return (result.data || []).map((ticket: any) => ({
          value: ticket.id,
          label: ticket.properties?.subject || `Ticket ${ticket.id}`,
          raw: ticket
        }))
      }

      // For job titles, departments, industries, lead status - these might be simple string arrays or option objects
      if (['hubspot_job_titles', 'hubspot_departments', 'hubspot_industries', 'hubspot_lead_status_options', 'hubspot_content_topics_options', 'hubspot_preferred_channels_options'].includes(dataType)) {
        return (result.data || []).map((item: any) => ({
          value: typeof item === 'string' ? item : item.value || item.id,
          label: typeof item === 'string' ? item : item.label || item.name || item.value
        }))
      }
      
      // Default mapping
      return (result.data || []).map((item: any) => ({
        value: item.id || item.value,
        label: item.name || item.label || item.title || `Item ${item.id}`
      }))
      
    } catch (error) {
      logger.error(`Error loading HubSpot ${fieldName} options:`, error)
      return []
    }
  },
  
  // HubSpot doesn't use parent field dependencies like Airtable
  getFieldDependencies(fieldName: string): string[] {
    return []
  }
}
