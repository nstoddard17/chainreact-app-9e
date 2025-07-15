// Script to test updating workflow node positions
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Environment variables:');
console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅ Found' : '❌ Missing');
console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✅ Found' : '❌ Missing');

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing required environment variables.');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

// Initialize Supabase client with service role key for admin access
const supabase = createClient(supabaseUrl, supabaseKey);

// Workflow ID to update - replace with your actual workflow ID
const WORKFLOW_ID = '299dcb69-dddc-45d3-86c0-4ecb5a14ea03'; // Replace with your workflow ID

async function testWorkflowUpdate() {
  try {
    // First, get the current workflow
    console.log(`Fetching workflow ${WORKFLOW_ID}...`);
    const { data: workflow, error: fetchError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', WORKFLOW_ID)
      .single();

    if (fetchError) {
      console.error('Error fetching workflow:', fetchError);
      return;
    }

    console.log('Current workflow:', {
      id: workflow.id,
      name: workflow.name,
      nodes: workflow.nodes?.length || 0,
      connections: workflow.connections?.length || 0
    });

    // Check if nodes column exists
    if (!workflow.nodes) {
      console.error('Nodes column does not exist in the workflow table!');
      console.log('Available columns:', Object.keys(workflow));
      return;
    }

    // Create test nodes with explicit positions
    const testNodes = [
      {
        id: 'trigger',
        type: 'custom',
        position: { x: 200, y: 100 },
        data: {
          type: 'gmail_trigger_new_email',
          config: { hasAttachment: 'any' },
          providerId: 'gmail',
          isTrigger: true,
          title: 'New Email',
          description: 'Triggers when a new email is received.'
        }
      },
      {
        id: 'node-1752541256364',
        type: 'custom',
        position: { x: 400, y: 300 },
        data: {
          type: 'discord_action_send_message',
          config: {
            guildId: '1391236319807541270',
            message: 'test',
            channelId: '1391236320285818963',
            guildId_label: 'chainreactapp\'s server',
            channelId_label: '#general'
          },
          providerId: 'discord',
          isTrigger: false,
          title: 'Send Channel Message',
          description: 'Sends a message to a Discord channel.'
        }
      }
    ];

    // Update the workflow with test nodes
    console.log('Updating workflow with test nodes...');
    const { data: updatedWorkflow, error: updateError } = await supabase
      .from('workflows')
      .update({
        nodes: testNodes,
        connections: workflow.connections || []
      })
      .eq('id', WORKFLOW_ID)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating workflow:', updateError);
      return;
    }

    console.log('Workflow updated successfully!');
    console.log('Updated nodes:', updatedWorkflow.nodes?.map(n => ({
      id: n.id,
      position: n.position
    })));

    // Verify the update by fetching the workflow again
    console.log('Verifying update...');
    const { data: verifiedWorkflow, error: verifyError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', WORKFLOW_ID)
      .single();

    if (verifyError) {
      console.error('Error verifying workflow:', verifyError);
      return;
    }

    console.log('Verified nodes:', verifiedWorkflow.nodes?.map(n => ({
      id: n.id,
      position: n.position
    })));
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testWorkflowUpdate(); 