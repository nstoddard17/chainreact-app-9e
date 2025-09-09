import fetch from 'node-fetch';

/**
 * Test Discord Support Workflow Generation
 * 
 * This test validates that the AI workflow generator properly creates
 * a Discord support workflow with multiple scenario-based chains.
 */

const API_URL = 'http://localhost:3000/api/ai/generate-workflow';

// The Discord support prompt from the user
const DISCORD_SUPPORT_PROMPT = `I need help setting up something for our Discord server. We get a lot of messages in our support channel and it's getting overwhelming to manage. I want the bot to automatically read new messages and figure out what kind of help people need. Like if someone's reporting a bug, it should create a ticket somewhere and let them know we got it. If it's just a regular question, it should try to answer it. If someone says something is urgent or broken, it needs to alert our team right away. And for feature requests, maybe it could save those somewhere so we don't forget about them. Basically I want it to be smart enough to know what to do with different types of messages - like having different response paths depending on what people are asking about. Can it do all that automatically when someone posts in our Discord channel?`;

async function testDiscordSupportWorkflow() {
  console.log('🧪 Testing Discord Support Workflow Generation\n');
  console.log('📝 Prompt:', DISCORD_SUPPORT_PROMPT.substring(0, 100) + '...\n');

  try {
    // Make the API request
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: DISCORD_SUPPORT_PROMPT,
        model: 'gpt-4o-mini'
      }),
    });

    const data = await response.json();

    if (!data.success) {
      console.error('❌ Generation failed:', data.error);
      return false;
    }

    console.log('✅ Workflow generated successfully!\n');
    
    const workflow = data.generated || data.workflow;
    
    // Validate the workflow structure
    console.log('🔍 Validating workflow structure...\n');
    
    // Check for Discord trigger
    const trigger = workflow.nodes.find(n => 
      n.data.type === 'discord_trigger_new_message' || 
      n.data.type?.includes('discord') && n.data.isTrigger
    );
    
    if (trigger) {
      console.log('✅ Discord trigger found:', trigger.data.title);
    } else {
      console.log('❌ Missing Discord trigger!');
      return false;
    }
    
    // Check for AI Agent
    const aiAgent = workflow.nodes.find(n => n.data.type === 'ai_agent');
    
    if (!aiAgent) {
      console.log('❌ Missing AI Agent!');
      return false;
    }
    
    console.log('✅ AI Agent found\n');
    console.log('📊 Analyzing chains...\n');
    
    const chains = aiAgent.data.config?.chains || [];
    
    // Expected chain types
    const expectedChains = {
      bug: false,
      support: false,
      urgent: false,
      feature: false
    };
    
    // Analyze each chain
    chains.forEach((chain, index) => {
      console.log(`Chain ${index + 1}: ${chain.name}`);
      console.log(`  Description: ${chain.description}`);
      console.log(`  Actions (${chain.actions?.length || 0}):`);
      
      chain.actions?.forEach(action => {
        console.log(`    - ${action.type} (${action.label})`);
        
        // Check for expected actions
        if (action.type.includes('github') || action.type.includes('trello')) {
          expectedChains.bug = true;
        }
        if (action.type.includes('google_drive') || action.type.includes('notion') && action.type.includes('search')) {
          expectedChains.support = true;
        }
        if (action.type.includes('slack') && (chain.name.toLowerCase().includes('urgent') || chain.name.toLowerCase().includes('emergency'))) {
          expectedChains.urgent = true;
        }
        if ((action.type.includes('notion') || action.type.includes('airtable')) && action.type.includes('create')) {
          expectedChains.feature = true;
        }
      });
      
      console.log('');
    });
    
    // Validate expected chains
    console.log('📋 Validation Results:');
    console.log(`  Bug Report Chain: ${expectedChains.bug ? '✅' : '❌'}`);
    console.log(`  Support Chain: ${expectedChains.support ? '✅' : '❌'}`);
    console.log(`  Urgent Chain: ${expectedChains.urgent ? '✅' : '❌'}`);
    console.log(`  Feature Request Chain: ${expectedChains.feature ? '✅' : '❌'}`);
    
    const allChainsPresent = Object.values(expectedChains).every(v => v);
    
    if (allChainsPresent) {
      console.log('\n🎉 All expected chains and actions are present!');
      return true;
    } else {
      console.log('\n⚠️ Some expected chains are missing');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Run the test
testDiscordSupportWorkflow().then(success => {
  if (success) {
    console.log('\n✅ Discord Support Workflow test passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Discord Support Workflow test failed');
    process.exit(1);
  }
});