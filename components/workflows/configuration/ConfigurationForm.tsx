"use client"

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Play, TestTube, Save, Settings, Zap, Link, X } from "lucide-react";
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
    loadOptions
  } = useDynamicOptions({ nodeType: nodeInfo?.type, providerId: nodeInfo?.providerId });

  // Discord integration check
  const { getIntegrationByProvider, connectIntegration, getConnectedProviders } = useIntegrationStore();
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
        // For Discord actions, keep the existing behavior
        else {
          // Set default positive bot status when guild is selected
          if (value && discordIntegration) {
            setBotStatus({
              isInGuild: true,
              hasPermissions: true
            });
          } else {
            setBotStatus(null);
          }
          
          // Clear dependent fields when guildId changes
          if (nodeInfo.configSchema) {
            nodeInfo.configSchema.forEach(field => {
              if (field.dependsOn === 'guildId') {
                console.log('🔍 Clearing dependent field:', field.name);
                setValue(field.name, '');
                loadOptions(field.name, 'guildId', value);
              }
            });
          }
        }
      }
      
      // Don't auto-save configuration changes - let user save manually when they click Save or Listen
    }
  }, [nodeInfo, setValue, loadOptions, values, discordIntegration, checkBotStatus, currentNodeId, getWorkflowId, dynamicOptions]);
  
  /**
   * Get visible fields based on current values and dependencies
   */
  const getVisibleFields = () => {
    if (!nodeInfo?.configSchema) return [];
    
    // Special handling for Discord triggers
    if (nodeInfo.providerId === 'discord' && nodeInfo.type === 'discord_trigger_new_message') {
      // For Discord triggers, show fields conditionally
      return nodeInfo.configSchema.filter(field => {
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
      const fields = nodeInfo.configSchema.filter(field => {
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
        
        // Show fields that don't have dependencies
        if (!field.dependsOn) return true;
        
        // Hide fields that depend on other unselected fields
        return values[field.dependsOn] !== undefined && values[field.dependsOn] !== null && values[field.dependsOn] !== '';
      });
      
      return fields;
    }
    
    // Default field visibility logic for non-Discord actions
    return nodeInfo.configSchema.filter(field => {
      if (!field.dependsOn) return true;
      return values[field.dependsOn] !== undefined && values[field.dependsOn] !== null && values[field.dependsOn] !== '';
    });
  };
  
  /**
   * Split fields into basic and advanced tabs
   */
  const splitFields = () => {
    const visibleFields = getVisibleFields();
    
    return {
      basicFields: visibleFields.filter(field => !(field as any).advanced),
      advancedFields: visibleFields.filter(field => (field as any).advanced)
    };
  };

  const { basicFields, advancedFields } = splitFields();

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
  // Simple loading state
  if (isLoading) {
    return <ConfigurationLoadingScreen />;
  }

  // Handle Discord integrations specially
  if (nodeInfo?.providerId === 'discord' && nodeInfo?.type?.startsWith('discord_action_')) {
    // Show connection prompt if Discord is not connected
    if (!discordIntegration) {
      return (
        <div className="space-y-4 p-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-yellow-800">Discord Integration Required</h3>
            <p className="text-sm text-yellow-700 mt-1">
              You need to connect your Discord account to use this action.
            </p>
            <Button
              variant="outline"
              className="mt-3 text-sm"
              onClick={() => {
                window.location.href = "/integrations";
              }}
            >
              Connect Discord
            </Button>
          </div>
        </div>
      );
    }
    
    // Check if we have a guildId field for server selection
    const guildField = nodeInfo.configSchema?.find(field => field.name === 'guildId');
    
    if (guildField && !values.guildId) {
      // Show just the server selection field initially
      return (
        <div className="space-y-6">
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
    }}>
      {/* Show tabs only if we have advanced fields */}
      {advancedFields.length > 0 ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
          
          <ScrollArea className="h-[calc(80vh-220px)] pr-4 overflow-visible">
            <TabsContent value="basic" className="space-y-3 mt-0 px-2 pb-6">
              {basicFields.map((field, index) => (
                <FieldRenderer
                  key={`basic-${field.name}-${field.type}-${index}`}
                  field={field}
                  value={values[field.name]}
                  onChange={(value) => handleFieldChange(field.name, value)}
                  error={errors[field.name]}
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  dynamicOptions={dynamicOptions}
                  loadingDynamic={loadingDynamic}
                  onDynamicLoad={async (fieldName, dependsOn, dependsOnValue) => {
                    if (dependsOn && values[dependsOn]) {
                      await loadOptions(fieldName, dependsOn, values[dependsOn]);
                    } else {
                      await loadOptions(fieldName);
                    }
                  }}
                />
              ))}
            </TabsContent>
            
            <TabsContent value="advanced" className="space-y-3 mt-0 px-2 pb-6">
              {advancedFields.map((field, index) => (
                <FieldRenderer
                  key={`advanced-${field.name}-${field.type}-${index}`}
                  field={field}
                  value={values[field.name]}
                  onChange={(value) => handleFieldChange(field.name, value)}
                  error={errors[field.name]}
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  dynamicOptions={dynamicOptions}
                  loadingDynamic={loadingDynamic}
                  onDynamicLoad={async (fieldName, dependsOn, dependsOnValue) => {
                    if (dependsOn && values[dependsOn]) {
                      await loadOptions(fieldName, dependsOn, values[dependsOn]);
                    } else {
                      await loadOptions(fieldName);
                    }
                  }}
                />
              ))}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      ) : (
        // Simple view without tabs if no advanced fields
        <ScrollArea className="h-[calc(80vh-220px)] pr-4 overflow-visible">
          <div className="space-y-3 px-2 pb-6">
            {basicFields.map((field, index) => (
              <FieldRenderer
                key={`basic-${field.name}-${field.type}-${index}`}
                field={field}
                value={values[field.name]}
                onChange={(value) => handleFieldChange(field.name, value)}
                error={errors[field.name]}
                workflowData={workflowData}
                currentNodeId={currentNodeId}
                dynamicOptions={dynamicOptions}
                loadingDynamic={loadingDynamic}
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
        </ScrollArea>
      )}

      {/* Discord Bot Status - Show only for Discord actions */}
      {nodeInfo?.providerId === 'discord' && (
        <div className="mt-6 px-6">
          {!discordIntegration ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-red-800">Discord Integration Required</h3>
                  <p className="text-sm text-red-700 mt-1">
                    You need to connect your Discord account to use this action.
                  </p>
                </div>
                <Button
                  onClick={handleConnectDiscord}
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Connect Discord
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
      <div className="flex justify-between items-center mt-8 h-[80px] px-6 border-t border-slate-200 bg-white">
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