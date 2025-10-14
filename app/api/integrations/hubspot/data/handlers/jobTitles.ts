/**
 * HubSpot Job Titles Handler
 */

import { HubSpotIntegration, HubSpotJobTitle, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, buildHubSpotApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getHubSpotJobTitles: HubSpotDataHandler<HubSpotJobTitle> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotJobTitle[]> => {
  logger.debug("🔍 HubSpot job titles fetcher called with integration:", {
    id: integration.id,
    provider: integration.provider,
    hasToken: !!integration.access_token,
    tokenLength: integration.access_token?.length
  })
  
  try {
    // Validate integration status
    validateHubSpotIntegration(integration)
    
    logger.debug(`🔍 Validating HubSpot token...`)
    const tokenResult = await validateHubSpotToken(integration)
    
    if (!tokenResult.success) {
      logger.debug(`❌ HubSpot token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }
    
    logger.debug('🔍 Using predefined HubSpot job titles list...')
    // Job titles are free text fields in HubSpot, but we'll provide common options
    const jobTitles = getDefaultJobTitles()
    
    logger.debug(`✅ HubSpot job titles fetched successfully: ${jobTitles.length} job titles`)
    return jobTitles
    
  } catch (error: any) {
    logger.error("Error fetching HubSpot job titles:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching HubSpot job titles")
  }
}

// Common job titles list
function getDefaultJobTitles(): HubSpotJobTitle[] {
  return [
    { label: 'CEO', value: 'ceo' },
    { label: 'President', value: 'president' },
    { label: 'Vice President', value: 'vice_president' },
    { label: 'Director', value: 'director' },
    { label: 'Manager', value: 'manager' },
    { label: 'Senior Manager', value: 'senior_manager' },
    { label: 'Team Lead', value: 'team_lead' },
    { label: 'Supervisor', value: 'supervisor' },
    { label: 'Coordinator', value: 'coordinator' },
    { label: 'Specialist', value: 'specialist' },
    { label: 'Analyst', value: 'analyst' },
    { label: 'Senior Analyst', value: 'senior_analyst' },
    { label: 'Associate', value: 'associate' },
    { label: 'Senior Associate', value: 'senior_associate' },
    { label: 'Consultant', value: 'consultant' },
    { label: 'Senior Consultant', value: 'senior_consultant' },
    { label: 'Engineer', value: 'engineer' },
    { label: 'Senior Engineer', value: 'senior_engineer' },
    { label: 'Developer', value: 'developer' },
    { label: 'Senior Developer', value: 'senior_developer' },
    { label: 'Designer', value: 'designer' },
    { label: 'Senior Designer', value: 'senior_designer' },
    { label: 'Account Manager', value: 'account_manager' },
    { label: 'Sales Representative', value: 'sales_representative' },
    { label: 'Marketing Manager', value: 'marketing_manager' },
    { label: 'Product Manager', value: 'product_manager' },
    { label: 'Project Manager', value: 'project_manager' },
    { label: 'HR Manager', value: 'hr_manager' },
    { label: 'Finance Manager', value: 'finance_manager' },
    { label: 'Operations Manager', value: 'operations_manager' },
    { label: 'Administrator', value: 'administrator' },
    { label: 'Assistant', value: 'assistant' },
    { label: 'Executive Assistant', value: 'executive_assistant' },
    { label: 'Intern', value: 'intern' },
    { label: 'Other', value: 'other' }
  ]
}