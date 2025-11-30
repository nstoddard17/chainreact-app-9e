import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';
import { createClient } from '@supabase/supabase-js';

import { logger } from '@/lib/utils/logger'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { integrationId, baseId, tableName } = body;
    
    logger.debug('Metadata API called with:', { integrationId, baseId, tableName });

    if (!integrationId || !baseId || !tableName) {
      return errorResponse('Integration ID, base ID, and table name are required' , 400);
    }

    // Fetch the integration
    const { data: integration, error: integrationError } = await getSupabase()
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single();

    if (integrationError || !integration) {
      return errorResponse('Integration not found' , 404);
    }

    // Decrypt the access token
    let accessToken;
    try {
      const { safeDecrypt } = await import('../../../../../lib/security/encryption');
      accessToken = safeDecrypt(integration.access_token);
      logger.debug('Access token decrypted successfully');
    } catch (decryptError: any) {
      logger.error('Failed to decrypt access token:', decryptError);
      return errorResponse('Failed to decrypt access token', 200, {
        fields: null,
        details: decryptError.message 
      });
    }

    // Fetch table metadata from Airtable API
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
    logger.debug('Fetching metadata from Airtable:', metaUrl);
    const metaResponse = await fetch(metaUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!metaResponse.ok) {
      const errorText = await metaResponse.text();
      logger.error('Airtable metadata API error:', {
        status: metaResponse.status,
        statusText: metaResponse.statusText,
        error: errorText,
        baseId,
        tableName,
        url: metaUrl
      });
      
      // If metadata API fails, return empty to trigger fallback
      return jsonResponse({ 
        fields: null,
        error: `Metadata API failed: ${metaResponse.status} ${metaResponse.statusText}`,
        details: errorText
      });
    }

    const metaData = await metaResponse.json();
    
    logger.debug('Airtable metadata response received:', {
      hasData: !!metaData,
      tableCount: metaData.tables?.length || 0,
      baseId,
      requestedTable: tableName
    });
    
    // Find the specific table
    const table = metaData.tables?.find((t: any) => 
      t.name === tableName || t.id === tableName
    );

    if (!table) {
      logger.debug('Table not found in metadata, available tables:', 
        metaData.tables?.map((t: any) => ({ name: t.name, id: t.id })));
      return jsonResponse({ 
        fields: null,
        error: 'Table not found in base',
        availableTables: metaData.tables?.map((t: any) => t.name)
      });
    }

    // Log field types for debugging
    const fieldTypes = table.fields?.map((f: any) => ({
      name: f.name,
      type: f.type,
      id: f.id
    }));
    logger.debug('Table fields found:', fieldTypes);

    // Return the table with its fields including all metadata
    return jsonResponse({
      id: table.id,
      name: table.name,
      fields: table.fields || [],
      views: table.views || []
    });

  } catch (error: any) {
    logger.error('Error fetching Airtable metadata:', {
      error: error.message,
      stack: error.stack,
      integrationId,
      baseId,
      tableName
    });
    return jsonResponse(
      { 
        error: 'Failed to fetch metadata', 
        fields: null,
        details: error.message 
      },
      { status: 200 } // Return 200 to trigger fallback
    );
  }
}
