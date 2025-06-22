#!/usr/bin/env node

/**
 * ChainReact Scheduled Token Refresh Script
 * 
 * This script is meant to be run as a scheduled job (e.g., with cron) to refresh
 * OAuth tokens that are about to expire. It uses the TokenRefreshService from
 * the ChainReact application.
 * 
 * Example cron usage:
 *   Run every 4 hours at 30 minutes past the hour:
 *   cd /path/to/chainreact && node scripts/scheduled-token-refresh.js
 * 
 * Options:
 *   --limit NUMBER          Maximum tokens to refresh (default: 200)
 *   --provider PROVIDER_ID  Only refresh tokens for specific provider
 *   --dry-run               Don't update the database, just simulate
 *   --help                  Show this help message
 */

// Set up environment - load .env.local file
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

// Suppress Next.js warnings
process.env.NEXT_RUNTIME = 'nodejs';

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  limit: 200,
  provider: null,
  dryRun: false,
};

// Parse arguments
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--limit':
      options.limit = parseInt(args[++i], 10);
      break;
    case '--provider':
      options.provider = args[++i];
      break;
    case '--dry-run':
      options.dryRun = true;
      break;
    case '--help':
      showHelp();
      process.exit(0);
      break;
    default:
      console.error(`Unknown option: ${args[i]}`);
      showHelp();
      process.exit(1);
  }
}

function showHelp() {
  console.log(`
ChainReact Scheduled Token Refresh Script

Usage: node scripts/scheduled-token-refresh.js [options]

Options:
  --limit NUMBER          Maximum tokens to refresh (default: 200)
  --provider PROVIDER_ID  Only refresh tokens for specific provider
  --dry-run               Don't update the database, just simulate
  --help                  Show this help message
  `);
}

// Import the token refresh service
const { TokenRefreshService } = require('../lib/integrations/tokenRefreshService');

// Main function
async function main() {
  console.log('Starting scheduled token refresh...');
  console.log(`Options: ${JSON.stringify(options)}`);
  
  try {
    // Execute token refresh
    const stats = await TokenRefreshService.refreshTokens({
      prioritizeExpiring: true,
      dryRun: options.dryRun,
      limit: options.limit,
      batchSize: 50,
      onlyProvider: options.provider,
      // Default thresholds:
      // - Refresh access tokens that expire within 30 minutes
      // - Refresh refresh tokens that expire within 60 minutes
      accessTokenExpiryThreshold: 30,
      refreshTokenExpiryThreshold: 60,
    });
    
    // Calculate success rate
    const successRate = stats.processed > 0
      ? Math.round((stats.successful / stats.processed) * 100)
      : 0;
    
    // Output results
    console.log('\n===== Token Refresh Results =====');
    console.log(`Duration: ${stats.durationMs / 1000} seconds`);
    console.log(`Processed: ${stats.processed}`);
    console.log(`Successful: ${stats.successful}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log(`Success Rate: ${successRate}%`);
    
    if (Object.keys(stats.errors).length > 0) {
      console.log('\n===== Errors =====');
      for (const [error, count] of Object.entries(stats.errors)) {
        console.log(`${error}: ${count}`);
      }
    }
    
    if (Object.keys(stats.providerStats).length > 0) {
      console.log('\n===== Provider Stats =====');
      for (const [provider, providerStats] of Object.entries(stats.providerStats)) {
        console.log(`${provider}: ${providerStats.successful}/${providerStats.processed} successful (${Math.round((providerStats.successful / providerStats.processed) * 100)}%)`);
      }
    }
    
    console.log('\nScheduled token refresh completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during scheduled token refresh:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error during token refresh:', err);
  process.exit(1);
}); 