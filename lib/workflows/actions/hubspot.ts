import { ActionResult } from './core/executeWait'
import { getDecryptedAccessToken } from './core/getDecryptedAccessToken'
import { resolveValue } from './core/resolveValue'

/**
 * Create a new HubSpot contact
 */
export async function createHubSpotContact(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      hubspot_contact_properties = {}
    } = resolvedConfig

    // Get HubSpot integration
    const { createSupabaseServerClient } = await import("@/utils/supabase/server")
    const supabase = await createSupabaseServerClient()
    
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "hubspot")
      .eq("status", "connected")
      .single()

    if (!integration) {
      throw new Error("HubSpot integration not connected")
    }

    const accessToken = await getDecryptedAccessToken(userId, "hubspot")

    // Process dynamic form data
    const properties: Record<string, any> = {}
    
    // Convert dynamic form data to HubSpot API format
    Object.entries(hubspot_contact_properties).forEach(([propertyName, fieldData]: [string, any]) => {
      if (fieldData && typeof fieldData === 'object') {
        if (fieldData.type === 'literal' && fieldData.value !== undefined && fieldData.value !== '') {
          properties[propertyName] = fieldData.value
        } else if (fieldData.type === 'variable' && fieldData.value) {
          // For variables, we need to resolve them from the input
          const resolvedValue = input[fieldData.value] || fieldData.value
          if (resolvedValue !== undefined && resolvedValue !== '') {
            properties[propertyName] = resolvedValue
          }
        }
      }
    })

    // Validate that we have at least an email
    if (!properties.email) {
      throw new Error("Email is required for HubSpot contact creation")
    }

    // Create contact payload
    const payload = {
      properties: properties
    }

    // Create contact
    const response = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`HubSpot API error: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        contactId: result.id,
        properties: result.properties,
        hubspot_contact_properties: hubspot_contact_properties,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        hubspotResponse: result
      },
      message: `HubSpot contact created successfully with email ${result.properties.email}`
    }

  } catch (error: any) {
    console.error("HubSpot create contact error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to create HubSpot contact"
    }
  }
}

/**
 * Create a new HubSpot company
 */
export async function createHubSpotCompany(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      name,
      domain,
      phone,
      address,
      city,
      state,
      zip,
      country,
      industry,
      description,
      annual_revenue,
      number_of_employees
    } = resolvedConfig

    if (!name) {
      throw new Error("Company name is required")
    }

    // Get HubSpot integration
    const { createSupabaseServerClient } = await import("@/utils/supabase/server")
    const supabase = await createSupabaseServerClient()
    
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "hubspot")
      .eq("status", "connected")
      .single()

    if (!integration) {
      throw new Error("HubSpot integration not connected")
    }

    const accessToken = await getDecryptedAccessToken(userId, "hubspot")

    // Prepare company properties
    const properties: Record<string, any> = {
      name: name
    }

    if (domain) properties.domain = domain
    if (phone) properties.phone = phone
    if (address) properties.address = address
    if (city) properties.city = city
    if (state) properties.state = state
    if (zip) properties.zip = zip
    if (country) properties.country = country
    if (industry) properties.industry = industry
    if (description) properties.description = description
    if (annual_revenue) properties.annualrevenue = annual_revenue
    if (number_of_employees) properties.numberofemployees = number_of_employees

    // Create company payload
    const payload = {
      properties: properties
    }

    // Create company
    const response = await fetch("https://api.hubapi.com/crm/v3/objects/companies", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`HubSpot API error: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        companyId: result.id,
        name: result.properties.name,
        domain: result.properties.domain,
        phone: result.properties.phone,
        address: result.properties.address,
        city: result.properties.city,
        state: result.properties.state,
        zip: result.properties.zip,
        country: result.properties.country,
        industry: result.properties.industry,
        description: result.properties.description,
        annual_revenue: result.properties.annualrevenue,
        number_of_employees: result.properties.numberofemployees,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        hubspotResponse: result
      },
      message: `HubSpot company "${result.properties.name}" created successfully`
    }

  } catch (error: any) {
    console.error("HubSpot create company error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to create HubSpot company"
    }
  }
}

/**
 * Create a new HubSpot deal
 */
export async function createHubSpotDeal(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      dealname,
      amount,
      pipeline,
      dealstage,
      closedate,
      dealtype,
      description,
      company,
      contact
    } = resolvedConfig

    if (!dealname) {
      throw new Error("Deal name is required")
    }

    // Get HubSpot integration
    const { createSupabaseServerClient } = await import("@/utils/supabase/server")
    const supabase = await createSupabaseServerClient()
    
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "hubspot")
      .eq("status", "connected")
      .single()

    if (!integration) {
      throw new Error("HubSpot integration not connected")
    }

    const accessToken = await getDecryptedAccessToken(userId, "hubspot")

    // Prepare deal properties
    const properties: Record<string, any> = {
      dealname: dealname
    }

    if (amount) properties.amount = amount
    if (pipeline) properties.pipeline = pipeline
    if (dealstage) properties.dealstage = dealstage
    if (closedate) properties.closedate = closedate
    if (dealtype) properties.dealtype = dealtype
    if (description) properties.description = description

    // Create deal payload
    const payload = {
      properties: properties
    }

    // Create deal
    const response = await fetch("https://api.hubapi.com/crm/v3/objects/deals", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`HubSpot API error: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    // Associate with company if provided
    if (company) {
      await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${result.id}/associations/companies/${company}/deal_to_company`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      })
    }

    // Associate with contact if provided
    if (contact) {
      await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${result.id}/associations/contacts/${contact}/deal_to_contact`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      })
    }

    return {
      success: true,
      output: {
        dealId: result.id,
        dealname: result.properties.dealname,
        amount: result.properties.amount,
        pipeline: result.properties.pipeline,
        dealstage: result.properties.dealstage,
        closedate: result.properties.closedate,
        dealtype: result.properties.dealtype,
        description: result.properties.description,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        hubspotResponse: result
      },
      message: `HubSpot deal "${result.properties.dealname}" created successfully`
    }

  } catch (error: any) {
    console.error("HubSpot create deal error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to create HubSpot deal"
    }
  }
} 