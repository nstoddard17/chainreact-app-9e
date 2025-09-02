import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { integrationId, baseId, tableName } = body;
    
    console.log('Metadata API called with:', { integrationId, baseId, tableName });

    if (!integrationId || !baseId || !tableName) {
      return NextResponse.json(
        { error: 'Integration ID, base ID, and table name are required' },
        { status: 400 }
      );
    }

    // Fetch the integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single();

    if (integrationError || !integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    // Decrypt the access token
    let accessToken;
    try {
      const { safeDecrypt } = await import('../../../../../lib/security/encryption');
      accessToken = safeDecrypt(integration.access_token);
      console.log('Access token decrypted successfully');
    } catch (decryptError: any) {
      console.error('Failed to decrypt access token:', decryptError);
      return NextResponse.json(
        { 
          error: 'Failed to decrypt access token', 
          fields: null,
          details: decryptError.message 
        },
        { status: 200 }
      );
    }

    // Fetch table metadata from Airtable API
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
    console.log('Fetching metadata from Airtable:', metaUrl);
    const metaResponse = await fetch(metaUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!metaResponse.ok) {
      const errorText = await metaResponse.text();
      console.error('Airtable metadata API error:', {
        status: metaResponse.status,
        statusText: metaResponse.statusText,
        error: errorText,
        baseId,
        tableName,
        url: metaUrl
      });
      
      // If metadata API fails, return empty to trigger fallback
      return NextResponse.json({ 
        fields: null,
        error: `Metadata API failed: ${metaResponse.status} ${metaResponse.statusText}`,
        details: errorText
      });
    }

    const metaData = await metaResponse.json();
    
    console.log('Airtable metadata response received:', {
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
      console.log('Table not found in metadata, available tables:', 
        metaData.tables?.map((t: any) => ({ name: t.name, id: t.id })));
      return NextResponse.json({ 
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
    console.log('Table fields found:', fieldTypes);

    // Return the table with its fields including all metadata
    return NextResponse.json({
      id: table.id,
      name: table.name,
      fields: table.fields || []
    });

  } catch (error: any) {
    console.error('Error fetching Airtable metadata:', {
      error: error.message,
      stack: error.stack,
      integrationId,
      baseId,
      tableName
    });
    return NextResponse.json(
      { 
        error: 'Failed to fetch metadata', 
        fields: null,
        details: error.message 
      },
      { status: 200 } // Return 200 to trigger fallback
    );
  }
}