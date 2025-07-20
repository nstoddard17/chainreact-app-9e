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
      name,
      phone,
      hs_lead_status,
      favorite_content_topics,
      preferred_channels,
      additional_properties = [],
      additional_values = {},
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
    
    // Content Preferences
    if (favorite_content_topics) properties.favorite_content_topics = favorite_content_topics
    
    // Communication Preferences
    if (preferred_channels) properties.preferred_channels = preferred_channels
    
    // Add additional properties from dynamic field selector
    if (additional_properties && Array.isArray(additional_properties)) {
      additional_properties.forEach(propName => {
        // Use values from additional_values if available, otherwise fall back to resolvedConfig
        if (additional_values[propName] !== undefined && additional_values[propName] !== null && additional_values[propName] !== '') {
          properties[propName] = additional_values[propName]
        } else {
          const propValue = resolvedConfig[propName]
          if (propValue !== undefined && propValue !== null && propValue !== '') {
            properties[propName] = propValue
          }
        }
      })
    }
    
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
        name: `${data.properties.firstname || ''} ${data.properties.lastname || ''}`.trim(),
        phone: data.properties.phone,
        hs_lead_status: data.properties.hs_lead_status,
        favorite_content_topics: data.properties.favorite_content_topics,
        preferred_channels: data.properties.preferred_channels,
        // Include all properties from the response
        properties: data.properties,
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