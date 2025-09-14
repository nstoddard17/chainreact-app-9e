import { ExecutionContext } from '@/types/workflow';
import { ActionResult } from '@/lib/workflows/actions';

/**
 * Internal function to execute Notion Manage Users action
 */
async function executeNotionManageUsersInternal(
  context: ExecutionContext,
  config: any
): Promise<any> {
  const { operation, userId, includeGuests } = config;

  // Get the Notion integration
  const { createClient } = await import('@/utils/supabaseClient');
  const supabase = createClient();

  const { data: integration, error: integrationError } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', context.userId)
    .eq('provider', 'notion')
    .eq('status', 'connected')
    .single();

  if (integrationError || !integration) {
    throw new Error('Notion integration not found or not connected');
  }

  const baseHeaders = {
    'Authorization': `Bearer ${integration.access_token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
  };

  switch (operation) {
    case 'list':
      // List all users in the workspace
      const listResponse = await fetch('https://api.notion.com/v1/users', {
        method: 'GET',
        headers: baseHeaders
      });

      if (!listResponse.ok) {
        const error = await listResponse.json();
        throw new Error(`Failed to list users: ${error.message || listResponse.statusText}`);
      }

      const listData = await listResponse.json();

      // Process and enrich user data
      const users = listData.results.map((user: any) => ({
        id: user.id,
        type: user.type,
        name: user.name || 'Unknown User',
        email: user.person?.email || user.bot?.owner?.workspace_name || null,
        avatar_url: user.avatar_url,
        // Person-specific details
        person: user.type === 'person' ? {
          email: user.person?.email,
        } : undefined,
        // Bot-specific details
        bot: user.type === 'bot' ? {
          owner_type: user.bot?.owner?.type,
          workspace_name: user.bot?.workspace_name,
        } : undefined,
        // Include guest status based on config
        is_guest: user.type === 'person' && !user.bot ?
          (user.person?.email && !user.person?.email.includes('@yourworkspace.com')) : false
      }));

      // Filter out guests if requested
      const filteredUsers = includeGuests === 'false'
        ? users.filter((u: any) => !u.is_guest)
        : users;

      return {
        users: filteredUsers,
        total_count: filteredUsers.length,
        has_more: listData.has_more,
        next_cursor: listData.next_cursor
      };

    case 'get':
      // Get details for a specific user
      if (!userId) {
        throw new Error('User ID is required for get operation');
      }

      const getResponse = await fetch(`https://api.notion.com/v1/users/${userId}`, {
        method: 'GET',
        headers: baseHeaders
      });

      if (!getResponse.ok) {
        const error = await getResponse.json();
        throw new Error(`Failed to get user details: ${error.message || getResponse.statusText}`);
      }

      const userData = await getResponse.json();

      // Return comprehensive user details
      const userDetails = {
        id: userData.id,
        type: userData.type,
        name: userData.name || 'Unknown User',
        avatar_url: userData.avatar_url,

        // Person-specific details
        person_details: userData.type === 'person' ? {
          email: userData.person?.email,
        } : null,

        // Bot-specific details
        bot_details: userData.type === 'bot' ? {
          owner_type: userData.bot?.owner?.type,
          owner_user_id: userData.bot?.owner?.user?.id,
          workspace_name: userData.bot?.workspace_name,
        } : null,

        // Additional metadata
        object: userData.object,

        // Workspace access level (inferred)
        access_level: userData.type === 'bot' ? 'bot' :
                     (userData.person?.email ? 'member' : 'guest'),

        // Format a readable description
        description: userData.type === 'bot'
          ? `Bot owned by ${userData.bot?.owner?.type || 'workspace'}`
          : `${userData.type === 'person' ? 'User' : 'Unknown'} - ${userData.person?.email || 'No email'}`
      };

      // Also fetch recent activity if possible (pages created/edited by this user)
      try {
        // Search for pages last edited by this user
        const activityResponse = await fetch('https://api.notion.com/v1/search', {
          method: 'POST',
          headers: baseHeaders,
          body: JSON.stringify({
            filter: {
              property: 'object',
              value: 'page'
            },
            sort: {
              direction: 'descending',
              timestamp: 'last_edited_time'
            },
            page_size: 5
          })
        });

        if (activityResponse.ok) {
          const activityData = await activityResponse.json();

          // Filter pages edited by this user
          const userPages = activityData.results.filter((page: any) =>
            page.last_edited_by?.id === userId
          ).slice(0, 5);

          userDetails.recent_activity = userPages.map((page: any) => ({
            page_id: page.id,
            title: page.properties?.title?.title?.[0]?.plain_text ||
                   page.properties?.Name?.title?.[0]?.plain_text ||
                   'Untitled',
            last_edited: page.last_edited_time,
            url: page.url
          }));
        }
      } catch (activityError) {
        console.log('Could not fetch user activity:', activityError);
        // Activity is optional, so we don't throw here
      }

      return {
        user: userDetails
      };

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

/**
 * Export wrapper function for action registry
 * Converts from standard action handler signature to ExecutionContext signature
 */
export async function executeNotionManageUsers(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Create ExecutionContext from standard inputs
    const context: ExecutionContext = {
      userId,
      workflowId: input.workflowId || '',
      executionId: input.executionId || '',
      testMode: input.testMode || false,
      dataFlowManager: {
        resolveVariable: (value: string) => {
          // Simple variable resolution for backward compatibility
          if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) {
            const match = value.match(/\{\{([^}]+)\}\}/);
            if (match) {
              const path = match[1].split('.');
              let result: any = input;
              for (const key of path) {
                result = result?.[key];
              }
              return result !== undefined ? result : value;
            }
          }
          return value;
        },
        getPreviousNodeOutputs: () => input.previousResults || {},
        getNodeOutput: (nodeId: string) => input.previousResults?.[nodeId] || null
      }
    };

    // Execute the internal function
    const result = await executeNotionManageUsersInternal(context, config);

    return {
      success: true,
      output: result,
      message: `Successfully executed ${config.operation} operation`
    };
  } catch (error: any) {
    console.error('Notion Manage Users error:', error);
    return {
      success: false,
      output: {},
      message: error.message || `Failed to execute ${config.operation} operation`
    };
  }
}