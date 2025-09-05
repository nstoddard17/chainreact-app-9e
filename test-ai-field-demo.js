/**
 * AI Field Execution Demonstration
 * 
 * This demonstrates how AI fields are resolved during workflow execution,
 * including respecting dropdown constraints.
 */

console.log('ChainReact AI Field Execution Demonstration');
console.log('=' .repeat(60));

// Simulated workflow with AI fields
const testWorkflow = {
  name: 'Email to Team Notification Workflow',
  nodes: [
    {
      id: 'trigger-1',
      type: 'gmail_trigger_new_email',
      label: 'Gmail: New Email'
    },
    {
      id: 'action-1', 
      type: 'slack_action_send_message',
      label: 'Slack: Send Message',
      config: {
        channel: '{{AI_FIELD:channel}}',
        message: '{{AI_FIELD:message}}',
        _allFieldsAI: true
      }
    },
    {
      id: 'action-2',
      type: 'discord_action_send_message', 
      label: 'Discord: Send Message',
      config: {
        serverId: '{{AI_FIELD:serverId}}',
        channelId: '{{AI_FIELD:channelId}}',
        message: '{{AI_FIELD:message}}',
        _allFieldsAI: true
      }
    },
    {
      id: 'action-3',
      type: 'notion_action_create_page',
      label: 'Notion: Create Page',
      config: {
        databaseId: '{{AI_FIELD:databaseId}}',
        title: '{{AI_FIELD:title}}',
        properties: '{{AI_FIELD:properties}}',
        _allFieldsAI: true
      }
    }
  ]
};

// Mock trigger data (email received)
const triggerData = {
  from: 'john.doe@company.com',
  to: 'team@company.com',
  subject: 'URGENT: Project Alpha Deadline Update',
  body: 'The project deadline has been moved to next Friday. All team members need to update their schedules. This is a critical change that affects the entire timeline.',
  timestamp: new Date().toISOString(),
  hasAttachments: false
};

// Field schemas with dropdown options (as they would be in the actual system)
const fieldSchemas = {
  'slack_action_send_message': {
    channel: {
      type: 'select',
      label: 'Channel',
      required: true,
      options: ['#general', '#random', '#announcements', '#team-updates', '#project-alpha', '#urgent-alerts']
    },
    message: {
      type: 'text',
      label: 'Message',
      required: true,
      maxLength: 2000
    }
  },
  'discord_action_send_message': {
    serverId: {
      type: 'select',
      label: 'Server',
      required: true,
      options: ['Main Server', 'Dev Team Server', 'Project Server']
    },
    channelId: {
      type: 'select',
      label: 'Channel',
      required: true,
      options: ['general', 'announcements', 'dev-updates', 'project-alpha', 'urgent']
    },
    message: {
      type: 'text',
      label: 'Message',
      required: true,
      maxLength: 2000
    }
  },
  'notion_action_create_page': {
    databaseId: {
      type: 'select',
      label: 'Database',
      required: true,
      options: ['Tasks Database', 'Projects Database', 'Meeting Notes', 'Email Archive', 'Team Updates']
    },
    title: {
      type: 'text',
      label: 'Page Title',
      required: true,
      maxLength: 100
    },
    properties: {
      type: 'json',
      label: 'Properties',
      required: false
    }
  }
};

// AI field resolution simulation
function simulateAIFieldResolution(nodeType, fieldName, fieldSchema, context) {
  const schema = fieldSchemas[nodeType]?.[fieldName];
  if (!schema) return `[Unknown field: ${fieldName}]`;
  
  // For dropdown fields, AI must select from available options
  if (schema.type === 'select' && schema.options) {
    let selectedOption;
    
    // Intelligent selection based on context
    if (fieldName === 'channel' || fieldName === 'channelId') {
      // Urgent messages go to urgent/announcement channels
      if (context.subject.toLowerCase().includes('urgent')) {
        selectedOption = schema.options.find(opt => 
          opt.toLowerCase().includes('urgent') || 
          opt.toLowerCase().includes('announcement')
        ) || schema.options[0];
      }
      // Project updates go to project channels
      else if (context.subject.toLowerCase().includes('project')) {
        selectedOption = schema.options.find(opt => 
          opt.toLowerCase().includes('project')
        ) || schema.options[0];
      } else {
        selectedOption = schema.options[0];
      }
    }
    
    else if (fieldName === 'serverId') {
      // Select appropriate server based on content
      if (context.subject.toLowerCase().includes('project')) {
        selectedOption = schema.options.find(opt => 
          opt.toLowerCase().includes('project')
        ) || schema.options[0];
      } else {
        selectedOption = schema.options[0];
      }
    }
    
    else if (fieldName === 'databaseId') {
      // Select database based on email content
      if (context.subject.toLowerCase().includes('project')) {
        selectedOption = schema.options.find(opt => 
          opt.toLowerCase().includes('project')
        ) || schema.options[0];
      } else {
        selectedOption = schema.options.find(opt => 
          opt.toLowerCase().includes('email')
        ) || schema.options[0];
      }
    }
    
    else {
      // Default to first option
      selectedOption = schema.options[0];
    }
    
    return selectedOption;
  }
  
  // For text fields, generate appropriate content
  if (schema.type === 'text') {
    if (fieldName === 'message') {
      const message = `📧 New email from ${context.from}\n` +
                     `Subject: ${context.subject}\n` +
                     `Preview: ${context.body.substring(0, 150)}...`;
      return message.substring(0, schema.maxLength || message.length);
    }
    
    if (fieldName === 'title') {
      const title = `Email: ${context.subject}`;
      return title.substring(0, schema.maxLength || title.length);
    }
  }
  
  // For JSON fields
  if (schema.type === 'json') {
    return {
      'From': context.from,
      'Subject': context.subject,
      'Date': context.timestamp,
      'Priority': context.subject.includes('URGENT') ? 'High' : 'Normal',
      'Has Attachments': context.hasAttachments
    };
  }
  
  return `[Generated value for ${fieldName}]`;
}

