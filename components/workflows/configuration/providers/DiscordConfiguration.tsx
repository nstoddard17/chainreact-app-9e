"use client"

import React, { useCallback, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings2, Zap, AlertTriangle, Check, X, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldRenderer } from '../fields/FieldRenderer';
import DiscordBotStatus from '@/components/workflows/DiscordBotStatus';
import { useDiscordState } from '../hooks/useDiscordState';
import { DiscordReactionRemover } from '../fields/discord/DiscordReactionRemover';
import { useIntegrationStore } from '@/stores/integrationStore';

interface DiscordConfigurationProps {
  nodeInfo: any;
  values: Record<string, any>;
  setValue: (field: string, value: any) => void;
  errors: Record<string, string>;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  onCancel: () => void;
  onBack?: () => void;
  isEditMode?: boolean;
  workflowData?: any;
  currentNodeId?: string;
  dynamicOptions: Record<string, any[]>;
  loadingDynamic: boolean;
  loadOptions: (fieldName: string, parentField?: string, parentValue?: any, forceReload?: boolean) => Promise<void>;
  integrationName?: string;
  needsConnection?: boolean;
  onConnectIntegration?: () => void;
  aiFields?: Record<string, boolean>;
  setAiFields?: (fields: Record<string, boolean>) => void;
}

