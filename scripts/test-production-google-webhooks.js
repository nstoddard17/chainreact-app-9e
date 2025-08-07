import fetch from 'node-fetch'

// Production base URL
const productionBaseUrl = 'https://chainreact.app'

// All Google-related integrations
const googleIntegrations = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Email service'
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Calendar service'
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'File storage service'
  },
  {
    id: 'google-docs',
    name: 'Google Docs',
    description: 'Document service'
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    description: 'Spreadsheet service'
  }
]

async function testProductionWebhookUrl(url, integrationName) {
  try {
    console.log(`\n🔍 Testing ${integrationName} production webhook...`)
    console.log(`   URL: ${url}`)
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ChainReact-Webhook-Tester/1.0'
      },
      body: JSON.stringify({
        test: true,
        integration: integrationName,
        timestamp: new Date().toISOString(),
        message: 'This is a test webhook payload from the ChainReact webhook tester'
      })
    })

    const responseText = await response.text()
    
    if (response.ok) {
      console.log(`   ✅ Status: ${response.status} - ${response.statusText}`)
      console.log(`   📄 Response: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`)
      return { success: true, status: response.status, response: responseText }
    } else {
      console.log(`   ❌ Status: ${response.status} - ${response.statusText}`)
      console.log(`   📄 Response: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`)
      return { success: false, status: response.status, response: responseText }
    }
  } catch (error) {
    console.log(`   💥 Error: ${error.message}`)
    return { success: false, error: error.message }
  }
}

async function testProductionGoogleWebhooks() {
  console.log('🚀 Testing Production Google Webhooks')
  console.log('=' .repeat(50))
  console.log(`📍 Production Base URL: ${productionBaseUrl}`)
  console.log(`📅 Test Time: ${new Date().toISOString()}`)
  
  const results = []
  
  for (const integration of googleIntegrations) {
    const webhookUrl = `${productionBaseUrl}/api/workflow/${integration.id}`
    const result = await testProductionWebhookUrl(webhookUrl, integration.name)
    
    results.push({
      integration: integration.name,
      url: webhookUrl,
      ...result
    })
    
    // Add a small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  // Summary
  console.log('\n' + '=' .repeat(50))
  console.log('📊 PRODUCTION TEST SUMMARY')
  console.log('=' .repeat(50))
  
  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)
  
  console.log(`✅ Successful: ${successful.length}/${results.length}`)
  console.log(`❌ Failed: ${failed.length}/${results.length}`)
  
  if (successful.length > 0) {
    console.log('\n✅ SUCCESSFUL PRODUCTION WEBHOOKS:')
    successful.forEach(result => {
      console.log(`   • ${result.integration}: ${result.url}`)
    })
  }
  
  if (failed.length > 0) {
    console.log('\n❌ FAILED PRODUCTION WEBHOOKS:')
    failed.forEach(result => {
      console.log(`   • ${result.integration}: ${result.url}`)
      console.log(`     Status: ${result.status || 'Connection Error'}`)
      console.log(`     Error: ${result.error || result.response}`)
    })
  }
  
  console.log('\n📋 PRODUCTION WEBHOOK URLS FOR SETUP:')
  googleIntegrations.forEach(integration => {
    console.log(`   • ${integration.name}: ${productionBaseUrl}/api/workflow/${integration.id}`)
  })
  
  return results
}

// Run the test
testProductionGoogleWebhooks()
  .then(results => {
    console.log('\n✨ Production test completed!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n💥 Production test failed:', error)
    process.exit(1)
  })
