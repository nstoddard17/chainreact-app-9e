import { ExecutionContext } from '@/types/workflow';
import { ActionResult } from '@/lib/workflows/actions';

/**
 * Build Notion filter from user-friendly filter fields
 */
function buildNotionFilter(config: any): any {
  const { filterType } = config;

  if (!filterType || filterType === 'custom_json') {
    // Use custom JSON filter if provided
    return config.customFilter ? JSON.parse(config.customFilter) : undefined;
  }

  // Build filter based on filter type
  switch (filterType) {
    // Title filters
    case 'title_contains':
      return {
        property: 'title',
        title: {
          contains: config.titleFilterValue || ''
        }
      };

    case 'title_equals':
      return {
        property: 'title',
        title: {
          equals: config.titleFilterValue || ''
        }
      };

    case 'title_starts_with':
      return {
        property: 'title',
        title: {
          starts_with: config.titleFilterValue || ''
        }
      };

    case 'title_ends_with':
      return {
        property: 'title',
        title: {
          ends_with: config.titleFilterValue || ''
        }
      };

    // Date filters
    case 'created_after':
      return {
        timestamp: 'created_time',
        created_time: {
          after: config.dateFilterValue || new Date().toISOString()
        }
      };

    case 'created_before':
      return {
        timestamp: 'created_time',
        created_time: {
          before: config.dateFilterValue || new Date().toISOString()
        }
      };

    case 'updated_after':
      return {
        timestamp: 'last_edited_time',
        last_edited_time: {
          after: config.dateFilterValue || new Date().toISOString()
        }
      };

    case 'updated_before':
      return {
        timestamp: 'last_edited_time',
        last_edited_time: {
          before: config.dateFilterValue || new Date().toISOString()
        }
      };

    // Property filters
    case 'property_equals':
      return {
        property: config.propertyName,
        rich_text: {
          equals: config.propertyValue || ''
        }
      };

    case 'property_contains':
      return {
        property: config.propertyName,
        rich_text: {
          contains: config.propertyValue || ''
        }
      };

    case 'property_checkbox':
      return {
        property: config.propertyName,
        checkbox: {
          equals: config.propertyCheckboxValue === 'true'
        }
      };

    case 'property_select':
      return {
        property: config.propertyName,
        select: {
          equals: config.propertyValue || ''
        }
      };

    case 'property_multi_select':
      return {
        property: config.propertyName,
        multi_select: {
          contains: config.propertyMultiSelectValues?.[0] || ''
        }
      };

    case 'property_number':
      const numberOperatorMap: Record<string, string> = {
        'equals': 'equals',
        'does_not_equal': 'does_not_equal',
        'greater_than': 'greater_than',
        'less_than': 'less_than',
        'greater_than_or_equal_to': 'greater_than_or_equal_to',
        'less_than_or_equal_to': 'less_than_or_equal_to'
      };

      return {
        property: config.propertyName,
        number: {
          [numberOperatorMap[config.propertyNumberOperator] || 'equals']: config.propertyNumberValue || 0
        }
      };

    case 'property_date':
      const dateOperatorMap: Record<string, any> = {
        'equals': { equals: config.propertyDateValue },
        'before': { before: config.propertyDateValue },
        'after': { after: config.propertyDateValue },
        'on_or_before': { on_or_before: config.propertyDateValue },
        'on_or_after': { on_or_after: config.propertyDateValue },
        'past_week': { past_week: {} },
        'past_month': { past_month: {} },
        'past_year': { past_year: {} },
        'next_week': { next_week: {} },
        'next_month': { next_month: {} },
        'next_year': { next_year: {} }
      };

      return {
        property: config.propertyName,
        date: dateOperatorMap[config.propertyDateOperator] || { equals: config.propertyDateValue }
      };

    case 'property_people':
      return {
        property: config.propertyName,
        people: {
          contains: config.propertyPeopleValue || ''
        }
      };

    default:
      return undefined;
  }
}

/**
 * Build Notion sorts array from user-friendly sort fields
 */
function buildNotionSorts(config: any): any[] | undefined {
  if (!config.sortBy) {
    return undefined;
  }

  return [{
    property: config.sortBy === 'title' ? 'title' : config.sortBy,
    direction: config.sortDirection || 'ascending'
  }];
}

/**
 * Internal function to execute Notion Manage Database action
 */
async function executeNotionManageDatabaseInternal(
  context: ExecutionContext,
  config: any
): Promise<any> {
  const { operation } = config;

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
    case 'create':
      // Create a new database
      const createBody = {
        parent: {
          type: config.databaseType === 'Inline' ? 'page_id' : 'workspace',
          ...(config.databaseType === 'Inline' ? { page_id: config.parentPage } : { workspace: true })
        },
        title: [
          {
            type: 'text',
            text: {
              content: config.title || 'Untitled Database'
            }
          }
        ],
        properties: {
          Name: {
            title: {}
          }
        }
      };

      const createResponse = await fetch('https://api.notion.com/v1/databases', {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify(createBody)
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(`Failed to create database: ${error.message || createResponse.statusText}`);
      }

      return await createResponse.json();

    case 'query':
    case 'search':
      // Query/search a database
      const filter = buildNotionFilter(config);
      const sorts = buildNotionSorts(config);

      const queryBody: any = {
        page_size: Math.min(config.limit || 100, 100)
      };

      if (filter) {
        queryBody.filter = filter;
      }

      if (sorts) {
        queryBody.sorts = sorts;
      }

      const queryResponse = await fetch(`https://api.notion.com/v1/databases/${config.database}/query`, {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify(queryBody)
      });

      if (!queryResponse.ok) {
        const error = await queryResponse.json();
        throw new Error(`Failed to query database: ${error.message || queryResponse.statusText}`);
      }

      const queryResult = await queryResponse.json();

      return {
        results: queryResult.results,
        hasMore: queryResult.has_more,
        nextCursor: queryResult.next_cursor,
        totalResults: queryResult.results.length
      };

    case 'update':
      // Update database metadata
      const updateBody: any = {};

      if (config.title) {
        updateBody.title = [
          {
            type: 'text',
            text: {
              content: config.title
            }
          }
        ];
      }

      if (config.description) {
        updateBody.description = [
          {
            type: 'text',
            text: {
              content: config.description
            }
          }
        ];
      }

      const updateResponse = await fetch(`https://api.notion.com/v1/databases/${config.database}`, {
        method: 'PATCH',
        headers: baseHeaders,
        body: JSON.stringify(updateBody)
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.json();
        throw new Error(`Failed to update database: ${error.message || updateResponse.statusText}`);
      }

      return await updateResponse.json();

    case 'sync':
      // Sync database entries (simplified version)
      // This would need more complex implementation based on sync direction
      throw new Error('Database sync operation not yet implemented');

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

/**
 * Export wrapper function for action registry
 * Converts from standard action handler signature to ExecutionContext signature
 */
export async function executeNotionManageDatabase(
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
    const result = await executeNotionManageDatabaseInternal(context, config);

    return {
      success: true,
      output: result,
      message: `Successfully executed ${config.operation} operation`
    };
  } catch (error: any) {
    console.error('Notion Manage Database error:', error);
    return {
      success: false,
      output: {},
      message: error.message || `Failed to execute ${config.operation} operation`
    };
  }
}