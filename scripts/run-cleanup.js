// Simple script to run the token cleanup
// Run with: node scripts/run-cleanup.js

const { execSync } = require('child_process');
const path = require('path');

console.log('🧹 Starting token cleanup process...');

try {
  // Method 1: Try to run the TypeScript script with ts-node
  console.log('Attempting to run TypeScript cleanup script...');
  try {
    execSync('npx ts-node scripts/cleanup-corrupted-tokens.ts', { stdio: 'inherit' });
    console.log('✅ TypeScript cleanup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to run TypeScript cleanup:', error.message);
    console.log('Falling back to SQL cleanup...');
  }

  // Method 2: Try to run the SQL script with psql
  console.log('Attempting to run SQL cleanup script...');
  
  // Get database URL from environment
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_URL;
  
  if (!dbUrl) {
    console.error('❌ No database URL found in environment variables');
    console.error('Please set DATABASE_URL or SUPABASE_URL');
    process.exit(1);
  }
  
  // Run the SQL script
  execSync(`psql "${dbUrl}" -f scripts/cleanup-corrupted-tokens.sql`, { stdio: 'inherit' });
  console.log('✅ SQL cleanup completed successfully');
  
} catch (error) {
  console.error('❌ Failed to run cleanup:', error.message);
  console.error('Please run the cleanup manually:');
  console.error('1. Using TypeScript: npx ts-node scripts/cleanup-corrupted-tokens.ts');
  console.error('2. Using SQL: psql YOUR_DB_URL -f scripts/cleanup-corrupted-tokens.sql');
  process.exit(1);
} 