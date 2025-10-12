import { useState, useEffect, useCallback, useRef } from 'react'

import { logger } from '@/lib/utils/logger'

export type LiveTestStatus = 'idle' | 'starting' | 'listening' | 'executing' | 'completed' | 'failed' | 'stopped'

export interface LiveTestSession {
  sessionId: string
  status: LiveTestStatus
  triggerType: string
  expiresIn: number
  executionId?: string
}

export interface ExecutionProgress {
  status: 'running' | 'completed' | 'failed'
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
  }, [workflowId])

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

        setState(prev => ({
          ...prev,
          progress: data.progress,
        }))

        // Check if execution completed
        if (data.progress.status === 'completed' || data.progress.status === 'failed') {
          stopExecutionPolling()
          setState(prev => ({
            ...prev,
            status: data.progress.status === 'completed' ? 'completed' : 'failed',
            error: data.progress.errorMessage || null,
          }))
        }
      } catch (error) {
        logger.error('Error polling execution status:', error)
      }
    }

    // Poll immediately and then every interval
    pollExecution()
    executionPollIntervalRef.current = setInterval(pollExecution, POLL_INTERVAL)
  }, [workflowId])

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
    isActive: state.status === 'listening' || state.status === 'executing',
    isListening: state.status === 'listening',
    isExecuting: state.status === 'executing',
  }
}
