"use client"

import { useState, useCallback, useRef } from "react"

/**
 * Hook for admin actions that may require step-up authentication.
 *
 * Wraps a fetch call and intercepts STEP_UP_REQUIRED responses.
 * When step-up is needed, sets `needsStepUp` to true so the component
 * can render the StepUpAuthDialog. After verification, call `retry()`
 * to re-execute the original request.
 *
 * Usage:
 * ```tsx
 * const { execute, retry, needsStepUp, setNeedsStepUp, loading } = useAdminAction()
 *
 * const handleDelete = () => execute('/api/admin/users/delete', {
 *   method: 'POST',
 *   body: JSON.stringify({ userId, deleteData: true }),
 * })
 *
 * <StepUpAuthDialog
 *   open={needsStepUp}
 *   onOpenChange={setNeedsStepUp}
 *   onVerified={retry}
 *   onCancel={() => setNeedsStepUp(false)}
 * />
 * ```
 */
export function useAdminAction<T = unknown>() {
  const [loading, setLoading] = useState(false)
  const [needsStepUp, setNeedsStepUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingRequest = useRef<{ url: string; options: RequestInit } | null>(null)

  const execute = useCallback(
    async (
      url: string,
      options: RequestInit = {},
      onSuccess?: (data: T) => void,
      onError?: (error: string) => void
    ) => {
      try {
        setLoading(true)
        setError(null)

        // Store for potential retry
        pendingRequest.current = { url, options }

        const response = await fetch(url, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
          },
        })

        const data = await response.json()

        if (!response.ok) {
          if (data.code === "STEP_UP_REQUIRED") {
            setNeedsStepUp(true)
            // Store onSuccess/onError for retry
            pendingRequest.current = {
              ...pendingRequest.current!,
              // @ts-expect-error -- storing callbacks for retry
              _onSuccess: onSuccess,
              _onError: onError,
            }
            return null
          }
          const errMsg = data.error || "Request failed"
          setError(errMsg)
          onError?.(errMsg)
          return null
        }

        onSuccess?.(data as T)
        return data as T
      } catch (err: any) {
        const errMsg = err.message || "Network error"
        setError(errMsg)
        onError?.(errMsg)
        return null
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const retry = useCallback(async () => {
    if (!pendingRequest.current) return
    const { url, options, _onSuccess, _onError } = pendingRequest.current as any
    setNeedsStepUp(false)
    await execute(url, options, _onSuccess, _onError)
  }, [execute])

  return {
    execute,
    retry,
    needsStepUp,
    setNeedsStepUp,
    loading,
    error,
  }
}
