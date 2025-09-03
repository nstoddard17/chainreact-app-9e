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
  const { executeWorkflow } = useWorkflowTestStore()
  const { addError, clearErrors } = useWorkflowErrorStore()
  
  const [isExecuting, setIsExecuting] = useState(false)
  const [activeExecutionNodeId, setActiveExecutionNodeId] = useState<string | null>(null)
  const [executionResults, setExecutionResults] = useState<Record<string, ExecutionResult>>({})

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
      clearErrors()
      
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
          addError(nodeId, error)
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
  }, [currentWorkflow, updateWorkflow, executeWorkflow, clearErrors, addError, toast, router])

  const handleResetLoadingStates = useCallback(() => {
    setIsExecuting(false)
    setActiveExecutionNodeId(null)
    setExecutionResults({})
  }, [])

  return {
    isExecuting,
    activeExecutionNodeId,
    executionResults,
    handleExecute,
    handleResetLoadingStates,
  }
}