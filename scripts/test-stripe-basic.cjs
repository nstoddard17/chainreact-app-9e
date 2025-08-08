const crypto = require('crypto')

// Test configuration
const WEBHOOK_URL = 'https://chainreact.app/api/workflow/stripe'
const WEBHOOK_SECRET = 'whsec_test_secret_for_testing'

// Simple test event
const testEvent = {
  id: 'evt_test_123',
  object: 'event',
  api_version: '2020-08-27',
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: 'cus_test_123',
      object: 'customer',
      created: Math.floor(Date.now() / 1000),
      email: 'test@example.com',
      name: 'Test Customer'
    }
  },
  livemode: false,
  pending_webhooks: 1,
  request: {
    id: 'req_test_123',
    idempotency_key: null
  },
  type: 'customer.created'
}

function generateStripeSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000)
  const signedPayload = `${timestamp}.${payload}`
  const signature = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
  return `t=${timestamp},v1=${signature}`
}

async function testBasicWebhook() {
  console.log(`🧪 Testing basic Stripe webhook functionality...`)
  
  const payload = JSON.stringify(testEvent)
  const signature = generateStripeSignature(payload, WEBHOOK_SECRET)

  try {
    console.log(`📤 Sending request to: ${WEBHOOK_URL}`)
    console.log(`📋 Event type: customer.created`)
    console.log(`🔐 Signature: ${signature.substring(0, 50)}...`)

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature,
        'User-Agent': 'Stripe-Webhook-Test/1.0'
      },
      body: payload
    })

    const responseText = await response.text()
    let responseData
    try {
      responseData = JSON.parse(responseText)
    } catch (e) {
      responseData = { raw: responseText }
    }

    console.log(`📥 Response Status: ${response.status}`)
    console.log(`📥 Response Body:`, JSON.stringify(responseData, null, 2))

    if (response.ok) {
      console.log(`✅ Basic webhook test SUCCESSFUL`)
      return true
    } else {
      console.log(`❌ Basic webhook test FAILED`)
      return false
    }

  } catch (error) {
    console.error(`❌ Error testing webhook:`, error.message)
    return false
  }
}

async function testGetEndpoint() {
  console.log(`\n🧪 Testing GET endpoint...`)
  
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()
    console.log(`📥 GET Response Status: ${response.status}`)
    console.log(`📥 GET Response:`, JSON.stringify(data, null, 2))

    if (response.ok) {
      console.log(`✅ GET endpoint test SUCCESSFUL`)
      return true
    } else {
      console.log(`❌ GET endpoint test FAILED`)
      return false
    }

  } catch (error) {
    console.error(`❌ Error testing GET endpoint:`, error.message)
    return false
  }
}

async function runBasicTests() {
  console.log(`🚀 Starting basic Stripe webhook tests...`)
  console.log(`🌐 Webhook URL: ${WEBHOOK_URL}`)
  console.log(`🔑 Using test webhook secret: ${WEBHOOK_SECRET.substring(0, 20)}...`)

  const results = {
    get: await testGetEndpoint(),
    webhook: await testBasicWebhook()
  }

  console.log(`\n📊 Test Results Summary:`)
  console.log(`GET Endpoint: ${results.get ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`Webhook POST: ${results.webhook ? '✅ PASS' : '❌ FAIL'}`)

  const allPassed = Object.values(results).every(result => result)
  console.log(`\n${allPassed ? '🎉 All tests passed!' : '⚠️ Some tests failed. Check the logs above.'}`)

  return allPassed
}

// Run tests if this script is executed directly
if (require.main === module) {
  runBasicTests()
    .then(success => {
      process.exit(success ? 0 : 1)
    })
    .catch(error => {
      console.error('❌ Test runner error:', error)
      process.exit(1)
    })
}

module.exports = { runBasicTests, testBasicWebhook, testGetEndpoint }
