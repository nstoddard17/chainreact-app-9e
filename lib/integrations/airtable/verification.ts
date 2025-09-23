import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Verify if an Airtable record still exists using the user's OAuth token
 * @param userId - The user ID who owns the integration
 * @param baseId - The Airtable base ID
 * @param tableId - The Airtable table ID
 * @param recordId - The Airtable record ID to verify
 * @returns true if record exists, false if deleted or error
 */
export async function verifyAirtableRecord(
  userId: string,
  baseId: string,
  tableId: string,
  recordId: string
): Promise<boolean> {
  try {
    // Get user's Airtable integration and access token
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('encrypted_access_token, status')
      .eq('user_id', userId)
      .eq('provider', 'airtable')
      .eq('status', 'connected')
      .single();

    if (integrationError || !integration) {
      console.error('❌ Failed to get Airtable integration:', integrationError);
      return false; // Can't verify, assume doesn't exist
    }

    // Decrypt the access token
    const { decryptToken } = await import('../tokenUtils');
    const accessToken = await decryptToken(integration.encrypted_access_token);

    if (!accessToken) {
      console.error('❌ Failed to decrypt Airtable access token');
      return false;
    }

    // Call Airtable API to check if record exists
    const response = await fetch(
      `https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 200) {
      console.log(`✅ Record ${recordId} still exists`);
      return true;
    } else if (response.status === 404) {
      console.log(`🗑️ Record ${recordId} has been deleted`);
      return false;
    } else {
      console.error(`❌ Unexpected status checking record: ${response.status}`);
      // On error, we'll process anyway to avoid losing legitimate records
      return true;
    }
  } catch (error) {
    console.error('❌ Error verifying Airtable record:', error);
    // On error, process anyway to avoid losing legitimate records
    return true;
  }
}