import { NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine';
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes';
import { pollOneNoteForNewNotes, getLastPollTime, updateLastPollTime } from '@/lib/workflows/triggers/polling/onenote';

import { logger } from '@/lib/utils/logger'

export async function GET() {
  const supabase = createAdminClient();
  const executionEngine = new AdvancedExecutionEngine();

  try {
    const { data: activeWorkflows, error } = await supabase
      .from('workflows')
      .select('id, name, user_id, status')
      .eq('status', 'active');

    if (error) {
      throw error;
    }

    for (const workflow of activeWorkflows) {
      // Load nodes from normalized table
      const { data: dbNodes } = await supabase
        .from('workflow_nodes')
        .select('*')
        .eq('workflow_id', workflow.id)
        .order('display_order')

      const nodes = (dbNodes || []).map((n: any) => ({
        id: n.id,
        type: n.node_type,
        position: { x: n.position_x, y: n.position_y },
        data: {
          type: n.node_type,
          label: n.label,
          config: n.config || {},
          isTrigger: n.is_trigger,
          triggerType: n.config?.triggerType,
          providerId: n.provider_id
        }
      }))

      const pollingTriggers = nodes.filter(
        (node: any) => node.data.isTrigger && node.data.triggerType === 'polling'
      );

      for (const triggerNode of pollingTriggers) {
        const newData = await fetchDataForPollingTrigger(
          triggerNode,
          workflow.user_id,
          workflow.id
        );

        if (newData && newData.length > 0) {
          logger.debug(`Found ${newData.length} new items for workflow ${workflow.id}`);

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

    return jsonResponse({ success: true, message: 'Polling complete.' });
  } catch (error: any) {
    logger.error('Polling cron job error:', error);
    return errorResponse('Internal server error' , 500);
  }
}

async function fetchDataForPollingTrigger(
  triggerNode: any,
  userId: string,
  workflowId: string
): Promise<any[]> {
  const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === triggerNode.data.type);
  if (!nodeComponent) return [];

  logger.debug(`Polling for ${nodeComponent.title} for user ${userId}...`);

  // Handle OneNote polling trigger
  if (triggerNode.data.type === 'microsoft-onenote_trigger_new_note') {
    try {
      const config = triggerNode.data.config || {};
      const lastPollTime = await getLastPollTime(workflowId, triggerNode.id);

      const newNotes = await pollOneNoteForNewNotes(
        userId,
        workflowId,
        {
          notebookId: config.notebookId,
          sectionId: config.sectionId,
          pollingInterval: config.pollingInterval
        },
        lastPollTime || undefined
      );

      // Update last poll time if we found notes
      if (newNotes.length > 0) {
        await updateLastPollTime(workflowId, triggerNode.id);
      }

      return newNotes;
    } catch (error: any) {
      logger.error('Error polling OneNote trigger:', { error: error.message, userId, workflowId });
      return [];
    }
  }

  // For other polling triggers, return empty array (to be implemented)
  logger.debug(`No polling handler implemented for ${nodeComponent.title}`);
  return [];
}
