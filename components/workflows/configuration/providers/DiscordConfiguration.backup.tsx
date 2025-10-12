"use client"

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings2, AlertTriangle, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldRenderer } from '../fields/FieldRenderer';
import { useDiscordState } from '../hooks/useDiscordState';
import { useIntegrationStore } from '@/stores/integrationStore';

import { logger } from '@/lib/utils/logger'

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
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set());
  
  // Get integration to check status
  const { getIntegrationByProvider } = useIntegrationStore();
  const integration = getIntegrationByProvider('discord');
  
  // Use Discord state hook
  const discordState = useDiscordState({
    nodeInfo,
    values,
    loadOptions
  });

  // Handle dynamic field loading
  const handleDynamicLoad = async (fieldName: string) => {
    try {
      setLoadingFields(prev => {
        const newSet = new Set(prev);
        newSet.add(fieldName);
        return newSet;
      });
      
      await loadOptions(fieldName);
    } catch (error) {
      logger.error('Error loading dynamic options:', error);
    } finally {
      setLoadingFields(prev => {
        const newSet = new Set(prev);
        newSet.delete(fieldName);
        return newSet;
      });
    }
  };

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
  if (needsConnection && !integration) {
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

  // Get fields to render (simple filtering)
  const fields = nodeInfo?.configSchema?.filter((field: any) => {
    // Don't show hidden fields
    if (field.type === 'hidden') return false;
    
    // Show channelId only if guildId is selected
    if (field.name === 'channelId' && !values.guildId) {
      return false;
    }
    
    return true;
  }) || [];

  // Simple UI for Discord send message
  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex-1 px-6 py-4">
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-3">
            {fields.map((field: any) => (
              <FieldRenderer
                key={field.name}
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
            ))}
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