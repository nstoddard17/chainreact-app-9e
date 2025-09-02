"use client"

import React, { useCallback, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings2, Zap, AlertTriangle, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldRenderer } from '../fields/FieldRenderer';
import DiscordBotStatus from '@/components/workflows/DiscordBotStatus';
import { useDiscordState } from '../hooks/useDiscordState';
import { DiscordReactionRemover } from '../fields/discord/DiscordReactionRemover';

interface DiscordConfigurationProps {
  nodeInfo: any;
  values: Record<string, any>;
  setValue: (field: string, value: any) => void;
  errors: Record<string, string>;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  onCancel: () => void;
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

  // Use Discord state hook
  const discordState = useDiscordState({
    nodeInfo,
    values,
    loadOptions
  });

  // Separate fields into basic and advanced
  const baseFields = nodeInfo?.configSchema?.filter((field: any) => 
    !field.advanced && field.type !== 'hidden'
  ) || [];
  
  const advancedFields = nodeInfo?.configSchema?.filter((field: any) => 
    field.advanced && field.type !== 'hidden'
  ) || [];

  // Handle dynamic field loading
  const handleDynamicLoad = useCallback(async (
    fieldName: string,
    dependsOn?: string,
    dependsOnValue?: any,
    forceReload?: boolean
  ) => {
    console.log('🔍 [DiscordConfig] handleDynamicLoad called:', { 
      fieldName, 
      dependsOn, 
      dependsOnValue,
      forceReload 
    });
    
    const field = nodeInfo?.configSchema?.find((f: any) => f.name === fieldName);
    if (!field) {
      console.warn('Field not found in schema:', fieldName);
      return;
    }
    
    try {
      // If explicit dependencies are provided, use them
      if (dependsOn && dependsOnValue !== undefined) {
        await loadOptions(fieldName, dependsOn, dependsOnValue, forceReload);
      } 
      // Otherwise check field's defined dependencies
      else if (field.dependsOn && values[field.dependsOn]) {
        await loadOptions(fieldName, field.dependsOn, values[field.dependsOn], forceReload);
      } 
      // No dependencies, just load the field
      else {
        await loadOptions(fieldName, undefined, undefined, forceReload);
      }
    } catch (error) {
      console.error('Error loading dynamic options:', error);
    }
  }, [nodeInfo, values, loadOptions]);

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
          loadingDynamic={loadingFields.has(field.name) || loadingDynamic}
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
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
        <h3 className="text-lg font-semibold mb-2">Discord Connection Required</h3>
        <p className="text-sm text-slate-600 mb-4">
          Please connect your Discord account to use this action.
        </p>
        <Button onClick={onConnectIntegration} variant="default">
          Connect Discord
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
              {renderFields(baseFields)}
            </div>
          </ScrollArea>
        </div>
        
        <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 bg-white dark:bg-slate-900">
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
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
        
        {/* Discord Bot Status */}
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
        
        <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 bg-white dark:bg-slate-900">
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
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