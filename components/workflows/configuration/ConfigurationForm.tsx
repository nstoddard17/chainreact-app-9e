"use client"

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Play, TestTube, Save, Settings, Zap, Link, X, Eye } from "lucide-react";
import { FieldRenderer } from "./fields/FieldRenderer";
import { useFormState } from "./hooks/useFormState";
import { useDynamicOptions } from "./hooks/useDynamicOptions";
import { NodeComponent } from "@/lib/workflows/availableNodes";
import { ConfigFormProps } from "./utils/types";
import { shouldHideField } from "./utils/validation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfigurationLoadingScreen } from "@/components/ui/loading-screen";
import { useWorkflowTestStore } from "@/stores/workflowTestStore";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import DiscordBotStatus from "../DiscordBotStatus";
import { useIntegrationStore } from "@/stores/integrationStore";
import { loadNodeConfig, saveNodeConfig } from '@/lib/workflows/configPersistence';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Component to render the configuration form based on node schema
 */
export default function ConfigurationForm({
  nodeInfo,
  initialData,
  onSubmit,
  onCancel,
  workflowData,
  currentNodeId,
  integrationName,
}: ConfigFormProps) {
  const [hasInitialized, setHasInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [isLoading, setIsLoading] = useState(false);
  const [isTestLoading, setIsTestLoading] = useState(false);
  const [botStatus, setBotStatus] = useState<{ isInGuild: boolean; hasPermissions: boolean } | null>(null);
  const [isBotStatusChecking, setIsBotStatusChecking] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [airtableRecords, setAirtableRecords] = useState<any[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [showPreviewData, setShowPreviewData] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set());
  const [scrollProgress, setScrollProgress] = useState(0);
  const [channelBotStatus, setChannelBotStatus] = useState<{ 
    isInChannel: boolean; 
    canSendMessages: boolean; 
    hasPermissions: boolean; 
    userCanInviteBot: boolean; 
    error?: string 
  } | null>(null);
  const [isChannelBotStatusChecking, setIsChannelBotStatusChecking] = useState(false);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [channelLoadingError, setChannelLoadingError] = useState<string | null>(null);
  const [isDiscordBotConfigured, setIsDiscordBotConfigured] = useState<boolean | null>(null);
  const [discordClientId, setDiscordClientId] = useState<string | null>(null);
  const [isBotConnectionInProgress, setIsBotConnectionInProgress] = useState(false);
  
  // Function to get the current workflow ID from the URL
  const getWorkflowId = useCallback(() => {
    if (typeof window === "undefined") return "";
    const pathParts = window.location.pathname.split('/');
    const builderIndex = pathParts.indexOf('builder');
    if (builderIndex !== -1 && pathParts.length > builderIndex + 1) {
      return pathParts[builderIndex + 1];
    }
    return "";
  }, []);
  
  // Form state management
  const {
    values,
    errors,
    touched,
    isDirty,
    isValid,
    setValue,
    setValues,
    resetForm,
    validate,
    handleSubmit
  } = useFormState(initialData || {}, nodeInfo);

  // Dynamic options management
  const {
    dynamicOptions,
    loading: loadingDynamic,
    isInitialLoading,
    loadOptions
  } = useDynamicOptions({ nodeType: nodeInfo?.type, providerId: nodeInfo?.providerId });

  // Discord integration check
  const { getIntegrationByProvider, connectIntegration, getConnectedProviders, loadIntegrationData } = useIntegrationStore();
  const discordIntegration = getIntegrationByProvider('discord');
  const needsDiscordConnection = nodeInfo?.providerId === 'discord' && !discordIntegration;

  // Function to check Discord bot status in server
  const checkBotStatus = useCallback(async (guildId: string) => {
    if (!guildId || !discordIntegration) return;
    
    try {
      setIsBotStatusChecking(true);
      const response = await fetch(`/api/discord/bot-status?guildId=${guildId}`);
      const data = await response.json();
      
      setBotStatus({
        isInGuild: data.isInGuild,
        hasPermissions: data.hasPermissions
      });
    } catch (error) {
      console.error("Error checking Discord bot status:", error);
      setBotStatus({
        isInGuild: false,
        hasPermissions: false
      });
    } finally {
      setIsBotStatusChecking(false);
    }
  }, [discordIntegration]);

  // Function to check Discord bot status in specific channel
  const checkChannelBotStatus = useCallback(async (channelId: string, guildId: string) => {
    if (!channelId || !guildId || !discordIntegration) return;
    
    try {
      setIsChannelBotStatusChecking(true);
      const response = await fetch(`/api/discord/channel-bot-status?channelId=${channelId}&guildId=${guildId}`);
      const data = await response.json();
      
      setChannelBotStatus({
        isInChannel: data.isInChannel,
        canSendMessages: data.canSendMessages,
        hasPermissions: data.hasPermissions,
        userCanInviteBot: data.userCanInviteBot,
        error: data.error
      });
    } catch (error) {
      console.error("Error checking Discord channel bot status:", error);
      setChannelBotStatus({
        isInChannel: false,
        canSendMessages: false,
        hasPermissions: false,
        userCanInviteBot: false,
        error: 'Failed to check bot status'
      });
    } finally {
      setIsChannelBotStatusChecking(false);
    }
  }, [discordIntegration]);

  // Function to check if Discord bot is in server (quick check before loading channels)
  const checkBotInServer = useCallback(async (guildId: string): Promise<boolean> => {
    if (!guildId || !discordIntegration) return false;
    
    try {
      const response = await fetch(`/api/discord/bot-status?guildId=${guildId}`);
      const data = await response.json();
      
      if (!response.ok) {
        console.log('🔍 Bot status check failed:', data.error);
        return false;
      }
      
      console.log('🔍 Bot status check result:', data);
      return data.isInGuild === true;
    } catch (error) {
      console.error("Error checking if bot is in server:", error);
      return false;
    }
  }, [discordIntegration]);

  // Function to invite bot to Discord server
  const handleInviteBot = useCallback((guildId?: string) => {
    console.log('🔍 Discord invite bot called:', { 
      discordClientId: discordClientId ? 'Present' : 'Missing',
      isDiscordBotConfigured,
      guildId 
    });
    
    if (!discordClientId) {
      console.error('Discord client ID not available - cannot open OAuth flow');
      return;
    }
    
    // Discord permissions needed for sending messages:
    // VIEW_CHANNEL (0x400) + SEND_MESSAGES (0x800) + EMBED_LINKS (0x4000) + ATTACH_FILES (0x8000) + USE_EXTERNAL_EMOJIS (0x40000) + ADD_REACTIONS (0x40)
    const permissions = '77888'; // Combined permissions
    let inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${discordClientId}&permissions=${permissions}&scope=bot%20applications.commands`;
    
    // If we have a specific guild ID, add it to the URL to pre-select the server
    if (guildId) {
      inviteUrl += `&guild_id=${guildId}`;
    }
    
    console.log('🔍 Opening Discord OAuth popup with URL:', inviteUrl);
    
    // Set loading state
    setIsBotConnectionInProgress(true);
    
    // Open popup window for Discord OAuth
    const popup = window.open(
      inviteUrl, 
      'discord-bot-auth',
      'width=500,height=700,scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no'
    );
    
    if (!popup) {
      setIsBotConnectionInProgress(false);
      alert('Popup blocked! Please allow popups for this site and try again.');
      return;
    }
    
    // Track if we detected a success page for auto-close timing
    let successPageDetectedAt = null;
    
    // Monitor the popup for completion
    const checkPopup = setInterval(async () => {
      try {
        // Try to access popup URL to detect Discord success page
        let successDetected = false;
        
        try {
          if (popup.location && popup.location.href) {
            const url = popup.location.href;
            console.log('🔍 Popup URL:', url);
            
            // Enhanced success detection patterns
            if (url.includes('discord.com')) {
              // Check for exact success patterns
              const isAuthorized = url.includes('/oauth2/authorized') || url.includes('oauth2/authorized');
              const hasSuccess = url.toLowerCase().includes('success');
              const hasPermissions = url.includes('permissions=');
              const hasGuildId = url.includes('guild_id');
              const hasCode = url.includes('code=');
              
              console.log('🔍 Discord URL analysis:', {
                url,
                isAuthorized,
                hasSuccess,
                hasPermissions,
                hasGuildId,
                hasCode
              });
              
              if (isAuthorized || hasSuccess || hasPermissions || hasGuildId || hasCode) {
                console.log('✅ Discord OAuth success detected, auto-closing popup...');
                successDetected = true;
                popup.close();
                return; // Let the closed handler take over
              }
            }
          }
        } catch (crossOriginError) {
          // Cross-origin restriction - try alternative detection methods
          console.log('🔍 Cross-origin blocked, trying alternative detection methods...');
          
          try {
            // Check if popup title changed (sometimes accessible even with CORS)
            if (popup.document && popup.document.title) {
              const title = popup.document.title.toLowerCase();
              console.log('🔍 Popup title:', title);
              if (title.includes('success') || title.includes('authorized') || title.includes('complete') || title.includes('discord')) {
                console.log('✅ Discord OAuth success detected via title, auto-closing popup...');
                successDetected = true;
                popup.close();
                return;
              }
            }
          } catch (titleError) {
            console.log('🔍 Title check also blocked by CORS');
          }
          
          try {
            // Try to detect if popup content contains success indicators
            if (popup.document && popup.document.body) {
              const bodyText = popup.document.body.innerText.toLowerCase();
              console.log('🔍 Popup body text (first 200 chars):', bodyText.substring(0, 200));
              if (bodyText.includes('success') || bodyText.includes('authorized') || bodyText.includes('you may now close')) {
                console.log('✅ Discord OAuth success detected via content, auto-closing popup...');
                successDetected = true;
                popup.close();
                return;
              }
            }
          } catch (contentError) {
            console.log('🔍 Content check also blocked by CORS');
          }
        }
        
        // Fallback: Auto-close after detecting success page for a few seconds
        try {
          if (popup.location && popup.location.href && popup.location.href.includes('oauth2/authorized')) {
            if (!successPageDetectedAt) {
              successPageDetectedAt = Date.now();
              console.log('🔍 Success page detected, will auto-close in 3 seconds if still open...');
            } else if (Date.now() - successPageDetectedAt > 3000) {
              // Auto-close after 3 seconds on success page
              console.log('✅ Auto-closing popup after 3 seconds on success page');
              popup.close();
              return;
            }
          }
        } catch (e) {
          // Ignore cross-origin errors
        }
        
        // Check if popup is closed (user finished or cancelled)
        if (popup.closed) {
          console.log('🔍 Discord OAuth popup closed');
          clearInterval(checkPopup);
          setIsBotConnectionInProgress(false);
          
          if (guildId) {
            console.log('🔍 Popup closed for guild:', guildId, '- starting immediate bot status check...');
            
            // Immediately show loading state by clearing bot status
            setBotStatus(null);
            
            // Start checking immediately with shorter initial delay
            setTimeout(async () => {
              try {
                console.log('🔍 First bot status check after popup close...');
                await checkBotStatus(guildId);
                console.log('🔍 Initial bot status check completed');
                
                // Quick retry if still not detected (Discord can be slow)
                setTimeout(async () => {
                  // Only retry if we haven't detected the bot yet
                  if (!botStatus?.isInGuild) {
                    console.log('🔍 Bot still not detected, trying second check...');
                    await checkBotStatus(guildId);
                    console.log('🔍 Second bot status check completed');
                    
                    // Final retry with longer delay
                    setTimeout(async () => {
                      if (!botStatus?.isInGuild) {
                        console.log('🔍 Bot still not detected, trying final check...');
                        await checkBotStatus(guildId);
                        console.log('🔍 Final bot status check completed');
                      }
                    }, 8000); // 8 second final retry
                  }
                }, 3000); // 3 second quick retry
              } catch (error) {
                console.error('Error checking bot status after OAuth:', error);
              }
            }, 1000); // Only wait 1 second initially for faster feedback
          } else {
            console.log('🔍 No guildId available for bot status check');
          }
        }
      } catch (error) {
        console.error('Error in popup monitoring:', error);
      }
    }, 300); // Check more frequently (every 300ms) for better responsiveness
    
    // Safety cleanup after 5 minutes
    setTimeout(() => {
      clearInterval(checkPopup);
      if (!popup.closed) {
        popup.close();
      }
    }, 300000);
    
  }, [discordClientId, isDiscordBotConfigured, checkBotInServer, loadOptions]);

  // Check Discord configuration on mount only for Discord nodes
  useEffect(() => {
    if (nodeInfo?.providerId !== 'discord') return;
    
    const fetchDiscordConfig = async () => {
      try {
        const response = await fetch('/api/discord/config');
        const data = await response.json();
        
        console.log('🔍 Discord configuration check on mount:', data);
        
        if (data.configured && data.clientId) {
          setIsDiscordBotConfigured(true);
          setDiscordClientId(data.clientId);
        } else {
          setIsDiscordBotConfigured(false);
          setDiscordClientId(null);
        }
      } catch (error) {
        console.error('Error fetching Discord config:', error);
        setIsDiscordBotConfigured(false);
        setDiscordClientId(null);
      }
    };

    fetchDiscordConfig();
  }, [nodeInfo?.providerId]);

  // Load initial values when component mounts or nodeInfo changes
  useEffect(() => {
    if (!nodeInfo?.configSchema) return;

    // Try to load saved configuration
    if (currentNodeId && nodeInfo?.type) {
      const workflowId = getWorkflowId();
      if (workflowId) {
        const savedNodeData = loadNodeConfig(workflowId, currentNodeId, nodeInfo.type);
        if (savedNodeData) {
          console.log('📋 Loaded saved configuration for Discord trigger node:', currentNodeId);
          
          // Apply saved configuration to form values
          const savedConfig = savedNodeData.config || {};
          Object.entries(savedConfig).forEach(([key, value]) => {
            if (value !== undefined) {
              setValue(key, value);
            }
          });
          
          // If we have saved dynamic options, restore them
          if (savedNodeData.dynamicOptions) {
            console.log('📋 Found saved dynamic options for Discord trigger');
          }
        }
      }
    }

    // Initialize form values from config schema for any missing values
    nodeInfo.configSchema.forEach(field => {
      if (field.defaultValue !== undefined && !values[field.name]) {
        setValue(field.name, field.defaultValue);
      }
    });

    // Initialize form values only once
    if (!hasInitialized) {
      setHasInitialized(true);
    }
    
    // Set default Discord bot status for better UX (only once)
    if (nodeInfo.providerId === 'discord' && !botStatus && hasInitialized) {
      setBotStatus({
        isInGuild: true,
        hasPermissions: true
      });
    }
  }, [nodeInfo?.configSchema, nodeInfo?.providerId, hasInitialized]);

  /**
   * Handle Discord connection
   */
  const handleConnectDiscord = useCallback(async () => {
    try {
      await connectIntegration('discord');
    } catch (error) {
      console.error('Failed to connect Discord:', error);
    }
  }, [connectIntegration]);

  /**
   * Progressive field disclosure for Discord actions
   */
  const renderDiscordProgressiveConfig = () => {
    const guildField = nodeInfo?.configSchema?.find(field => field.name === 'guildId');
    const channelField = nodeInfo?.configSchema?.find(field => field.name === 'channelId');
    
    // Step 1: Show connection prompt if Discord is not connected
    if (!discordIntegration) {
      return (
        <div className="space-y-4 p-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-800">Connect Discord</h3>
            <p className="text-sm text-blue-700 mt-1">
              Connect your Discord account to configure this action and access your servers.
            </p>
            <Button
              variant="default"
              className="mt-3 text-sm bg-[#5865F2] hover:bg-[#4752C4] text-white"
              onClick={handleConnectDiscord}
              disabled={loadingDynamic}
            >
              {loadingDynamic ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Connecting...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0190 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1568 2.4189Z"/>
                  </svg>
                  Connect Discord
                </div>
              )}
            </Button>
          </div>
        </div>
      );
    }

    // Step 2: Show only server field initially
    if (guildField && !values.guildId) {
      return (
        <div className="space-y-6 p-4">
          <FieldRenderer
            field={guildField}
            value={values.guildId || ""}
            onChange={(value) => handleFieldChange('guildId', value)}
            error={errors.guildId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingDynamic}
            onDynamicLoad={loadOptions}
          />
        </div>
      );
    }

    // Step 3: Server selected - check bot connection status
    if (values.guildId && (!botStatus || isBotStatusChecking)) {
      // Bot status checking or not started yet
      return (
        <div className="space-y-6 p-4">
          <FieldRenderer
            field={guildField}
            value={values.guildId || ""}
            onChange={(value) => handleFieldChange('guildId', value)}
            error={errors.guildId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingDynamic}
            onDynamicLoad={loadOptions}
          />
          
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent"></div>
              <span className="text-sm text-gray-700">Checking bot connection status...</span>
            </div>
          </div>
        </div>
      );
    }

    // Step 4: Bot not connected - show connect button
    if (values.guildId && botStatus && !botStatus.isInGuild) {
      return (
        <div className="space-y-6 p-4">
          <FieldRenderer
            field={guildField}
            value={values.guildId || ""}
            onChange={(value) => handleFieldChange('guildId', value)}
            error={errors.guildId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingDynamic}
            onDynamicLoad={loadOptions}
          />
          
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-orange-800">Bot Connection Required</h3>
            <p className="text-sm text-orange-700 mt-1">
              The Discord bot needs to be added to this server to use Discord actions. Click the button below to add the bot.
            </p>
            
            <Button
              type="button"
              variant="default"
              className="mt-3 text-sm bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => handleInviteBot(values.guildId)}
              disabled={isBotConnectionInProgress}
            >
              {isBotConnectionInProgress ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Connecting Bot...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0190 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1568 2.4189Z"/>
                  </svg>
                  Connect Bot to Server
                </div>
              )}
            </Button>
          </div>
        </div>
      );
    }

    // Step 4.5: Bot connected but lacks permissions - show reconnect button
    if (values.guildId && botStatus?.isInGuild && !botStatus.hasPermissions) {
      return (
        <div className="space-y-6 p-4">
          <FieldRenderer
            field={guildField}
            value={values.guildId || ""}
            onChange={(value) => handleFieldChange('guildId', value)}
            error={errors.guildId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingDynamic}
            onDynamicLoad={loadOptions}
          />
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-yellow-800">Bot Needs Additional Permissions</h3>
            <p className="text-sm text-yellow-700 mt-1">
              The Discord bot is connected to this server but needs additional permissions to view channels. Click the button below to update bot permissions.
            </p>
            
            <Button
              type="button"
              variant="default"
              className="mt-3 text-sm bg-yellow-600 hover:bg-yellow-700 text-white"
              onClick={() => handleInviteBot(values.guildId)}
              disabled={isBotConnectionInProgress}
            >
              {isBotConnectionInProgress ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Updating Permissions...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                  </svg>
                  Update Bot Permissions
                </div>
              )}
            </Button>
          </div>
        </div>
      );
    }

    // Step 5: Bot connected with permissions, show server and channel fields
    if (values.guildId && botStatus?.isInGuild && botStatus?.hasPermissions && channelField && !values.channelId) {
      return (
        <div className="space-y-6 p-4">
          <FieldRenderer
            field={guildField}
            value={values.guildId || ""}
            onChange={(value) => handleFieldChange('guildId', value)}
            error={errors.guildId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingDynamic}
            onDynamicLoad={loadOptions}
          />
          
          {/* Success message */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full bg-green-500 flex-shrink-0"></div>
              <span className="text-sm text-green-800">Bot connected to server</span>
            </div>
          </div>
          
          <FieldRenderer
            field={channelField}
            value={values.channelId || ""}
            onChange={(value) => handleFieldChange('channelId', value)}
            error={errors.channelId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={isLoadingChannels || loadingFields.has('channelId')}
            onDynamicLoad={loadOptions}
          />
          
          {channelLoadingError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">
                Failed to load channels. Please try reconnecting the bot or contact support.
              </p>
            </div>
          )}
        </div>
      );
    }

    // Step 6: Channel selected, show all remaining fields
    if (values.guildId && values.channelId) {
      // Get all fields except guildId and channelId (already shown)
      const remainingFields = nodeInfo?.configSchema?.filter(field => 
        field.name !== 'guildId' && field.name !== 'channelId'
      ) || [];
      
      return (
        <div className="space-y-6 p-4">
          <FieldRenderer
            field={guildField}
            value={values.guildId || ""}
            onChange={(value) => handleFieldChange('guildId', value)}
            error={errors.guildId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingDynamic}
            onDynamicLoad={loadOptions}
          />
          
          <FieldRenderer
            field={channelField}
            value={values.channelId || ""}
            onChange={(value) => handleFieldChange('channelId', value)}
            error={errors.channelId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={isLoadingChannels || loadingFields.has('channelId')}
            onDynamicLoad={loadOptions}
          />
          
          {/* Success indicators */}
          <div className="space-y-2">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-green-500 flex-shrink-0"></div>
                <span className="text-sm text-green-800">Bot connected to server</span>
              </div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-green-500 flex-shrink-0"></div>
                <span className="text-sm text-green-800">Channel selected</span>
              </div>
            </div>
          </div>
          
          {/* Render remaining fields */}
          {remainingFields.map((field, index) => (
            <FieldRenderer
              key={`discord-field-${field.name}-${index}`}
              field={field}
              value={values[field.name]}
              onChange={(value) => handleFieldChange(field.name, value)}
              error={errors[field.name]}
              workflowData={workflowData}
              currentNodeId={currentNodeId}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingFields.has(field.name)}
              nodeInfo={nodeInfo}
              allValues={values}
              onDynamicLoad={async (fieldName, dependsOn, dependsOnValue) => {
                if (dependsOn && values[dependsOn]) {
                  await loadOptions(fieldName, dependsOn, values[dependsOn]);
                } else {
                  await loadOptions(fieldName);
                }
              }}
            />
          ))}
        </div>
      );
    }

    // Fallback - shouldn't reach here but show basic fields if we do
    return (
      <div className="space-y-6 p-4">
        {nodeInfo?.configSchema?.map((field, index) => (
          <FieldRenderer
            key={`fallback-field-${field.name}-${index}`}
            field={field}
            value={values[field.name]}
            onChange={(value) => handleFieldChange(field.name, value)}
            error={errors[field.name]}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingFields.has(field.name)}
            nodeInfo={nodeInfo}
            allValues={values}
            onDynamicLoad={loadOptions}
          />
        )) || []}
      </div>
    );
  };

  /**
   * Load Airtable records for the selected table
   */
  const loadAirtableRecords = useCallback(async (baseId: string, tableName: string) => {
    try {
      setLoadingRecords(true);
      
      const integration = getIntegrationByProvider('airtable');
      if (!integration) {
        console.warn('No Airtable integration found');
        return;
      }

      console.log('🔍 Loading Airtable records:', { baseId, tableName });
      
      // Call the Airtable-specific data API endpoint
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          integrationId: integration.id,
          dataType: 'airtable_records',
          options: {
            baseId,
            tableName,
            maxRecords: 50 // Limit for selection
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to load records: ${response.status}`);
      }

      const result = await response.json();
      const records = result.data || [];
      
      console.log('🔍 Loaded records:', records);
      console.log('🔍 Record count:', records?.length || 0);
      setAirtableRecords(records || []);
      
    } catch (error) {
      console.error('Error loading Airtable records:', error);
      setAirtableRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  }, [getIntegrationByProvider]);

  /**
   * Load preview data for list records
   */
  const loadPreviewData = useCallback(async (baseId: string, tableName: string) => {
    try {
      setLoadingPreview(true);
      const integration = getIntegrationByProvider('airtable');
      if (!integration) {
        console.warn('No Airtable integration found');
        return;
      }

      console.log('🔍 Loading all records for preview:', { baseId, tableName });
      
      // Call the Airtable-specific data API endpoint
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          integrationId: integration.id,
          dataType: 'airtable_records',
          options: {
            baseId,
            tableName,
            maxRecords: 100 // Limit for preview
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to load preview data: ${response.status}`);
      }

      const result = await response.json();
      const records = result.data || [];

      console.log('🔍 All records loaded for preview:', records);
      console.log('🔍 Total record count:', records?.length || 0);
      setPreviewData(records || []);
      setShowPreviewData(true);
    } catch (error) {
      console.error('Error loading preview data:', error);
      setPreviewData([]);
    } finally {
      setLoadingPreview(false);
    }
  }, [getIntegrationByProvider]);

  /**
   * Test configuration handler
   */
  const handleTest = useCallback(async () => {
    if (!nodeInfo) return;
    
    setIsTestLoading(true);
    
    try {
      // Prepare test data
      const testData = {
        nodeType: nodeInfo.type,
        config: values,
        nodeId: currentNodeId || "test"
      };
      
      // Call test API
      const response = await fetch("/api/workflows/test-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testData)
      });
      
      const result = await response.json();
      
    } catch (error) {
      console.error("Test error:", error);
    } finally {
      setIsTestLoading(false);
    }
  }, [nodeInfo, values, currentNodeId]);

  /**
   * Handle field value changes
   */
  const handleFieldChange = useCallback((fieldName: string, value: any) => {
    console.log('🔍 handleFieldChange called:', { fieldName, value, currentValues: values });
    console.log('🔍 Node info:', { type: nodeInfo?.type, providerId: nodeInfo?.providerId });
    
    // Update the form value
    setValue(fieldName, value);
    
    // Special handling for Discord trigger fields
    if (nodeInfo?.providerId === 'discord') {
      if (fieldName === 'guildId') {
        console.log('🔍 Handling Discord guildId change:', { fieldName, value });
        
        // For Discord triggers, only load the channels without other side effects
        if (nodeInfo.type === 'discord_trigger_new_message') {
          // Load all related data when guild is selected
          if (value) {
            console.log('🔍 Loading all Discord data for trigger with guildId:', value);
            
            // Load dependent options once per selection (non-blocking)
            loadOptions('channelId', 'guildId', value);
            loadOptions('authorFilter', 'guildId', value);
          } else {
            console.log('🔍 Clearing dependent fields as guildId is empty');
            setValue('channelId', '');
            setValue('authorFilter', '');
            setValue('contentFilter', '');
          }
        } 
        // For Discord actions, check bot status first then load channels
        else if (nodeInfo?.type?.startsWith('discord_action_')) {
          // Always clear all Discord-related states when server field changes
          setValue('channelId', '');
          setChannelBotStatus(null);
          setChannelLoadingError(null);
          setBotStatus(null); // Clear previous bot status immediately
          
          if (value && value.trim() !== '' && discordIntegration) {
            console.log('🔍 Server selected, checking bot status for Discord action with guildId:', value);
            
            // Start bot status check which will trigger loading state in progressive disclosure UI
            checkBotStatus(value);
          } else {
            console.log('🔍 Server cleared or Discord not connected, keeping bot status null');
            // Keep botStatus as null - this will show just the server field in progressive disclosure
          }
        }
      }
      
      // Check channel bot status for Discord actions when channelId changes
      if (fieldName === 'channelId' && nodeInfo?.type?.startsWith('discord_action_')) {
        console.log('🔍 Handling Discord channelId change:', { fieldName, value });
        
        // Clear previous channel bot status
        setChannelBotStatus(null);
        
        if (value && values.guildId) {
          console.log('🔍 Checking bot status for channel:', value, 'in guild:', values.guildId);
          checkChannelBotStatus(value, values.guildId);
        }
      }
    }
    
    // Handle baseId changes for Airtable
    if (fieldName === 'baseId' && nodeInfo?.providerId === 'airtable') {
      console.log('🔍 Airtable baseId changed to:', value);
      console.log('🔍 Node type:', nodeInfo.type);
      console.log('🔍 Previous value was:', values.baseId);
      
      // Clear preview data when base changes for list records
      if (nodeInfo.type === 'airtable_action_list_records') {
        setShowPreviewData(false);
        setPreviewData([]);
      }
      
      // Clear dependent fields when baseId changes
      if (nodeInfo.configSchema) {
        nodeInfo.configSchema.forEach(field => {
          if (field.dependsOn === 'baseId') {
            console.log('🔍 Clearing dependent field:', field.name);
            setValue(field.name, '');
            if (value) {
              console.log('🔍 Loading options for:', field.name, 'with baseId:', value);
              // Set loading state for this field
              setLoadingFields(prev => new Set(prev).add(field.name));
              loadOptions(field.name, 'baseId', value, true).finally(() => {
                // Clear loading state when done
                setLoadingFields(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(field.name);
                  return newSet;
                });
              });
            }
          }
        });
      }
      
      // For update/create/move record actions, clear records and dynamic fields
      if (nodeInfo.type === 'airtable_action_update_record' || 
          nodeInfo.type === 'airtable_action_create_record' || 
          nodeInfo.type === 'airtable_action_move_record') {
        setSelectedRecord(null);
        setAirtableRecords([]);
        setLoadingRecords(false);
        // Clear all dynamic fields
        Object.keys(values).forEach(key => {
          if (key.startsWith('airtable_field_')) {
            setValue(key, '');
          }
        });
      }
    }
    
    // Handle tableName changes for Airtable
    if (fieldName === 'tableName' && nodeInfo?.providerId === 'airtable') {
      console.log('🔍 Airtable tableName changed to:', value);
      
      // For list records, clear any existing preview data when table changes
      if (nodeInfo.type === 'airtable_action_list_records') {
        setShowPreviewData(false);
        setPreviewData([]);
      }
      
      // Clear record selection and dynamic fields when table changes for update/create/move records
      if (nodeInfo.type === 'airtable_action_update_record' || 
          nodeInfo.type === 'airtable_action_create_record' || 
          nodeInfo.type === 'airtable_action_move_record') {
        setSelectedRecord(null);
        setAirtableRecords([]);
        setLoadingRecords(false);
        // Clear all dynamic fields
        Object.keys(values).forEach(key => {
          if (key.startsWith('airtable_field_')) {
            setValue(key, '');
          }
        });
        
        // Load records for the new table (only for update record)
        if (nodeInfo.type === 'airtable_action_update_record' && value && values.baseId) {
          loadAirtableRecords(values.baseId, value);
        }
      }
    }
    
    // Don't auto-save configuration changes - let user save manually when they click Save or Listen
  }, [nodeInfo, setValue, loadOptions, values, discordIntegration, checkBotStatus, checkChannelBotStatus, checkBotInServer, currentNodeId, getWorkflowId, dynamicOptions, setShowPreviewData, setPreviewData, setSelectedRecord, setAirtableRecords, setLoadingRecords, loadAirtableRecords]);
  
  /**
   * Handle record selection from the Airtable records table
   */
  const handleRecordSelect = useCallback((record: any) => {
    console.log('🔍 Record selected:', record);
    setSelectedRecord(record);
    
    // Find the selected table schema to map field names to field IDs
    const selectedTable = dynamicOptions?.tableName?.find((table: any) => 
      table.value === values.tableName
    );
    
    if (selectedTable?.fields && record.fields) {
      // Pre-populate dynamic fields with selected record data
      selectedTable.fields.forEach((tableField: any) => {
        const fieldName = `airtable_field_${tableField.id}`;
        const existingValue = record.fields[tableField.name];
        const fieldType = getAirtableFieldType(tableField.type);
        
        // Skip file fields as they cannot be programmatically set due to security restrictions
        if (fieldType === 'file') {
          console.log(`🔍 Skipping file field ${tableField.name} (cannot pre-populate file inputs)`);
          return;
        }
        
        if (existingValue !== undefined && existingValue !== null) {
          // Handle array values (like multiple selects or linked records)
          let valueToSet = existingValue;
          if (Array.isArray(existingValue)) {
            // For arrays, we might need special handling depending on the field type
            if (fieldType === 'airtable-linked-record') {
              // For linked records, Airtable returns an array of record IDs
              // We need to preserve this format for the linked record component
              valueToSet = existingValue;
              console.log(`🔍 Linked record field ${tableField.name} existing value:`, existingValue);
        console.log(`🔍 Linked record IDs for ${tableField.name}:`, existingValue);
        if (Array.isArray(existingValue)) {
          existingValue.forEach((id, i) => {
            console.log(`🔍 ${tableField.name} record ${i}: "${id}" (type: ${typeof id})`);
          });
        }
            } else if (fieldType === 'select') {
              // For multiple selects, join with commas or keep as array depending on implementation
              valueToSet = existingValue;
            }
          }
          
          console.log(`🔍 Pre-populating field ${tableField.name} (${fieldName}) with:`, valueToSet);
          try {
            setValue(fieldName, valueToSet);
          } catch (error) {
            console.warn(`🔍 Failed to pre-populate field ${tableField.name}:`, error);
            // Continue with other fields even if one fails
          }
        }
      });
    }
  }, [dynamicOptions, values.tableName, setValue]);
  
  // Helper function to map Airtable field types to form field types
  const getAirtableFieldType = (airtableType: string): string => {
    switch (airtableType) {
      case 'singleLineText':
      case 'email':
      case 'url':
      case 'phoneNumber':
        return 'text';
      case 'multilineText':
      case 'richText':
        return 'textarea';
      case 'number':
      case 'currency':
      case 'percent':
      case 'duration':
      case 'rating':
        return 'number';
      case 'singleSelect':
        return 'select';
      case 'multipleSelects':
        return 'select'; // Will be handled with multiple: true
      case 'checkbox':
        return 'boolean';
      case 'date':
      case 'dateTime':
        return 'date';
      case 'multipleRecordLinks':
        return 'airtable-linked-record'; // Custom type for linked records
      case 'multipleAttachments':
        return 'file';
      default:
        return 'text';
    }
  };
  
  /**
   * Get visible fields based on current values and dependencies
   */
  const getVisibleFields = () => {
    if (!nodeInfo?.configSchema) return [];
    
    // Start with the base schema fields
    let visibleFields = [...nodeInfo.configSchema];
    
    // Special handling for Airtable list records - show fields conditionally
    if (nodeInfo.providerId === 'airtable' && nodeInfo.type === 'airtable_action_list_records') {
      // Always show baseId field
      const baseField = visibleFields.find(field => field.name === 'baseId');
      
      // Only show tableName field if baseId is selected
      if (values.baseId) {
        const tableField = visibleFields.find(field => field.name === 'tableName');
        const result = [baseField, tableField].filter(Boolean);
        
        // Add unique identifiers to prevent duplicates
        return result.map((field, index) => ({
          ...field,
          uniqueId: `list_records_${field.name}_${index}`
        }));
      } else {
        const result = [baseField].filter(Boolean);
        
        // Add unique identifiers to prevent duplicates
        return result.map((field, index) => ({
          ...field,
          uniqueId: `list_records_${field.name}_${index}`
        }));
      }
    }
    
    // Special handling for Airtable create/update record - add dynamic fields when table is selected
    if (nodeInfo.providerId === 'airtable' && 
        (nodeInfo.type === 'airtable_action_create_record' || nodeInfo.type === 'airtable_action_update_record') && 
        values.tableName) {
      
      console.log('🔍 Attempting to generate dynamic fields for table:', values.tableName);
      console.log('🔍 Available dynamicOptions.tableName:', dynamicOptions?.tableName);
      
      // Find the selected table data which contains the fields schema
      const selectedTable = dynamicOptions?.tableName?.find((table: any) => 
        table.value === values.tableName
      );
      
      console.log('🔍 Found selectedTable:', selectedTable);
      
      if (selectedTable?.fields) {
        console.log('🔍 Creating dynamic fields from table fields:', selectedTable.fields);
        
        // Create dynamic fields for each Airtable table field
        const airtableFields = selectedTable.fields.map((tableField: any, fieldIndex: number) => ({
          name: `airtable_field_${tableField.id}`,
          label: tableField.name,
          type: getAirtableFieldType(tableField.type),
          required: tableField.required || false,
          description: tableField.description,
          placeholder: `Enter ${tableField.name}`,
          // Store the original Airtable field data for the renderer
          airtableField: tableField,
          // Add a unique identifier to help with React keys
          uniqueId: `${values.tableName}-${tableField.id}-${fieldIndex}`
        }));
        
        console.log('🔍 Generated airtableFields:', airtableFields);
        
        // Add the dynamic fields after the existing schema fields
        visibleFields = [...visibleFields, ...airtableFields as any];
      } else {
        console.log('🔍 No fields found in selectedTable');
      }
    }
    
    // Filter fields based on conditions
    // Special handling for Discord triggers
    if (nodeInfo.providerId === 'discord' && nodeInfo.type === 'discord_trigger_new_message') {
      // For Discord triggers, show fields conditionally
      return visibleFields.filter(field => {
        // Always show guildId (server field)
        if (field.name === 'guildId') return true;
        
        // Show channelId only if guildId is selected
        if (field.name === 'channelId') {
          return !!values.guildId;
        }
        
        // Show content filter and author filter if channelId is selected
        if (field.name === 'contentFilter' || field.name === 'authorFilter') {
          return !!values.channelId;
        }
        
        return true;
      });
    }
    
    // Special handling for Discord actions
    if (nodeInfo.providerId === 'discord' && nodeInfo.type?.includes('discord_action')) {
      // For Discord actions, show fields conditionally
      const fields = visibleFields.filter(field => {
        // Always show guildId (server field)
        if (field.name === 'guildId') return true;
        
        // Show channelId and message fields only if:
        // 1. A server is selected
        // 2. Discord integration is connected
        // 3. Bot is in the guild and has permissions
        if (field.name === 'channelId' || field.name === 'message') {
          const hasServerSelected = values.guildId && values.guildId !== '';
          const hasDiscordConnected = !!discordIntegration;
          const hasBotAccess = botStatus?.isInGuild && botStatus?.hasPermissions;
          
          return hasServerSelected && hasDiscordConnected && hasBotAccess;
        }
        
        // Show other fields that depend on guildId only if guildId is selected
        if (field.dependsOn === 'guildId') {
          return values.guildId && values.guildId !== '';
        }

        // Show other fields that depend on baseId only if baseId is selected (for Airtable)
        if (field.dependsOn === 'baseId') {
          return values.baseId && values.baseId !== '';
        }
        
        // Show fields that don't have dependencies
        if (!field.dependsOn) return true;
        
        // Hide fields that depend on other unselected fields
        return values[field.dependsOn] !== undefined && values[field.dependsOn] !== null && values[field.dependsOn] !== '';
      });
      
      return fields;
    }
    
    // Default field visibility logic 
    return visibleFields.filter(field => {
      // For Airtable, show dynamic fields when table is selected
      if (field.name?.startsWith('airtable_field_') && nodeInfo.providerId === 'airtable') {
        return !!values.tableName;
      }
      
      if (!field.dependsOn) return true;
      return values[field.dependsOn] !== undefined && values[field.dependsOn] !== null && values[field.dependsOn] !== '';
    });
  };
  
  /**
   * Split fields into basic and advanced tabs, handling records table for update record
   */
  const splitFields = () => {
    const visibleFields = getVisibleFields();
    
    // For Airtable list records, ensure no dynamic fields are created
    if (nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_list_records') {
      return {
        basicFields: visibleFields.filter(field => !(field as any).advanced),
        advancedFields: visibleFields.filter(field => (field as any).advanced),
        dynamicFields: [], // Explicitly empty for list records
        dynamicAdvancedFields: [] // Explicitly empty for list records
      };
    }
    
    // For Airtable update record, separate base fields from dynamic fields
    if (nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_update_record') {
      const baseFields = visibleFields.filter(field => !field.name?.startsWith('airtable_field_'));
      const dynamicFields = visibleFields.filter(field => field.name?.startsWith('airtable_field_'));
      
      return {
        basicFields: baseFields.filter(field => !(field as any).advanced),
        advancedFields: baseFields.filter(field => (field as any).advanced),
        dynamicFields: dynamicFields.filter(field => !(field as any).advanced),
        dynamicAdvancedFields: dynamicFields.filter(field => (field as any).advanced)
      };
    }
    
    return {
      basicFields: visibleFields.filter(field => !(field as any).advanced),
      advancedFields: visibleFields.filter(field => (field as any).advanced),
      dynamicFields: [],
      dynamicAdvancedFields: []
    };
  };

  const { basicFields, advancedFields, dynamicFields, dynamicAdvancedFields } = splitFields();

  /**
   * Render fields with optional records table for update record
   */
  const renderFieldsWithTable = (fields: any[], isDynamic: boolean = false) => {
    const isUpdateRecord = nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_update_record';
    const isListRecord = nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_list_records';
    const showRecordsTable = isUpdateRecord && !isDynamic && values.tableName && values.baseId;
    const showDynamicFields = isUpdateRecord && isDynamic && values.tableName;
    
    return (
      <>
        {/* Render base fields first */}
        {!isDynamic && fields.map((field, index) => {
          const fieldKey = `${isDynamic ? 'dynamic' : 'basic'}-field-${(field as any).uniqueId || field.name}-${field.type}-${index}-${nodeInfo?.type || 'unknown'}`;
          return (
          <React.Fragment key={fieldKey}>
            <FieldRenderer
              field={field}
              value={values[field.name]}
              onChange={(value) => handleFieldChange(field.name, value)}
              error={errors[field.name]}
              workflowData={workflowData}
              currentNodeId={currentNodeId}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingFields.has(field.name) || (loadingDynamic && field.name !== 'baseId')}
              nodeInfo={nodeInfo}
              allValues={values}
              onDynamicLoad={async (fieldName, dependsOn, dependsOnValue) => {
                if (dependsOn && values[dependsOn]) {
                  await loadOptions(fieldName, dependsOn, values[dependsOn]);
                } else {
                  await loadOptions(fieldName);
                }
              }}
            />
            
            {/* Show preview button for list records right after table field */}
            {isListRecord && field.name === 'tableName' && values.tableName && values.baseId && (
              <div className="mt-4 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <p className="text-sm text-slate-600 mb-3">
                    Preview the data that will be retrieved from the selected table. This shows all records that would be returned when the workflow runs.
                  </p>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (showPreviewData) {
                          setShowPreviewData(false);
                          setPreviewData([]);
                        } else {
                          loadPreviewData(values.baseId, values.tableName);
                        }
                      }}
                      disabled={loadingPreview}
                      className="flex items-center gap-2"
                    >
                      {loadingPreview ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></div>
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      {loadingPreview ? 'Loading...' : showPreviewData ? 'Hide Preview' : 'Preview All Records'}
                    </Button>
                    {showPreviewData && previewData.length > 0 && (
                      <div className="text-sm text-slate-600">
                        Showing {previewData.length} record{previewData.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Inline Preview Data Table from main branch design */}
                {showPreviewData && (
                  <div className="border border-slate-200 rounded-lg bg-white shadow-sm">
                    <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 rounded-t-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-slate-900">
                            Preview: {values.tableName}
                          </h3>
                          <p className="text-xs text-slate-600">
                            {previewData.length} record{previewData.length !== 1 ? 's' : ''} • Data available in workflow
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowPreviewData(false);
                            setPreviewData([]);
                          }}
                          className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      {previewData.length > 0 ? (
                        <>
                          <style jsx>{`
                            .preview-table-container {
                              overflow: scroll !important;
                              overflow-x: scroll !important;
                              overflow-y: scroll !important;
                            }
                            .preview-table-container::-webkit-scrollbar {
                              width: 16px !important;
                              height: 16px !important;
                              background-color: #e2e8f0 !important;
                              display: block !important;
                            }
                            .preview-table-container::-webkit-scrollbar-track {
                              background: #f1f5f9 !important;
                              border-radius: 8px !important;
                              border: 1px solid #cbd5e1 !important;
                            }
                            .preview-table-container::-webkit-scrollbar-thumb {
                              background: #475569 !important;
                              border-radius: 8px !important;
                              border: 2px solid #e2e8f0 !important;
                              min-height: 20px !important;
                              min-width: 20px !important;
                            }
                            .preview-table-container::-webkit-scrollbar-thumb:hover {
                              background: #334155 !important;
                            }
                            .preview-table-container::-webkit-scrollbar-corner {
                              background: #f1f5f9 !important;
                              border: 1px solid #cbd5e1 !important;
                            }
                            .preview-table-container {
                              scrollbar-width: auto !important;
                              scrollbar-color: #475569 #f1f5f9 !important;
                              scrollbar-gutter: stable !important;
                            }
                          `}</style>
                          <div className="relative">
                            {/* Sticky ID column positioned absolutely */}
                            <div 
                              className="absolute left-0 top-0 z-20 bg-white border-r border-slate-200"
                              style={{ 
                                width: (() => {
                                  // Calculate optimal ID column width with better sizing
                                  let maxWidth = Math.max('ID'.length * 10 + 40, 80); // Header width with more space
                                  
                                  // Check all ID values with better character width estimation
                                  previewData.slice(0, 8).forEach(record => {
                                    const idValue = record.value || record.id || '';
                                    const idWidth = String(idValue).length * 9 + 24; // 9px per char + more padding
                                    maxWidth = Math.max(maxWidth, idWidth);
                                  });
                                  
                                  return `${Math.min(maxWidth, 250)}px`; // Higher cap for longer IDs
                                })()
                              }}
                            >
                              <table className="text-sm" style={{ borderSpacing: 0 }}>
                                <thead className="bg-slate-50/50">
                                  <tr style={{ height: '41px' }}>
                                    <th 
                                      className="font-medium text-slate-700 p-2 text-center border-b border-slate-200"
                                      style={{ 
                                        width: (() => {
                                          let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                          previewData.slice(0, 8).forEach(record => {
                                            const idValue = record.value || record.id || '';
                                            const idWidth = String(idValue).length * 9 + 24;
                                            maxWidth = Math.max(maxWidth, idWidth);
                                          });
                                          return `${Math.min(maxWidth, 250)}px`;
                                        })()
                                      }}
                                    >
                                      ID
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {previewData.slice(0, 8).map((record: any, index: number) => {
                                    const idColumnWidth = (() => {
                                      let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                      previewData.slice(0, 8).forEach(rec => {
                                        const idValue = rec.value || rec.id || '';
                                        const idWidth = String(idValue).length * 9 + 24;
                                        maxWidth = Math.max(maxWidth, idWidth);
                                      });
                                      return Math.min(maxWidth, 250);
                                    })();
                                    
                                    return (
                                      <tr key={`id-${record.value || record.id || index}`} className="hover:bg-slate-50/50" style={{ height: '49px' }}>
                                        <td 
                                          className="font-mono text-xs text-slate-500 bg-slate-50/30 p-2 text-center"
                                          style={{ width: `${idColumnWidth}px` }}
                                        >
                                          <div 
                                            className="overflow-hidden text-center" 
                                            style={{ width: `${idColumnWidth - 16}px` }}
                                            title={record.value || record.id || ''}
                                          >
                                            {record.value || record.id || ''}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {previewData.length > 8 && (
                                    <tr>
                                      <td className="p-2 text-center text-xs text-slate-500 bg-slate-50">
                                        ...
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                            
                            {/* Scrollable content area starting after ID column */}
                            <div 
                              className="max-h-[300px] preview-table-container"
                              style={{ 
                                marginLeft: (() => {
                                  // Calculate dynamic ID column width for margin
                                  let maxWidth = Math.max('ID'.length * 10 + 40, 80);
                                  previewData.slice(0, 8).forEach(record => {
                                    const idValue = record.value || record.id || '';
                                    const idWidth = String(idValue).length * 9 + 24;
                                    maxWidth = Math.max(maxWidth, idWidth);
                                  });
                                  return `${Math.min(maxWidth, 250)}px`;
                                })(),
                                maxWidth: (() => {
                                  // Calculate max width accounting for dynamic ID column - more restrictive
                                  let idWidth = Math.max('ID'.length * 10 + 40, 80);
                                  previewData.slice(0, 8).forEach(record => {
                                    const idValue = record.value || record.id || '';
                                    const calcWidth = String(idValue).length * 9 + 24;
                                    idWidth = Math.max(idWidth, calcWidth);
                                  });
                                  idWidth = Math.min(idWidth, 250);
                                  return `calc(100vw - ${idWidth}px - 380px - 140px)`; // Even more space for Variables panel
                                })(), // Account for ID column + Variables panel + more padding
                                overflow: 'scroll',
                                overflowX: 'scroll',
                                overflowY: 'scroll',
                                scrollbarWidth: 'auto',
                                scrollbarColor: '#475569 #f1f5f9',
                                WebkitOverflowScrolling: 'touch'
                              }}
                              onScroll={(e) => {
                                const target = e.target as HTMLDivElement;
                                const scrollLeft = target.scrollLeft;
                                const scrollWidth = target.scrollWidth;
                                const clientWidth = target.clientWidth;
                                const maxScroll = scrollWidth - clientWidth;
                                const progress = maxScroll > 0 ? (scrollLeft / maxScroll) * 100 : 0;
                                setScrollProgress(progress);
                                console.log('📏 SCROLL DEBUG:', {
                                  scrollLeft,
                                  scrollWidth, 
                                  clientWidth,
                                  maxScroll,
                                  progress: Math.round(progress),
                                  containerWidth: target.offsetWidth
                                });
                              }}
                            >
                            <table 
                              className="text-sm" 
                              style={{ 
                                borderSpacing: 0,
                                width: (() => {
                                  // Calculate dynamic width based on content
                                  const fields = Object.keys(previewData[0]?.fields || {});
                                  if (fields.length === 0) return '800px';
                                  
                                  // Calculate dynamic ID column width
                                  let idColumnWidth = Math.max('ID'.length * 10 + 40, 80);
                                  previewData.slice(0, 8).forEach(record => {
                                    const idValue = record.value || record.id || '';
                                    const idWidth = String(idValue).length * 9 + 24;
                                    idColumnWidth = Math.max(idColumnWidth, idWidth);
                                  });
                                  idColumnWidth = Math.min(idColumnWidth, 250);
                                  
                                  // Calculate width for each column based on content
                                  let totalWidth = 0;
                                  fields.forEach(fieldName => {
                                    // Calculate header width
                                    let maxWidth = Math.max(fieldName.length * 8 + 32, 100); // 8px per char + padding
                                    
                                    // Check data width for this field
                                    previewData.slice(0, 8).forEach(record => {
                                      const value = record.fields?.[fieldName];
                                      
                                      // Check if this is an attachment field
                                      const isAttachment = Array.isArray(value) && 
                                        value.length > 0 && 
                                        value[0] && 
                                        typeof value[0] === 'object' && 
                                        value[0].url && 
                                        value[0].filename;
                                      
                                      if (isAttachment) {
                                        // For attachment fields, calculate width based on thumbnail count
                                        const thumbnailCount = Math.min(value.length, 3);
                                        const hasMoreIndicator = value.length > 3;
                                        const attachmentWidth = (thumbnailCount * 32) + ((thumbnailCount - 1) * 4) + (hasMoreIndicator ? 36 : 0) + 32; // 32px per thumbnail + 4px gap + more indicator + padding
                                        maxWidth = Math.max(maxWidth, attachmentWidth);
                                      } else {
                                        // Regular text width calculation
                                        const valueStr = Array.isArray(value) 
                                          ? value.join(', ') 
                                          : String(value || '');
                                        const valueWidth = Math.min(valueStr.length * 7 + 16, 300); // Cap at 300px
                                        maxWidth = Math.max(maxWidth, valueWidth);
                                      }
                                    });
                                    
                                    totalWidth += maxWidth;
                                  });
                                  
                                  // Add dynamic ID column width to make last column align perfectly
                                  const finalWidth = totalWidth + idColumnWidth;
                                  
                                  return `${finalWidth}px`;
                                })(),
                                tableLayout: 'fixed'
                              }}
                            >
                            <thead className="bg-slate-50/50 sticky top-0 z-10">
                              <tr style={{ height: '41px' }}>
                                {/* Show all fields with horizontal scrolling - no ID column here */}
                                {Object.keys(previewData[0]?.fields || {}).map((fieldName, index, fields) => {
                                  // Calculate column width
                                  let columnWidth = Math.max(fieldName.length * 8 + 32, 100);
                                  previewData.slice(0, 8).forEach(record => {
                                    const value = record.fields?.[fieldName];
                                    
                                    // Check if this is an attachment field
                                    const isAttachment = Array.isArray(value) && 
                                      value.length > 0 && 
                                      value[0] && 
                                      typeof value[0] === 'object' && 
                                      value[0].url && 
                                      value[0].filename;
                                    
                                    if (isAttachment) {
                                      // For attachment fields, calculate width based on thumbnail count
                                      const thumbnailCount = Math.min(value.length, 3);
                                      const hasMoreIndicator = value.length > 3;
                                      const attachmentWidth = (thumbnailCount * 32) + ((thumbnailCount - 1) * 4) + (hasMoreIndicator ? 36 : 0) + 32; // 32px per thumbnail + 4px gap + more indicator + padding
                                      columnWidth = Math.max(columnWidth, attachmentWidth);
                                    } else {
                                      // Regular text width calculation
                                      const valueStr = Array.isArray(value) 
                                        ? value.join(', ') 
                                        : String(value || '');
                                      const valueWidth = Math.min(valueStr.length * 7 + 16, 300);
                                      columnWidth = Math.max(columnWidth, valueWidth);
                                    }
                                  });
                                  
                                  // For the last column, add dynamic ID column width for perfect alignment
                                  if (index === fields.length - 1) {
                                    let idColumnWidth = Math.max('ID'.length * 10 + 40, 80);
                                    previewData.slice(0, 8).forEach(record => {
                                      const idValue = record.value || record.id || '';
                                      const idWidth = String(idValue).length * 9 + 24;
                                      idColumnWidth = Math.max(idColumnWidth, idWidth);
                                    });
                                    idColumnWidth = Math.min(idColumnWidth, 250);
                                    columnWidth += idColumnWidth; // Add dynamic ID column width for perfect alignment
                                  }
                                  
                                  return (
                                    <th 
                                      key={fieldName} 
                                      className="font-medium text-slate-700 border-r border-slate-200 last:border-r-0 p-2 whitespace-nowrap text-center" 
                                      style={{ width: `${columnWidth}px`, minWidth: `${columnWidth}px` }}
                                    >
                                      <div title={fieldName} className="text-center">
                                        {fieldName}
                                      </div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {previewData.slice(0, 8).map((record: any, index: number) => (
                                <tr key={record.value || record.id || index} className="hover:bg-slate-50/50" style={{ height: '49px' }}>
                                  {/* No ID cell - start directly with field data */}
                                  {Object.entries(record.fields || {}).map(([fieldName, fieldValue]: [string, any], fieldIndex: number) => {
                                    const fieldNames = Object.keys(record.fields || {});
                                    const isLastColumn = fieldIndex === fieldNames.length - 1;
                                    
                                    // Calculate column width (same logic as header)
                                    let columnWidth = Math.max(fieldName.length * 8 + 32, 100);
                                    previewData.slice(0, 8).forEach(rec => {
                                      const value = rec.fields?.[fieldName];
                                      
                                      // Check if this is an attachment field
                                      const isAttachment = Array.isArray(value) && 
                                        value.length > 0 && 
                                        value[0] && 
                                        typeof value[0] === 'object' && 
                                        value[0].url && 
                                        value[0].filename;
                                      
                                      if (isAttachment) {
                                        // For attachment fields, calculate width based on thumbnail count
                                        const thumbnailCount = Math.min(value.length, 3);
                                        const hasMoreIndicator = value.length > 3;
                                        const attachmentWidth = (thumbnailCount * 32) + ((thumbnailCount - 1) * 4) + (hasMoreIndicator ? 36 : 0) + 32; // 32px per thumbnail + 4px gap + more indicator + padding
                                        columnWidth = Math.max(columnWidth, attachmentWidth);
                                      } else {
                                        // Regular text width calculation
                                        const valueStr = Array.isArray(value) 
                                          ? value.join(', ') 
                                          : String(value || '');
                                        const valueWidth = Math.min(valueStr.length * 7 + 16, 300);
                                        columnWidth = Math.max(columnWidth, valueWidth);
                                      }
                                    });
                                    
                                    // Add dynamic ID column width to last column for alignment
                                    if (isLastColumn) {
                                      let idColumnWidth = Math.max('ID'.length * 10 + 40, 80);
                                      previewData.slice(0, 8).forEach(rec => {
                                        const idValue = rec.value || rec.id || '';
                                        const idWidth = String(idValue).length * 9 + 24;
                                        idColumnWidth = Math.max(idColumnWidth, idWidth);
                                      });
                                      idColumnWidth = Math.min(idColumnWidth, 250);
                                      columnWidth += idColumnWidth;
                                    }
                                    
                                    return (
                                      <td 
                                        key={`${record.id}-${fieldName}-${fieldIndex}`} 
                                        className="border-r border-slate-100 last:border-r-0 p-2 whitespace-nowrap text-center"
                                        style={{ width: `${columnWidth}px`, minWidth: `${columnWidth}px` }}
                                      >
                                        <div className="flex items-center justify-center" style={{ width: `${columnWidth - 16}px` }}>
                                          {(() => {
                                            // Check if this is an Airtable attachment field
                                            const isAttachment = Array.isArray(fieldValue) && 
                                              fieldValue.length > 0 && 
                                              fieldValue[0] && 
                                              typeof fieldValue[0] === 'object' && 
                                              fieldValue[0].url && 
                                              fieldValue[0].filename;
                                            
                                            if (isAttachment) {
                                              // Render attachment thumbnails
                                              return (
                                                <div className="flex flex-wrap gap-1 justify-center">
                                                  {fieldValue.slice(0, 3).map((attachment: any, index: number) => {
                                                    const isImage = attachment.type?.startsWith('image/') || 
                                                      /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(attachment.filename || '');
                                                    
                                                    if (isImage) {
                                                      const thumbnailUrl = attachment.thumbnails?.small?.url || attachment.url;
                                                      return (
                                                        <div 
                                                          key={`${attachment.id || index}`}
                                                          className="relative group"
                                                          title={`${attachment.filename} (${(attachment.size / 1024).toFixed(1)}KB)`}
                                                        >
                                                          <img 
                                                            src={thumbnailUrl}
                                                            alt={attachment.filename || 'Attachment'}
                                                            className="w-8 h-8 object-cover rounded border border-slate-200 hover:border-blue-300 transition-colors"
                                                            onError={(e) => {
                                                              // Fallback to file icon if image fails to load
                                                              const target = e.target as HTMLImageElement;
                                                              target.style.display = 'none';
                                                              const parent = target.parentElement;
                                                              if (parent) {
                                                                parent.innerHTML = `
                                                                  <div class="w-8 h-8 bg-slate-100 rounded border border-slate-200 flex items-center justify-center">
                                                                    <span class="text-xs text-slate-500">📎</span>
                                                                  </div>
                                                                `;
                                                              }
                                                            }}
                                                          />
                                                        </div>
                                                      );
                                                    } else {
                                                      // Non-image attachment - show file icon
                                                      return (
                                                        <div 
                                                          key={`${attachment.id || index}`}
                                                          className="w-8 h-8 bg-slate-100 rounded border border-slate-200 flex items-center justify-center"
                                                          title={`${attachment.filename} (${(attachment.size / 1024).toFixed(1)}KB)`}
                                                        >
                                                          <span className="text-xs text-slate-500">📎</span>
                                                        </div>
                                                      );
                                                    }
                                                  })}
                                                  {fieldValue.length > 3 && (
                                                    <div className="w-8 h-8 bg-slate-50 rounded border border-slate-200 flex items-center justify-center">
                                                      <span className="text-xs text-slate-400">+{fieldValue.length - 3}</span>
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            }
                                            
                                            // Regular array handling
                                            if (Array.isArray(fieldValue)) {
                                              return (
                                                <div className="text-xs text-slate-900 text-center">
                                                  <span className="block" title={fieldValue.join(', ')}>
                                                    {fieldValue.length > 0 ? fieldValue.join(', ') : '[]'}
                                                  </span>
                                                </div>
                                              );
                                            }
                                            
                                            // Empty/null values
                                            if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
                                              return <span className="text-slate-400 italic text-xs">—</span>;
                                            }
                                            
                                            // Regular text values
                                            return (
                                              <div className="text-xs text-slate-900 text-center">
                                                <span className="block" title={String(fieldValue)}>
                                                  {String(fieldValue)}
                                                </span>
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                              {previewData.length > 8 && (
                                <tr>
                                  <td colSpan={Object.keys(previewData[0]?.fields || {}).length} className="p-2 text-center text-xs text-slate-500 bg-slate-50">
                                    ... and {previewData.length - 8} more record{previewData.length - 8 !== 1 ? 's' : ''}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                          <div className="bg-slate-100 rounded-full p-2 mb-2">
                            <Eye className="h-4 w-4 text-slate-400" />
                          </div>
                          <p className="text-sm font-medium">No preview data available</p>
                          <p className="text-xs text-slate-400 mt-1">The table may be empty or there was an error loading data</p>
                        </div>
                      )}
                    </div>
                    
                    {previewData.length > 0 && (
                      <>
                        <div className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 rounded-b-lg">
                          <div className="flex items-center justify-between text-xs text-slate-600">
                            <span>Total: {previewData.length} record{previewData.length !== 1 ? 's' : ''}</span>
                            <span>Showing all {Object.keys(previewData[0]?.fields || {}).length} field{Object.keys(previewData[0]?.fields || {}).length !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </React.Fragment>
        );
        })}
        
        {/* Records table for update record */}
        {showRecordsTable && (
          <div className="mt-6 space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-slate-900 mb-2">Select Record to Update</h4>
              <p className="text-sm text-slate-600 mb-4">
                Choose an existing record from the table to update its values. Once selected, the form fields below will be pre-populated with the current record data.
              </p>
              
              {loadingRecords ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
                  <span className="ml-2 text-sm text-slate-600">Loading records...</span>
                </div>
              ) : airtableRecords.length > 0 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]"></TableHead>
                        <TableHead className="w-[120px]">Record ID</TableHead>
                        <TableHead>Preview</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {airtableRecords.map((record, index) => (
                        <TableRow
                          key={record.id}
                          className={cn(
                            "cursor-pointer hover:bg-slate-50",
                            selectedRecord?.id === record.id && "bg-blue-50 border-blue-200"
                          )}
                          onClick={() => handleRecordSelect(record)}
                        >
                          <TableCell>
                            <div className={cn(
                              "w-4 h-4 rounded-full border-2",
                              selectedRecord?.id === record.id 
                                ? "bg-blue-500 border-blue-500" 
                                : "border-slate-300"
                            )}>
                              {selectedRecord?.id === record.id && (
                                <div className="w-2 h-2 bg-white rounded-full m-0.5"></div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {record.id.substring(0, 12)}...
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-slate-700 truncate max-w-[300px]">
                              {record.fields && Object.entries(record.fields).slice(0, 3).map(([key, value]) => (
                                <span key={key} className="mr-4">
                                  <span className="font-medium">{key}:</span> {String(value).substring(0, 20)}
                                  {String(value).length > 20 && '...'}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  No records found in this table
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Dynamic fields for update/create record */}
        {showDynamicFields && dynamicFields.length > 0 && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-px bg-slate-200 flex-1"></div>
              <span className="text-sm font-medium text-slate-600 px-3">Table Fields</span>
              <div className="h-px bg-slate-200 flex-1"></div>
            </div>
            
            {fields.map((field, index) => {
              const fieldKey = `dynamic-field-${(field as any).uniqueId || field.name}-${field.type}-${index}-${nodeInfo?.type || 'unknown'}`;
              return (
                <FieldRenderer
                  key={fieldKey}
                  field={field}
                  value={values[field.name]}
                  onChange={(value) => handleFieldChange(field.name, value)}
                  error={errors[field.name]}
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  dynamicOptions={dynamicOptions}
                  loadingDynamic={loadingDynamic}
                  nodeInfo={nodeInfo}
                  allValues={values}
                  onDynamicLoad={async (fieldName, dependsOn, dependsOnValue) => {
                    if (dependsOn && values[dependsOn]) {
                      await loadOptions(fieldName, dependsOn, values[dependsOn]);
                    } else {
                      await loadOptions(fieldName);
                    }
                  }}
                />
              );
            })}
          </div>
        )}
      </>
    );
  };

  if (!nodeInfo) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-500">
        <div className="text-center">
          <Settings className="h-8 w-8 mx-auto mb-2 text-slate-400" />
          <p>No configuration available for this node.</p>
        </div>
      </div>
    );
  }

  // Show loading screen when needed
  // Show loading for Airtable during initial data loading
  if (isLoading || (nodeInfo?.providerId === 'airtable' && isInitialLoading)) {
    return (
      <ConfigurationLoadingScreen 
        integrationName={nodeInfo?.providerId === 'airtable' ? 'Airtable' : integrationName || 'Integration'}
      />
    );
  }

  // Handle Discord integrations specially - Progressive field disclosure
  if (nodeInfo?.providerId === 'discord' && nodeInfo?.type?.startsWith('discord_action_')) {
    return renderDiscordProgressiveConfig();
  }

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      
      // Save configuration to persistent storage if we have a valid node ID
      if (currentNodeId && nodeInfo?.type) {
        const workflowId = getWorkflowId();
        if (workflowId) {
          console.log('📋 Saving configuration for Discord trigger node:', currentNodeId);
          // Save both config and dynamicOptions
          saveNodeConfig(workflowId, currentNodeId, nodeInfo.type, values, dynamicOptions);
        }
      }
      
      handleSubmit(onSubmit)();
    }} className="h-full flex flex-col">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Show tabs only if we have advanced fields */}
        {advancedFields.length > 0 ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1">
          <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-100 p-1 rounded-lg">
            <TabsTrigger 
              value="basic" 
              className={cn(
                "rounded-md transition-all duration-200",
                activeTab === "basic" 
                  ? "bg-white text-slate-900 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Settings className="h-4 w-4 mr-2" />
              Basic Settings
            </TabsTrigger>
            <TabsTrigger 
              value="advanced"
              className={cn(
                "rounded-md transition-all duration-200",
                activeTab === "advanced" 
                  ? "bg-white text-slate-900 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Zap className="h-4 w-4 mr-2" />
              Advanced
            </TabsTrigger>
          </TabsList>
          
          <div className="flex-1 min-h-0">
            <TabsContent value="basic" className="h-full mt-0">
              <ScrollArea className="h-[calc(90vh-220px)] pr-4">
                <div className="space-y-3 px-2 pb-6">
                  {renderFieldsWithTable(basicFields, false)}
                  {/* Render dynamic fields for basic tab */}
                  {dynamicFields.length > 0 && renderFieldsWithTable(dynamicFields, true)}
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="advanced" className="h-full mt-0">
              <ScrollArea className="h-[calc(90vh-220px)] pr-4">
                <div className="space-y-3 px-2 pb-6">
                  {renderFieldsWithTable(advancedFields, false)}
                  {/* Render dynamic fields for advanced tab */}
                  {dynamicAdvancedFields.length > 0 && renderFieldsWithTable(dynamicAdvancedFields, true)}
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      ) : (
        // Simple view without tabs if no advanced fields
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-3 px-2 pb-6">
            {renderFieldsWithTable(basicFields, false)}
            {/* Render dynamic fields for simple view */}
            {dynamicFields.length > 0 && renderFieldsWithTable(dynamicFields, true)}
          </div>
        </ScrollArea>
      )}
      </div>

      {/* Discord Bot Status - Show only for Discord actions */}
      {nodeInfo?.providerId === 'discord' && (
        <div className="px-6 py-3 border-t border-slate-100 flex-shrink-0">
          {!discordIntegration ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-blue-800">Connect Discord</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Connect your Discord account to access servers and channels.
                  </p>
                </div>
                <Button
                  onClick={handleConnectDiscord}
                  size="sm"
                  className="bg-[#5865F2] hover:bg-[#4752C4] text-white"
                  disabled={loadingDynamic}
                >
                  {loadingDynamic ? (
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Connecting...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0190 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1568 2.4189Z"/>
                      </svg>
                      Connect
                    </div>
                  )}
                </Button>
              </div>
            </div>
          ) : values.guildId ? (
            <DiscordBotStatus guildId={values.guildId} className="w-full" />
          ) : (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-orange-800">Discord Bot Setup</h3>
                  <p className="text-sm text-orange-700 mt-1">
                    Select a Discord server to check bot status and add the bot if needed.
                  </p>
                </div>
                <div className="text-sm text-orange-600">
                  <span className="font-medium">Step 1:</span> Select a server above
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Form buttons */}
      <div className="flex justify-between items-center h-[70px] px-6 border-t border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          {Object.keys(errors).length > 0 && (
            <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200">
              {Object.keys(errors).length} error{Object.keys(errors).length > 1 ? 's' : ''}
            </Badge>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="flex items-center gap-2"
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
        </div>
        
        <div className="flex gap-3">
          {nodeInfo?.testable && (
            <Button
              type="button"
              onClick={handleTest}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white"
              disabled={isTestLoading}
            >
              {isTestLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              ) : (
                <Play className="h-4 w-4" />
              )}
              Test Configuration
            </Button>
          )}
          <Button
            type="submit"
            className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Save className="h-4 w-4" />
            Save Configuration
          </Button>
        </div>
      </div>
    </form>
  );
}