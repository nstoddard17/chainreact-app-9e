/**
 * Dynamic HubSpot Data Handlers
 * Handlers for fetching dynamic object types and properties
 */

import { HubSpotDataHandler } from '../types';

import { logger } from '@/lib/utils/logger'

/**
 * Get available HubSpot objects (standard and custom)
 */
export const getHubSpotObjects: HubSpotDataHandler = async (accessToken: string, options?: any) => {
  try {
    // Fetch available objects
    const response = await fetch('/api/integrations/hubspot/objects', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch HubSpot objects');
    }

    const objects = await response.json();

    return {
      success: true,
      data: objects
    };
  } catch (error: any) {
    logger.error('Error fetching HubSpot objects:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch HubSpot objects'
    };
  }
};

/**
 * Get properties for a specific object type
 */
export const getHubSpotObjectProperties: HubSpotDataHandler = async (accessToken: string, options?: any) => {
  try {
    const objectType = options?.objectType || 'contacts';

    const response = await fetch(`/api/integrations/hubspot/properties?objectType=${objectType}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch properties for ${objectType}`);
    }

    const properties = await response.json();

    return {
      success: true,
      data: properties
    };
  } catch (error: any) {
    logger.error('Error fetching HubSpot object properties:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch object properties'
    };
  }
};

/**
 * Get records for a specific object type (generic handler)
 */
export const getHubSpotObjectRecords: HubSpotDataHandler = async (accessToken: string, options?: any) => {
  try {
    const objectType = options?.objectType || 'contacts';
    const limit = options?.limit || 100;
    const searchQuery = options?.searchQuery;

    const url = `https://api.hubapi.com/crm/v3/objects/${objectType}?limit=${limit}&properties=*`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${objectType} records`);
    }

    const data = await response.json();

    // If there's a search query, filter results
    let results = data.results || [];
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      results = results.filter((record: any) => {
        // Search in common properties
        const properties = record.properties || {};
        const searchableFields = [
          properties.name,
          properties.firstname,
          properties.lastname,
          properties.email,
          properties.dealname,
          properties.domain,
        ].filter(Boolean);

        return searchableFields.some(field =>
          field.toLowerCase().includes(query)
        );
      });
    }

    return {
      success: true,
      data: results
    };
  } catch (error: any) {
    logger.error('Error fetching HubSpot object records:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch object records'
    };
  }
};

/**
 * Get available contact properties for selection
 */
export const getHubSpotContactAvailableProperties: HubSpotDataHandler = async (accessToken: string, options?: any) => {
  try {
    const response = await fetch(`https://api.hubapi.com/crm/v3/properties/contacts`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch contact properties');
    }

    const data = await response.json();
    const properties = data.results || [];

    // Filter and format properties for selection
    const availableProperties = properties
      .filter((prop: any) => {
        // Exclude read-only, calculated, and hubspot-defined system properties
        const isEditable = !prop.calculated &&
                          !prop.modificationMetadata?.readOnlyValue &&
                          !prop.hidden;

        // Include common HubSpot defined fields that are editable
        const isCommonField = ['email', 'firstname', 'lastname', 'phone', 'company',
                              'jobtitle', 'website', 'address', 'city', 'state',
                              'zip', 'country', 'lifecyclestage', 'hs_lead_status'].includes(prop.name);

        return isEditable || isCommonField;
      })
      .map((prop: any) => ({
        value: prop.name,
        label: prop.label,
        metadata: {
          type: prop.type,
          fieldType: prop.fieldType,
          group: prop.groupName,
          description: prop.description,
          required: prop.name === 'email', // Email is always required
          options: prop.options
        }
      }))
      .sort((a: any, b: any) => {
        // Sort email first, then by label
        if (a.value === 'email') return -1;
        if (b.value === 'email') return 1;
        return a.label.localeCompare(b.label);
      });

    return {
      success: true,
      data: availableProperties
    };
  } catch (error: any) {
    logger.error('Error fetching HubSpot contact available properties:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch contact properties'
    };
  }
};

/**
 * Get identifier properties for a specific object type (for upsert)
 */
export const getHubSpotIdentifierProperties: HubSpotDataHandler = async (accessToken: string, options?: any) => {
  try {
    const objectType = options?.objectType || 'contacts';

    // First get all properties
    const propertiesResponse = await fetch(`https://api.hubapi.com/crm/v3/properties/${objectType}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!propertiesResponse.ok) {
      throw new Error(`Failed to fetch properties for ${objectType}`);
    }

    const propertiesData = await propertiesResponse.json();
    const properties = propertiesData.results || [];

    // Filter to properties that can be used as identifiers
    const identifierProperties = properties.filter((prop: any) => {
      // Check if property is searchable and unique
      const isSearchable = !prop.calculated && !prop.hidden;
      const isTextBased = prop.type === 'string' || prop.type === 'enumeration';
      const isIdentifier = prop.hasUniqueValue ||
                          prop.name === 'email' ||
                          prop.name === 'domain' ||
                          prop.name.includes('id') ||
                          prop.name.includes('key');

      return isSearchable && isTextBased && (isIdentifier || prop.label.toLowerCase().includes('unique'));
    });

    // Map to simpler format
    const formattedProperties = identifierProperties.map((prop: any) => ({
      value: prop.name,
      label: prop.label,
      description: prop.description
    }));

    return {
      success: true,
      data: formattedProperties
    };
  } catch (error: any) {
    logger.error('Error fetching HubSpot identifier properties:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch identifier properties'
    };
  }
};