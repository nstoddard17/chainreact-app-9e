#!/usr/bin/env node

/**
 * Test script for Airtable webhook triggers
 *
 * Usage: node scripts/test-airtable-triggers.js
 */

const fetch = require('node-fetch');

async function testAirtableWebhookFlow() {
  console.log('🧪 Testing Airtable Webhook Trigger Flow\n');

  // Test configuration
  const config = {
    baseUrl: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    testBaseId: 'appXXXXXXXXXXXXXX', // Replace with a test base ID
    testWebhookId: 'achXXXXXXXXXXXXXX', // Replace with test webhook ID
    testUserId: 'test-user-id'
  };

  console.log('1️⃣ Testing webhook registration...');
  try {
    // This would normally be triggered when a workflow is created
    const registerResponse = await fetch(`${config.baseUrl}/api/workflows/webhook-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflowId: 'test-workflow-id',
        userId: config.testUserId,
        triggerType: 'airtable_trigger_new_record',
        providerId: 'airtable',
        config: {
          baseId: config.testBaseId,
          tableName: 'Test Table'
        }
      })
    });

    if (registerResponse.ok) {
      console.log('✅ Webhook registration endpoint working');
    } else {
      console.log('❌ Webhook registration failed:', await registerResponse.text());
    }
  } catch (error) {
    console.log('❌ Webhook registration error:', error.message);
  }

  console.log('\n2️⃣ Testing webhook notification endpoint...');
  try {
    // Simulate an Airtable webhook notification
    const notificationPayload = {
      base: { id: config.testBaseId },
      webhook: { id: config.testWebhookId },
      timestamp: new Date().toISOString()
    };

    const notificationResponse = await fetch(`${config.baseUrl}/api/workflow/airtable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // In production, this would include X-Airtable-Signature-256
      },
      body: JSON.stringify(notificationPayload)
    });

    if (notificationResponse.ok) {
      const result = await notificationResponse.json();
      console.log('✅ Webhook notification processed:', result);
    } else {
      console.log('❌ Webhook notification failed:', await notificationResponse.text());
    }
  } catch (error) {
    console.log('❌ Webhook notification error:', error.message);
  }

  console.log('\n3️⃣ Testing webhook refresh endpoint...');
  try {
    const refreshResponse = await fetch(`${config.baseUrl}/api/webhooks/refresh-airtable`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET || 'test-secret'}`
      }
    });

    if (refreshResponse.ok) {
      const result = await refreshResponse.json();
      console.log('✅ Webhook refresh endpoint working:', result);
    } else {
      console.log('❌ Webhook refresh failed:', await refreshResponse.text());
    }
  } catch (error) {
    console.log('❌ Webhook refresh error:', error.message);
  }

  console.log('\n📝 Test Summary:');
  console.log('- Webhook registration: Check if webhook is created in Airtable');
  console.log('- Webhook notification: Check if workflow executions are created');
  console.log('- Webhook refresh: Check if expiring webhooks are refreshed');
  console.log('\nFor full testing:');
  console.log('1. Create a workflow with an Airtable trigger');
  console.log('2. Add a record to the monitored table in Airtable');
  console.log('3. Check if the workflow execution is triggered');
}

// Run the test
testAirtableWebhookFlow().catch(console.error);