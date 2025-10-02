"use client"

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { FieldRenderer } from '../fields/FieldRenderer';

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
}: DiscordConfigurationProps) {
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
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

  // Simple field change handler that loads channel options when server is selected
  const handleFieldChange = (fieldName: string, value: any) => {
    // Update the value
    setValue(fieldName, value);
    
    // If server (guildId) was changed, load channels
    if (fieldName === 'guildId' && value) {
      // Clear channel value when server changes
      setValue('channelId', '');
      
      // Load channels for the selected server
      // Use setTimeout to prevent blocking the UI
      setTimeout(() => {
        loadOptions('channelId', 'guildId', value);
      }, 100);
    }
  };

  // Get fields to render
  const fields = nodeInfo?.configSchema?.filter((field: any) => {
    // Don't show hidden fields
    if (field.type === 'hidden') return false;
    
    // Show channelId only if guildId is selected
    if (field.name === 'channelId' && !values.guildId) {
      return false;
    }
    
    return true;
  }) || [];

  // Simple UI
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
                onChange={(value) => handleFieldChange(field.name, value)}
                error={errors[field.name] || validationErrors[field.name]}
                workflowData={workflowData}
                currentNodeId={currentNodeId}
                dynamicOptions={dynamicOptions}
                loadingDynamic={loadingDynamic}
                nodeInfo={nodeInfo}
                parentValues={values}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
      
      <div className="border-t border-border px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <Button type="button" variant="outline" onClick={onBack || onCancel}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </div>
          <Button type="submit">
            {isEditMode ? 'Update' : 'Save'} Configuration
          </Button>
        </div>
      </div>
    </form>
  );
}