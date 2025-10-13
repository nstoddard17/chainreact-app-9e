import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { decrypt } from '@/lib/security/encryption';

import { logger } from '@/lib/utils/logger'
import type { HubspotObjectType, HubspotObjectsResponse } from '@/lib/workflows/nodes/providers/hubspot/types';

// Standard HubSpot CRM objects
const STANDARD_OBJECTS: HubspotObjectType[] = [
  { value: 'contacts', label: 'Contacts', isCustom: false },
  { value: 'companies', label: 'Companies', isCustom: false },
  { value: 'deals', label: 'Deals', isCustom: false },
  { value: 'tickets', label: 'Tickets', isCustom: false },
  { value: 'products', label: 'Products', isCustom: false },
  { value: 'line_items', label: 'Line Items', isCustom: false },
  { value: 'quotes', label: 'Quotes', isCustom: false },
  { value: 'notes', label: 'Notes', isCustom: false },
  { value: 'tasks', label: 'Tasks', isCustom: false },
  { value: 'calls', label: 'Calls', isCustom: false },
  { value: 'emails', label: 'Emails', isCustom: false },
  { value: 'meetings', label: 'Meetings', isCustom: false },
];

export async function GET(request: NextRequest) {
  try {
    // Get user from session
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return errorResponse('Unauthorized' , 401);
    }

    // Get HubSpot integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'hubspot')
      .eq('status', 'connected')
      .single();

    if (integrationError || !integration) {
      return errorResponse('HubSpot integration not found or not connected' , 404);
    }

    // Decrypt access token
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      logger.error('Encryption key not configured');
      return errorResponse('Server configuration error' , 500);
    }

    const accessToken = decrypt(integration.access_token, encryptionKey);

    // Start with standard objects
    let allObjects: HubspotObjectType[] = [...STANDARD_OBJECTS];

    // Try to fetch custom objects
    try {
      const customObjectsResponse = await fetch(
        'https://api.hubapi.com/crm/v3/schemas',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (customObjectsResponse.ok) {
        const customObjectsData: HubspotObjectsResponse = await customObjectsjsonResponse();

        // Add custom objects to the list
        const customObjects: HubspotObjectType[] = customObjectsData.results
          .filter(schema => !schema.name.startsWith('p_')) // Filter out some internal schemas if needed
          .map(schema => ({
            value: schema.name,
            label: schema.labels?.plural || schema.name,
            isCustom: true,
            objectTypeId: schema.objectTypeId,
          }));

        allObjects = [...allObjects, ...customObjects];
      } else if (customObjectsResponse.status === 403) {
        // User doesn't have permission to view custom objects, just return standard objects
        logger.debug('No permission to view custom objects, returning standard objects only');
      } else {
        logger.error('Failed to fetch custom objects:', customObjectsResponse.status, await customObjectsResponse.text());
      }
    } catch (error) {
      // If fetching custom objects fails, just return standard objects
      logger.error('Error fetching custom objects:', error);
    }

    // Sort objects: standard first, then custom alphabetically
    allObjects.sort((a, b) => {
      if (!a.isCustom && b.isCustom) return -1;
      if (a.isCustom && !b.isCustom) return 1;
      return a.label.localeCompare(b.label);
    });

    return jsonResponse(allObjects);
  } catch (error) {
    logger.error('Error in HubSpot objects route:', error);
    return errorResponse('Internal server error' , 500);
  }
}