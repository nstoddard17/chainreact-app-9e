"use client"

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Play, TestTube } from "lucide-react";
import { FieldRenderer } from "./fields/FieldRenderer";
import { useFormState } from "./hooks/useFormState";
import { useDynamicOptions } from "./hooks/useDynamicOptions";
import { NodeComponent } from "@/lib/workflows/availableNodes";
import { ConfigFormProps } from "./utils/types";
import { shouldHideField } from "./utils/validation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfigurationLoadingScreen } from "@/components/ui/loading-screen";
import { useWorkflowTestStore } from "@/stores/workflowTestStore";

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
        if (field.dynamic && !field.dependsOn && initialData[field.name]) {
          loadOptions(field.name);
        }
      });
    }
  }, [nodeInfo, initialData, setValues, validate, loadOptions]);

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
  const { basicFields, advancedFields } = useCallback(() => {
    const visibleFields = getVisibleFields();
    
    return {
      basicFields: visibleFields.filter(field => !field.advanced),
      advancedFields: visibleFields.filter(field => field.advanced)
    };
  }, [getVisibleFields])();

  if (!nodeInfo) {
    return <div>No configuration available for this node.</div>;
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
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
          
          <ScrollArea className="h-[calc(60vh-120px)] pr-4">
            <TabsContent value="basic" className="space-y-4 mt-0">
              {basicFields.map((field) => (
                <FieldRenderer
                  key={`${field.name}-${field.type}`}
                  field={field}
                  value={values[field.name]}
                  onChange={(value) => handleFieldChange(field.name, value)}
                  error={errors[field.name]}
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  dynamicOptions={dynamicOptions}
                  loadingDynamic={loadingDynamic}
                  onDynamicLoad={(fieldName, dependsOn, dependsOnValue) => {
                    if (dependsOn && values[dependsOn]) {
                      loadOptions(fieldName, { [dependsOn]: values[dependsOn] });
                    } else {
                      loadOptions(fieldName);
                    }
                  }}
                />
              ))}
            </TabsContent>
            
            <TabsContent value="advanced" className="space-y-4 mt-0">
              {advancedFields.map((field) => (
                <FieldRenderer
                  key={`${field.name}-${field.type}`}
                  field={field}
                  value={values[field.name]}
                  onChange={(value) => handleFieldChange(field.name, value)}
                  error={errors[field.name]}
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  dynamicOptions={dynamicOptions}
                  loadingDynamic={loadingDynamic}
                  onDynamicLoad={(fieldName, dependsOn, dependsOnValue) => {
                    if (dependsOn && values[dependsOn]) {
                      loadOptions(fieldName, { [dependsOn]: values[dependsOn] });
                    } else {
                      loadOptions(fieldName);
                    }
                  }}
                />
              ))}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      ) : (
        // Simple view without tabs if no advanced fields
        <ScrollArea className="h-[calc(60vh-120px)] pr-4">
          <div className="space-y-4">
            {basicFields.map((field) => (
              <FieldRenderer
                key={`${field.name}-${field.type}`}
                field={field}
                value={values[field.name]}
                onChange={(value) => handleFieldChange(field.name, value)}
                error={errors[field.name]}
                workflowData={workflowData}
                currentNodeId={currentNodeId}
                dynamicOptions={dynamicOptions}
                loadingDynamic={loadingDynamic}
                onDynamicLoad={(fieldName, dependsOn, dependsOnValue) => {
                  if (dependsOn && values[dependsOn]) {
                    loadOptions(fieldName, { [dependsOn]: values[dependsOn] });
                  } else {
                    loadOptions(fieldName);
                  }
                }}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Form buttons */}
      <div className="flex justify-between mt-6">
        <div>
          {nodeInfo.testable && (
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={isTestLoading}
              className="flex items-center gap-2"
            >
              {isTestLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4" />
              )}
              Test
            </Button>
          )}
        </div>
        
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}