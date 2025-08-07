import dotenv from 'dotenv'
import fetch from 'node-fetch'

// Load environment variables
dotenv.config({ path: '.env.local' })

// Get base URL from environment
const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL) {
    return process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL
  }
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  return 'https://chainreact.app'
}

const baseUrl = getBaseUrl()

// All Google-related integrations
const googleIntegrations = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Email service',
    triggers: ['gmail_trigger_new_email', 'gmail_trigger_new_attachment', 'gmail_trigger_new_label']
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Calendar service',
    triggers: ['google_calendar_trigger_event_created', 'google_calendar_trigger_event_updated', 'google_calendar_trigger_event_deleted']
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'File storage service',
    triggers: ['google_drive_trigger_file_created', 'google_drive_trigger_file_updated', 'google_drive_trigger_file_deleted']
  },
  {
    id: 'google-docs',
    name: 'Google Docs',
    description: 'Document service',
    triggers: ['google_docs_trigger_new_document', 'google_docs_trigger_document_updated']
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    description: 'Spreadsheet service',
    triggers: ['google_sheets_trigger_row_added', 'google_sheets_trigger_row_updated', 'google_sheets_trigger_row_deleted']
  }
]

async function testWebhookUrl(url, integrationName) {
  try {
    console.log(`\n🔍 Testing ${integrationName} webhook...`)
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

async function testAllGoogleWebhooks() {
  console.log('🚀 Testing All Google Webhooks')
  console.log('=' .repeat(50))
  console.log(`📍 Base URL: ${baseUrl}`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`📅 Test Time: ${new Date().toISOString()}`)
  
  const results = []
  
  for (const integration of googleIntegrations) {
    const webhookUrl = `${baseUrl}/api/workflow/${integration.id}`
    const result = await testWebhookUrl(webhookUrl, integration.name)
    
    results.push({
      integration: integration.name,
      url: webhookUrl,
      ...result
    })
    
    // Add a small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  // Summary
  console.log('\n' + '=' .repeat(50))
  console.log('📊 TEST SUMMARY')
  console.log('=' .repeat(50))
  
  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)
  
  console.log(`✅ Successful: ${successful.length}/${results.length}`)
  console.log(`❌ Failed: ${failed.length}/${results.length}`)
  
  if (successful.length > 0) {
    console.log('\n✅ SUCCESSFUL WEBHOOKS:')
    successful.forEach(result => {
      console.log(`   • ${result.integration}: ${result.url}`)
    })
  }
  
  if (failed.length > 0) {
    console.log('\n❌ FAILED WEBHOOKS:')
    failed.forEach(result => {
      console.log(`   • ${result.integration}: ${result.url}`)
      console.log(`     Status: ${result.status || 'Connection Error'}`)
      console.log(`     Error: ${result.error || result.response}`)
    })
  }
  
  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:')
  if (failed.length === 0) {
    console.log('   🎉 All Google webhooks are working correctly!')
  } else {
    console.log('   🔧 Some webhooks failed. Check the following:')
    console.log('      • Ensure the development server is running (npm run dev)')
    console.log('      • Verify the base URL is correct')
    console.log('      • Check that the API routes exist')
    console.log('      • Review server logs for detailed error messages')
  }
  
  console.log('\n📋 WEBHOOK URLS FOR SETUP:')
  googleIntegrations.forEach(integration => {
    console.log(`   • ${integration.name}: ${baseUrl}/api/workflow/${integration.id}`)
  })
  
  return results
}

// Run the test
testAllGoogleWebhooks()
  .then(results => {
    console.log('\n✨ Test completed!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n💥 Test failed:', error)
    process.exit(1)
  })
