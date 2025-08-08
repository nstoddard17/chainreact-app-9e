const crypto = require('crypto')

// Test configuration
const WEBHOOK_URL = 'https://chainreact.app/api/workflow/stripe'
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret_for_testing'

// Sample Stripe webhook payloads
const sampleEvents = {
  'customer.created': {
    id: 'evt_test_customer_created',
    object: 'event',
    api_version: '2020-08-27',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'cus_test_customer_123',
        object: 'customer',
        created: Math.floor(Date.now() / 1000),
        email: 'test@example.com',
        name: 'Test Customer',
        phone: '+1234567890',
        metadata: {
          source: 'webhook_test'
        }
      }
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: 'req_test_123',
      idempotency_key: null
    },
    type: 'customer.created'
  },
  'payment_intent.succeeded': {
    id: 'evt_test_payment_succeeded',
    object: 'event',
    api_version: '2020-08-27',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'pi_test_payment_123',
        object: 'payment_intent',
        amount: 2000,
        currency: 'usd',
        customer: 'cus_test_customer_123',
        status: 'succeeded',
        created: Math.floor(Date.now() / 1000),
        metadata: {
          order_id: 'order_123'
        }
      }
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: 'req_test_456',
      idempotency_key: null
    },
    type: 'payment_intent.succeeded'
  },
  'customer.subscription.created': {
    id: 'evt_test_subscription_created',
    object: 'event',
    api_version: '2020-08-27',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'sub_test_subscription_123',
        object: 'subscription',
        customer: 'cus_test_customer_123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days from now
        created: Math.floor(Date.now() / 1000),
        items: {
          data: [{
            id: 'si_test_item_123',
            price: {
              id: 'price_test_123'
            }
          }]
        }
      }
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: 'req_test_789',
      idempotency_key: null
    },
    type: 'customer.subscription.created'
  }
}

function generateStripeSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000)
  const signedPayload = `${timestamp}.${payload}`
  const signature = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
  return `t=${timestamp},v1=${signature}`
}

async function testWebhookEndpoint(eventType) {
  console.log(`\n🧪 Testing ${eventType} webhook...`)
  
  const event = sampleEvents[eventType]
  if (!event) {
    console.error(`❌ No sample event found for ${eventType}`)
    return
  }

  const payload = JSON.stringify(event)
  const signature = generateStripeSignature(payload, WEBHOOK_SECRET)

  try {
    console.log(`📤 Sending request to: ${WEBHOOK_URL}`)
    console.log(`📋 Event type: ${eventType}`)
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
    console.log(`📥 Response Headers:`, Object.fromEntries(response.headers.entries()))
    console.log(`📥 Response Body:`, JSON.stringify(responseData, null, 2))

    if (response.ok) {
      console.log(`✅ Webhook test for ${eventType} SUCCESSFUL`)
      return true
    } else {
      console.log(`❌ Webhook test for ${eventType} FAILED`)
      return false
    }

  } catch (error) {
    console.error(`❌ Error testing ${eventType}:`, error.message)
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

async function runAllTests() {
  console.log(`🚀 Starting Stripe webhook tests...`)
  console.log(`🌐 Webhook URL: ${WEBHOOK_URL}`)
  console.log(`🔑 Using test webhook secret: ${WEBHOOK_SECRET.substring(0, 20)}...`)

  const results = {
    get: await testGetEndpoint(),
    customerCreated: await testWebhookEndpoint('customer.created'),
    paymentSucceeded: await testWebhookEndpoint('payment_intent.succeeded'),
    subscriptionCreated: await testWebhookEndpoint('customer.subscription.created')
  }

  console.log(`\n📊 Test Results Summary:`)
  console.log(`GET Endpoint: ${results.get ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`Customer Created: ${results.customerCreated ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`Payment Succeeded: ${results.paymentSucceeded ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`Subscription Created: ${results.subscriptionCreated ? '✅ PASS' : '❌ FAIL'}`)

  const allPassed = Object.values(results).every(result => result)
  console.log(`\n${allPassed ? '🎉 All tests passed!' : '⚠️ Some tests failed. Check the logs above.'}`)

  return allPassed
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1)
    })
    .catch(error => {
      console.error('❌ Test runner error:', error)
      process.exit(1)
    })
}

module.exports = { runAllTests, testWebhookEndpoint, testGetEndpoint }
