/**
 * Airtable Single Record Handler
 */

import { AirtableIntegration, AirtableRecord, AirtableDataHandler, AirtableHandlerOptions } from '../types'
import { validateAirtableIntegration, validateAirtableToken, makeAirtableApiRequest, parseAirtableApiResponse, buildAirtableApiUrl } from '../utils'

export const getAirtableSingleRecord: AirtableDataHandler<AirtableRecord> = async (integration: AirtableIntegration, options: AirtableHandlerOptions = {}): Promise<AirtableRecord> => {
  const { baseId, tableName, recordId } = options
  
  console.log("🔍 Airtable single record fetcher called with:", {
    integrationId: integration.id,
    baseId,
    tableName,
    recordId,
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
    
    if (!baseId) {
      throw new Error('Base ID is required for fetching a record')
    }
    
    if (!tableName) {
      throw new Error('Table name is required for fetching a record')
    }
    
    if (!recordId) {
      throw new Error('Record ID is required for fetching a record')
    }
    
    console.log('🔍 Fetching single Airtable record from API...')
    
    const apiUrl = buildAirtableApiUrl(`/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`)
    
    const response = await makeAirtableApiRequest(apiUrl, tokenResult.token!)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to fetch record: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }
    
    const record = await response.json()
    
    console.log(`✅ Airtable record fetched successfully: ${record.id}`)
    return record as AirtableRecord
    
  } catch (error: any) {
    console.error("Error fetching Airtable single record:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Airtable authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Airtable API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Airtable record")
  }
}