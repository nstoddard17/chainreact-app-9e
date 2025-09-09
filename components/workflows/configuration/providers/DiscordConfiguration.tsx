"use client"

import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, ChevronLeft, AlertCircle, ExternalLink, CheckCircle } from "lucide-react";
import { FieldRenderer } from '../fields/FieldRenderer';
import { useDiscordState } from '../hooks/useDiscordState';
import { cn } from "@/lib/utils";

// Discord-specific extended configuration
// This includes Discord-specific UI features like bot status, channel permissions, etc.
export const DISCORD_EXTENDED_CONFIG = {
  features: {
    botStatusChecking: true,
    channelPermissionWarnings: true,
    progressiveFieldDisclosure: true,
    richTextEditor: true,
  },
  // Add more Discord-specific UI configuration here as needed
};

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
  isConnectedToAIAgent?: boolean;
  loadingFields?: Set<string>;
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
  aiFields,
  setAiFields,
  isConnectedToAIAgent,
  loadingFields = new Set(),
}: DiscordConfigurationProps) {
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [localLoadingFields, setLocalLoadingFields] = useState<Set<string>>(new Set());
  const isLoadingChannels = useRef(false);
  
  // Use Discord state hook for advanced features
  const discordState = useDiscordState({
    nodeInfo,
    values,
    loadOptions
  });
  
  const {
    botStatus,
    isBotStatusChecking,
    channelBotStatus,
    isChannelBotStatusChecking,
    channelLoadingError,
    rateLimitInfo,
    handleInviteBot,
    checkBotStatus
  } = discordState;
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    const newErrors: Record<string, string> = {};
    
    if (nodeInfo?.configSchema) {
      for (const field of nodeInfo.configSchema) {
        if (field.required && !values[field.name]) {
          newErrors[field.name] = `${field.label} is required`;
        }
      }
    }
    
    if (Object.keys(newErrors).length > 0) {
      setValidationErrors(newErrors);
      return;
    }
    
    await onSubmit(values);
  };

  // Need connection UI
  if (needsConnection) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
        <h3 className="text-lg font-semibold mb-2">
          Discord Connection Required
        </h3>
        <p className="text-sm text-slate-600 mb-4">
          Please connect your Discord account to use this action.
        </p>
        <Button onClick={onConnectIntegration}>
          Connect Discord
        </Button>
      </div>
    );
  }

  // Ultra-simple field change handler with debouncing and loading state management
  const handleFieldChange = (fieldName: string, value: any) => {
    console.log('🎯 [Discord] Field change:', fieldName, value);
    
    // Update the value immediately
    setValue(fieldName, value);
    
    // Handle server selection
    if (fieldName === 'guildId' && value) {
      // Prevent multiple concurrent loads
      if (isLoadingChannels.current) {
        console.log('⏳ [Discord] Already loading channels, skipping');
        return;
      }
      
      // Clear dependent fields when server changes
      setValue('channelId', '');
      setValue('messageId', '');
      
      // Check bot status for the selected guild
      checkBotStatus(value);
      
      // Set loading flag
      isLoadingChannels.current = true;
      setLocalLoadingFields(new Set(['channelId']));
      
      // Load channels with a longer delay to prevent UI freeze
      setTimeout(() => {
        console.log('📥 [Discord] Loading channels for guild:', value);
        loadOptions('channelId', 'guildId', value)
          .then(() => {
            console.log('✅ [Discord] Channels loaded successfully');
          })
          .catch((error) => {
            console.error('❌ [Discord] Error loading channels:', error);
          })
          .finally(() => {
            isLoadingChannels.current = false;
            setLocalLoadingFields(new Set());
          });
      }, 500); // Increased delay to 500ms
    }
    
    // Handle channel selection - load messages if message field exists
    if (fieldName === 'channelId' && value) {
      // Check if we have a messageId field in the schema
      const hasMessageField = nodeInfo?.configSchema?.some((field: any) => field.name === 'messageId');
      
      if (hasMessageField) {
        // Clear message value when channel changes
        setValue('messageId', '');
        // Also clear content field if it exists (for edit message action)
        if (nodeInfo?.configSchema?.some((field: any) => field.name === 'content')) {
          setValue('content', '');
        }
        
        // Set loading state for messages
        setLocalLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.add('messageId');
          return newSet;
        });
        
        // Load messages with a delay - force refresh to get new format
        setTimeout(() => {
          console.log('📥 [Discord] Loading messages for channel:', value);
          loadOptions('messageId', 'channelId', value, true) // true forces refresh
            .then(() => {
              console.log('✅ [Discord] Messages loaded successfully');
            })
            .catch((error) => {
              console.error('❌ [Discord] Error loading messages:', error);
            })
            .finally(() => {
              setLocalLoadingFields(prev => {
                const newSet = new Set(prev);
                newSet.delete('messageId');
                return newSet;
              });
            });
        }, 300);
      }
    }
    
    // Handle message selection for edit message action
    if (fieldName === 'messageId' && value) {
      // Clear content field when a different message is selected
      const hasContentField = nodeInfo?.configSchema?.some((field: any) => field.name === 'content');
      if (hasContentField) {
        // Could optionally pre-populate with the existing message content here
        // For now, just ensure the field is ready for editing
        console.log('📝 [Discord] Message selected for editing:', value);
      }
    }
  };
  
  // Listen for bot connection events
  useEffect(() => {
    const handleBotConnected = (event: CustomEvent) => {
      if (event.detail?.guildId === values.guildId) {
        console.log('🤖 [Discord] Bot connected to server, refreshing...');
        // Reload channels after bot is connected
        if (values.guildId) {
          setTimeout(() => {
            loadOptions('channelId', 'guildId', values.guildId, true);
          }, 1000);
        }
      }
    };
    
    window.addEventListener('discord-bot-connected', handleBotConnected as EventListener);
    return () => {
      window.removeEventListener('discord-bot-connected', handleBotConnected as EventListener);
    };
  }, [values.guildId, loadOptions]);

  // Get all fields (don't filter - we'll conditionally render instead)
  const fields = nodeInfo?.configSchema || [];

  // Check if we're loading a specific field
  const isFieldLoading = (fieldName: string) => {
    return localLoadingFields.has(fieldName) || loadingFields?.has(fieldName) || 
           (fieldName === 'channelId' && isLoadingChannels.current);
  };
  
  // Check if we need to show channel permission warning
  const showChannelWarning = values.channelId && channelBotStatus && !channelBotStatus.canSendMessages && !isChannelBotStatusChecking;
  const isAction = nodeInfo?.type?.startsWith('discord_action_');

  // Simple UI with advanced features
  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex-1 px-6 py-4">
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-3">
            {/* Rate Limit Warning - Always show at top if rate limited */}
            {rateLimitInfo.isRateLimited && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-500 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-red-900 dark:text-red-100 mb-1">
                      Rate Limited
                    </h4>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {rateLimitInfo.message || 'Discord API rate limit reached. Please wait a moment before trying again.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Channel Permission Warning for Actions */}
            {showChannelWarning && isAction && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-yellow-900 dark:text-yellow-100 mb-1">
                      Missing Channel Permissions
                    </h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      The bot doesn't have permission to send messages in this channel. Please check the channel permissions.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {fields.map((field: any, index: number) => {
              // Skip hidden fields
              if (field.type === 'hidden') return null;
              
              // Conditionally hide channelId if no guild selected
              if (field.name === 'channelId' && !values.guildId) {
                return null;
              }
              
              // Conditionally hide message field if no channel selected (for send message action)
              if (field.name === 'message' && !values.channelId) {
                return null;
              }
              
              // Conditionally hide messageId field if no channel selected (for edit/delete message actions)
              if (field.name === 'messageId' && !values.channelId) {
                return null;
              }
              
              // Conditionally hide content field if no message selected (for edit message action)
              if (field.name === 'content' && !values.messageId) {
                return null;
              }
              
              return (
                <React.Fragment key={`discord-${field.name}`}>
                  <FieldRenderer
                    field={field}
                    value={values[field.name]}
                    onChange={(value) => handleFieldChange(field.name, value)}
                    error={errors[field.name] || validationErrors[field.name]}
                    workflowData={workflowData}
                    currentNodeId={currentNodeId}
                    dynamicOptions={dynamicOptions}
                    loadingDynamic={isFieldLoading(field.name)}
                    nodeInfo={nodeInfo}
                    parentValues={values}
                    aiFields={aiFields}
                    setAiFields={setAiFields}
                    isConnectedToAIAgent={isConnectedToAIAgent}
                  />
                  
                  {/* Show bot status warning after server field ONLY if bot is not connected */}
                  {field.name === 'guildId' && values.guildId && botStatus && !botStatus.isInGuild && !isBotStatusChecking && !isAction && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-medium text-yellow-900 dark:text-yellow-100 mb-1">
                            Bot Not in Server
                          </h4>
                          <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                            The ChainReact bot needs to be added to this Discord server to receive messages.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleInviteBot(values.guildId)}
                            className="border-yellow-600 text-yellow-700 hover:bg-yellow-100 dark:border-yellow-500 dark:text-yellow-300 dark:hover:bg-yellow-900/40"
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Add Bot to Server
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
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