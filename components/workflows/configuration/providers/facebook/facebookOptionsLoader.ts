/**
 * Facebook Options Loader
 * Handles dynamic option loading for Facebook integration fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';

export class FacebookOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'pageId',
    'recipientId',
    'postId',
    'shareToGroups'
  ];

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'facebook' && this.supportedFields.includes(fieldName);
  }

  async load(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, integrationId, dependsOnValue, signal } = params;
    
    if (!integrationId) {
      console.log('🔍 [Facebook] No integration ID provided');
      return [];
    }

    try {
      let result: FormattedOption[] = [];
      
      switch (fieldName) {
        case 'pageId':
          result = await this.loadPages(params);
          break;
        
        case 'recipientId':
          result = await this.loadConversations(params);
          break;
        
        case 'postId':
          result = await this.loadPosts(params);
          break;
        
        case 'shareToGroups':
          result = await this.loadGroups(params);
          break;
        
        default:
          result = [];
      }
      
      console.log(`✅ [Facebook] Loaded ${result.length} options for ${fieldName}`);
      return result;
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('🚫 [Facebook] Request aborted for field:', fieldName);
        return [];
      }
      
      console.error('❌ [Facebook] Error loading options:', error);
      throw error;
    }
  }

  private async loadPages(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { integrationId, signal } = params;
    
    try {
      const response = await fetch('/api/integrations/facebook/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'facebook_pages'
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load Facebook pages: ${response.status}`);
      }

      const result = await response.json();
      const pages = result.data || [];

      return pages.map((page: any) => ({
        value: page.id,
        label: page.name || page.id,
        metadata: {
          accessToken: page.access_token,
          category: page.category
        }
      }));
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw error;
      }
      console.error('❌ [Facebook] Error loading pages:', error);
      return [];
    }
  }

  private async loadConversations(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { integrationId, dependsOnValue: pageId, signal } = params;
    
    if (!pageId) {
      console.log('🔍 [Facebook] Cannot load conversations without page ID');
      return [];
    }

    try {
      const response = await fetch('/api/integrations/facebook/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'facebook_conversations',
          options: { pageId }
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load conversations: ${response.status}`);
      }

      const result = await response.json();
      const conversations = result.data || [];

      return conversations.map((conv: any) => ({
        value: conv.id,
        label: conv.participants?.[0]?.name || conv.id,
        metadata: {
          updatedTime: conv.updated_time,
          messageCount: conv.message_count
        }
      }));
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw error;
      }
      console.error('❌ [Facebook] Error loading conversations:', error);
      return [];
    }
  }

  private async loadPosts(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { integrationId, dependsOnValue: pageId, signal } = params;
    
    if (!pageId) {
      console.log('🔍 [Facebook] Cannot load posts without page ID');
      return [];
    }

    try {
      const response = await fetch('/api/integrations/facebook/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'facebook_posts',
          options: { pageId }
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load posts: ${response.status}`);
      }

      const result = await response.json();
      const posts = result.data || [];

      return posts.map((post: any) => ({
        value: post.id,
        label: post.message ? 
          (post.message.length > 50 ? 
            post.message.substring(0, 50) + '...' : 
            post.message) : 
          `Post ${post.id}`,
        metadata: {
          createdTime: post.created_time,
          type: post.type
        }
      }));
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw error;
      }
      console.error('❌ [Facebook] Error loading posts:', error);
      return [];
    }
  }

  private async loadGroups(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { integrationId, signal } = params;
    
    // Groups are loaded for the user, not dependent on page selection
    try {
      const response = await fetch('/api/integrations/facebook/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'facebook_groups',
          options: {}
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load groups: ${response.status}`);
      }

      const result = await response.json();
      const groups = result.data || [];
      
      console.log('🔍 [Facebook] Groups data received:', groups);

      return groups.map((group: any) => ({
        value: group.id, // Always use group.id for the value
        label: group.name || `Group ${group.id}`,
        disabled: group.id === 'no-groups' || group.id === 'permission-info' || group.id === 'error' || group.id === 'no-groups-found' || group.id === 'api-limitation', // Disable informational entries
        metadata: {
          memberCount: group.member_count,
          privacy: group.privacy,
          description: group.description
        }
      }));
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw error;
      }
      console.error('❌ [Facebook] Error loading groups:', error);
      return [];
    }
  }

  getFieldDependencies(fieldName: string): string[] {
    switch (fieldName) {
      case 'recipientId':
      case 'postId':
        return ['pageId'];
      
      case 'shareToGroups':
        return []; // Groups don't depend on page selection
      
      default:
        return [];
    }
  }

  shouldResetOnDependencyChange(fieldName: string): boolean {
    // Reset dependent fields when page changes
    return ['recipientId', 'postId'].includes(fieldName);
  }
}