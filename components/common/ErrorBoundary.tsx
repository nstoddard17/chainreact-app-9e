"use client"

import React, { Component, ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/utils/logger'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
  errorCount: number
}

/**
 * Error Boundary component to catch and handle React errors gracefully
 * Includes automatic retry for transient errors like chunk loading failures
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { onError } = this.props

    // Log the error
    logger.error('ErrorBoundary caught an error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    })

    // Check if it's a chunk loading error (transient, should retry)
    const isChunkError =
      error.message?.includes('Loading chunk') ||
      error.message?.includes('ChunkLoadError') ||
      error.name === 'ChunkLoadError'

    this.setState((prevState) => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1
    }))

    // Call custom error handler if provided
    if (onError) {
      onError(error, errorInfo)
    }

    // Auto-retry for chunk errors (max 2 retries)
    if (isChunkError && this.state.errorCount < 2) {
      logger.info('Chunk load error detected, auto-retrying in 1s...', {
        attempt: this.state.errorCount + 1
      })

      setTimeout(() => {
        this.handleReset()
        // Force reload the page to fetch fresh chunks
        if (typeof window !== 'undefined') {
          window.location.reload()
        }
      }, 1000)
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render() {
    const { hasError, error } = this.state
    const { children, fallback } = this.props

    if (hasError && error) {
      // Check if it's a chunk loading error
      const isChunkError =
        error.message?.includes('Loading chunk') ||
        error.message?.includes('ChunkLoadError') ||
        error.name === 'ChunkLoadError'

      // For chunk errors, show minimal UI as we're auto-retrying
      if (isChunkError && this.state.errorCount <= 2) {
        return (
          <div className="flex items-center justify-center min-h-screen bg-background">
            <div className="text-center space-y-4 p-6">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground">Loading page resources...</p>
            </div>
          </div>
        )
      }

      // Use custom fallback if provided
      if (fallback) {
        return <>{fallback}</>
      }

      // Default error UI
      return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4">
          <div className="max-w-md w-full space-y-6 text-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">Something went wrong</h2>
              <p className="text-muted-foreground">
                {isChunkError
                  ? "Failed to load page resources. Please refresh the page."
                  : "An unexpected error occurred. Please try again."}
              </p>
            </div>

            {error.message && (
              <div className="p-4 bg-muted rounded-lg text-left">
                <p className="text-sm font-mono text-muted-foreground break-all">
                  {error.message}
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button onClick={this.handleReset} variant="outline">
                Try Again
              </Button>
              <Button onClick={this.handleReload}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return children
  }
}
