/**
 * HubSpot Create Contact Action Handler
 * 
 * Creates a new contact in HubSpot using the HubSpot API
 */

import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/integrations/resolveValue"

/**
 * Action metadata for UI display and reference
 */
export const ACTION_METADATA = {
  key: "hubspot_action_create_contact",
  name: "Create HubSpot Contact",
  description: "Create a new contact in HubSpot CRM",
  icon: "user-plus"
};

/**
 * Standard interface for action parameters
 */
export interface ActionParams {
  userId: string
  config: Record<string, any>
  input: Record<string, any>
}

/**
 * Standard interface for action results
 */
export interface ActionResult {
  success: boolean
  output?: Record<string, any>
  message?: string
  error?: string
}

/**
 * Creates a new HubSpot contact
 * 
 * @param params - Standard action parameters
 * @returns Action result with success/failure and any outputs
 */
export async function createHubSpotContact(params: ActionParams): Promise<ActionResult> {
  try {
    const { userId, config, input } = params
    
    // 1. Get HubSpot API key
    const credentials = await getIntegrationCredentials(userId, "hubspot")
    
    // 2. Resolve any templated values in the config
    const resolvedConfig = resolveValue(config, {
      input,
    })
    
    // 3. Extract required parameters
    const { 
      email,
      firstname,
      lastname,
      phone,
      mobilephone,
      website,
      company,
      jobtitle,
      department,
      address,
      city,
      state,
      zip,
      country,
      lifecycle_stage,
      lead_status,
      annualrevenue,
      numberofemployees,
      industry,
      hs_email_optout,
      hs_analytics_first_timestamp,
      hs_analytics_last_timestamp,
      custom_properties = {}
    } = resolvedConfig
    
    // 4. Validate required parameters
    if (!email) {
      return {
        success: false,
        error: "Missing required parameter: email"
      }
    }
    
    // 5. Prepare the request payload
    const properties: any = {
      email
    }
    
    // Basic Information
    if (firstname) properties.firstname = firstname
    if (lastname) properties.lastname = lastname
    
    // Contact Information
    if (phone) properties.phone = phone
    if (mobilephone) properties.mobilephone = mobilephone
    if (website) properties.website = website
    
    // Company Information
    if (company) properties.company = company
    if (jobtitle) properties.jobtitle = jobtitle
    if (department) properties.department = department
    
    // Address Information
    if (address) properties.address = address
    if (city) properties.city = city
    if (state) properties.state = state
    if (zip) properties.zip = zip
    if (country) properties.country = country
    
    // Lead Management
    if (lifecycle_stage) properties.lifecycle_stage = lifecycle_stage
    if (lead_status) properties.hs_lead_status = lead_status
    
    // Additional Information
    if (annualrevenue) properties.annualrevenue = annualrevenue
    if (numberofemployees) properties.numberofemployees = numberofemployees
    if (industry) properties.industry = industry
    
    // Communication Preferences
    if (hs_email_optout !== undefined) properties.hs_email_optout = hs_email_optout
    if (hs_analytics_first_timestamp) properties.hs_analytics_first_timestamp = hs_analytics_first_timestamp
    if (hs_analytics_last_timestamp) properties.hs_analytics_last_timestamp = hs_analytics_last_timestamp
    
    // Add custom properties
    if (custom_properties && typeof custom_properties === 'object') {
      Object.assign(properties, custom_properties)
    }
    
    const payload = {
      properties
    }
    
    // 6. Make HubSpot API request
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    
    // 7. Handle API response
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HubSpot API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    // 8. Return success result with any outputs
    return {
      success: true,
      output: {
        contactId: data.id,
        email: data.properties.email,
        firstname: data.properties.firstname,
        lastname: data.properties.lastname,
        phone: data.properties.phone,
        mobilephone: data.properties.mobilephone,
        website: data.properties.website,
        company: data.properties.company,
        jobtitle: data.properties.jobtitle,
        department: data.properties.department,
        address: data.properties.address,
        city: data.properties.city,
        state: data.properties.state,
        zip: data.properties.zip,
        country: data.properties.country,
        lifecycle_stage: data.properties.lifecycle_stage,
        lead_status: data.properties.hs_lead_status,
        annualrevenue: data.properties.annualrevenue,
        numberofemployees: data.properties.numberofemployees,
        industry: data.properties.industry,
        hs_email_optout: data.properties.hs_email_optout,
        hs_analytics_first_timestamp: data.properties.hs_analytics_first_timestamp,
        hs_analytics_last_timestamp: data.properties.hs_analytics_last_timestamp,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        archived: data.archived,
        hubspotResponse: data
      },
      message: `Contact "${data.properties.email}" created successfully in HubSpot`
    }
    
  } catch (error: any) {
    // 9. Handle errors and return failure result
    console.error("HubSpot create contact failed:", error)
    return {
      success: false,
      error: error.message || "Failed to create HubSpot contact"
    }
  }
} 