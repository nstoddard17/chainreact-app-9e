/**
 * Airtable Field Values Handler
 * Returns unique values from a specific field in a table for filtering purposes
 */

import { AirtableIntegration, AirtableDataHandler, AirtableHandlerOptions } from '../types'
import { validateAirtableIntegration, validateAirtableToken, makeAirtableApiRequest, parseAirtableApiResponse, buildAirtableApiUrl } from '../utils'

export interface AirtableFieldValue {
  value: string
  label: string
  count?: number
}

export const getAirtableFieldValues: AirtableDataHandler<AirtableFieldValue> = async (integration: AirtableIntegration, options: AirtableHandlerOptions = {}): Promise<AirtableFieldValue[]> => {
  const { baseId, tableName, filterField } = options
  
  console.log("🔍 Airtable field values fetcher called with:", {
    integrationId: integration.id,
    baseId,
    tableName,
    filterField,
    hasToken: !!integration.access_token
  })
  
  try {
    // Validate integration status
    validateAirtableIntegration(integration)
    
    console.log(`🔍 Validating Airtable token...`)
    const tokenResult = await validateAirtableToken(integration)
    
    if (!tokenResult.success) {
      console.log(`❌ Airtable token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }
    
    if (!baseId || !tableName || !filterField) {
      throw new Error('Base ID, table name, and filter field are required for fetching field values')
    }
    
    console.log('🔍 Fetching Airtable records to extract field values...')
    
    // Build the URL for getting records from the table
    const url = new URL(buildAirtableApiUrl(`/v0/${baseId}/${encodeURIComponent(tableName)}`))
    // Only fetch the specific field we need + id for efficiency
    url.searchParams.append('fields[]', filterField)
    url.searchParams.append('maxRecords', '1000') // Get enough records to capture all unique values
    
    const response = await makeAirtableApiRequest(url.toString(), tokenResult.token!)
    const recordsData = await parseAirtableApiResponse(response)
    
    // Extract unique values from the specified field
    const valueCount: Record<string, number> = {}
    
    recordsData.records?.forEach((record: any) => {
      const fieldValue = record.fields?.[filterField]
      
      if (fieldValue != null) {
        // Handle different field types
        let values: string[] = []
        
        if (Array.isArray(fieldValue)) {
          // Handle multi-select, linked records, etc.
          values = fieldValue.map(v => typeof v === 'object' ? (v.name || v.value || String(v)) : String(v))
        } else if (typeof fieldValue === 'object') {
          // Handle objects (like user references)
          values = [fieldValue.name || fieldValue.email || fieldValue.value || String(fieldValue)]
        } else {
          // Handle simple values
          values = [String(fieldValue)]
        }
        
        // Count occurrences
        values.forEach(value => {
          if (value && value.trim()) {
            const cleanValue = value.trim()
            valueCount[cleanValue] = (valueCount[cleanValue] || 0) + 1
          }
        })
      }
    })
    
    // Convert to array and sort by frequency (most common first)
    const fieldValues: AirtableFieldValue[] = Object.entries(valueCount)
      .map(([value, count]) => ({
        value,
        label: value,
        count
      }))
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 100) // Limit to top 100 values for UI performance
    
    console.log(`✅ Airtable field values fetched successfully: ${fieldValues.length} unique values from field "${filterField}" in table "${tableName}"`)
    return fieldValues
    
  } catch (error: any) {
    console.error("Error fetching Airtable field values:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Airtable authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Airtable API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Airtable field values")
  }
}