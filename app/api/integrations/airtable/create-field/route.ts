import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { integrationId, baseId, tableName, fieldName, fieldType } = body;

    logger.debug('[Create Field] API called with:', { integrationId, baseId, tableName, fieldName, fieldType });

    if (!integrationId || !baseId || !tableName || !fieldName || !fieldType) {
      return errorResponse('Missing required parameters', 400);
    }

    // Fetch the integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single();

    if (integrationError || !integration) {
      return errorResponse('Integration not found', 404);
    }

    // Decrypt the access token
    let accessToken;
    try {
      const { safeDecrypt } = await import('../../../../../lib/security/encryption');
      accessToken = safeDecrypt(integration.access_token);
      logger.debug('[Create Field] Access token decrypted successfully');
    } catch (decryptError: any) {
      logger.error('[Create Field] Failed to decrypt access token:', decryptError);
      return errorResponse('Failed to decrypt access token', 500);
    }

    // First, get the table metadata to find the table ID
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
    logger.debug('[Create Field] Fetching table metadata:', metaUrl);

    const metaResponse = await fetch(metaUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!metaResponse.ok) {
      const errorText = await metaResponse.text();
      logger.error('[Create Field] Metadata API error:', {
        status: metaResponse.status,
        error: errorText
      });
      return errorResponse('Failed to fetch table metadata', metaResponse.status);
    }

    const metaData = await metaResponse.json();
    const table = metaData.tables?.find((t: any) =>
      t.name === tableName || t.id === tableName
    );

    if (!table) {
      return errorResponse('Table not found in base', 404);
    }

    // Create the field using Airtable API
    const createFieldUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${table.id}/fields`;
    logger.debug('[Create Field] Creating field:', { url: createFieldUrl, fieldName, fieldType });

    const createResponse = await fetch(createFieldUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: fieldName,
        type: fieldType,
        options: fieldType === 'multipleAttachments' ? {} : undefined
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      logger.error('[Create Field] Create field API error:', {
        status: createResponse.status,
        error: errorText
      });
      return errorResponse(`Failed to create field: ${errorText}`, createResponse.status);
    }

    const createdField = await createResponse.json();
    logger.debug('[Create Field] Field created successfully:', createdField);

    return jsonResponse({
      success: true,
      field: createdField
    });

  } catch (error: any) {
    logger.error('[Create Field] Error:', {
      error: error.message,
      stack: error.stack
    });
    return errorResponse(`Failed to create field: ${error.message}`, 500);
  }
}
