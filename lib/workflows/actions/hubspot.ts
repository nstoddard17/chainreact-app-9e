import { ActionResult } from './core/executeWait'
import { getDecryptedAccessToken } from './core/getDecryptedAccessToken'
import { resolveValue } from '@/lib/integrations/resolveValue'

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
      email,
      name,
      phone,
      hs_lead_status,
      // Company Information
      associatedCompanyId,
      jobtitle,
      department,
      industry,
      // Location Information
      address,
      city,
      state,
      zip,
      country,
      // Social Media
      website,
      linkedinbio,
      twitterhandle,
      // Lifecycle Stage
      lifecyclestage,
      // Legacy fields (keeping for backward compatibility)
      favorite_content_topics,
      preferred_channels,
      additional_properties = [],
      additional_values = {},
      all_available_fields = [],
      all_field_values = {},
      company_fields = [],
      company_field_values = {},
      custom_properties = {}
    } = resolvedConfig

    if (!email) {
      throw new Error("Email is required")
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

    // Prepare contact properties
    const properties: Record<string, any> = {
      email: email
    }

    // Basic Information
    if (name) {
      // Split the name into first and last name for HubSpot
      const nameParts = name.trim().split(' ')
      if (nameParts.length > 0) {
        properties.firstname = nameParts[0]
        if (nameParts.length > 1) {
          properties.lastname = nameParts.slice(1).join(' ')
        }
      }
    }

    // Contact Information
    if (phone) properties.phone = phone

    // Lead Management
    if (hs_lead_status) properties.hs_lead_status = hs_lead_status

    // Company Information
    if (jobtitle) properties.jobtitle = jobtitle
    if (department) properties.hs_department = department // HubSpot uses hs_department
    if (industry) properties.industry = industry
    if (associatedCompanyId) properties.associatedcompanyid = associatedCompanyId

    // Location Information
    if (address) properties.address = address
    if (city) properties.city = city
    if (state) properties.state = state
    if (zip) properties.zip = zip
    if (country) properties.country = country

    // Social Media
    if (website) properties.website = website
    if (linkedinbio) properties.linkedinbio = linkedinbio
    if (twitterhandle) properties.twitterhandle = twitterhandle

    // Lifecycle Stage
    if (lifecyclestage) properties.lifecyclestage = lifecyclestage

    // Legacy - Content Preferences
    if (favorite_content_topics) properties.favorite_content_topics = favorite_content_topics

    // Legacy - Communication Preferences
    if (preferred_channels) properties.preferred_channels = preferred_channels
    
    // Add additional properties from dynamic field selector
    if (additional_properties && Array.isArray(additional_properties)) {
      console.log('Processing additional properties:', additional_properties)
      console.log('Additional values:', additional_values)
      
      additional_properties.forEach(propName => {
        // Use values from additional_values if available, otherwise fall back to resolvedConfig
        if (additional_values[propName] !== undefined && additional_values[propName] !== null && additional_values[propName] !== '') {
          properties[propName] = additional_values[propName]
          console.log(`Added property ${propName} with value:`, additional_values[propName])
        } else {
          const propValue = resolvedConfig[propName]
          if (propValue !== undefined && propValue !== null && propValue !== '') {
            properties[propName] = propValue
            console.log(`Added property ${propName} with value from config:`, propValue)
          }
        }
      })
    }

    // Add all available fields from the comprehensive field selector
    if (all_available_fields && Array.isArray(all_available_fields)) {
      console.log('Processing all available fields:', all_available_fields)
      console.log('All field values:', all_field_values)
      
      all_available_fields.forEach(fieldName => {
        // Use values from all_field_values if available, otherwise fall back to resolvedConfig
        if (all_field_values[fieldName] !== undefined && all_field_values[fieldName] !== null && all_field_values[fieldName] !== '') {
          properties[fieldName] = all_field_values[fieldName]
          console.log(`Added field ${fieldName} with value:`, all_field_values[fieldName])
        } else {
          const fieldValue = resolvedConfig[fieldName]
          if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
            properties[fieldName] = fieldValue
            console.log(`Added field ${fieldName} with value from config:`, fieldValue)
          }
        }
      })
    }
    
    console.log('Final properties being sent to HubSpot:', properties)
    
    // Add custom properties
    if (custom_properties && typeof custom_properties === 'object') {
      Object.assign(properties, custom_properties)
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
    
    console.log('HubSpot API response:', result)
    console.log('Created contact properties:', result.properties)

    // Check if we should associate with existing company or create new one
    let companyId = null
    let companyName = null

    // If associatedCompanyId is a string that's not an ID (i.e., a new company name to create)
    if (associatedCompanyId && typeof associatedCompanyId === 'string' && !associatedCompanyId.match(/^\d+$/)) {
      companyName = associatedCompanyId
      try {
        console.log('Creating company record for:', companyName)
        
        // Prepare company properties
        const companyProperties: Record<string, any> = {
          name: companyName
        }
        
        // Add company-specific fields if provided
        if (company_fields && Array.isArray(company_fields)) {
          console.log('Processing company-specific fields:', company_fields)
          console.log('Company field values:', company_field_values)
          
          company_fields.forEach(fieldName => {
            if (company_field_values[fieldName] !== undefined && company_field_values[fieldName] !== null && company_field_values[fieldName] !== '') {
              companyProperties[fieldName] = company_field_values[fieldName]
              console.log(`Added company field ${fieldName} with value:`, company_field_values[fieldName])
            }
          })
        }
        
        // Add additional company properties from contact data if not already set by company fields
        if (properties.website && !companyProperties.domain) companyProperties.domain = properties.website
        if (properties.phone && !companyProperties.phone) companyProperties.phone = properties.phone
        if (properties.address && !companyProperties.address) companyProperties.address = properties.address
        if (properties.city && !companyProperties.city) companyProperties.city = properties.city
        if (properties.state && !companyProperties.state) companyProperties.state = properties.state
        if (properties.zip && !companyProperties.zip) companyProperties.zip = properties.zip
        if (properties.country && !companyProperties.country) companyProperties.country = properties.country
        if (properties.industry && !companyProperties.industry) companyProperties.industry = properties.industry
        
        // Create company
        const companyResponse = await fetch("https://api.hubapi.com/crm/v3/objects/companies", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            properties: companyProperties
          })
        })
        
        if (companyResponse.ok) {
          const companyResult = await companyResponse.json()
          companyId = companyResult.id
          console.log('Created company with ID:', companyId)
          
          // Associate contact with company
          const associationResponse = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${result.id}/associations/companies/${companyId}/contact_to_company`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            }
          })
          
          if (associationResponse.ok) {
            console.log('Successfully associated contact with company')
          } else {
            console.warn('Failed to associate contact with company:', associationResponse.status)
          }
        } else {
          console.warn('Failed to create company:', companyResponse.status)
        }
      } catch (error) {
        console.warn('Error creating company:', error)
      }
    } else if (associatedCompanyId && associatedCompanyId.match(/^\d+$/)) {
      // If associatedCompanyId is an actual ID, associate the contact with the existing company
      companyId = associatedCompanyId
      try {
        const associationResponse = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${result.id}/associations/companies/${companyId}/contact_to_company`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        })

        if (associationResponse.ok) {
          console.log('Successfully associated contact with existing company')
        } else {
          console.warn('Failed to associate contact with existing company:', associationResponse.status)
        }
      } catch (error) {
        console.warn('Error associating with existing company:', error)
      }
    }

    return {
      success: true,
      output: {
        contactId: result.id,
        email: result.properties.email,
        name: `${result.properties.firstname || ''} ${result.properties.lastname || ''}`.trim(),
        phone: result.properties.phone,
        hs_lead_status: result.properties.hs_lead_status,
        favorite_content_topics: result.properties.favorite_content_topics,
        preferred_channels: result.properties.preferred_channels,
        // Include all properties from the response
        properties: result.properties,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        hubspotResponse: result,
        // Include company information if created
        companyId: companyId,
        companyCreated: !!companyId
      },
      message: companyId 
        ? `HubSpot contact created successfully with email ${result.properties.email} and associated with company ${companyName}`
        : `HubSpot contact created successfully with email ${result.properties.email}`
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
 * Add contact to HubSpot list
 */
export async function addContactToHubSpotList(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      contactEmail,
      listId
    } = resolvedConfig

    if (!contactEmail) {
      throw new Error("Contact email is required")
    }

    if (!listId) {
      throw new Error("List ID is required")
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

    // First, get contact ID from email
    const searchResponse = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: "email",
            operator: "EQ",
            value: contactEmail
          }]
        }]
      })
    })

    if (!searchResponse.ok) {
      const errorData = await searchResponse.json().catch(() => ({}))
      throw new Error(`Failed to find contact: ${errorData.message || searchResponse.statusText}`)
    }

    const searchResult = await searchResponse.json()
    
    if (!searchResult.results || searchResult.results.length === 0) {
      throw new Error(`No contact found with email: ${contactEmail}`)
    }

    const contactId = searchResult.results[0].id

    // Add contact to list
    const response = await fetch(`https://api.hubapi.com/crm/v3/lists/${listId}/memberships/add`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify([contactId])
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      
      // Check if it's because the list is not manual
      if (errorData.message && errorData.message.includes("DYNAMIC")) {
        throw new Error("Cannot add contacts to dynamic lists. Please select a manual list.")
      }
      
      throw new Error(`HubSpot API error: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        contactId: contactId,
        contactEmail: contactEmail,
        listId: listId,
        membersAdded: result.recordsIdsAdded || [contactId],
        message: `Contact ${contactEmail} added to list successfully`
      },
      message: `Successfully added contact ${contactEmail} to list`
    }

  } catch (error: any) {
    console.error("HubSpot add contact to list error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to add contact to list"
    }
  }
}

/**
 * Update an existing HubSpot deal
 */
export async function updateHubSpotDeal(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      dealId,
      dealname,
      amount,
      dealstage,
      closedate,
      dealtype,
      description
    } = resolvedConfig

    if (!dealId) {
      throw new Error("Deal ID is required")
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

    // Prepare update properties - only include fields that have values
    const properties: Record<string, any> = {}
    
    if (dealname) properties.dealname = dealname
    if (amount !== undefined && amount !== null) properties.amount = amount.toString()
    if (dealstage) properties.dealstage = dealstage
    if (closedate) properties.closedate = closedate
    if (dealtype) properties.dealtype = dealtype
    if (description) properties.description = description

    if (Object.keys(properties).length === 0) {
      throw new Error("No fields to update")
    }

    // Update deal
    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        properties: properties
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`HubSpot API error: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        dealId: result.id,
        dealname: result.properties.dealname,
        amount: result.properties.amount,
        dealstage: result.properties.dealstage,
        closedate: result.properties.closedate,
        dealtype: result.properties.dealtype,
        description: result.properties.description,
        updatedAt: result.updatedAt,
        hubspotResponse: result
      },
      message: `HubSpot deal "${result.properties.dealname}" updated successfully`
    }

  } catch (error: any) {
    console.error("HubSpot update deal error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to update HubSpot deal"
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
      associatedCompanyId,
      associatedContactId
    } = resolvedConfig

    if (!dealname) {
      throw new Error("Deal name is required")
    }

    if (!dealstage) {
      throw new Error("Deal stage is required")
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
      dealname: dealname,
      dealstage: dealstage
    }

    if (amount) properties.amount = amount
    if (pipeline) properties.pipeline = pipeline || "default"
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
    if (associatedCompanyId) {
      await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${result.id}/associations/companies/${associatedCompanyId}/deal_to_company`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      })
    }

    // Associate with contact if provided
    if (associatedContactId) {
      await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${result.id}/associations/contacts/${associatedContactId}/deal_to_contact`, {
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
        hubspotResponse: result,
        associatedCompanyId: associatedCompanyId,
        associatedContactId: associatedContactId
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