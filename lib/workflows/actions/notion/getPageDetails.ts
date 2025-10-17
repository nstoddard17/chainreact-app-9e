import { ExecutionContext } from '@/types/workflows';
import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/security/encryption';

import { logger } from '@/lib/utils/logger'

export async function notionGetPageDetails(
  context: ExecutionContext
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { node, dataFlowManager, testMode } = context;
    const config = node.data.configuration || {};
    
    // Get required fields
    const workspaceId = await dataFlowManager.resolveVariable(config.workspace);
    const pageId = await dataFlowManager.resolveVariable(config.page);
    
    if (!workspaceId || !pageId) {
      throw new Error('Workspace and Page are required');
    }
    
    // Get optional configuration
    const includeProperties = config.includeProperties !== false; // Default true
    const includeContent = config.includeContent !== false; // Default true
    const includeChildren = config.includeChildren === true; // Default false
    const includeComments = config.includeComments === true; // Default false
    const outputFormat = config.outputFormat || 'full';
    
    // In test mode, return sample data
    if (testMode) {
      return {
        success: true,
        data: {
          id: pageId,
          workspace: workspaceId,
          title: 'Test Page',
          url: `https://notion.so/${pageId}`,
          properties: includeProperties ? {
            'Title': { type: 'title', title: [{ plain_text: 'Test Page' }] },
            'Status': { type: 'select', select: { name: 'In Progress' } },
            'Created': { type: 'created_time', created_time: new Date().toISOString() }
          } : undefined,
          content: includeContent ? [
            { type: 'paragraph', text: 'This is test content from the page.' }
          ] : undefined,
          children: includeChildren ? [] : undefined,
          comments: includeComments ? [] : undefined,
          metadata: {
            created_time: new Date().toISOString(),
            last_edited_time: new Date().toISOString(),
            archived: false
          }
        }
      };
    }
    
    // Get the user's Notion integration
    const supabase = createAdminClient();
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
    
    // Get the workspace access token
    const workspaces = integration.metadata?.workspaces || {};
    const workspace = workspaces[workspaceId];
    
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found in integration`);
    }
    
    // Decrypt the access token
    const encryptionKey = process.env.ENCRYPTION_KEY!;
    const accessToken = decrypt(workspace.access_token, encryptionKey);
    
    // Fetch page details from Notion API
    const pageResponse = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Notion-Version': '2025-09-03',
        'Content-Type': 'application/json'
      }
    });
    
    if (!pageResponse.ok) {
      const error = await pageResponse.text();
      throw new Error(`Failed to fetch page details: ${error}`);
    }
    
    const pageData = await pageResponse.json();
    
    // Prepare the result based on output format
    const result: any = {
      id: pageData.id,
      url: pageData.url,
      workspace: workspaceId,
      workspaceName: workspace.workspace_name
    };
    
    // Extract title from properties
    if (pageData.properties) {
      for (const [propName, prop] of Object.entries(pageData.properties)) {
        if ((prop as any).type === 'title' && (prop as any).title?.length > 0) {
          result.title = (prop as any).title[0]?.plain_text || 'Untitled';
          break;
        }
      }
    }
    
    // Add data based on configuration
    if (includeProperties) {
      result.properties = pageData.properties;
    }
    
    if (includeContent) {
      // Fetch page content blocks
      const blocksResponse = await fetch(
        `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Notion-Version': '2025-09-03',
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (blocksResponse.ok) {
        const blocksData = await blocksResponse.json();
        result.content = blocksData.results;
      }
    }
    
    if (includeChildren) {
      // Search for child pages
      const childrenResponse = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Notion-Version': '2025-09-03',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: {
            property: 'object',
            value: 'page'
          },
          page_size: 100
        })
      });
      
      if (childrenResponse.ok) {
        const searchData = await childrenResponse.json();
        // Filter for pages that have this page as parent
        result.children = searchData.results.filter(
          (page: any) => page.parent?.page_id === pageId
        );
      }
    }
    
    if (includeComments) {
      // Fetch comments
      const commentsResponse = await fetch(
        `https://api.notion.com/v1/comments?block_id=${pageId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Notion-Version': '2025-09-03',
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (commentsResponse.ok) {
        const commentsData = await commentsResponse.json();
        result.comments = commentsData.results;
      }
    }
    
    // Add metadata
    result.metadata = {
      created_time: pageData.created_time,
      last_edited_time: pageData.last_edited_time,
      created_by: pageData.created_by,
      last_edited_by: pageData.last_edited_by,
      archived: pageData.archived,
      parent: pageData.parent,
      icon: pageData.icon,
      cover: pageData.cover
    };
    
    // Format based on output format
    switch (outputFormat) {
      case 'summary':
        return {
          success: true,
          data: {
            id: result.id,
            title: result.title,
            url: result.url,
            workspace: result.workspace,
            created: result.metadata.created_time,
            modified: result.metadata.last_edited_time
          }
        };
      
      case 'properties':
        return {
          success: true,
          data: {
            id: result.id,
            title: result.title,
            properties: result.properties
          }
        };
      
      case 'content':
        return {
          success: true,
          data: {
            id: result.id,
            title: result.title,
            content: result.content
          }
        };
      
      case 'metadata':
        return {
          success: true,
          data: {
            id: result.id,
            title: result.title,
            metadata: result.metadata
          }
        };
      
      case 'full':
      default:
        return {
          success: true,
          data: result
        };
    }
    
  } catch (error: any) {
    logger.error('Error getting Notion page details:', error);
    return {
      success: false,
      error: error.message || 'Failed to get page details'
    };
  }
}