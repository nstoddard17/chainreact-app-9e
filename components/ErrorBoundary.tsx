"use client"

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { reportError } from '@/lib/utils/errorReporting'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  context?: string
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  isReporting: boolean
  reported: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isReporting: false,
      reported: false,
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      isReporting: false,
      reported: false,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    
    this.setState({
      error,
      errorInfo,
    })
    
    // Log error but don't auto-report to avoid overwhelming support
    reportError(error, {
      context: this.props.context || 'Application Error Boundary',
      showToast: false,
      autoReport: false,
    })
  }

  handleReportError = async () => {
    if (!this.state.error || this.state.isReporting || this.state.reported) return
    
    this.setState({ isReporting: true })
    
    try {
      await reportError(this.state.error, {
        context: this.props.context || 'Application Error Boundary',
        showToast: true,
        autoReport: true,
      })
      
      this.setState({ reported: true })
    } catch (err) {
      console.error('Failed to report error:', err)
    } finally {
      this.setState({ isReporting: false })
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      isReporting: false,
      reported: false,
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-6 w-6 text-red-500" />
                <CardTitle>Something went wrong</CardTitle>
              </div>
              <CardDescription>
                An unexpected error occurred. You can try refreshing the page or report this issue to our support team.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error details (only in development) */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="font-semibold text-red-700 dark:text-red-400 mb-2">
                    {this.state.error.name}: {this.state.error.message}
                  </p>
                  {this.state.error.stack && (
                    <pre className="text-xs text-red-600 dark:text-red-300 overflow-x-auto">
                      {this.state.error.stack}
                    </pre>
                  )}
                </div>
              )}

              <div className="flex space-x-4">
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                >
                  Refresh Page
                </Button>
                
                {!this.state.reported ? (
                  <Button
                    onClick={this.handleReportError}
                    disabled={this.state.isReporting}
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                  >
                    {this.state.isReporting ? 'Reporting...' : 'Report Issue'}
                  </Button>
                ) : (
                  <Button disabled variant="outline">
                    ✓ Issue Reported
                  </Button>
                )}
                
                <Button
                  onClick={this.handleReset}
                  variant="ghost"
                >
                  Try Again
                </Button>
              </div>

              {this.state.reported && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  A support ticket has been created for this issue. Our team will investigate and get back to you soon.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}