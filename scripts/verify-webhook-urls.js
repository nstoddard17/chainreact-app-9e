import fetch from 'node-fetch'

// Test both development and production URLs
const environments = [
  {
    name: 'Development',
    baseUrl: 'http://localhost:3000',
    description: 'Local development server'
  },
  {
    name: 'Production',
    baseUrl: 'https://chainreact.app',
    description: 'Production deployment'
  }
]

// All Google-related integrations
const googleIntegrations = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Email service',
    triggers: ['New Email', 'New Attachment', 'New Label']
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Calendar service',
    triggers: ['Event Created', 'Event Updated', 'Event Deleted']
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'File storage service',
    triggers: ['File Created', 'File Updated', 'File Deleted']
  },
  {
    id: 'google-docs',
    name: 'Google Docs',
    description: 'Document service',
    triggers: ['New Document', 'Document Updated']
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    description: 'Spreadsheet service',
    triggers: ['Row Added', 'Row Updated', 'Row Deleted']
  }
]

async function testWebhookEndpoint(url, environmentName, integrationName) {
  try {
    console.log(`\n🔍 Testing ${integrationName} (${environmentName})...`)
    console.log(`   URL: ${url}`)
    
    // First try a GET request to check if the endpoint exists
    const getResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'ChainReact-Webhook-Verifier/1.0'
      }
    })

    if (getResponse.ok) {
      const getData = await getResponse.text()
      console.log(`   ✅ GET: ${getResponse.status} - Endpoint accessible`)
      console.log(`   📄 Response: ${getData.substring(0, 150)}...`)
      
      // Now try a POST request
      const postResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChainReact-Webhook-Verifier/1.0'
        },
        body: JSON.stringify({
          test: true,
          integration: integrationName,
          timestamp: new Date().toISOString()
        })
      })

      const postData = await postResponse.text()
      
      if (postResponse.ok) {
        console.log(`   ✅ POST: ${postResponse.status} - Webhook functional`)
        console.log(`   📄 Response: ${postData.substring(0, 150)}...`)
        return { success: true, getStatus: getResponse.status, postStatus: postResponse.status }
      } else {
        console.log(`   ⚠️  POST: ${postResponse.status} - ${postResponse.statusText}`)
        console.log(`   📄 Response: ${postData.substring(0, 150)}...`)
        return { success: false, getStatus: getResponse.status, postStatus: postResponse.status, error: postData }
      }
    } else {
      console.log(`   ❌ GET: ${getResponse.status} - ${getResponse.statusText}`)
      return { success: false, getStatus: getResponse.status, error: 'Endpoint not accessible' }
    }
  } catch (error) {
    console.log(`   💥 Error: ${error.message}`)
    return { success: false, error: error.message }
  }
}

async function verifyAllWebhookUrls() {
  console.log('🚀 Verifying All Google Webhook URLs')
  console.log('=' .repeat(60))
  console.log(`📅 Test Time: ${new Date().toISOString()}`)
  
  const results = []
  
  for (const env of environments) {
    console.log(`\n🌍 ${env.name} Environment`)
    console.log(`📍 Base URL: ${env.baseUrl}`)
    console.log(`📝 Description: ${env.description}`)
    
    for (const integration of googleIntegrations) {
      const webhookUrl = `${env.baseUrl}/api/workflow/${integration.id}`
      const result = await testWebhookEndpoint(webhookUrl, env.name, integration.name)
      
      results.push({
        environment: env.name,
        integration: integration.name,
        url: webhookUrl,
        ...result
      })
      
      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  
  // Summary
  console.log('\n' + '=' .repeat(60))
  console.log('📊 VERIFICATION SUMMARY')
  console.log('=' .repeat(60))
  
  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)
  
  console.log(`✅ Successful: ${successful.length}/${results.length}`)
  console.log(`❌ Failed: ${failed.length}/${results.length}`)
  
  // Group by environment
  const devResults = results.filter(r => r.environment === 'Development')
  const prodResults = results.filter(r => r.environment === 'Production')
  
  console.log(`\n🔧 Development: ${devResults.filter(r => r.success).length}/${devResults.length} working`)
  console.log(`🚀 Production: ${prodResults.filter(r => r.success).length}/${prodResults.length} working`)
  
  if (failed.length > 0) {
    console.log('\n❌ ISSUES FOUND:')
    failed.forEach(result => {
      console.log(`   • ${result.integration} (${result.environment}): ${result.url}`)
      console.log(`     Error: ${result.error}`)
    })
  }
  
  // Setup instructions
  console.log('\n📋 WEBHOOK SETUP INSTRUCTIONS:')
  console.log('=' .repeat(60))
  
  console.log('\n🔧 For Development/Testing:')
  console.log('   Use these URLs with ngrok or local testing:')
  googleIntegrations.forEach(integration => {
    console.log(`   • ${integration.name}: http://localhost:3000/api/workflow/${integration.id}`)
  })
  
  console.log('\n🚀 For Production:')
  console.log('   Use these URLs in your Google service configurations:')
  googleIntegrations.forEach(integration => {
    console.log(`   • ${integration.name}: https://chainreact.app/api/workflow/${integration.id}`)
  })
  
  console.log('\n💡 SETUP TIPS:')
  console.log('   • Development URLs work when running "npm run dev"')
  console.log('   • Production URLs require the app to be deployed')
  console.log('   • Use ngrok for local testing with external services')
  console.log('   • Ensure your Google service has webhook permissions')
  
  return results
}

// Run the verification
verifyAllWebhookUrls()
  .then(results => {
    console.log('\n✨ Verification completed!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n💥 Verification failed:', error)
    process.exit(1)
  })
