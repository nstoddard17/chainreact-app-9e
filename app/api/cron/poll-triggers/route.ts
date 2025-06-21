import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine';
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/availableNodes';

export async function GET() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const executionEngine = new AdvancedExecutionEngine();

  try {
    const { data: activeWorkflows, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('status', 'active');

    if (error) {
      throw error;
    }

    for (const workflow of activeWorkflows) {
      const pollingTriggers = workflow.nodes.filter(
        (node: any) => node.data.isTrigger && node.data.triggerType === 'polling'
      );

      for (const triggerNode of pollingTriggers) {
        // This is where you would implement the provider-specific logic to fetch new data.
        // For demonstration, I'll simulate finding new data.
        const newData = await fetchDataForPollingTrigger(triggerNode, workflow.user_id);

        if (newData && newData.length > 0) {
          for (const item of newData) {
            const executionSession = await executionEngine.createExecutionSession(
              workflow.id,
              workflow.user_id,
              'scheduled',
              { inputData: item }
            );

            // Asynchronously execute the workflow for each new item
            executionEngine.executeWorkflowAdvanced(executionSession.id, item);
          }
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Polling complete.' });
  } catch (error: any) {
    console.error('Polling cron job error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function fetchDataForPollingTrigger(triggerNode: any, userId: string): Promise<any[]> {
  const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === triggerNode.data.type);
  if (!nodeComponent) return [];

  console.log(`Polling for ${nodeComponent.title} for user ${userId}...`);

  // In a real implementation, you would:
  // 1. Use the `getApiClientForNode` logic to get an authenticated client.
  // 2. Call the provider's API to check for new data since the last poll.
  // 3. You'd need to store a cursor or timestamp of the last poll to avoid duplicates.
  
  // Simulating finding one new item.
  return [{ id: crypto.randomUUID(), message: 'This is a new item found via polling.' }];
} 