export function DiscordConfiguration({
  nodeInfo,
  values,
  setValue,
  errors,
  onSubmit,
  onCancel,
  onBack,
  isEditMode,
  workflowData,
  currentNodeId,
  dynamicOptions,
  loadingDynamic,
  loadOptions,
  integrationName,
  needsConnection,
  onConnectIntegration,
  aiFields = {},
  setAiFields = () => {},
}: DiscordConfigurationProps) {
  const [activeTab, setActiveTab] = useState('basic');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set());
  const [hasSavedValues, setHasSavedValues] = useState(false);
  
  // Get integration to check status
  const { getIntegrationByProvider, integrations } = useIntegrationStore();
  const integration = getIntegrationByProvider('discord');
  
  // Check if we have saved values for dependent fields (indicates we're reopening with saved config)
  useEffect(() => {
    // Check if we have saved values - channelId should be set and not being loaded from initial mount
    const hasChannelValue = !!(values.channelId);
    const hasAuthorValue = !!(values.authorFilter);
    const hasSavedConfiguration = hasChannelValue || hasAuthorValue;
    
    setHasSavedValues(hasSavedConfiguration);
    
    if (hasSavedConfiguration) {
      console.log('🔍 [DiscordConfig] Detected saved configuration');
      console.log('  - channelId:', values.channelId);
      console.log('  - authorFilter:', values.authorFilter);
      console.log('  - hasSavedConfiguration:', hasSavedConfiguration);
      
      // Silently load the data in background to get actual names
      // This won't show loading states but will populate the options
      if (hasChannelValue && values.guildId) {
        console.log('📥 [DiscordConfig] Silently loading channels for display');
        // Direct call to loadOptions with silent flag
        loadOptions('channelId', 'guildId', values.guildId, false, true);
      }
      
      if (hasAuthorValue && values.channelId) {
        console.log('📥 [DiscordConfig] Silently loading users for display');
        // Load after a short delay to ensure channel context is ready
        setTimeout(() => {
          // authorFilter depends on channelId for discord_members
          loadOptions('authorFilter', 'channelId', values.channelId, false, true);
        }, 1000); // Delay to ensure other data is ready
      }
    }
  }, []); // Only run once on mount

  // Use Discord state hook
  const discordState = useDiscordState({
    nodeInfo,
    values,
    loadOptions
  });
  
  // Reload data when integration status changes
  React.useEffect(() => {
    if (integration?.status === 'connected' || integration?.status === 'active') {
      // Only reload guild options if we don't already have them
      if (nodeInfo?.configSchema && !dynamicOptions?.guildId?.length) {
        const guildField = nodeInfo.configSchema.find((f: any) => f.name === 'guildId');
        if (guildField && guildField.dynamic) {
          loadOptions('guildId', undefined, undefined, true);
        }
      }
    }
  }, [integration?.status]);
  
  // Listen for integration reconnection events
  React.useEffect(() => {
    const handleReconnection = async (event: CustomEvent) => {
      console.log('🔄 [DiscordConfig] Integration reconnection event received:', event.detail);
      
      // Check if this is for Discord
      if (event.detail?.provider === 'discord') {
        console.log('✅ [DiscordConfig] Discord reconnected, refreshing fields...');
        
        // Clear Discord guilds cache to ensure fresh data
        try {
          const { clearDiscordGuildsCache } = await import('@/stores/discordGuildsCacheStore');
          clearDiscordGuildsCache();
          console.log('✅ [DiscordConfig] Cleared Discord guilds cache');
        } catch (error) {
          console.error('Failed to clear Discord guilds cache:', error);
        }
        
        // Set loading state for the guild field
        setLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.add('guildId');
          return newSet;
        });
        
        // Force refresh integrations to get updated status
        setTimeout(() => {
          // Reload the guild options
          if (nodeInfo?.configSchema) {
            const guildField = nodeInfo.configSchema.find((f: any) => f.name === 'guildId');
            if (guildField && guildField.dynamic) {
              loadOptions('guildId', undefined, undefined, true).finally(() => {
                setLoadingFields(prev => {
                  const newSet = new Set(prev);
                  newSet.delete('guildId');
                  return newSet;
                });
              });
            }
          }
        }, 500); // Small delay to ensure integration status is updated
      }
    };
    
    // Listen for the reconnection event
    window.addEventListener('integration-reconnected', handleReconnection as EventListener);
    
    return () => {
      window.removeEventListener('integration-reconnected', handleReconnection as EventListener);
    };
  }, [nodeInfo, loadOptions]);
  
  // Load channels when bot status changes to connected
  React.useEffect(() => {
    // SKIP if we have saved values
    if (hasSavedValues && values.channelId) {
      console.log('📌 [DiscordConfig] Bot connected but skipping channel load - using saved channel value:', values.channelId);
      return;
    }
    
    // Only load if bot just became connected and we don't already have channels
    if (discordState?.botStatus?.isInGuild && values.guildId && !discordState?.isBotStatusChecking) {
      // Check if we already have channels loaded
      if (dynamicOptions?.channelId?.length > 0) {
        console.log('📌 [DiscordConfig] Channels already loaded, skipping');
        return;
      }
      
      console.log('🤖 [DiscordConfig] Bot is connected, loading channels for guild:', values.guildId);
      
      // Set loading state for channels
      setLoadingFields(prev => {
        const newSet = new Set(prev);
        newSet.add('channelId');
        return newSet;
      });
      
      // Load channels
      loadOptions('channelId', 'guildId', values.guildId, true).finally(() => {
        setLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.delete('channelId');
          return newSet;
        });
      });
      
      // Note: authorFilter now depends on channelId, not guildId
      // It will be loaded when a channel is selected
    }
  }, [discordState?.botStatus?.isInGuild, values.guildId, discordState?.isBotStatusChecking, hasSavedValues, values.channelId]);

  // Helper function to check if a field should be shown based on dependencies
  const shouldShowField = (field: any) => {
    // Never show fields with type: 'hidden'
    if (field.type === 'hidden') return false;
    
    // Special handling for channelId field - only show if bot is connected to selected guild
    if (field.name === 'channelId' && values.guildId) {
      // Check if bot is connected to the selected guild
      const botIsConnected = discordState?.botStatus?.isInGuild === true;
      const botIsChecking = discordState?.isBotStatusChecking;
      
      // Show field if bot is connected or still checking (with loading state)
      if (!botIsConnected && !botIsChecking) {
        return false; // Hide channel field if bot is not connected
      }
    }
    
    // If field has hidden: true and dependsOn, only show if dependency is satisfied
    if (field.hidden && field.dependsOn) {
      const dependencyValue = values[field.dependsOn];
      return !!dependencyValue; // Show only if dependency has a value
    }
    
    // If field has hidden: true but no dependsOn, don't show it
    if (field.hidden) return false;
    
    // Otherwise show the field
    return true;
  };

  // Separate fields into basic and advanced
  const baseFields = nodeInfo?.configSchema?.filter((field: any) => 
    !field.advanced && shouldShowField(field)
  ) || [];
  
  const advancedFields = nodeInfo?.configSchema?.filter((field: any) => 
    field.advanced && shouldShowField(field)
  ) || [];

  // Handle dynamic field loading
  const handleDynamicLoad = useCallback(async (
    fieldName: string,
    dependsOn?: string,
    dependsOnValue?: any,
    forceReload?: boolean,
    silent?: boolean  // Add silent parameter
  ) => {
    console.log('🔍 [DiscordConfig] handleDynamicLoad called:', { 
      fieldName, 
      dependsOn, 
      dependsOnValue,
      forceReload,
      silent,
      hasSavedValues,
      currentValue: values[fieldName]
    });
    
    // For saved configurations with non-silent calls, skip loading for channelId only
    // authorFilter always needs to load its options even with saved values
    if (hasSavedValues && fieldName === 'channelId' && !forceReload && !silent) {
      console.log(`🚫 [DiscordConfig] SKIPPING load for ${fieldName} - using saved value:`, values[fieldName]);
      // Clear any loading state that might have been set
      setLoadingFields(prev => {
        const newSet = new Set(prev);
        newSet.delete(fieldName);
        return newSet;
      });
      return; // Don't load anything
    }
    
    // For silent loads, proceed but don't show loading state
    if (silent) {
      console.log(`🔇 [DiscordConfig] Silent load for ${fieldName}`);
    }
    
    
    // Skip loading guildId if we already have options and not force reloading
    // Also skip if we already have a selected value to prevent re-triggering loading state
    if (fieldName === 'guildId' && !forceReload) {
      // If we have a selected value AND options, definitely skip
      if (values.guildId && dynamicOptions?.guildId?.length > 0) {
        console.log('📌 [DiscordConfig] Skipping guildId reload - value selected and options exist');
        // Make sure loading state is cleared
        setLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.delete('guildId');
          return newSet;
        });
        return;
      }
      // Check if we already have options loaded (even without a value)
      if (dynamicOptions?.guildId?.length > 0) {
        console.log('📌 [DiscordConfig] Skipping guildId reload - already have options');
        // Make sure loading state is cleared
        setLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.delete('guildId');
          return newSet;
        });
        return;
      }
    }
    
    // Skip loading channelId if bot is not connected yet
    if (fieldName === 'channelId' && values.guildId && !discordState?.botStatus?.isInGuild && !discordState?.isBotStatusChecking) {
      console.log('⏸️ [DiscordConfig] Skipping channelId load - bot not connected yet');
      return;
    }
    
    const field = nodeInfo?.configSchema?.find((f: any) => f.name === fieldName);
    if (!field) {
      console.warn('Field not found in schema:', fieldName);
      return;
    }
    
    try {
      // Only set loading state if not silent
      if (!silent) {
        setLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.add(fieldName);
          return newSet;
        });
      }
      
      // If explicit dependencies are provided, use them
      if (dependsOn && dependsOnValue !== undefined) {
        await loadOptions(fieldName, dependsOn, dependsOnValue, forceReload, silent);
      } 
      // Otherwise check field's defined dependencies
      else if (field.dependsOn && values[field.dependsOn]) {
        await loadOptions(fieldName, field.dependsOn, values[field.dependsOn], forceReload, silent);
      } 
      // No dependencies, just load the field
      else {
        await loadOptions(fieldName, undefined, undefined, forceReload, silent);
      }
    } catch (error) {
      console.error('Error loading dynamic options:', error);
    } finally {
      // Clear loading state when done (but not for silent loads)
      if (!silent) {
        setLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.delete(fieldName);
          return newSet;
        });
      }
    }
  }, [nodeInfo, values, loadOptions, dynamicOptions, discordState]);

  // Render fields helper
  const renderFields = (fields: any[]) => {
    return fields.map((field, index) => (
      <React.Fragment key={`field-${field.name}-${index}`}>
        <FieldRenderer
          field={field}
          value={values[field.name]}
          onChange={(value) => setValue(field.name, value)}
          error={errors[field.name] || validationErrors[field.name]}
          workflowData={workflowData}
          currentNodeId={currentNodeId}
          dynamicOptions={dynamicOptions}
          loadingDynamic={loadingFields.has(field.name)}
          nodeInfo={nodeInfo}
          onDynamicLoad={handleDynamicLoad}
          parentValues={values}
        />
        
        {/* Discord Reaction Remover for remove_reaction action */}
        {field.name === 'messageId' && nodeInfo?.type === 'discord_action_remove_reaction' && values.messageId && values.channelId && (
          <DiscordReactionRemover
            messageId={values.messageId}
            channelId={values.channelId}
            onReactionSelect={(emoji) => setValue('selectedEmoji', emoji)}
            selectedReaction={values.selectedEmoji}
            dynamicOptions={{...dynamicOptions, selectedEmoji: discordState.selectedEmojiReactions}}
            onLoadReactions={() => {
              discordState.loadReactionsForMessage(values.channelId, values.messageId);
            }}
            isLoading={loadingFields.has('selectedEmoji')}
          />
        )}
      </React.Fragment>
    ));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    const requiredFields = [...baseFields, ...advancedFields].filter(f => f.required);
    const errors: Record<string, string> = {};
    
    requiredFields.forEach(field => {
      if (!values[field.name]) {
        errors[field.name] = `${field.label || field.name} is required`;
      }
    });
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    
    await onSubmit(values);
  };

  // Show connection required state
  if (needsConnection) {
    const isReauthorization = integration?.status === 'needs_reauthorization';
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
        <h3 className="text-lg font-semibold mb-2">
          {isReauthorization ? 'Discord Re-authorization Required' : 'Discord Connection Required'}
        </h3>
        <p className="text-sm text-slate-600 mb-4">
          {isReauthorization 
            ? 'Your Discord integration needs to be re-authorized. Please reconnect your account.'
            : 'Please connect your Discord account to use this action.'}
        </p>
        <Button onClick={onConnectIntegration} variant="default">
          {isReauthorization ? 'Reconnect Discord' : 'Connect Discord'}
        </Button>
      </div>
    );
  }

  // For Discord triggers, use simpler UI
  if (nodeInfo?.type === 'discord_trigger_new_message' || nodeInfo?.type === 'discord_trigger_slash_command') {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <div className="flex-1 px-6 py-4">
          <ScrollArea className="h-[calc(90vh-180px)] pr-4">
            <div className="space-y-3">
              {/* Inline guidance banner for selecting server/channel */}
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <div className="font-medium mb-1">Select a Discord server and channel</div>
                <div className="mb-2">Choose your server first, then pick a channel to listen for new messages.</div>
                {!dynamicOptions?.guildId?.length && (
                  <div className="flex items-center gap-2 text-blue-900">
                    <span>Don’t see your servers?</span>
                    <ul className="list-disc pl-5">
                      <li>Connect Discord in Integrations</li>
                      <li>Invite the bot to your server</li>
                      <li>Ensure the bot can view channels</li>
                    </ul>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleDynamicLoad('guildId', undefined, undefined, true)}
                    >
                      Retry loading servers
                    </Button>
                  </div>
                )}
                {values.guildId && (!dynamicOptions?.channelId?.length || !values.channelId) && (
                  <div className="flex items-center gap-2 mt-2">
                    <span>After selecting a server, choose a channel.</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleDynamicLoad('channelId', 'guildId', values.guildId, true)}
                    >
                      Retry loading channels
                    </Button>
                  </div>
                )}
              </div>
              {renderFields(baseFields)}
              
              {/* Discord Bot Status for triggers - Show after guild is selected but before channel field */}
              {values.guildId && !discordState?.botStatus?.isInGuild && !discordState?.isBotStatusChecking && (
                <DiscordBotStatus
                  integration={discordState.discordIntegration}
                  botStatus={discordState.botStatus}
                  isChecking={discordState.isBotStatusChecking}
                  onInviteBot={() => discordState.handleInviteBot(values.guildId)}
                  channelBotStatus={discordState.channelBotStatus}
                  isChannelChecking={discordState.isChannelBotStatusChecking}
                  isBotConnectionInProgress={discordState.isBotConnectionInProgress}
                  guildId={values.guildId}
                  channelId={values.channelId}
                />
              )}
            </div>
          </ScrollArea>
        </div>
        
        <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 bg-white dark:bg-slate-900">
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onBack || onCancel}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <Button type="submit">
              {isEditMode ? 'Update' : 'Save'} Configuration
            </Button>
          </div>
        </div>
      </form>
    );
  }

  // Discord Actions UI with tabs
  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <TabsList className="mx-6 mt-4 mb-0 grid w-auto grid-cols-2 gap-1 p-1 bg-slate-100/50">
          <TabsTrigger
            value="basic"
            className={cn(
              "flex items-center gap-2 px-3 py-2",
              "rounded-md transition-all duration-200",
              activeTab === "basic" 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Settings2 className="h-4 w-4" />
            Basic
          </TabsTrigger>
          <TabsTrigger
            value="advanced"
            className={cn(
              "flex items-center gap-2 px-3 py-2",
              "rounded-md transition-all duration-200",
              activeTab === "advanced" 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Zap className="h-4 w-4" />
            Advanced
          </TabsTrigger>
        </TabsList>
        
        <div className="flex-1 min-h-0">
          <TabsContent value="basic" className="h-full mt-0">
            <ScrollArea className="h-[calc(90vh-220px)] pr-4">
              <div className="space-y-3 px-6 pb-6">
                {renderFields(baseFields)}
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="advanced" className="h-full mt-0">
            <ScrollArea className="h-[calc(90vh-220px)] pr-4">
              <div className="space-y-3 px-6 pb-6">
                {advancedFields.length > 0 ? (
                  renderFields(advancedFields)
                ) : (
                  <div className="text-center text-slate-500 py-8">
                    No advanced settings available for this action.
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </div>
        
        {/* Discord Bot Status - Show after guild is selected but before channel field */}
        {values.guildId && !discordState?.botStatus?.isInGuild && !discordState?.isBotStatusChecking && (
          <DiscordBotStatus
            integration={discordState.discordIntegration}
            botStatus={discordState.botStatus}
            isChecking={discordState.isBotStatusChecking}
            onInviteBot={() => discordState.handleInviteBot(values.guildId)}
            channelBotStatus={discordState.channelBotStatus}
            isChannelChecking={discordState.isChannelBotStatusChecking}
            isBotConnectionInProgress={discordState.isBotConnectionInProgress}
            guildId={values.guildId}
            channelId={values.channelId}
          />
        )}
        
        <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 bg-white dark:bg-slate-900">
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onBack || onCancel}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <Button type="submit">
              {isEditMode ? 'Update' : 'Save'} Configuration
            </Button>
          </div>
        </div>
      </Tabs>
    </form>
  );
}
