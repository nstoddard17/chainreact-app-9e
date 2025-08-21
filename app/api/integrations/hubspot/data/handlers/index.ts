/**
 * HubSpot Data Handlers Export
 */

import { getHubSpotCompanies } from './companies'
import { getHubSpotContacts } from './contacts'
import { getHubSpotDeals } from './deals'
import { getHubSpotLists } from './lists'
import { getHubSpotPipelines } from './pipelines'
import { getHubSpotDealStages } from './dealStages'
import { getHubSpotJobTitles } from './jobTitles'
import { getHubSpotDepartments } from './departments'
import { getHubSpotIndustries } from './industries'
import { getHubSpotContactProperties } from './contactProperties'

export const hubspotHandlers = {
  'hubspot_companies': getHubSpotCompanies,
  'hubspot_contacts': getHubSpotContacts,
  'hubspot_deals': getHubSpotDeals,
  'hubspot_lists': getHubSpotLists,
  'hubspot_pipelines': getHubSpotPipelines,
  'hubspot_deal_stages': getHubSpotDealStages,
  'hubspot_job_titles': getHubSpotJobTitles,
  'hubspot_departments': getHubSpotDepartments,
  'hubspot_industries': getHubSpotIndustries,
  'hubspot_contact_properties': getHubSpotContactProperties
}

export {
  getHubSpotCompanies,
  getHubSpotContacts,
  getHubSpotDeals,
  getHubSpotLists,
  getHubSpotPipelines,
  getHubSpotDealStages,
  getHubSpotJobTitles,
  getHubSpotDepartments,
  getHubSpotIndustries,
  getHubSpotContactProperties
}