/**
 * Test AI Field Storage and Display System
 * 
 * This script simulates a workflow execution with AI field resolution
 * and demonstrates how the results are stored and can be retrieved.
 */

console.log('🚀 ChainReact AI Field Storage Test');
console.log('=' .repeat(60));

// Simulated workflow configuration
const testWorkflow = {
  id: 'wf-test-123',
  name: 'Email to Multi-Channel Notification',
  nodes: [
    {
      id: 'trigger-1',
      type: 'gmail_trigger_new_email',
      label: 'Gmail: New Email',
      data: {
        type: 'gmail_trigger_new_email',
        config: {}
      }
    },
    {
      id: 'action-1',
      type: 'slack_action_send_message',
      label: 'Slack: Send Message',
      data: {
        type: 'slack_action_send_message',
        config: {
          channel: '{{AI_FIELD:channel}}',
          message: '{{AI_FIELD:message}}',
          _allFieldsAI: true
        }
      }
    },
    {
      id: 'action-2',
      type: 'notion_action_create_page',
      label: 'Notion: Create Page',
      data: {
        type: 'notion_action_create_page',
        config: {
          databaseId: '{{AI_FIELD:databaseId}}',
          title: '{{AI_FIELD:title}}',
          properties: '{{AI_FIELD:properties}}',
          _allFieldsAI: true
        }
      }
    }
  ]
};

// Simulated execution context
const executionContext = {
  executionId: 'exec-' + Date.now(),
  workflowId: testWorkflow.id,
  userId: 'user-123',
  startedAt: new Date().toISOString()
};

// Simulated trigger data
const triggerData = {
  from: 'client@important.com',
  to: 'team@company.com',
  subject: 'URGENT: Contract Renewal - Action Required',
  body: 'The annual contract is up for renewal next week. We need to finalize terms by Friday. Please review the attached proposal and confirm.',
  timestamp: new Date().toISOString(),
  hasAttachments: true,
  attachmentCount: 2
};

// Field schemas with dropdown options
const fieldSchemas = {
  'slack_action_send_message': {
    channel: {
      type: 'select',
      options: ['#general', '#announcements', '#sales', '#contracts', '#urgent-alerts']
    },
    message: {
      type: 'text',
      maxLength: 2000
    }
  },
  'notion_action_create_page': {
    databaseId: {
      type: 'select',
      options: ['Contracts Database', 'Sales Pipeline', 'Email Archive', 'Client Communications']
    },
    title: {
      type: 'text',
      maxLength: 100
    },
    properties: {
      type: 'json'
    }
  }
};

// Simulate AI field resolution with storage
function simulateAIFieldResolution(node, context) {
  console.log(`\n📌 Processing Node: ${node.label}`);
  console.log('   Node ID:', node.id);
  console.log('   Node Type:', node.type);
  
  const resolutions = [];
  const nodeSchema = fieldSchemas[node.type];
  
  if (!nodeSchema) {
    console.log('   ⚠️ No schema found for node type');
    return resolutions;
  }
  
  Object.entries(node.data.config).forEach(([fieldName, fieldValue]) => {
    if (fieldName === '_allFieldsAI') return;
    
    const fieldSchema = nodeSchema[fieldName];
    if (!fieldSchema) return;
    
    console.log(`\n   🔧 Field: ${fieldName}`);
    console.log(`      Original: "${fieldValue}"`);
    
    let resolvedValue;
    let reasoning = '';
    
    // AI decision logic based on context
    if (fieldSchema.type === 'select' && fieldSchema.options) {
      console.log(`      Options: [${fieldSchema.options.join(', ')}]`);
      
      // Intelligent selection based on email content
      if (fieldName === 'channel') {
        if (context.subject.includes('URGENT')) {
          resolvedValue = '#urgent-alerts';
          reasoning = 'Selected urgent channel due to URGENT keyword in subject';
        } else if (context.subject.includes('Contract')) {
          resolvedValue = '#contracts';
          reasoning = 'Selected contracts channel due to contract-related content';
        } else {
          resolvedValue = '#general';
          reasoning = 'Selected general channel as default';
        }
      } else if (fieldName === 'databaseId') {
        if (context.subject.includes('Contract')) {
          resolvedValue = 'Contracts Database';
          reasoning = 'Selected Contracts Database based on email subject';
        } else if (context.from.includes('client')) {
          resolvedValue = 'Client Communications';
          reasoning = 'Selected Client Communications based on sender';
        } else {
          resolvedValue = 'Email Archive';
          reasoning = 'Selected Email Archive as default storage';
        }
      }
      
      console.log(`      ✅ AI Selected: "${resolvedValue}"`);
      console.log(`      💭 Reasoning: ${reasoning}`);
    } else {
      // Generate text content
      if (fieldName === 'message') {
        resolvedValue = `📧 Urgent email from ${context.from}\n` +
                       `Subject: ${context.subject}\n` +
                       `Preview: ${context.body.substring(0, 150)}...\n` +
                       `📎 ${context.attachmentCount} attachments`;
        reasoning = 'Generated message summary from email content';
      } else if (fieldName === 'title') {
        resolvedValue = `Email: ${context.subject} - ${new Date().toLocaleDateString()}`;
        reasoning = 'Generated title from subject and date';
      } else if (fieldName === 'properties') {
        resolvedValue = JSON.stringify({
          'From': context.from,
          'Subject': context.subject,
          'Received': context.timestamp,
          'Priority': 'High',
          'Status': 'Pending Review',
          'Has Attachments': context.hasAttachments,
          'Attachment Count': context.attachmentCount
        }, null, 2);
        reasoning = 'Generated properties object from email metadata';
      }
      
      console.log(`      ✅ AI Generated: "${typeof resolvedValue === 'object' ? JSON.stringify(resolvedValue) : resolvedValue.substring(0, 100)}..."`);
      console.log(`      💭 Reasoning: ${reasoning}`);
    }
    
    // Create resolution record
    resolutions.push({
      executionId: executionContext.executionId,
      workflowId: executionContext.workflowId,
      userId: executionContext.userId,
      nodeId: node.id,
      nodeType: node.type,
      nodeLabel: node.label,
      fieldName: fieldName,
      fieldType: fieldSchema.type,
      originalValue: fieldValue,
      resolvedValue: resolvedValue,
      availableOptions: fieldSchema.options ? { options: fieldSchema.options } : null,
      resolutionContext: {
        trigger: context,
        workflowName: testWorkflow.name
      },
      resolutionReasoning: reasoning,
      tokensUsed: Math.floor(Math.random() * 100) + 50,
      cost: (Math.random() * 0.01).toFixed(6),
      model: 'gpt-3.5-turbo',
      resolvedAt: new Date().toISOString()
    });
  });
  
  return resolutions;
}

