/**
 * Check HubSpot Integration in Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkHubSpotIntegration() {
  console.log('🔍 Checking HubSpot Integration in Supabase...\n');
  
  try {
    // Get all HubSpot integrations
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('provider', 'hubspot')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Error fetching integrations:', error);
      return;
    }
    
    console.log(`📊 Found ${integrations?.length || 0} HubSpot integration(s)\n`);
    
    if (integrations && integrations.length > 0) {
      integrations.forEach((integration, index) => {
        console.log(`🔹 Integration ${index + 1}:`);
        console.log(`   ID: ${integration.id}`);
        console.log(`   User ID: ${integration.user_id}`);
        console.log(`   Status: ${integration.status}`);
        console.log(`   Is Active: ${integration.is_active}`);
        console.log(`   Created: ${new Date(integration.created_at).toLocaleString()}`);
        console.log(`   Updated: ${new Date(integration.updated_at).toLocaleString()}`);
        console.log(`   Has Access Token: ${!!integration.access_token}`);
        console.log(`   Has Refresh Token: ${!!integration.refresh_token}`);
        
        if (integration.expires_at) {
          const expiresAt = new Date(integration.expires_at);
          const now = new Date();
          const isExpired = expiresAt < now;
          console.log(`   Expires: ${expiresAt.toLocaleString()} ${isExpired ? '(EXPIRED)' : '(VALID)'}`);
        }
        
        if (integration.metadata) {
          console.log(`   Hub ID: ${integration.metadata.hub_id || 'N/A'}`);
          console.log(`   Hub Domain: ${integration.metadata.hub_domain || 'N/A'}`);
          console.log(`   Scopes: ${integration.metadata.scopes?.join(', ') || 'N/A'}`);
        }
        
        console.log('');
      });
      
      // Check the most recent integration
      const latestIntegration = integrations[0];
      
      if (latestIntegration.status === 'connected' && latestIntegration.is_active) {
        console.log('✅ Latest HubSpot integration appears to be properly connected!');
        console.log('   The OAuth flow completed successfully and stored the tokens.');
        console.log('   The UI issue is likely just a localStorage/messaging problem.');
      } else {
        console.log('⚠️ Latest HubSpot integration status:', latestIntegration.status);
        console.log('   There might be an issue with the integration.');
      }
    } else {
      console.log('❌ No HubSpot integrations found in the database');
    }
    
    // Also check for any stale PKCE flow entries
    const { data: pkceEntries } = await supabase
      .from('pkce_flow')
      .select('*')
      .eq('provider', 'hubspot')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (pkceEntries && pkceEntries.length > 0) {
      console.log(`\n📝 Found ${pkceEntries.length} recent OAuth state entries`);
      console.log('   These should be cleaned up after successful OAuth');
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

console.log('====================================');
console.log('HubSpot Integration Check');
console.log('====================================\n');

checkHubSpotIntegration().then(() => {
  console.log('\n====================================');
  console.log('Check Complete');
  console.log('====================================');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});