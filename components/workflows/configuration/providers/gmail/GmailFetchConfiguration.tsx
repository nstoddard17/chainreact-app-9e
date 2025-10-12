"use client"

import React, { useCallback, useState } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, Search, Settings } from "lucide-react";
import { FieldRenderer } from '../../fields/FieldRenderer';
import { AIFieldWrapper } from '../../fields/AIFieldWrapper';

import { logger } from '@/lib/utils/logger'

interface GmailFetchConfigurationProps {
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
  aiFields?: Record<string, boolean>;
  setAiFields?: (fields: Record<string, boolean>) => void;
  isConnectedToAIAgent?: boolean;
}

export function GmailFetchConfiguration({
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
  aiFields = {},
  setAiFields = () => {},
  isConnectedToAIAgent = false,
}: GmailFetchConfigurationProps) {
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic');

  // Handle dynamic field loading
  const handleDynamicLoad = useCallback(async (
    fieldName: string,
    dependsOn?: string,
    dependsOnValue?: any,
    forceReload?: boolean
  ) => {
    logger.debug('🔍 [GmailFetchConfig] handleDynamicLoad called:', { 
      fieldName, 
      dependsOn, 
      dependsOnValue,
      forceReload 
    });
    
    const field = nodeInfo?.configSchema?.find((f: any) => f.name === fieldName);
    if (!field) {
      logger.warn('Field not found in schema:', fieldName);
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
      logger.error('❌ [GmailFetchConfig] Error loading dynamic options:', error);
    }
  }, [nodeInfo, values, loadOptions]);

  // Helper function to check if a field should be shown based on dependencies
  const shouldShowField = (field: any) => {
    // Never show fields with type: 'hidden'
    if (field.type === 'hidden') return false;
    
    // Check conditionalVisibility
    if (field.conditionalVisibility) {
      const { field: dependentField, value: expectedValue } = field.conditionalVisibility;
      const actualValue = values[dependentField];
      
      // Special handling for boolean true - check for any truthy value
      if (expectedValue === true && typeof expectedValue === 'boolean') {
        // Hide if actualValue is empty, null, undefined, or empty string
        if (!actualValue || (typeof actualValue === 'string' && actualValue.trim() === '')) {
          return false;
        }
      }
      // Special handling for boolean false - check for falsy value
      else if (expectedValue === false && typeof expectedValue === 'boolean') {
        // Hide if actualValue is truthy
        if (actualValue && !(typeof actualValue === 'string' && actualValue.trim() === '')) {
          return false;
        }
      }
      // For other values, check exact match
      else if (actualValue !== expectedValue) {
        return false;
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
  const basicFields = nodeInfo?.configSchema?.filter((field: any) => 
    !field.advanced && shouldShowField(field)
  ) || [];
  
  const advancedFields = nodeInfo?.configSchema?.filter((field: any) => 
    field.advanced && shouldShowField(field)
  ) || [];

  // Handle AI field toggle
  const handleAIToggle = useCallback((fieldName: string, enabled: boolean) => {
    setAiFields({
      ...aiFields,
      [fieldName]: enabled
    });
  }, [aiFields, setAiFields]);

  // Render fields helper
  const renderFields = (fields: any[]) => {
    return fields.map((field, index) => {
      // Use AIFieldWrapper when connected to AI Agent, otherwise use FieldRenderer
      const shouldUseAIWrapper = isConnectedToAIAgent === true;
      const Component = shouldUseAIWrapper ? AIFieldWrapper : FieldRenderer;
      
      return (
        <React.Fragment key={`field-${field.name}-${index}`}>
          <Component
            field={field}
            value={values[field.name]}
            onChange={(value) => setValue(field.name, value)}
            error={errors[field.name] || validationErrors[field.name]}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingFields.has(field.name) || (loadingDynamic && field.dynamic)}
            nodeInfo={nodeInfo}
            onDynamicLoad={handleDynamicLoad}
            parentValues={values}
            // Props specific to AIFieldWrapper
            isAIEnabled={aiFields[field.name] || aiFields._allFieldsAI || false}
            onAIToggle={isConnectedToAIAgent ? handleAIToggle : undefined}
          />
        </React.Fragment>
      );
    });
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields (only for visible fields)
    const allFields = [...basicFields, ...advancedFields];
    const requiredFields = allFields.filter(f => f.required && shouldShowField(f));
    const errors: Record<string, string> = {};
    
    requiredFields.forEach(field => {
      if (!values[field.name] && values[field.name] !== 0 && values[field.name] !== false) {
        errors[field.name] = `${field.label || field.name} is required`;
      }
    });
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      // Focus on first error field
      const firstErrorField = Object.keys(errors)[0];
      const element = document.querySelector(`[name="${firstErrorField}"]`) as HTMLElement;
      element?.focus();
      
      // If error is in advanced tab, switch to it
      const errorField = allFields.find(f => f.name === firstErrorField);
      if (errorField?.advanced && activeTab === 'basic') {
        setActiveTab('advanced');
      }
      return;
    }
    
    await onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'basic' | 'advanced')} className="flex-1 flex flex-col">
        <div className="px-6 pt-4 pb-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic" className="gap-2">
              <Search className="w-4 h-4" />
              Basic
            </TabsTrigger>
            <TabsTrigger value="advanced" className="gap-2">
              <Settings className="w-4 h-4" />
              Advanced
            </TabsTrigger>
          </TabsList>
        </div>
        
        <div className="flex-1 px-6 pb-4 overflow-hidden">
          {/* Basic Tab */}
          <TabsContent value="basic" className="h-full mt-2" forceMount hidden={activeTab !== 'basic'}>
            <ScrollArea className="h-[calc(90vh-240px)] pr-4">
              <div className="space-y-3">
                {basicFields.length > 0 ? (
                  renderFields(basicFields)
                ) : (
                  <p className="text-sm text-slate-500">No basic configuration options available.</p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          
          {/* Advanced Tab */}
          <TabsContent value="advanced" className="h-full mt-2" forceMount hidden={activeTab !== 'advanced'}>
            <ScrollArea className="h-[calc(90vh-240px)] pr-4">
              <div className="space-y-3">
                {advancedFields.length > 0 ? (
                  renderFields(advancedFields)
                ) : (
                  <p className="text-sm text-slate-500">No advanced configuration options available.</p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </div>
      </Tabs>
      
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