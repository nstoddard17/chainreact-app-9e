import { useState, useEffect, useCallback, useRef } from 'react'

import { logger } from '@/lib/utils/logger'
import { useWorkflowTestStore } from '@/stores/workflowTestStore'

export type LiveTestStatus = 'idle' | 'starting' | 'listening' | 'executing' | 'paused' | 'completed' | 'failed' | 'stopped'

export interface LiveTestSession {
  sessionId: string
  status: LiveTestStatus
  triggerType: string
  expiresIn: number
  executionId?: string
}

export interface ExecutionProgress {
  status: 'running' | 'completed' | 'failed' | 'paused'
  currentNodeId: string | null
  currentNodeName: string | null
  completedNodes: string[]
  failedNodes: Array<{ nodeId: string; error: string }>
  totalNodes: number
  progressPercentage: number
  errorMessage?: string
}

export interface LiveTestModeState {
  status: LiveTestStatus
  session: LiveTestSession | null
  progress: ExecutionProgress | null
  error: string | null
}

const POLL_INTERVAL = 1000 // Poll every 1 second

export function useLiveTestMode(workflowId: string) {
  const [state, setState] = useState<LiveTestModeState>({
    status: 'idle',
    session: null,
    progress: null,
    error: null,
  })

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const executionPollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastSyncedProgressRef = useRef<{
    currentNodeId: string | null
    completedNodes: string[]
  }>({ currentNodeId: null, completedNodes: [] })

  // Get workflow test store methods to sync node states
  const {
    setNodeRunning,
    setNodePaused,
    setNodeCompleted,
    setNodeFailed,
    startExecution,
    finishTestFlow,
    resetTestFlow
  } = useWorkflowTestStore()

  /**
   * Start live test mode - registers webhook and starts listening
   */
  const startLiveTest = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, status: 'starting', error: null }))

      const response = await fetch(`/api/workflows/${workflowId}/test-session`, {
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to start live test')
      }

      const data = await response.json()

      setState(prev => ({
        ...prev,
        status: 'listening',
        session: data,
        error: null,
      }))

      // Start polling for session status
      startSessionPolling()

      logger.debug('✅ Live test mode started', data)
    } catch (error: any) {
      logger.error('Failed to start live test:', error)
      setState(prev => ({
        ...prev,
        status: 'failed',
        error: error.message,
      }))
    }
  }, [workflowId])

  /**
   * Stop live test mode
   */
  const stopLiveTest = useCallback(async () => {
    try {
      await fetch(`/api/workflows/${workflowId}/test-session`, {
        method: 'DELETE',
      })

      // Stop all polling
      stopSessionPolling()
      stopExecutionPolling()

      // Reset the workflow test store
      resetTestFlow()

      // Reset sync refs
      lastSyncedProgressRef.current = { currentNodeId: null, completedNodes: [] }

      setState({
        status: 'stopped',
        session: null,
        progress: null,
        error: null,
      })

      logger.debug('✅ Live test mode stopped')
    } catch (error: any) {
      logger.error('Failed to stop live test:', error)
    }
  }, [workflowId, resetTestFlow])

  /**
   * Poll for session status (checking if webhook triggered)
   */
  const startSessionPolling = useCallback(() => {
    if (pollIntervalRef.current) return

    const pollSession = async () => {
      try {
        const response = await fetch(`/api/workflows/${workflowId}/test-session`)
        if (!response.ok) return

        const data = await response.json()

        if (!data.active) {
          // Session ended or expired
          stopSessionPolling()
          setState(prev => ({
            ...prev,
            status: data.session?.status === 'expired' ? 'stopped' : 'completed',
          }))
          return
        }

        // Check if execution started
        if (data.session.status === 'executing' && data.session.execution_id) {
          setState(prev => ({
            ...prev,
            status: 'executing',
            session: { ...prev.session!, executionId: data.session.execution_id },
          }))

          // Stop session polling, start execution polling
          stopSessionPolling()
          startExecutionPolling(data.session.execution_id)
        }
      } catch (error) {
        logger.error('Error polling session status:', error)
      }
    }

    // Poll immediately and then every interval
    pollSession()
    pollIntervalRef.current = setInterval(pollSession, POLL_INTERVAL)
  }, [workflowId])

  /**
   * Stop session polling
   */
  const stopSessionPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  /**
   * Poll for execution progress (real-time node execution)
   */
  const startExecutionPolling = useCallback((executionId: string) => {
    if (executionPollIntervalRef.current) return

    const pollExecution = async () => {
      try {
        const response = await fetch(
          `/api/workflows/${workflowId}/execution-status/${executionId}`
        )
        if (!response.ok) return

        const data = await response.json()
        const progress = data.progress

        // Sync with workflow test store for node visual states
        const lastSynced = lastSyncedProgressRef.current

        // Sync current running/paused node
        if (progress.currentNodeId && progress.currentNodeId !== lastSynced.currentNodeId) {
          if (progress.status === 'paused') {
            setNodePaused(progress.currentNodeId, undefined, progress.currentNodeName)
          } else {
            setNodeRunning(progress.currentNodeId, undefined, progress.currentNodeName)
          }
          lastSyncedProgressRef.current.currentNodeId = progress.currentNodeId
        } else if (progress.status === 'paused' && progress.currentNodeId) {
          // If status changed to paused for the same node, update it
          setNodePaused(progress.currentNodeId, undefined, progress.currentNodeName)
        }

        // Sync completed nodes
        if (progress.completedNodes) {
          const newlyCompleted = progress.completedNodes.filter(
            (nodeId: string) => !lastSynced.completedNodes.includes(nodeId)
          )
          newlyCompleted.forEach((nodeId: string) => {
            setNodeCompleted(nodeId)
          })
          lastSyncedProgressRef.current.completedNodes = [...progress.completedNodes]
        }

        // Sync failed nodes
        if (progress.failedNodes) {
          progress.failedNodes.forEach((failed: { nodeId: string; error: string }) => {
            setNodeFailed(failed.nodeId, failed.error)
          })
        }

        setState(prev => ({
          ...prev,
          progress: progress,
          // Update status to reflect paused state
          status: progress.status === 'paused' ? 'paused' :
                  progress.status === 'running' ? 'executing' : prev.status,
        }))

        // Check if execution completed or failed
        if (progress.status === 'completed' || progress.status === 'failed') {
          stopExecutionPolling()
          finishTestFlow(progress.status === 'completed' ? 'completed' : 'error', progress.errorMessage)
          setState(prev => ({
            ...prev,
            status: progress.status === 'completed' ? 'completed' : 'failed',
            error: progress.errorMessage || null,
          }))
        }
        // Note: Don't stop polling when paused - we want to detect when it resumes
      } catch (error) {
        logger.error('Error polling execution status:', error)
      }
    }

    // Poll immediately and then every interval
    pollExecution()
    executionPollIntervalRef.current = setInterval(pollExecution, POLL_INTERVAL)
  }, [workflowId, setNodeRunning, setNodePaused, setNodeCompleted, setNodeFailed, finishTestFlow])

  /**
   * Stop execution polling
   */
  const stopExecutionPolling = useCallback(() => {
    if (executionPollIntervalRef.current) {
      clearInterval(executionPollIntervalRef.current)
      executionPollIntervalRef.current = null
    }
  }, [])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopSessionPolling()
      stopExecutionPolling()
    }
  }, [stopSessionPolling, stopExecutionPolling])

  return {
    ...state,
    startLiveTest,
    stopLiveTest,
    isActive: state.status === 'listening' || state.status === 'executing' || state.status === 'paused',
    isListening: state.status === 'listening',
    isExecuting: state.status === 'executing',
    isPaused: state.status === 'paused',
  }
}
