// Comprehensive Vercel Cron Job Setup Verification
// Run this script to verify everything is configured correctly

const https = require('https');

// Test configuration
const BASE_URL = 'https://chainreact.app';
const ENDPOINTS = {
  test: '/api/cron/test-refresh',
  cron: '/api/cron/refresh-tokens',
  debug: '/api/cron/debug-integrations'
};

// Helper function to make HTTPS requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy());
    req.end();
  });
}

async function runTests() {
  console.log('🔍 Starting comprehensive Vercel cron job setup verification...\n');
  
  // Test 1: Check if test endpoint works (no auth required)
  console.log('1️⃣ Testing debug endpoint (no auth required)...');
  try {
    const testResult = await makeRequest(`${BASE_URL}${ENDPOINTS.debug}`);
    console.log(`   Status: ${testResult.status}`);
    if (testResult.status === 200) {
      console.log('   ✅ Debug endpoint working');
      if (testResult.data.analysis) {
        console.log(`   📊 Found ${testResult.data.analysis.totalIntegrations} integrations`);
      }
    } else {
      console.log('   ❌ Debug endpoint failed');
    }
  } catch (error) {
    console.log(`   ❌ Debug endpoint error: ${error.message}`);
  }
  
  // Test 2: Check if test refresh endpoint works
  console.log('\n2️⃣ Testing refresh test endpoint (no auth required)...');
  try {
    const testResult = await makeRequest(`${BASE_URL}${ENDPOINTS.test}`);
    console.log(`   Status: ${testResult.status}`);
    if (testResult.status === 200) {
      console.log('   ✅ Test refresh endpoint working');
      if (testResult.data.results) {
        console.log(`   📊 Environment variables: ${JSON.stringify(testResult.data.results.environmentVariables)}`);
      }
    } else {
      console.log('   ❌ Test refresh endpoint failed');
    }
  } catch (error) {
    console.log(`   ❌ Test refresh endpoint error: ${error.message}`);
  }
  
  // Test 3: Check if cron endpoint works with Vercel header
  console.log('\n3️⃣ Testing cron endpoint with Vercel header...');
  try {
    const cronResult = await makeRequest(`${BASE_URL}${ENDPOINTS.cron}`, {
      method: 'GET',
      headers: {
        'x-vercel-cron': '1'
      }
    });
    console.log(`   Status: ${cronResult.status}`);
    if (cronResult.status === 200) {
      console.log('   ✅ Cron endpoint working with Vercel header');
      if (cronResult.data.jobId) {
        console.log(`   🆔 Job ID: ${cronResult.data.jobId}`);
      }
    } else {
      console.log('   ❌ Cron endpoint failed with Vercel header');
      console.log(`   📄 Response: ${JSON.stringify(cronResult.data)}`);
    }
  } catch (error) {
    console.log(`   ❌ Cron endpoint error: ${error.message}`);
  }
  
  // Test 4: Check if cron endpoint works with secret parameter
  console.log('\n4️⃣ Testing cron endpoint with secret parameter...');
  try {
    const cronResult = await makeRequest(`${BASE_URL}${ENDPOINTS.cron}?secret=test-secret`);
    console.log(`   Status: ${cronResult.status}`);
    if (cronResult.status === 401) {
      console.log('   ✅ Cron endpoint properly rejecting invalid secret');
    } else if (cronResult.status === 200) {
      console.log('   ⚠️ Cron endpoint accepted invalid secret (security issue)');
    } else {
      console.log(`   📄 Response: ${JSON.stringify(cronResult.data)}`);
    }
  } catch (error) {
    console.log(`   ❌ Cron endpoint error: ${error.message}`);
  }
  
  // Test 5: Check vercel.json configuration
  console.log('\n5️⃣ Checking vercel.json configuration...');
  try {
    const fs = require('fs');
    const vercelConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    
    if (vercelConfig.crons && vercelConfig.crons.length > 0) {
      console.log('   ✅ vercel.json has cron jobs configured');
      vercelConfig.crons.forEach((cron, index) => {
        console.log(`   📅 Cron ${index + 1}: ${cron.schedule} -> ${cron.path}`);
      });
    } else {
      console.log('   ❌ No cron jobs found in vercel.json');
    }
  } catch (error) {
    console.log(`   ❌ Error reading vercel.json: ${error.message}`);
  }
  
  // Test 6: Check environment variables
  console.log('\n6️⃣ Checking required environment variables...');
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'CRON_SECRET'
  ];
  
  requiredEnvVars.forEach(envVar => {
    if (process.env[envVar]) {
      console.log(`   ✅ ${envVar} is set`);
    } else {
      console.log(`   ❌ ${envVar} is missing`);
    }
  });
  
  // Test 7: Check database connection
  console.log('\n7️⃣ Testing database connection...');
  try {
    const testResult = await makeRequest(`${BASE_URL}${ENDPOINTS.test}`);
    if (testResult.status === 200 && testResult.data.results) {
      const envVars = testResult.data.results.environmentVariables;
      if (envVars) {
        Object.entries(envVars).forEach(([varName, status]) => {
          console.log(`   ${status} ${varName}`);
        });
      }
    }
  } catch (error) {
    console.log(`   ❌ Database connection test failed: ${error.message}`);
  }
  
  console.log('\n🎯 Verification complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Deploy your changes to Vercel');
  console.log('2. Upgrade to a paid Vercel plan if not already done');
  console.log('3. Check the Vercel dashboard for cron job status');
  console.log('4. Monitor the cron job logs in Vercel dashboard');
  console.log('5. Check your database for token_refresh_logs entries');
}

// Run the tests
runTests().catch(console.error); 