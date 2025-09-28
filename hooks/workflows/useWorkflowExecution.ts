import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useWorkflowTestStore } from '@/stores/workflowTestStore'
import { useWorkflowErrorStore } from '@/stores/workflowErrorStore'
import { supabase } from '@/utils/supabaseClient'
import type { Node, Edge } from '@xyflow/react'
import type { WorkflowNode } from '@/stores/workflowStore'

export interface ExecutionResult {
  status: 'pending' | 'running' | 'completed' | 'error'
  timestamp: number
  error?: string
}

export function useWorkflowExecution() {
  const router = useRouter()
  const { toast } = useToast()
  const { currentWorkflow, updateWorkflow } = useWorkflowStore()
  const { setTestResults } = useWorkflowTestStore()
  const { addError, clearErrorsForWorkflow } = useWorkflowErrorStore()

  const [isExecuting, setIsExecuting] = useState(false)
  const [activeExecutionNodeId, setActiveExecutionNodeId] = useState<string | null>(null)
  const [executionResults, setExecutionResults] = useState<Record<string, ExecutionResult>>({})

  // Step execution states
  const [isStepMode, setIsStepMode] = useState(false)
  const [isStepByStep, setIsStepByStep] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null)
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, 'pending' | 'running' | 'completed' | 'error'>>({})
  const [stepContinueCallback, setStepContinueCallback] = useState<(() => void) | null>(null)
  const [skipCallback, setSkipCallback] = useState<(() => void) | null>(null)

  // Function to execute workflow via API
  const executeWorkflow = useCallback(async (
    workflowId: string,
    options?: {
      onNodeStart?: (nodeId: string) => void
      onNodeComplete?: (nodeId: string) => void
      onNodeError?: (nodeId: string, error: string) => void
      testMode?: boolean
      executionMode?: 'sandbox' | 'live'
    }
  ) => {
    try {
      const response = await fetch('/api/workflows/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workflowId,
          testMode: options?.testMode ?? false,
          executionMode: options?.executionMode ?? 'live',
          inputData: {},
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to execute workflow')
      }

      const result = await response.json()

      // Handle callbacks if provided
      if (result.results) {
        result.results.forEach((nodeResult: any) => {
          if (nodeResult.success) {
            options?.onNodeComplete?.(nodeResult.nodeId)
          } else {
            options?.onNodeError?.(nodeResult.nodeId, nodeResult.error || 'Unknown error')
          }
        })
      }

      return result
    } catch (error) {
      console.error('Error executing workflow:', error)
      throw error
    }
  }, [])

  const handleExecute = useCallback(async (nodes: Node[], edges: Edge[]) => {
    if (!currentWorkflow?.id) {
      toast({
        title: "Error",
        description: "Please save your workflow first",
        variant: "destructive",
      })
      return
    }

    const triggerNode = nodes.find(n => n.data?.isTrigger)
    if (!triggerNode) {
      toast({
        title: "Error",
        description: "Please add a trigger node first",
        variant: "destructive",
      })
      return
    }

    const hasConfiguration = triggerNode.data?.config && Object.keys(triggerNode.data.config).length > 0
    if (!hasConfiguration) {
      toast({
        title: "Error",
        description: "Please configure your trigger node first",
        variant: "destructive",
      })
      return
    }

    try {
      setIsExecuting(true)
      clearErrorsForWorkflow(currentWorkflow.id)
      
      const resetResults: Record<string, ExecutionResult> = {}
      nodes.forEach(node => {
        if (node.data?.nodeComponent) {
          resetResults[node.id] = { 
            status: 'pending', 
            timestamp: Date.now() 
          }
        }
      })
      setExecutionResults(resetResults)

      const workflowNodes: WorkflowNode[] = nodes.map(node => ({
        id: node.id,
        type: node.type || 'custom',
        position: node.position,
        data: node.data,
      }))

      const workflowConnections = edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      }))

      await updateWorkflow(currentWorkflow.id, {
        nodes: workflowNodes,
        connections: workflowConnections,
      })

      const executionResults = await executeWorkflow(currentWorkflow.id, {
        executionMode: 'live',
        onNodeStart: (nodeId: string) => {
          setActiveExecutionNodeId(nodeId)
          setExecutionResults(prev => ({
            ...prev,
            [nodeId]: {
              status: 'running',
              timestamp: Date.now()
            }
          }))
        },
        onNodeComplete: (nodeId: string) => {
          setExecutionResults(prev => ({
            ...prev,
            [nodeId]: {
              status: 'completed',
              timestamp: Date.now()
            }
          }))
        },
        onNodeError: (nodeId: string, error: string) => {
          const node = nodes.find(n => n.id === nodeId)
          addError({
            workflowId: currentWorkflow.id,
            nodeId: nodeId,
            nodeName: node?.data?.title || node?.data?.type || 'Unknown Node',
            errorMessage: error,
            timestamp: new Date().toISOString(),
            executionSessionId: `session-${Date.now()}`
          })
          setExecutionResults(prev => ({
            ...prev,
            [nodeId]: {
              status: 'error',
              error,
              timestamp: Date.now()
            }
          }))
        },
      })

      if (executionResults.success) {
        toast({
          title: "Success",
          description: "Workflow executed successfully!",
        })
        
        if (executionResults.executionId) {
          setTimeout(() => {
            router.push(`/executions/${executionResults.executionId}`)
          }, 1500)
        }
      } else {
        toast({
          title: "Execution Failed",
          description: executionResults.error || "An error occurred during execution",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error executing workflow:', error)
      toast({
        title: "Error",
        description: "Failed to execute workflow",
        variant: "destructive",
      })
    } finally {
      setIsExecuting(false)
      setActiveExecutionNodeId(null)
      
      setTimeout(() => {
        setExecutionResults({})
      }, 5000)
    }
  }, [currentWorkflow, updateWorkflow, executeWorkflow, clearErrorsForWorkflow, addError, toast, router])

  const handleResetLoadingStates = useCallback(() => {
    setIsExecuting(false)
    setActiveExecutionNodeId(null)
    setExecutionResults({})
    setIsStepMode(false)
    setIsStepByStep(false)
    setIsPaused(false)
    setCurrentNodeId(null)
    setNodeStatuses({})
    setStepContinueCallback(null)
    setSkipCallback(null)
  }, [])

  const handleTestSandbox = useCallback(async () => {
    // Placeholder for sandbox execution
    toast({
      title: "Sandbox Mode",
      description: "Sandbox execution coming soon",
    })
  }, [toast])

  const handleExecuteLive = useCallback(async () => {
    // Will be called with nodes and edges from the component
    toast({
      title: "Live Execution",
      description: "Live execution starting...",
    })
  }, [toast])

  const pauseExecution = useCallback(() => {
    setIsPaused(true)
  }, [])

  const stopStepExecution = useCallback(() => {
    setIsStepMode(false)
    setIsStepByStep(false)
    setIsPaused(false)
    setCurrentNodeId(null)
    setNodeStatuses({})
    setStepContinueCallback(null)
    setSkipCallback(null)
  }, [])

  const executeNodeStepByStep = useCallback(async (nodeId: string) => {
    setCurrentNodeId(nodeId)
    setNodeStatuses(prev => ({ ...prev, [nodeId]: 'running' }))
    // Implementation for step-by-step execution
  }, [])

  return {
    isExecuting,
    setIsExecuting,
    activeExecutionNodeId,
    executionResults,
    handleExecute,
    handleTestSandbox,
    handleExecuteLive,
    handleResetLoadingStates,
    // Step execution
    isStepMode,
    setIsStepMode,
    isStepByStep,
    setIsStepByStep,
    isPaused,
    setIsPaused,
    currentNodeId,
    setCurrentNodeId,
    nodeStatuses,
    setNodeStatuses,
    stepContinueCallback,
    setStepContinueCallback,
    skipCallback,
    setSkipCallback,
    pauseExecution,
    stopStepExecution,
    executeNodeStepByStep,
  }
}