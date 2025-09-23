#!/usr/bin/env node

/**
 * Test script for new execution modes:
 * - Run Once (Live): Skips triggers and executes from first action
 * - Test (Sandbox): Waits for real triggers then executes without sending data
 *
 * Usage: node scripts/test-execution-modes.js
 */

async function testExecutionModes() {
  console.log('🧪 Testing Workflow Execution Modes\n');

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  // Test configuration - you'll need to update these with real values
  const testConfig = {
    workflowId: 'test-workflow-id', // Replace with actual workflow ID
    userId: 'test-user-id',          // Replace with actual user ID
    authToken: 'test-auth-token'     // Replace with actual auth token
  };

  // Test workflow data with a trigger and action
  const testWorkflow = {
    nodes: [
      {
        id: 'trigger-1',
        type: 'custom',
        data: {
          type: 'airtable_trigger_new_record',
          isTrigger: true,
          title: 'New Airtable Record',
          providerId: 'airtable',
          config: {
            baseId: 'appXXXXXXXXXXXXXX',
            tableName: 'Test Table'
          }
        }
      },
      {
        id: 'action-1',
        type: 'custom',
        data: {
          type: 'gmail_action_send_email',
          title: 'Send Email',
          providerId: 'gmail',
          config: {
            to: 'test@example.com',
            subject: 'Test Email',
            body: 'This is a test email'
          }
        }
      }
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'trigger-1',
        target: 'action-1'
      }
    ]
  };

  console.log('1️⃣ Testing Run Once (Live) mode - Should skip triggers\n');

  try {
    const response = await fetch(`${baseUrl}/api/workflows/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testConfig.authToken}`
      },
      body: JSON.stringify({
        workflowId: testConfig.workflowId,
        testMode: false,
        executionMode: 'live',
        skipTriggers: true,  // This should skip the trigger node
        inputData: {
          trigger: {
            type: 'manual',
            timestamp: new Date().toISOString(),
            source: 'live_test'
          }
        },
        workflowData: testWorkflow
      })
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Run Once (Live) succeeded');
      console.log('   - Should have skipped trigger node');
      console.log('   - Should have executed action node with real API calls');
      console.log('   Result:', JSON.stringify(result, null, 2));
    } else {
      console.log('❌ Run Once (Live) failed:', result.error);
    }
  } catch (error) {
    console.log('❌ Run Once (Live) error:', error.message);
  }

  console.log('\n2️⃣ Testing Test (Sandbox) mode - Should wait for triggers\n');

  try {
    const response = await fetch(`${baseUrl}/api/workflows/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testConfig.authToken}`
      },
      body: JSON.stringify({
        workflowId: testConfig.workflowId,
        testMode: true,  // Sandbox mode
        executionMode: 'sandbox',
        skipTriggers: false,  // Don't skip triggers in sandbox
        inputData: {
          trigger: {
            type: 'manual',
            timestamp: new Date().toISOString(),
            source: 'sandbox_test'
          }
        },
        workflowData: testWorkflow
      })
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Test (Sandbox) succeeded');
      console.log('   - Should have intercepted actions');
      console.log('   - Should have stored execution in history');
      console.log('   - Should NOT have sent real emails/data');

      if (result.interceptedActions && result.interceptedActions.length > 0) {
        console.log(`   - Intercepted ${result.interceptedActions.length} action(s):`);
        result.interceptedActions.forEach(action => {
          console.log(`     • ${action.nodeName} (${action.type})`);
        });
      }

      if (result.executionHistoryId) {
        console.log(`   - Execution saved to history: ${result.executionHistoryId}`);
      }
    } else {
      console.log('❌ Test (Sandbox) failed:', result.error);
    }
  } catch (error) {
    console.log('❌ Test (Sandbox) error:', error.message);
  }

  console.log('\n📝 Test Summary:');
  console.log('- Run Once (Live): Skips triggers, executes actions with real API calls');
  console.log('- Test (Sandbox): Waits for triggers, executes without sending real data');
  console.log('\n⚠️  Note: Update the testConfig values with real workflow/user IDs to run actual tests');
}

// Run the test
testExecutionModes().catch(console.error);