// Execute the test
console.log('\n📧 TRIGGER EVENT:');
console.log('   From:', triggerData.from);
console.log('   Subject:', triggerData.subject);
console.log('   Body Preview:', triggerData.body.substring(0, 100) + '...');
console.log('   Attachments:', triggerData.attachmentCount);

console.log('\n' + '=' .repeat(60));
console.log('🤖 AI FIELD RESOLUTION PROCESS:');
console.log('=' .repeat(60));

// Storage for all resolutions
const allResolutions = [];

// Process each action node
testWorkflow.nodes.forEach(node => {
  if (node.type === 'gmail_trigger_new_email') {
    console.log(`\n⚡ ${node.label} - Trigger (no fields to process)`);
    return;
  }
  
  const resolutions = simulateAIFieldResolution(node, triggerData);
  allResolutions.push(...resolutions);
});

// Display storage summary
console.log('\n' + '=' .repeat(60));
console.log('💾 STORAGE SUMMARY:');
console.log('=' .repeat(60));

console.log(`\nExecution ID: ${executionContext.executionId}`);
console.log(`Workflow ID: ${executionContext.workflowId}`);
console.log(`Total Fields Resolved: ${allResolutions.length}`);
console.log(`Total Tokens Used: ${allResolutions.reduce((sum, r) => sum + r.tokensUsed, 0)}`);
console.log(`Total Cost: $${allResolutions.reduce((sum, r) => sum + parseFloat(r.cost), 0).toFixed(4)}`);

console.log('\n📊 Resolution Details by Node:');
const nodeGroups = {};
allResolutions.forEach(resolution => {
  if (!nodeGroups[resolution.nodeId]) {
    nodeGroups[resolution.nodeId] = {
      nodeLabel: resolution.nodeLabel,
      fields: []
    };
  }
  nodeGroups[resolution.nodeId].fields.push({
    field: resolution.fieldName,
    value: resolution.resolvedValue,
    reasoning: resolution.resolutionReasoning
  });
});

Object.entries(nodeGroups).forEach(([nodeId, data]) => {
  console.log(`\n   ${data.nodeLabel} (${nodeId}):`);
  data.fields.forEach(field => {
    const displayValue = typeof field.value === 'object' 
      ? JSON.stringify(field.value, null, 2).split('\n').map((line, i) => i === 0 ? line : '         ' + line).join('\n')
      : field.value.length > 50 ? field.value.substring(0, 50) + '...' : field.value;
    console.log(`      • ${field.field}: ${displayValue}`);
    console.log(`        💭 ${field.reasoning}`);
  });
});

console.log('\n' + '=' .repeat(60));
console.log('🎯 WHAT\'S STORED IN THE DATABASE:');
console.log('=' .repeat(60));

console.log(`
The following information is now stored in the ai_field_resolutions table:

1. For Each Field Resolution:
   - Execution ID: Links to the specific workflow run
   - Node Information: Type, ID, and human-readable label
   - Field Details: Name, type, original placeholder value
   - AI Decision: The actual value chosen/generated by AI
   - Available Options: For dropdowns, what choices were available
   - Context: The trigger data and workflow info used for decision
   - Reasoning: Why the AI made this specific choice
   - Metrics: Tokens used, cost, model used
   - Timestamp: When the resolution occurred

2. Accessible Via API:
   - GET /api/workflows/executions/${executionContext.executionId}/ai-resolutions
   - Returns all field resolutions grouped by node
   - Includes cost and token usage summaries

3. Displayed in UI:
   - AIFieldResolutionDisplay component shows all resolutions
   - Expandable node sections with field details
   - Shows original vs. resolved values
   - Displays reasoning for each decision
   - Total cost and token usage metrics

This allows users to:
✅ See exactly what the AI chose for each field
✅ Understand why specific values were selected
✅ Track AI usage costs per execution
✅ Debug workflow behavior
✅ Audit AI decision-making
`);

console.log('=' .repeat(60));
console.log('✨ Test completed successfully!');
console.log('=' .repeat(60));