"use client"

import React, { useCallback, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Twitter, Settings, Star } from "lucide-react";
import { ConfigurationContainer } from '../components/ConfigurationContainer';
import { FieldRenderer } from '../fields/FieldRenderer';
import { AIFieldWrapper } from '../fields/AIFieldWrapper';

interface TwitterConfigurationProps {
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
}

export function TwitterConfiguration({
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
  isConnectedToAIAgent = false,
}: TwitterConfigurationProps) {
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<string>("basic");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle dynamic field loading
  const handleDynamicLoad = useCallback(async (
    fieldName: string,
    dependsOn?: string,
    dependsOnValue?: any,
    forceReload?: boolean
  ) => {
    console.log('🔍 [TwitterConfig] handleDynamicLoad called:', { 
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
      if (dependsOn && dependsOnValue !== undefined) {
        await loadOptions(fieldName, dependsOn, dependsOnValue, forceReload);
      } else if (field.dependsOn && values[field.dependsOn]) {
        await loadOptions(fieldName, field.dependsOn, values[field.dependsOn], forceReload);
      } else {
        await loadOptions(fieldName, undefined, undefined, forceReload);
      }
    } catch (error) {
      console.error('❌ [TwitterConfig] Error loading dynamic options:', error);
    }
  }, [nodeInfo, values, loadOptions]);

  // Helper function to check if a field should be shown based on dependencies
  const shouldShowField = (field: any) => {
    if (field.type === 'hidden') return false;
    
    if (field.conditionalVisibility) {
      const { field: dependentField, value: expectedValue } = field.conditionalVisibility;
      const actualValue = values[dependentField];
      
      if (expectedValue === true && typeof expectedValue === 'boolean') {
        if (!actualValue || (typeof actualValue === 'string' && actualValue.trim() === '')) {
          return false;
        }
      } else if (expectedValue === false && typeof expectedValue === 'boolean') {
        if (actualValue && !(typeof actualValue === 'string' && actualValue.trim() === '')) {
          return false;
        }
      } else if (actualValue !== expectedValue) {
        return false;
      }
    }
    
    if (field.hidden && field.dependsOn) {
      const dependencyValue = values[field.dependsOn];
      return !!dependencyValue;
    }
    
    if (field.hidden) return false;
    
    return true;
  };

  // Separate fields by tab
  const basicFields = nodeInfo?.configSchema?.filter((field: any) => 
    field.uiTab === 'basic' && shouldShowField(field)
  ) || [];
  
  const advancedFields = nodeInfo?.configSchema?.filter((field: any) => 
    field.uiTab === 'advanced' && shouldShowField(field)
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
    
    // Validate required fields based on active tab
    const allFields = [...basicFields, ...advancedFields];
    const newErrors: Record<string, string> = {};
    
    allFields.forEach((field: any) => {
      if (field.required && !values[field.name]) {
        newErrors[field.name] = `${field.label} is required`;
      }
    });
    
    if (Object.keys(newErrors).length > 0) {
      setValidationErrors(newErrors);
      // Switch to the tab with the first error
      const firstErrorField = allFields.find(f => newErrors[f.name]);
      if (firstErrorField?.uiTab) {
        setActiveTab(firstErrorField.uiTab);
      }
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show connection prompt if needed
  if (needsConnection) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="mr-2"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <Twitter className="h-6 w-6 text-blue-500" />
            <div>
              <h2 className="text-lg font-semibold">Connect Twitter</h2>
              <p className="text-sm text-muted-foreground">
                Connect your Twitter account to use this action
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <Twitter className="h-16 w-16 text-blue-500 mx-auto" />
            <h3 className="text-lg font-semibold">Twitter not connected</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              You need to connect your Twitter account to use this action.
            </p>
            <Button onClick={onConnectIntegration} className="bg-blue-500 hover:bg-blue-600">
              Connect Twitter
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ConfigurationContainer
      onSubmit={handleSubmit}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
      showFooter={false}
    >
      <div className="flex items-center gap-3 mb-6">
        <Twitter className="h-6 w-6 text-blue-500" />
        <div>
          <h2 className="text-lg font-semibold">
            {nodeInfo?.title || 'Configure Twitter Action'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {nodeInfo?.description || 'Set up your Twitter action'}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <TabsList className="grid w-auto grid-cols-2 gap-1 p-1 bg-slate-100/50 mb-6">
          <TabsTrigger
            value="basic"
            className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <Twitter className="h-4 w-4" />
            <span className="font-medium">Basic Settings</span>
            {basicFields.some((f: any) => f.required && !values[f.name]) && (
              <span className="w-2 h-2 bg-red-500 rounded-full ml-1" />
            )}
          </TabsTrigger>
          <TabsTrigger
            value="advanced"
            className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <Star className="h-4 w-4" />
            <span className="font-medium">Advanced Options</span>
            {advancedFields.length > 0 && (
              <span className="text-xs text-muted-foreground ml-1">
                ({advancedFields.filter((f: any) => values[f.name]).length}/{advancedFields.length})
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <div className="flex-1">
          <TabsContent value="basic" className="mt-0">
            <div className="space-y-6">
              {renderFields(basicFields)}
              {basicFields.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No basic settings available
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="advanced" className="mt-0">
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex gap-2">
                  <Settings className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-blue-900">Advanced Twitter Features</h3>
                    <p className="text-sm text-blue-700 mt-1">
                      These options provide additional control over your tweets, including polls,
                      reply settings, communities, and more.
                    </p>
                  </div>
                </div>
              </div>
              {renderFields(advancedFields)}
              {advancedFields.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No advanced options available
                </div>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <div className="flex items-center justify-between pt-6 border-t mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-blue-500 hover:bg-blue-600"
        >
          {isSubmitting ? 'Saving...' : (isEditMode ? 'Update' : 'Save')}
        </Button>
      </div>
    </ConfigurationContainer>
  );
}