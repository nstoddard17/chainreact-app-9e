"use client"

import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertCircle, ExternalLink, CheckCircle, Check } from "lucide-react";
import { ConfigurationContainer } from '../components/ConfigurationContainer';
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
  loadOptions: (fieldName: string, parentField?: string, parentValue?: any, forceReload?: boolean, silent?: boolean, extraOptions?: Record<string, any>) => Promise<void>;
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
  const hasInitializedServers = useRef(false);

  // Log initial values when component mounts
  useEffect(() => {
    console.log('🔍 [Discord] Component mounted with initial values:', {
      nodeType: nodeInfo?.type,
      currentNodeId,
      guildId: values.guildId,
      channelId: values.channelId,
      message: values.message,
      allValues: values,
      dynamicOptionsGuilds: dynamicOptions.guildId?.length,
      dynamicOptionsChannels: dynamicOptions.channelId?.length
    });

    // Also log if values change
    console.log('🔄 [Discord] Values received from parent:', JSON.stringify(values, null, 2));
  }, []);

  // Track when values prop changes
  useEffect(() => {
    console.log('📝 [Discord] Values prop changed:', {
      guildId: values.guildId,
      channelId: values.channelId,
      message: values.message,
      timestamp: new Date().toISOString()
    });
  }, [values.guildId, values.channelId, values.message]);
  
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
    checkBotStatus,
    isLoadingChannelsAfterBotAdd
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

    console.log('🚀 [Discord] Submitting configuration with values:', {
      guildId: values.guildId,
      channelId: values.channelId,
      message: values.message,
      allValues: values
    });

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
    console.log(`🔄 [Discord] Field change: ${fieldName} = ${value}`);
    
    // Store the previous value for comparison
    const previousValue = values[fieldName];
    
    // Check if value actually changed
    if (value === previousValue) {
      console.log(`✅ [Discord] ${fieldName} value unchanged, skipping processing`);
      return;
    }
    
    // Update the value immediately
    setValue(fieldName, value);
    
    // Handle server selection
    if (fieldName === 'guildId') {
      // Only process if we have a value
      if (value) {
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
        setLocalLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.add('channelId');
          return newSet;
        });
        
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
              setLocalLoadingFields(prev => {
                const newSet = new Set(prev);
                newSet.delete('channelId');
                return newSet;
              });
            });
        }, 500); // Increased delay to 500ms

        // Also load members if we have a userIds field (for delete message action)
        const hasUsersField = nodeInfo?.configSchema?.some((field: any) => field.name === 'userIds');
        if (hasUsersField) {
          // Clear users value when server changes
          setValue('userIds', []);

          // Set loading state for users
          setLocalLoadingFields(prev => {
            const newSet = new Set(prev);
            newSet.add('userIds');
            return newSet;
          });

          // Load guild members with a delay
          setTimeout(() => {
            console.log('👥 [Discord] Loading guild members for server:', value);
            loadOptions('userIds', 'guildId', value, true)
              .then(() => {
                console.log('✅ [Discord] Guild members loaded successfully');
              })
              .catch((error) => {
                console.error('❌ [Discord] Error loading guild members:', error);
              })
              .finally(() => {
                setLocalLoadingFields(prev => {
                  const newSet = new Set(prev);
                  newSet.delete('userIds');
                  return newSet;
                });
              });
          }, 600); // Slightly longer delay to avoid overwhelming the API
        }
      } else {
        // If server is cleared, clear dependent fields
        setValue('channelId', '');
        setValue('messageId', '');
        setValue('userIds', []);
      }
    }
    
    // Handle channel selection - load messages and users for various fields
    if (fieldName === 'channelId') {
      // Only process if we have a value
      if (value) {
        // For fetch messages action, load members when channel is selected
        if (nodeInfo?.type === 'discord_action_fetch_messages' && values.guildId) {
          console.log('👥 [Discord] Loading members for fetch messages filter');
          // Set loading state for filterAuthor field
          setLocalLoadingFields(prev => {
            const newSet = new Set(prev);
            newSet.add('filterAuthor');
            return newSet;
          });
          
          // Load members for the selected server
          setTimeout(() => {
            loadOptions('filterAuthor', 'guildId', values.guildId, true)
              .then(() => {
                console.log('✅ [Discord] Members loaded for filter');
              })
              .catch((error) => {
                console.error('❌ [Discord] Error loading members:', error);
              })
              .finally(() => {
                setLocalLoadingFields(prev => {
                  const newSet = new Set(prev);
                  newSet.delete('filterAuthor');
                  return newSet;
                });
              });
          }, 300);
        }
        // Check if we have a messageId field in the schema (edit/single delete)
        const hasMessageField = nodeInfo?.configSchema?.some((field: any) => field.name === 'messageId');
        
        if (hasMessageField) {
          // Clear message value only when channel actually changes
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
          // Loading messages for channel
          // Pass the action type to filter messages if this is an edit action
          const actionType = nodeInfo?.type;
          loadOptions('messageId', 'channelId', value, true, false, { actionType }) // true forces refresh
            .then(() => {
              // Messages loaded successfully
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
        
        // Check if we have a messageIds field (multi-select for delete action)
        const hasMessagesField = nodeInfo?.configSchema?.some((field: any) => field.name === 'messageIds');
        
        if (hasMessagesField) {
          // Clear messages value only when channel actually changes
          setValue('messageIds', []);
          
          // Set loading state for messages
          setLocalLoadingFields(prev => {
            const newSet = new Set(prev);
            newSet.add('messageIds');
            return newSet;
          });
          
          // Load messages with a delay
          setTimeout(() => {
            console.log('📥 [Discord] Loading messages for multi-select:', value);
            loadOptions('messageIds', 'channelId', value, true)
              .then(() => {
                console.log('✅ [Discord] Messages loaded for multi-select');
              })
              .catch((error) => {
                console.error('❌ [Discord] Error loading messages:', error);
              })
              .finally(() => {
                setLocalLoadingFields(prev => {
                  const newSet = new Set(prev);
                  newSet.delete('messageIds');
                  return newSet;
                });
              });
          }, 300);
        }
        
        // Check if we have a userId field (for delete message user filter - legacy)
        const hasUserField = nodeInfo?.configSchema?.some((field: any) => field.name === 'userId');
        
        if (hasUserField) {
          // Clear user value when channel changes
          setValue('userId', '');
          
          // Set loading state for users
          setLocalLoadingFields(prev => {
            const newSet = new Set(prev);
            newSet.add('userId');
            return newSet;
          });
          
          // Load channel members with a delay
          setTimeout(() => {
            console.log('👥 [Discord] Loading channel members for:', value);
            loadOptions('userId', 'channelId', value, true)
              .then(() => {
                console.log('✅ [Discord] Channel members loaded successfully');
              })
              .catch((error) => {
                console.error('❌ [Discord] Error loading channel members:', error);
              })
              .finally(() => {
                setLocalLoadingFields(prev => {
                  const newSet = new Set(prev);
                  newSet.delete('userId');
                  return newSet;
                });
              });
          }, 300);
        }
        
        // Note: userIds field is now loaded when server (guildId) is selected,
        // not when channel is selected, since userIds depends on guildId
      }
    }
    
    // Handle message selection for edit message action
    if (fieldName === 'messageId' && value) {
      // Check if this is an edit message action with a content field
      const hasContentField = nodeInfo?.configSchema?.some((field: any) => field.name === 'content');
      if (hasContentField && nodeInfo?.type === 'discord_action_edit_message') {
        console.log('📝 [Discord] Message selected for editing:', value);
        
        // Find the selected message in the dynamic options to get its content
        const messageOptions = dynamicOptions?.messageId || [];
        const selectedMessage = messageOptions.find((msg: any) => {
          // Handle both formats: direct ID or object with value
          const msgId = msg.value || msg.id || msg;
          return msgId === value;
        });
        
        if (selectedMessage && selectedMessage.content) {
          console.log('📄 [Discord] Populating content field with:', selectedMessage.content);
          // Populate the content field with the selected message's content
          setValue('content', selectedMessage.content);
        } else {
          console.log('⚠️ [Discord] No content found for selected message');
          // Clear the content field if no content is found
          setValue('content', '');
        }
      }
    }
  };
  
  // Auto-load Discord servers for ALL Discord nodes (actions and triggers) on mount
  useEffect(() => {
    // Check if this is a Discord node (action or trigger)
    const isDiscordNode = nodeInfo?.type?.startsWith('discord_action_') || nodeInfo?.type?.startsWith('discord_trigger_');

    // Only auto-load servers if:
    // 1. This is a Discord node (action or trigger)
    // 2. We haven't already initialized
    // 3. The guildId field exists in the schema
    // 4. We don't already have servers loaded
    if (isDiscordNode && !hasInitializedServers.current) {
      const hasGuildField = nodeInfo?.configSchema?.some((field: any) => field.name === 'guildId');
      const serversAlreadyLoaded = dynamicOptions.guildId && dynamicOptions.guildId.length > 0;

      if (hasGuildField && !serversAlreadyLoaded) {
        console.log('🚀 [Discord] Auto-loading servers for Discord node:', nodeInfo?.type);
        hasInitializedServers.current = true;

        // Set loading state for the server field
        setLocalLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.add('guildId');
          return newSet;
        });

        // Add a small delay to ensure component is fully mounted (helps with production)
        const loadServers = async () => {
          try {
            // Only try once to avoid rate limits
            await loadOptions('guildId', undefined, undefined, false); // Don't force reload
            console.log('✅ [Discord] Servers loaded successfully');
          } catch (error: any) {
            // Check if it's a rate limit error
            if (error?.message?.includes('rate limit')) {
              console.warn('⚠️ [Discord] Rate limited, will not retry automatically');
            } else {
              console.error('❌ [Discord] Failed to load servers:', error);
            }
            // Reset the flag so user can trigger reload manually if needed
            hasInitializedServers.current = false;
          } finally {
            setLocalLoadingFields(prev => {
              const newSet = new Set(prev);
              newSet.delete('guildId');
              return newSet;
            });
          }
        };

        // Small delay to ensure component is ready
        setTimeout(() => {
          loadServers();
        }, 100);
      } else if (serversAlreadyLoaded) {
        console.log('✅ [Discord] Servers already loaded, skipping auto-load');
        hasInitializedServers.current = true;
      }
    }
  }, [nodeInfo?.type, dynamicOptions.guildId]); // Watch dynamicOptions.guildId to know if servers are loaded

  // Auto-load channels when component mounts with saved guildId
  useEffect(() => {
    // Only load for Discord nodes
    const isDiscordNode = nodeInfo?.type?.startsWith('discord_action_') || nodeInfo?.type?.startsWith('discord_trigger_');
    if (!isDiscordNode) return;

    // If we have a saved guildId and channelId but no channel options loaded yet
    if (values.guildId && values.channelId && (!dynamicOptions.channelId || dynamicOptions.channelId.length === 0)) {
      console.log('🔄 [Discord] Loading channels for saved guildId:', values.guildId, 'with saved channelId:', values.channelId);

      // Debounce to avoid multiple calls
      const timeoutId = setTimeout(() => {
        // Load the channels for the saved guild
        setLocalLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.add('channelId');
          return newSet;
        });

        loadOptions('channelId', 'guildId', values.guildId, false).then(() => {
          console.log('✅ [Discord] Channels loaded for saved configuration');
        }).catch((error: any) => {
          // Don't log rate limit errors as errors
          if (error?.message?.includes('rate limit')) {
            console.warn('⚠️ [Discord] Rate limited when loading channels, user can select manually');
          } else {
            console.error('❌ [Discord] Failed to load channels for saved configuration:', error);
          }
        }).finally(() => {
          setLocalLoadingFields(prev => {
            const newSet = new Set(prev);
            newSet.delete('channelId');
            return newSet;
          });
        });
      }, 500); // Wait 500ms before loading to debounce

      return () => clearTimeout(timeoutId);
    }
  }, [values.guildId, values.channelId, nodeInfo?.type]); // Add nodeInfo.type to dependencies

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
    // For guildId, only check specific loading states, not global loadingDynamic
    if (fieldName === 'guildId') {
      return localLoadingFields.has(fieldName) || loadingFields?.has(fieldName);
    }
    // For channelId, include the after bot add loading state
    if (fieldName === 'channelId') {
      return localLoadingFields.has(fieldName) || loadingFields?.has(fieldName) ||
             isLoadingChannels.current || isLoadingChannelsAfterBotAdd;
    }
    return localLoadingFields.has(fieldName) || loadingFields?.has(fieldName);
  };
  
  // Check if we need to show channel permission warning
  const showChannelWarning = values.channelId && channelBotStatus && !channelBotStatus.canSendMessages && !isChannelBotStatusChecking;
  const isAction = nodeInfo?.type?.startsWith('discord_action_');
  const isTrigger = nodeInfo?.type?.startsWith('discord_trigger_');

  // Simple UI with advanced features
  return (
    <ConfigurationContainer
      onSubmit={handleSubmit}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
    >
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

              // Progressive field disclosure for Discord trigger (new message in channel)
              if (nodeInfo?.type === 'discord_trigger_new_message_in_channel') {
                // Only show guildId first
                if (!values.guildId && field.name !== 'guildId') {
                  return null;
                }
                // Show channelId after guildId is selected
                if (values.guildId && !values.channelId && field.name !== 'guildId' && field.name !== 'channelId') {
                  return null;
                }
                // Show all fields after both are selected
              }

              // Conditionally hide channelId if no guild selected (for other Discord nodes)
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
              
              // For delete message action - hide messages, userIds/userId, keywords, and keywordMatchType fields if no channel selected
              if (nodeInfo?.type === 'discord_action_delete_message') {
                if ((field.name === 'messageIds' || field.name === 'userIds' || field.name === 'userId' || field.name === 'keywords' || field.name === 'keywordMatchType') && !values.channelId) {
                  return null;
                }
                // Hide keywordMatchType field if no keywords are entered
                if (field.name === 'keywordMatchType' && (!values.keywords || values.keywords.length === 0)) {
                  return null;
                }
              }
              
              // For fetch messages action - progressive field display
              if (nodeInfo?.type === 'discord_action_fetch_messages') {
                // Hide channel field if no server selected
                if (field.name === 'channelId' && !values.guildId) {
                  return null;
                }
                // Hide all other fields if no channel selected
                if (!values.channelId && field.name !== 'guildId' && field.name !== 'channelId') {
                  return null;
                }
              }
              
              // For add/remove reaction actions - hide emoji field if no channel selected
              if (nodeInfo?.type === 'discord_action_add_reaction' || nodeInfo?.type === 'discord_action_remove_reaction') {
                if (field.name === 'emoji' && !values.channelId) {
                  return null;
                }
              }
              
              // For create channel action - progressive field display
              if (nodeInfo?.type === 'discord_action_create_channel') {
                // Step 1: Show only server field initially
                if (!values.guildId && field.name !== 'guildId') {
                  return null;
                }
                
                // Step 2: After server, show only channel type
                if (values.guildId && !values.type && field.name !== 'guildId' && field.name !== 'type') {
                  return null;
                }
                
                // Step 3: After type, show channel name
                if (values.type && !values.name && field.name !== 'guildId' && field.name !== 'type' && field.name !== 'name') {
                  return null;
                }
                
                // Step 4: After name, show private toggle
                if (values.name && field.name !== 'guildId' && field.name !== 'type' && field.name !== 'name' && field.name !== 'isPrivate') {
                  // Only show permission fields if isPrivate is true
                  if ((field.name === 'allowedUsers' || field.name === 'allowedRoles') && !values.isPrivate) {
                    return null;
                  }
                  // Hide optional fields (category, topic, slowmode) until private toggle is set
                  if (!('isPrivate' in values) && (field.name === 'parentId' || field.name === 'topic' || field.name === 'rateLimitPerUser')) {
                    return null;
                  }
                }
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
                    onDynamicLoad={loadOptions}
                    nodeInfo={nodeInfo}
                    parentValues={values}
                    aiFields={aiFields}
                    setAiFields={setAiFields}
                    isConnectedToAIAgent={isConnectedToAIAgent}
                  />

                  {/* Manual reload button if servers didn't load (production fallback) */}
                  {field.name === 'guildId' && !isFieldLoading('guildId') && (!dynamicOptions.guildId || dynamicOptions.guildId.length === 0) && (
                    <div className="mt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          console.log('🔄 [Discord] Manual server reload triggered');
                          hasInitializedServers.current = false;
                          setLocalLoadingFields(prev => {
                            const newSet = new Set(prev);
                            newSet.add('guildId');
                            return newSet;
                          });
                          loadOptions('guildId', undefined, undefined, true)
                            .then(() => {
                              console.log('✅ [Discord] Servers reloaded successfully');
                            })
                            .catch((error) => {
                              console.error('❌ [Discord] Error reloading servers:', error);
                            })
                            .finally(() => {
                              setLocalLoadingFields(prev => {
                                const newSet = new Set(prev);
                                newSet.delete('guildId');
                                return newSet;
                              });
                            });
                        }}
                      >
                        Load Discord Servers
                      </Button>
                    </div>
                  )}

                  {/* Show bot status after server field */}
                  {field.name === 'guildId' && values.guildId && botStatus && !isBotStatusChecking && (
                    <>
                      {/* Show warning if bot is NOT in server */}
                      {!botStatus.isInGuild && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                            <div className="flex-1">
                              <h4 className="font-medium text-yellow-900 dark:text-yellow-100 mb-1">
                                Bot Not in Server
                              </h4>
                              <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                                {isTrigger
                                  ? "The ChainReact bot needs to be added to this Discord server to receive messages."
                                  : "The ChainReact bot needs to be added to this Discord server to send messages."
                                }
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

                      {/* Show success indicator if bot IS in server - only for triggers */}
                      {botStatus.isInGuild && isTrigger && (
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <p className="text-sm text-green-700 dark:text-green-300">
                              Bot connected - ready to receive messages from this server
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </React.Fragment>
              );
            })}
    </ConfigurationContainer>
  );
}