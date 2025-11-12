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
import { getHubSpotDealProperties } from './dealProperties'
import { getHubSpotCompanyProperties } from './companyProperties'
import { getHubSpotTicketProperties } from './ticketProperties'
import {
  getHubSpotLeadStatusOptions,
  getHubSpotContentTopicsOptions,
  getHubSpotPreferredChannelsOptions
} from './propertyOptions'
import {
  getHubSpotObjects,
  getHubSpotObjectProperties,
  getHubSpotObjectRecords,
  getHubSpotIdentifierProperties,
  getHubSpotContactAvailableProperties
} from './dynamicHandlers'
// Import new ticket handlers
import { getHubSpotTickets } from './tickets'
import { getHubSpotTicketPipelines } from './ticketPipelines'
import { getHubSpotTicketStages } from './ticketStages'

// Import Phase 2 handlers
import { getHubSpotWorkflows } from './workflows'
import { getHubSpotForms } from './forms'
import { getHubSpotProducts } from './products'
import { getHubSpotOwners } from './owners'
import { getHubSpotLineItems } from './lineItems'

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
  'hubspot_contact_properties': getHubSpotContactProperties,
  'hubspot_deal_properties': getHubSpotDealProperties,
  'hubspot_company_properties': getHubSpotCompanyProperties,
  'hubspot_ticket_properties': getHubSpotTicketProperties,
  'hubspot_lead_status_options': getHubSpotLeadStatusOptions,
  'hubspot_content_topics_options': getHubSpotContentTopicsOptions,
  'hubspot_preferred_channels_options': getHubSpotPreferredChannelsOptions,
  // Ticket handlers
  'hubspot_tickets': getHubSpotTickets,
  'hubspot_ticket_pipelines': getHubSpotTicketPipelines,
  'hubspot_ticket_stages': getHubSpotTicketStages,
  // Phase 2 handlers
  'hubspot_workflows': getHubSpotWorkflows,
  'hubspot_forms': getHubSpotForms,
  'hubspot_products': getHubSpotProducts,
  'hubspot_owners': getHubSpotOwners,
  'hubspot_line_items': getHubSpotLineItems,
  // Dynamic handlers
  'hubspot_objects': getHubSpotObjects,
  'hubspot_object_properties': getHubSpotObjectProperties,
  'hubspot_object_records': getHubSpotObjectRecords,
  'hubspot_object_identifier_properties': getHubSpotIdentifierProperties,
  'hubspot_contact_available_properties': getHubSpotContactAvailableProperties
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
  getHubSpotContactProperties,
  getHubSpotDealProperties,
  getHubSpotCompanyProperties,
  getHubSpotTicketProperties,
  getHubSpotTickets,
  getHubSpotTicketPipelines,
  getHubSpotTicketStages,
  getHubSpotWorkflows,
  getHubSpotForms,
  getHubSpotProducts,
  getHubSpotOwners,
  getHubSpotLineItems
}
