const fetch = require('node-fetch')

const BASE_URL = 'http://localhost:3000'

async function testWebhook(provider, eventType, eventData) {
  try {
    console.log(`🧪 Testing ${provider} webhook with event: ${eventType}`)
    
    const response = await fetch(`${BASE_URL}/api/test/webhook-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider,
        eventType,
        eventData
      })
    })

    const result = await response.json()
    
    if (result.success) {
      console.log('✅ Webhook test successful!')
      console.log('📋 Result:', result.result)
    } else {
      console.log('❌ Webhook test failed:', result.error)
    }
    
    return result
  } catch (error) {
    console.error('❌ Error testing webhook:', error.message)
    return null
  }
}

async function runAllTests() {
  console.log('🚀 Starting webhook system tests...\n')

  // Test 1: Gmail new message
  console.log('📧 Test 1: Gmail New Message')
  await testWebhook('gmail', 'message.new', {
    type: 'message.new',
    message_id: 'test-gmail-123',
    thread_id: 'thread-456',
    from: 'sender@example.com',
    subject: 'Test Email Subject',
    body: 'This is a test email body'
  })
  console.log('')

  // Test 2: Discord message
  console.log('🎮 Test 2: Discord Message')
  await testWebhook('discord', 'MESSAGE_CREATE', {
    type: 'MESSAGE_CREATE',
    content: 'Hello from Discord!',
    author: { username: 'testuser', id: '123456789' },
    channel_id: '987654321',
    guild_id: '111222333'
  })
  console.log('')

  // Test 3: Slack message
  console.log('💬 Test 3: Slack Message')
  await testWebhook('slack', 'message', {
    type: 'message',
    text: 'Hello from Slack!',
    user: 'U123456789',
    channel: 'C987654321',
    ts: '1234567890.123456'
  })
  console.log('')

  // Test 4: GitHub issue
  console.log('🐙 Test 4: GitHub Issue')
  await testWebhook('github', 'issues', {
    action: 'created',
    issue: {
      id: 123456,
      title: 'Test Issue',
      body: 'This is a test issue',
      user: { login: 'testuser' }
    },
    repository: { name: 'test-repo' }
  })
  console.log('')

  // Test 5: Notion page
  console.log('📝 Test 5: Notion Page')
  await testWebhook('notion', 'page.created', {
    type: 'page.created',
    page_id: 'test-page-123',
    parent: { type: 'database_id', database_id: 'test-db-456' },
    properties: { title: 'Test Page' }
  })
  console.log('')

  console.log('🎉 All webhook tests completed!')
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests()
}

module.exports = { testWebhook, runAllTests } 