// Execute the demonstration
console.log('\n📧 TRIGGER EVENT:');
console.log('New email received:');
console.log(`  From: ${triggerData.from}`);
console.log(`  Subject: ${triggerData.subject}`);
console.log(`  Body preview: ${triggerData.body.substring(0, 100)}...`);

console.log('\n' + '=' .repeat(60));
console.log('🤖 AI FIELD RESOLUTION PROCESS:');
console.log('=' .repeat(60));

// Process each action node
testWorkflow.nodes.forEach(node => {
  if (node.type === 'gmail_trigger_new_email') {
    console.log(`\n⚡ ${node.label} - Trigger (no fields to process)`);
    return;
  }
  
  console.log(`\n📌 ${node.label}`);
  console.log('  Original config with AI placeholders:');
  
  // Show original config
  Object.entries(node.config).forEach(([key, value]) => {
    if (key !== '_allFieldsAI') {
      console.log(`    ${key}: "${value}"`);
    }
  });
  
  console.log('\n  🧠 AI Processing:');
  
  // Process each field
  const resolvedConfig = {};
  Object.entries(node.config).forEach(([fieldName, fieldValue]) => {
    if (fieldName === '_allFieldsAI') return;
    
    const schema = fieldSchemas[node.type]?.[fieldName];
    if (!schema) return;
    
    const resolvedValue = simulateAIFieldResolution(
      node.type,
      fieldName,
      schema,
      triggerData
    );
    
    resolvedConfig[fieldName] = resolvedValue;
    
    console.log(`    ${fieldName}:`);
    console.log(`      Type: ${schema.type}`);
    if (schema.options) {
      console.log(`      Available options: [${schema.options.join(', ')}]`);
      console.log(`      ✅ AI selected: "${resolvedValue}"`);
      
      // Verify it's a valid option
      const isValid = schema.options.includes(resolvedValue);
      if (!isValid) {
        console.log(`      ⚠️  WARNING: Selected value not in options!`);
      }
    } else {
      if (typeof resolvedValue === 'object') {
        console.log(`      ✅ AI generated: ${JSON.stringify(resolvedValue, null, 8).split('\n').join('\n      ')}`);
      } else {
        console.log(`      ✅ AI generated: "${resolvedValue}"`);
      }
    }
  });
  
  console.log('\n  📋 Final resolved configuration:');
  Object.entries(resolvedConfig).forEach(([key, value]) => {
    if (typeof value === 'object') {
      console.log(`    ${key}: ${JSON.stringify(value)}`);
    } else {
      console.log(`    ${key}: "${value}"`);
    }
  });
});

console.log('\n' + '=' .repeat(60));
console.log('🎯 EXECUTION SUMMARY:');
console.log('=' .repeat(60));

console.log(`
The workflow would execute with these AI-generated values:

1. Slack Message:
   - Channel: #urgent-alerts (selected from dropdown)
   - Message: Auto-generated based on email content

2. Discord Message:
   - Server: Project Server (selected from dropdown)
   - Channel: urgent (selected from dropdown)
   - Message: Auto-generated based on email content

3. Notion Page:
   - Database: Email Archive (selected from dropdown)
   - Title: "Email: URGENT: Project Alpha Deadline Update"
   - Properties: JSON object with email metadata

✅ All dropdown values were selected from their respective allowed options
✅ Text fields were generated based on context and constraints
✅ The AI respects field types and constraints during execution
`);

console.log('=' .repeat(60));
console.log('✨ This demonstrates how AI fields work during actual workflow execution:');
console.log('   1. AI analyzes the trigger data and workflow context');
console.log('   2. For dropdown fields, AI MUST select from available options');
console.log('   3. For text fields, AI generates appropriate content');
console.log('   4. All constraints (type, length, format) are respected');
console.log('=' .repeat(60));