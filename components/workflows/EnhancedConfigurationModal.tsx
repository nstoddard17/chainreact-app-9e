"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { NodeComponent, NodeField } from "@/lib/workflows/availableNodes"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useWorkflowTestStore } from "@/stores/workflowTestStore"
import { Play, ChevronLeft, ChevronRight, X, Loader2, TestTube, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface EnhancedConfigurationModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: Record<string, any>) => void
  nodeInfo: NodeComponent | null
  integrationName: string
  initialData?: Record<string, any>
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
}

export default function EnhancedConfigurationModal({
  isOpen,
  onClose,
  onSave,
  nodeInfo,
  integrationName,
  initialData = {},
  workflowData,
  currentNodeId,
}: EnhancedConfigurationModalProps) {
  const [config, setConfig] = useState<Record<string, any>>(initialData)
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  // Enhanced workflow segment testing state
  const [segmentTestResult, setSegmentTestResult] = useState<any>(null)
  const [isSegmentTestLoading, setIsSegmentTestLoading] = useState(false)
  const [showDataFlowPanels, setShowDataFlowPanels] = useState(false)
  
  // Global test store
  const { 
    setTestResults, 
    getNodeInputOutput, 
    isNodeInExecutionPath, 
    hasTestResults,
    getNodeTestResult,
    testTimestamp
  } = useWorkflowTestStore()

  useEffect(() => {
    setConfig(initialData)
  }, [initialData])

  // Check if this node has test data available
  const nodeTestData = currentNodeId ? getNodeInputOutput(currentNodeId) : null
  const isInExecutionPath = currentNodeId ? isNodeInExecutionPath(currentNodeId) : false
  const nodeTestResult = currentNodeId ? getNodeTestResult(currentNodeId) : null
  
  // Auto-show panels if this node has test data
  useEffect(() => {
    if (nodeTestData && isInExecutionPath) {
      setShowDataFlowPanels(true)
    }
  }, [nodeTestData, isInExecutionPath])

  // Enhanced workflow segment testing
  const handleTestWorkflowSegment = async () => {
    if (!nodeInfo?.testable || !workflowData || !currentNodeId) return
    
    setIsSegmentTestLoading(true)
    setSegmentTestResult(null)
    
    try {
      const response = await fetch('/api/workflows/test-workflow-segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowData,
          targetNodeId: currentNodeId,
          triggerData: {
            // Sample trigger data
            name: "John Doe",
            email: "john@example.com",
            status: "active",
            amount: 100,
            date: new Date().toISOString(),
            id: "test-123"
          }
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        setSegmentTestResult(result)
        setShowDataFlowPanels(true)
        
        // Store test results globally
        setTestResults(
          result.executionResults,
          result.executionPath,
          result.dataFlow.triggerOutput,
          currentNodeId
        )
      } else {
        setSegmentTestResult({
          success: false,
          error: result.error || "Test failed"
        })
        setShowDataFlowPanels(true)
      }
    } catch (error: any) {
      setSegmentTestResult({
        success: false,
        error: `Test failed: ${error.message}`
      })
      setShowDataFlowPanels(true)
    } finally {
      setIsSegmentTestLoading(false)
    }
  }

  const handleSave = () => {
    onSave(config)
    onClose()
  }

  const renderField = (field: NodeField) => {
    const value = config[field.name] || ""

    switch (field.type) {
      case "text":
      case "email":
        return (
          <Input
            type={field.type}
            value={value}
            onChange={(e) => setConfig(prev => ({ ...prev, [field.name]: e.target.value }))}
            placeholder={field.placeholder}
            className="w-full"
          />
        )
      case "textarea":
        return (
          <Textarea
            value={value}
            onChange={(e) => setConfig(prev => ({ ...prev, [field.name]: e.target.value }))}
            placeholder={field.placeholder}
            className="w-full min-h-[100px]"
          />
        )
      case "select":
        return (
          <Select
            value={value}
            onValueChange={(newValue) => setConfig(prev => ({ ...prev, [field.name]: newValue }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={field.placeholder} />
            </SelectTrigger>
                         <SelectContent>
               {field.options?.map((option) => {
                 const optionValue = typeof option === 'string' ? option : option.value
                 const optionLabel = typeof option === 'string' ? option : option.label
                 return (
                   <SelectItem key={optionValue} value={optionValue}>
                     {optionLabel}
                   </SelectItem>
                 )
               })}
             </SelectContent>
          </Select>
        )
      case "boolean":
        return (
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => setConfig(prev => ({ ...prev, [field.name]: e.target.checked }))}
              className="rounded border-gray-300"
            />
            <span className="text-sm">{field.label}</span>
          </div>
        )
      case "number":
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => setConfig(prev => ({ ...prev, [field.name]: Number(e.target.value) }))}
            placeholder={field.placeholder}
            className="w-full"
          />
        )
      default:
        return (
          <Input
            value={value}
            onChange={(e) => setConfig(prev => ({ ...prev, [field.name]: e.target.value }))}
            placeholder={field.placeholder}
            className="w-full"
          />
        )
    }
  }

  const renderDataFlowPanel = (title: string, data: any, type: 'input' | 'output', isStoredData = false) => {
    if (!data) return null

    return (
      <div className={cn(
        "flex-1 bg-background border-l border-border p-4 overflow-y-auto",
        type === 'input' ? "border-r-0" : "border-l-0"
      )}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              {title}
            </h3>
            <div className="flex items-center gap-2">
              {isStoredData && (
                <div className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-700">
                  <Clock className="w-3 h-3" />
                  Cached
                </div>
              )}
              <div className={cn(
                "px-2 py-1 text-xs rounded-full",
                type === 'input' 
                  ? "bg-blue-100 text-blue-700" 
                  : "bg-green-100 text-green-700"
              )}>
                {type === 'input' ? 'Input' : 'Output'}
              </div>
            </div>
          </div>
          
          <div className="bg-muted/50 rounded-lg p-3">
            <pre className="text-xs text-foreground whitespace-pre-wrap break-words">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
          
          {/* Show execution status for stored data */}
          {isStoredData && nodeTestResult && (
            <div className={cn(
              "text-xs px-2 py-1 rounded",
              nodeTestResult.success 
                ? "bg-green-100 text-green-800" 
                : "bg-red-100 text-red-800"
            )}>
              {nodeTestResult.success 
                ? `✓ Executed successfully (Step ${nodeTestResult.executionOrder})`
                : `✗ Failed: ${nodeTestResult.error}`}
            </div>
          )}
          
          {type === 'output' && nodeInfo?.outputSchema && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Available Fields:
              </div>
              <div className="space-y-1">
                {nodeInfo.outputSchema.map((field) => (
                  <div key={field.name} className="text-xs border rounded p-2 bg-background">
                    <div className="font-medium text-foreground">
                      {field.label} ({field.type})
                    </div>
                    <div className="text-muted-foreground">
                      {field.description}
                    </div>
                    {field.example && (
                      <div className="text-blue-600 font-mono mt-1">
                        Example: {typeof field.example === 'object' 
                          ? JSON.stringify(field.example) 
                          : field.example}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!nodeInfo) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className={cn(
          "max-w-4xl w-full h-[90vh] p-0 gap-0 overflow-hidden",
          showDataFlowPanels && "max-w-[95vw]"
        )}
      >
                 <div className="flex h-full">
           {/* Left Data Flow Panel - Input */}
           {showDataFlowPanels && (
             <div className="w-80 bg-muted/30 border-r border-border">
               {/* Show live test results if available, otherwise show stored data */}
               {segmentTestResult ? (
                 renderDataFlowPanel(
                   "Workflow Input", 
                   segmentTestResult.targetNodeInput,
                   'input',
                   false
                 )
               ) : nodeTestData ? (
                 renderDataFlowPanel(
                   "Node Input", 
                   nodeTestData.input,
                   'input',
                   true
                 )
               ) : null}
             </div>
           )}

          {/* Main Configuration Content */}
          <div className="flex-1 flex flex-col">
            <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between">
                                 <DialogTitle className="text-lg font-semibold">
                   Configure {nodeInfo.title || nodeInfo.type}
                 </DialogTitle>
                <div className="flex items-center gap-2">
                  {showDataFlowPanels && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowDataFlowPanels(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
              
                             {/* Test Status */}
               {showDataFlowPanels && (
                 <div className="space-y-2">
                   {segmentTestResult && (
                     <div className={cn(
                       "text-sm px-3 py-2 rounded-md",
                       segmentTestResult.success 
                         ? "bg-green-100 text-green-800" 
                         : "bg-red-100 text-red-800"
                     )}>
                       {segmentTestResult.success 
                         ? `✓ Test successful - Executed ${segmentTestResult.executionPath?.length || 0} nodes`
                         : `✗ Test failed: ${segmentTestResult.error}`}
                     </div>
                   )}
                   
                   {!segmentTestResult && nodeTestData && (
                     <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-md bg-blue-100 text-blue-800">
                       <TestTube className="w-4 h-4" />
                       <span>Showing cached test data from previous workflow execution</span>
                       {testTimestamp && (
                         <span className="text-xs opacity-75">
                           • {new Date(testTimestamp).toLocaleTimeString()}
                         </span>
                       )}
                     </div>
                   )}
                 </div>
               )}
            </DialogHeader>

            {/* Configuration Form */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-6">
                {nodeInfo.configSchema?.map((field) => (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={field.name} className="text-sm font-medium">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    {renderField(field)}
                    {field.description && (
                      <p className="text-xs text-muted-foreground">
                        {field.description}
                      </p>
                    )}
                    {errors[field.name] && (
                      <p className="text-red-500 text-sm">{errors[field.name]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Dialog Footer */}
            <DialogFooter className="px-6 py-4 border-t border-border flex-shrink-0">
              <div className="flex items-center justify-between w-full">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  {nodeInfo?.testable && workflowData && currentNodeId && (
                    <Button 
                      variant="secondary"
                      onClick={handleTestWorkflowSegment}
                      disabled={isSegmentTestLoading}
                      className="gap-2"
                    >
                      {isSegmentTestLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Test Workflow
                        </>
                      )}
                    </Button>
                  )}
                  
                  {/* Show data panels button for nodes with cached test data */}
                  {!showDataFlowPanels && nodeTestData && isInExecutionPath && (
                    <Button 
                      variant="outline"
                      onClick={() => setShowDataFlowPanels(true)}
                      className="gap-2"
                    >
                      <TestTube className="w-4 h-4" />
                      Show Test Data
                    </Button>
                  )}
                </div>
                <Button onClick={handleSave}>
                  Save Configuration
                </Button>
              </div>
            </DialogFooter>
          </div>

                     {/* Right Data Flow Panel - Output */}
           {showDataFlowPanels && (
             <div className="w-80 bg-muted/30 border-l border-border">
               {/* Show live test results if available, otherwise show stored data */}
               {segmentTestResult ? (
                 renderDataFlowPanel(
                   "Node Output", 
                   segmentTestResult.targetNodeOutput,
                   'output',
                   false
                 )
               ) : nodeTestData ? (
                 renderDataFlowPanel(
                   "Node Output", 
                   nodeTestData.output,
                   'output',
                   true
                 )
               ) : null}
             </div>
           )}
        </div>
      </DialogContent>
    </Dialog>
  )
} 