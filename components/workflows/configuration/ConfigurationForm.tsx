"use client"

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Play, TestTube, Save, Settings, Zap } from "lucide-react";
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
  // State hooks
  const [activeTab, setActiveTab] = useState("basic");
  const [isLoading, setIsLoading] = useState(false);
  const [isTestLoading, setIsTestLoading] = useState(false);
  
  // Form state management
  const {
    values,
    errors,
    setValue,
    setValues,
    handleSubmit,
    validate,
  } = useFormState(initialData, nodeInfo);

  // Dynamic options management
  const {
    dynamicOptions,
    loading: loadingDynamic,
    loadOptions
  } = useDynamicOptions({
    nodeType: nodeInfo?.type,
    providerId: nodeInfo?.providerId
  });

  // Workflow test store integration
  const { setTestResults } = useWorkflowTestStore();

  // Load initial values when component mounts or nodeInfo changes
  useEffect(() => {
    if (initialData && Object.keys(initialData).length > 0) {
      setValues(initialData);
    }
    
    // Initial validation
    validate();
    
    // Load any required dynamic data
    if (nodeInfo?.configSchema) {
      nodeInfo.configSchema.forEach(field => {
        if (field.dynamic && !field.dependsOn) {
          loadOptions(field.name);
        }
      });
    }
    
    // Debug logging
    console.log("🔍 ConfigurationForm initialized:", {
      nodeType: nodeInfo?.type,
      configSchema: nodeInfo?.configSchema,
      initialData,
      values
    });
  }, [nodeInfo, initialData, setValues, validate, loadOptions, values]);

  /**
   * Handle field value change
   */
  const handleFieldChange = useCallback((fieldName: string, value: any) => {
    setValue(fieldName, value);
    
    // Load dependent fields if needed
    if (nodeInfo?.configSchema) {
      const dependentFields = nodeInfo.configSchema.filter(
        (f) => f.dependsOn === fieldName
      );
      
      if (dependentFields.length > 0) {
        dependentFields.forEach(field => {
          if (field.dynamic) {
            // Clear the dependent field value
            setValue(field.name, "");
            // Load new options for the dependent field
            loadOptions(field.name, { [fieldName]: value });
          }
        });
      }
    }
  }, [nodeInfo, setValue, loadOptions]);
  
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
      
      // Update test results in the store
      setTestResults({
        nodeId: currentNodeId || "test",
        input: values,
        output: result.success ? result.data : null,
        error: !result.success ? result.error : null,
        timestamp: Date.now(),
        executionTime: result.executionTime
      });
      
      // Show success/error message
      // This would be handled through a toast notification in a real implementation
    } catch (error) {
      console.error("Test error:", error);
      setTestResults({
        nodeId: currentNodeId || "test",
        input: values,
        output: null,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
        executionTime: 0
      });
    } finally {
      setIsTestLoading(false);
    }
  }, [nodeInfo, values, currentNodeId, setTestResults]);
  
  /**
   * Get visible fields based on current values and dependencies
   */
  const getVisibleFields = useCallback(() => {
    if (!nodeInfo?.configSchema) return [];
    
    // Filter out hidden fields based on dependencies
    return nodeInfo.configSchema.filter(field => !shouldHideField(field, values));
  }, [nodeInfo, values]);
  
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
  if (isLoading) {
    return <ConfigurationLoadingScreen />;
  }

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
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
                      await loadOptions(fieldName, { [dependsOn]: values[dependsOn] });
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
                      await loadOptions(fieldName, { [dependsOn]: values[dependsOn] });
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
                    await loadOptions(fieldName, { [dependsOn]: values[dependsOn] });
                  } else {
                    await loadOptions(fieldName);
                  }
                }}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Discord Bot Status - Show only for Discord actions with guildId */}
      {nodeInfo?.providerId === 'discord' && values.guildId && (
        <div className="mt-6 px-6">
          <DiscordBotStatus guildId={values.guildId} />
        </div>
      )}

      {/* Form buttons */}
      <div className="flex justify-between items-center mt-8 pt-6 pb-4 px-6 border-t border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          {nodeInfo.testable && (
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={isTestLoading}
              className="flex items-center gap-2 bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 transition-all duration-200"
            >
              {isTestLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4" />
              )}
              Test Configuration
            </Button>
          )}
          
          {Object.keys(errors).length > 0 && (
            <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200">
              {Object.keys(errors).length} error{Object.keys(errors).length > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        
        <div className="flex gap-3">
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