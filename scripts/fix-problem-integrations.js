/**
 * Script to fix problematic integrations (Kit, TikTok, PayPal)
 * 
 * This script provides a simple way to:
 * 1. Reset problematic integrations to connected status
 * 2. Trigger a token refresh for these integrations
 */

const fetch = require('node-fetch');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SECRET = process.env.ADMIN_SECRET || process.env.CRON_SECRET || 'test';
const PROBLEM_PROVIDERS = ['kit', 'tiktok', 'paypal'];

async function resetProblemIntegrations() {
  console.log('🔄 Resetting problematic integrations...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/admin/reset-problem-integrations?secret=${SECRET}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        providers: PROBLEM_PROVIDERS,
      }),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.error('❌ Failed to reset integrations:', result.error || response.statusText);
      return false;
    }
    
    console.log('✅ Reset results:', result);
    return true;
  } catch (error) {
    console.error('❌ Error resetting integrations:', error.message);
    return false;
  }
}

async function refreshTokens() {
  console.log('🔄 Refreshing tokens for problematic integrations...');
  
  try {
    const response = await fetch(
      `${BASE_URL}/api/cron/refresh-tokens-simple?secret=${SECRET}&problemProvidersOnly=true`, 
      { method: 'GET' }
    );
    
    const result = await response.json();
    
    if (!response.ok) {
      console.error('❌ Failed to refresh tokens:', result.error || response.statusText);
      return false;
    }
    
    console.log('✅ Refresh results:', result);
    return true;
  } catch (error) {
    console.error('❌ Error refreshing tokens:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting fix-problem-integrations script');
  
  // Step 1: Reset problematic integrations
  const resetSuccess = await resetProblemIntegrations();
  
  if (!resetSuccess) {
    console.log('⚠️ Reset failed, but continuing with token refresh...');
  }
  
  // Step 2: Refresh tokens for problematic integrations
  const refreshSuccess = await refreshTokens();
  
  if (resetSuccess && refreshSuccess) {
    console.log('✅ Successfully fixed problematic integrations');
  } else {
    console.log('⚠️ Some operations failed, check the logs above for details');
  }
}

// Run the script
main().catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
}); 