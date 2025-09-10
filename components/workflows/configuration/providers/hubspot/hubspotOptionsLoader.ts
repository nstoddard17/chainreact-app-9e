/**
 * HubSpot Options Loader
 * Handles dynamic option loading for HubSpot fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types'

export const hubspotOptionsLoader: ProviderOptionsLoader = {
  canHandle(fieldName: string, providerId: string): boolean {
    // Check if this is a HubSpot provider
    if (providerId !== 'hubspot') {
      return false
    }
    
    // List of fields this loader can handle
    const supportedFields = [
      'listId',
      'associatedCompanyId',
      'associatedContactId',
      'dealId',
      'jobtitle',
      'department',
      'industry'
    ]
    
    return supportedFields.includes(fieldName)
  },
  
  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, integrationId, searchQuery } = params
    
    console.log('🔍 HubSpot options loader called with params:', { 
      fieldName, 
      integrationId,
      integrationIdType: typeof integrationId,
      integrationIdValue: integrationId,
      hasIntegrationId: !!integrationId,
      searchQuery,
      allParams: JSON.stringify(params)
    })
    
    if (!integrationId) {
      console.error('❌ [HubSpot Loader] No integration ID provided. Please connect your HubSpot account first.')
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
      dealId: 'hubspot_deals',
      jobtitle: 'hubspot_job_titles',
      department: 'hubspot_departments',
      industry: 'hubspot_industries',
    }
    
    const dataType = fieldToDataType[fieldName]
    if (!dataType) {
      console.warn(`No data type mapping for HubSpot field: ${fieldName}`)
      return []
    }
    
    try {
      const requestBody = {
        integrationId,
        dataType,
        options: { searchQuery }
      }
      
      console.log('📡 [HubSpot Loader] Making API request:', {
        integrationId,
        dataType,
        fieldName,
        requestBody: JSON.stringify(requestBody),
        bodyToSend: JSON.stringify(requestBody)
      })
      
      // Make sure we have valid data before making the request
      if (!integrationId || typeof integrationId !== 'string') {
        console.error('❌ [HubSpot Loader] Invalid integration ID:', integrationId)
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
        console.error('❌ [HubSpot Loader] No response received')
        throw new Error('No response from server')
      }
      
      if (!response.ok) {
        let errorText = ''
        try {
          errorText = await response.text()
        } catch (e) {
          console.error('❌ [HubSpot Loader] Could not read error text:', e)
        }
        
        console.error('❌ [HubSpot Loader] API error:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText || '(empty error response)',
          dataType,
          integrationId,
          integrationIdType: typeof integrationId,
          hasIntegrationId: !!integrationId
        })
        
        // Parse error if it's JSON
        let errorMessage = `Failed to fetch HubSpot ${dataType}`
        if (errorText) {
          try {
            const errorData = JSON.parse(errorText)
            errorMessage = errorData.error || errorMessage
          } catch {
            // Use text as is if not JSON
            errorMessage = errorText.substring(0, 200) // Limit length
          }
        }
        
        throw new Error(errorMessage)
      }
      
      const result = await response.json()
      console.log('✅ [HubSpot Loader] API response:', {
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
      
      // For job titles, departments, industries - these might be simple string arrays
      if (['hubspot_job_titles', 'hubspot_departments', 'hubspot_industries'].includes(dataType)) {
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
      console.error(`Error loading HubSpot ${fieldName} options:`, error)
      return []
    }
  },
  
  // HubSpot doesn't use parent field dependencies like Airtable
  getFieldDependencies(fieldName: string): string[] {
    return []
  }
}