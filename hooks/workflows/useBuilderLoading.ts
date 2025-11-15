import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/lib/utils/logger'

export interface BuilderLoadingState {
  // Individual loading states
  auth: boolean
  integrations: boolean
  workflow: boolean
  chatHistory: boolean

  // Overall states
  isInitializing: boolean
  isReady: boolean

  // Error tracking
  errors: {
    auth?: string
    integrations?: string
    workflow?: string
    chatHistory?: string
  }
}

export interface UseBuilderLoadingOptions {
  onReady?: () => void
  onError?: (error: string) => void
}

/**
 * Consolidated loading state management for WorkflowBuilder
 *
 * This hook tracks all loading states in one place and provides
 * a single "isReady" flag to determine when the builder can render.
 *
 * @example
 * const loading = useBuilderLoading({
 *   onReady: () => console.log('Builder ready!'),
 *   onError: (error) => toast.error(error)
 * })
 *
 * // Set individual loading states
 * loading.setLoading('auth', true)
 * loading.setLoading('integrations', false)
 *
 * // Check if ready
 * if (loading.state.isReady) {
 *   // Render builder
 * }
 */
export function useBuilderLoading(options?: UseBuilderLoadingOptions) {
  const [state, setState] = useState<BuilderLoadingState>({
    auth: true,
    integrations: true,
    workflow: true,
    chatHistory: false, // Chat is optional, don't block on it
    isInitializing: true,
    isReady: false,
    errors: {},
  })

  // Update a specific loading state
  const setLoading = useCallback((key: keyof Omit<BuilderLoadingState, 'isInitializing' | 'isReady' | 'errors'>, loading: boolean) => {
    setState(prev => {
      const next = { ...prev, [key]: loading }

      // Calculate overall states
      // We're ready when auth, integrations, and workflow are all loaded
      // Chat history is optional and shouldn't block
      const isReady = !next.auth && !next.integrations && !next.workflow
      const isInitializing = next.auth || next.integrations || next.workflow

      logger.debug('[useBuilderLoading] State update:', {
        key,
        loading,
        isReady,
        isInitializing,
        states: {
          auth: next.auth,
          integrations: next.integrations,
          workflow: next.workflow,
          chatHistory: next.chatHistory,
        }
      })

      return {
        ...next,
        isInitializing,
        isReady,
      }
    })
  }, [])

  // Set an error for a specific loading key
  const setError = useCallback((key: keyof BuilderLoadingState['errors'], error: string) => {
    setState(prev => ({
      ...prev,
      errors: {
        ...prev.errors,
        [key]: error,
      },
    }))

    options?.onError?.(error)
  }, [options])

  // Clear an error
  const clearError = useCallback((key: keyof BuilderLoadingState['errors']) => {
    setState(prev => ({
      ...prev,
      errors: {
        ...prev.errors,
        [key]: undefined,
      },
    }))
  }, [])

  // Reset all loading states
  const reset = useCallback(() => {
    setState({
      auth: true,
      integrations: true,
      workflow: true,
      chatHistory: false,
      isInitializing: true,
      isReady: false,
      errors: {},
    })
  }, [])

  // Call onReady when ready
  useEffect(() => {
    if (state.isReady && !state.isInitializing) {
      logger.debug('[useBuilderLoading] Builder is ready!')
      options?.onReady?.()
    }
  }, [state.isReady, state.isInitializing, options])

  return {
    state,
    setLoading,
    setError,
    clearError,
    reset,
  }
}
