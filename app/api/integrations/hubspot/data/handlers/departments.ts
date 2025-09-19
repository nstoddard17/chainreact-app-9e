/**
 * HubSpot Departments Handler
 */

import { HubSpotIntegration, HubSpotDepartment, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, buildHubSpotApiUrl } from '../utils'

export const getHubSpotDepartments: HubSpotDataHandler<HubSpotDepartment> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotDepartment[]> => {
  console.log("🔍 HubSpot departments fetcher called with integration:", {
    id: integration.id,
    provider: integration.provider,
    hasToken: !!integration.access_token,
    tokenLength: integration.access_token?.length
  })
  
  try {
    // Validate integration status
    validateHubSpotIntegration(integration)
    
    console.log(`🔍 Validating HubSpot token...`)
    const tokenResult = await validateHubSpotToken(integration)
    
    if (!tokenResult.success) {
      console.log(`❌ HubSpot token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }
    
    console.log('🔍 Using predefined HubSpot departments list...')
    // Departments are typically custom properties that vary by organization
    // We'll provide a standard list of common departments
    const departments = getDefaultDepartments()
    
    console.log(`✅ HubSpot departments fetched successfully: ${departments.length} departments`)
    return departments
    
  } catch (error: any) {
    console.error("Error fetching HubSpot departments:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching HubSpot departments")
  }
}

// Standard departments list
function getDefaultDepartments(): HubSpotDepartment[] {
  return [
    { label: 'Sales', value: 'sales' },
    { label: 'Marketing', value: 'marketing' },
    { label: 'Customer Service', value: 'customer_service' },
    { label: 'Customer Support', value: 'customer_support' },
    { label: 'Engineering', value: 'engineering' },
    { label: 'Product', value: 'product' },
    { label: 'Design', value: 'design' },
    { label: 'Human Resources', value: 'human_resources' },
    { label: 'Finance', value: 'finance' },
    { label: 'Accounting', value: 'accounting' },
    { label: 'Legal', value: 'legal' },
    { label: 'Operations', value: 'operations' },
    { label: 'IT', value: 'it' },
    { label: 'Research & Development', value: 'research_development' },
    { label: 'Business Development', value: 'business_development' },
    { label: 'Executive', value: 'executive' },
    { label: 'Administration', value: 'administration' },
    { label: 'Procurement', value: 'procurement' },
    { label: 'Quality Assurance', value: 'quality_assurance' },
    { label: 'Other', value: 'other' }
  ]
}