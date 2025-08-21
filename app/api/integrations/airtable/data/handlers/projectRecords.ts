/**
 * Airtable Project Records Handler
 */

import { AirtableIntegration, AirtableProjectRecord, AirtableDataHandler, AirtableHandlerOptions } from '../types'
import { validateAirtableIntegration, validateAirtableToken, makeAirtableApiRequest, parseAirtableApiResponse, buildAirtableApiUrl } from '../utils'

export const getAirtableProjectRecords: AirtableDataHandler<AirtableProjectRecord> = async (integration: AirtableIntegration, options: AirtableHandlerOptions = {}): Promise<AirtableProjectRecord[]> => {
  const { baseId } = options
  
  console.log("🔍 Airtable project records fetcher called with:", {
    integrationId: integration.id,
    baseId,
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
      throw new Error('Base ID is required for fetching project records')
    }
    
    console.log('🔍 Fetching Airtable project records from API...')
    
    // Try common project table names
    const possibleTableNames = ['Projects', 'Project List', 'Project Management', 'Initiatives', 'Campaigns', 'Work']
    let records: AirtableProjectRecord[] = []
    
    for (const tableName of possibleTableNames) {
      try {
        const apiUrl = buildAirtableApiUrl(`/v0/${baseId}/${encodeURIComponent(tableName)}?maxRecords=100`)
        const response = await makeAirtableApiRequest(apiUrl, tokenResult.token!)
        
        if (response.ok) {
          const tableRecords = await parseAirtableApiResponse<AirtableProjectRecord>(response)
          console.log(`✅ Found project table: ${tableName} with ${tableRecords.length} records`)
          records = tableRecords
          break
        }
      } catch (error) {
        console.log(`❌ Table ${tableName} not found, trying next...`)
        continue
      }
    }
    
    if (records.length === 0) {
      console.log('📝 No project table found, returning empty array')
    }
    
    console.log(`✅ Airtable project records fetched successfully: ${records.length} records`)
    return records
    
  } catch (error: any) {
    console.error("Error fetching Airtable project records:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Airtable authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Airtable API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Airtable project records")
  }
}