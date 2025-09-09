/**
 * [Provider Name] Options Loader Template
 * 
 * Instructions:
 * 1. Replace [Provider] with your provider name (e.g., Notion, Slack, etc.)
 * 2. Replace [provider] with lowercase provider ID (e.g., notion, slack, etc.)
 * 3. Add your supported fields to the supportedFields array
 * 4. Implement the load methods for each field type
 * 5. Define field dependencies if any fields depend on others
 * 
 * File Location: components/workflows/configuration/providers/[provider]/[provider]OptionsLoader.ts
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';

export class [Provider]OptionsLoader implements ProviderOptionsLoader {
  /**
   * List of field names this loader can handle
   * These should match the field names in availableNodes.ts
   */
  private supportedFields = [
    // Add your field names here
    // 'workspaceId',
    // 'channelId',
    // 'userId',
  ];

  /**
   * Check if this loader can handle the given field
   * @param fieldName - The field name from the workflow node
   * @param providerId - The provider ID (should match your provider)
   */
  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === '[provider]' && this.supportedFields.includes(fieldName);
  }

  /**
   * Main entry point for loading options
   * Routes to specific load methods based on field name
   */
  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, dependsOnValue, forceRefresh, signal } = params;

    switch (fieldName) {
      // Add cases for each supported field
      // case 'workspaceId':
      //   return this.loadWorkspaces(params);
      
      // case 'channelId':
      //   return this.loadChannels(params);
      
      default:
        console.warn(`[Provider] Unsupported field: ${fieldName}`);
        return [];
    }
  }

  /**
   * Example: Load workspaces (top-level resource)
   * Replace with your actual implementation
   */
  // private async loadWorkspaces(params: LoadOptionsParams): Promise<FormattedOption[]> {
  //   const { integrationId, signal } = params;
    
  //   if (!integrationId) {
  //     console.log('🔍 [[Provider]] Cannot load workspaces without integrationId');
  //     return [];
  //   }

  //   try {
  //     const response = await fetch('/api/integrations/[provider]/data', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({
  //         integrationId,
  //         dataType: '[provider]_workspaces',
  //         options: {}
  //       }),
  //       signal
  //     });

  //     if (!response.ok) {
  //       throw new Error(`Failed to load workspaces: ${response.status}`);
  //     }

  //     const result = await response.json();
  //     const workspaces = result.data || [];

  //     return workspaces.map((workspace: any) => ({
  //       value: workspace.id,
  //       label: workspace.name || workspace.id,
  //       // Add any additional properties you want to store
  //       icon: workspace.icon,
  //       description: workspace.description
  //     }));
  //   } catch (error: any) {
  //     console.error('❌ [[Provider]] Error loading workspaces:', error);
      
  //     // Handle specific error types
  //     if (error.message?.includes('authentication') || error.message?.includes('expired')) {
  //       console.log('🔄 [[Provider]] Authentication error detected, token may need refresh');
  //     }
      
  //     return [];
  //   }
  // }

  /**
   * Example: Load channels (depends on workspace)
   * Shows how to handle dependent fields
   */
  // private async loadChannels(params: LoadOptionsParams): Promise<FormattedOption[]> {
  //   const { dependsOnValue: workspaceId, integrationId, signal } = params;
    
  //   if (!workspaceId) {
  //     console.log('🔍 [[Provider]] Cannot load channels without workspaceId');
  //     return [];
  //   }

  //   if (!integrationId) {
  //     console.log('🔍 [[Provider]] Cannot load channels without integrationId');
  //     return [];
  //   }

  //   try {
  //     const response = await fetch('/api/integrations/[provider]/data', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({
  //         integrationId,
  //         dataType: '[provider]_channels',
  //         options: { workspaceId }
  //       }),
  //       signal
  //     });

  //     if (!response.ok) {
  //       throw new Error(`Failed to load channels: ${response.status}`);
  //     }

  //     const result = await response.json();
  //     const channels = result.data || [];

  //     // Sort channels for better UX
  //     channels.sort((a: any, b: any) => {
  //       // Sort by type first (e.g., public before private)
  //       if (a.type !== b.type) {
  //         return a.type === 'public' ? -1 : 1;
  //       }
  //       // Then alphabetically
  //       return (a.name || a.id).localeCompare(b.name || b.id);
  //     });

  //     return channels.map((channel: any) => ({
  //       value: channel.id,
  //       label: channel.name || channel.id,
  //       type: channel.type,
  //       isPrivate: channel.is_private,
  //       memberCount: channel.member_count
  //     }));
  //   } catch (error) {
  //     console.error('❌ [[Provider]] Error loading channels:', error);
  //     return [];
  //   }
  // }

  /**
   * Define field dependencies
   * Return an array of field names that must be filled before this field can load
   */
  getFieldDependencies(fieldName: string): string[] {
    switch (fieldName) {
      // Example: channels depend on workspace being selected first
      // case 'channelId':
      //   return ['workspaceId'];
      
      // case 'messageId':
      //   return ['channelId'];
      
      default:
        return [];
    }
  }

  /**
   * Optional: Clear any provider-specific cache
   * Called when the integration is refreshed or reconnected
   */
  clearCache?(): void {
    // Implement if you have provider-specific caching
    // For example, clear stored workspace list
    console.log('🧹 [[Provider]] Clearing cache');
  }
}

/**
 * Usage:
 * 1. Save this file as: components/workflows/configuration/providers/[provider]/[provider]OptionsLoader.ts
 * 2. Register in providers/registry.ts:
 *    import { [Provider]OptionsLoader } from './[provider]/[provider]OptionsLoader';
 *    this.register('[provider]', new [Provider]OptionsLoader());
 * 3. Add field mappings in config/fieldMappings.ts
 * 4. Create API handler at: app/api/integrations/[provider]/data/route.ts
 */