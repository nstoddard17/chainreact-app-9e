"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertCircle,
  RefreshCw,
  WifiOff,
  Server,
  Lock,
  Clock,
  HelpCircle,
  Home,
  ArrowLeft,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

// Error types and their configurations
export type ErrorType =
  | 'network'
  | 'server'
  | 'auth'
  | 'timeout'
  | 'not-found'
  | 'permission'
  | 'rate-limit'
  | 'unknown'

interface ErrorConfig {
  icon: React.ElementType
  title: string
  description: string
  suggestions: string[]
  canRetry: boolean
  showSupport: boolean
  severity: 'warning' | 'error' | 'info'
}

const ERROR_CONFIGS: Record<ErrorType, ErrorConfig> = {
  network: {
    icon: WifiOff,
    title: "Connection Lost",
    description: "We couldn't connect to our servers. Please check your internet connection.",
    suggestions: [
      "Check if you're connected to the internet",
      "Try disabling your VPN if you're using one",
      "Wait a moment and try again",
    ],
    canRetry: true,
    showSupport: false,
    severity: 'warning',
  },
  server: {
    icon: Server,
    title: "Server Error",
    description: "Something went wrong on our end. Our team has been notified.",
    suggestions: [
      "Wait a few minutes and try again",
      "If the problem persists, check our status page",
      "Contact support if this continues",
    ],
    canRetry: true,
    showSupport: true,
    severity: 'error',
  },
  auth: {
    icon: Lock,
    title: "Authentication Error",
    description: "Your session has expired or is invalid. Please sign in again.",
    suggestions: [
      "Sign out and sign back in",
      "Clear your browser cookies and try again",
      "Make sure you're using the correct account",
    ],
    canRetry: false,
    showSupport: false,
    severity: 'warning',
  },
  timeout: {
    icon: Clock,
    title: "Request Timed Out",
    description: "The request took too long to complete. This might be due to network issues.",
    suggestions: [
      "Check your internet connection",
      "Try again with a smaller request",
      "If loading data, try refreshing the page",
    ],
    canRetry: true,
    showSupport: false,
    severity: 'warning',
  },
  'not-found': {
    icon: HelpCircle,
    title: "Not Found",
    description: "The resource you're looking for doesn't exist or has been moved.",
    suggestions: [
      "Check if the URL is correct",
      "The item may have been deleted",
      "Try navigating from the home page",
    ],
    canRetry: false,
    showSupport: false,
    severity: 'info',
  },
  permission: {
    icon: Lock,
    title: "Access Denied",
    description: "You don't have permission to access this resource.",
    suggestions: [
      "Contact the resource owner for access",
      "Make sure you're signed in with the correct account",
      "Your role may not have access to this feature",
    ],
    canRetry: false,
    showSupport: true,
    severity: 'warning',
  },
  'rate-limit': {
    icon: Clock,
    title: "Too Many Requests",
    description: "You've made too many requests. Please wait before trying again.",
    suggestions: [
      "Wait a few minutes before retrying",
      "Reduce the frequency of your requests",
      "Contact support if you need higher limits",
    ],
    canRetry: true,
    showSupport: true,
    severity: 'warning',
  },
  unknown: {
    icon: AlertCircle,
    title: "Something Went Wrong",
    description: "An unexpected error occurred. Please try again.",
    suggestions: [
      "Refresh the page and try again",
      "Clear your browser cache",
      "Contact support if the problem persists",
    ],
    canRetry: true,
    showSupport: true,
    severity: 'error',
  },
}

interface ErrorRecoveryProps {
  errorType?: ErrorType
  title?: string
  description?: string
  errorMessage?: string
  errorCode?: string
  onRetry?: () => void | Promise<void>
  retryLabel?: string
  showHome?: boolean
  showBack?: boolean
  compact?: boolean
  className?: string
}

/**
 * Error Recovery Component
 *
 * Displays error information with recovery options like retry buttons,
 * helpful suggestions, and support contact.
 */
export function ErrorRecovery({
  errorType = 'unknown',
  title,
  description,
  errorMessage,
  errorCode,
  onRetry,
  retryLabel = "Try Again",
  showHome = true,
  showBack = true,
  compact = false,
  className,
}: ErrorRecoveryProps) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [copied, setCopied] = useState(false)

  const config = ERROR_CONFIGS[errorType]
  const Icon = config.icon

  const displayTitle = title || config.title
  const displayDescription = description || config.description

  const handleRetry = useCallback(async () => {
    if (!onRetry) return
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }, [onRetry])

  const copyErrorDetails = useCallback(() => {
    const details = [
      `Error: ${displayTitle}`,
      `Type: ${errorType}`,
      errorCode && `Code: ${errorCode}`,
      errorMessage && `Message: ${errorMessage}`,
      `Time: ${new Date().toISOString()}`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : 'N/A'}`,
    ]
      .filter(Boolean)
      .join('\n')

    navigator.clipboard.writeText(details)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [displayTitle, errorType, errorCode, errorMessage])

  const severityColors = {
    warning: 'text-amber-500',
    error: 'text-red-500',
    info: 'text-blue-500',
  }

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 p-4 rounded-lg border",
          config.severity === 'error' && "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900",
          config.severity === 'warning' && "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900",
          config.severity === 'info' && "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900",
          className
        )}
      >
        <Icon className={cn("w-5 h-5 flex-shrink-0", severityColors[config.severity])} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{displayTitle}</p>
          <p className="text-xs text-muted-foreground truncate">{displayDescription}</p>
        </div>
        {onRetry && config.canRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRetry}
            disabled={retrying}
          >
            {retrying ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        )}
      </div>
    )
  }

  return (
    <Card className={cn("max-w-lg mx-auto", className)}>
      <CardHeader className="text-center pb-4">
        <div className={cn(
          "w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4",
          config.severity === 'error' && "bg-red-100 dark:bg-red-900/20",
          config.severity === 'warning' && "bg-amber-100 dark:bg-amber-900/20",
          config.severity === 'info' && "bg-blue-100 dark:bg-blue-900/20",
        )}>
          <Icon className={cn("w-8 h-8", severityColors[config.severity])} />
        </div>
        <CardTitle className="text-xl">{displayTitle}</CardTitle>
        <CardDescription className="text-base">{displayDescription}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Suggestions */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">What you can try:</p>
          <ul className="space-y-2">
            {config.suggestions.map((suggestion, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-medium flex-shrink-0">
                  {index + 1}
                </span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Error Details (collapsible) */}
        {(errorMessage || errorCode) && (
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              {showDetails ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              Technical Details
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="rounded-lg bg-muted p-3 text-sm font-mono space-y-1 relative">
                {errorCode && (
                  <p className="text-muted-foreground">
                    Code: <span className="text-foreground">{errorCode}</span>
                  </p>
                )}
                {errorMessage && (
                  <p className="text-muted-foreground break-all">
                    {errorMessage}
                  </p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 h-7 px-2"
                  onClick={copyErrorDetails}
                >
                  {copied ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {onRetry && config.canRetry && (
            <Button
              onClick={handleRetry}
              disabled={retrying}
              className="w-full gap-2"
            >
              {retrying ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {retryLabel}
            </Button>
          )}

          <div className="flex gap-2">
            {showBack && (
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => router.back()}
              >
                <ArrowLeft className="w-4 h-4" />
                Go Back
              </Button>
            )}
            {showHome && (
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => router.push('/workflows')}
              >
                <Home className="w-4 h-4" />
                Home
              </Button>
            )}
          </div>
        </div>

        {/* Support Link */}
        {config.showSupport && (
          <div className="text-center text-sm text-muted-foreground">
            Need help?{' '}
            <a
              href="/support"
              className="text-primary hover:underline"
            >
              Contact Support
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Inline Error Component
 * For smaller error displays within forms or sections
 */
interface InlineErrorProps {
  message: string
  onRetry?: () => void
  onDismiss?: () => void
  className?: string
}

export function InlineError({
  message,
  onRetry,
  onDismiss,
  className,
}: InlineErrorProps) {
  const [retrying, setRetrying] = useState(false)

  const handleRetry = async () => {
    if (!onRetry) return
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900",
        className
      )}
    >
      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
      <p className="flex-1 text-sm text-red-700 dark:text-red-400">{message}</p>
      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRetry}
          disabled={retrying}
          className="h-7 px-2 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
        >
          {retrying ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            "Retry"
          )}
        </Button>
      )}
      {onDismiss && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="h-7 px-2 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
        >
          Dismiss
        </Button>
      )}
    </div>
  )
}

/**
 * Helper function to determine error type from error object
 */
export function getErrorType(error: any): ErrorType {
  if (!error) return 'unknown'

  // Check for network errors
  if (error.name === 'TypeError' && error.message?.includes('fetch')) {
    return 'network'
  }
  if (error.message?.toLowerCase().includes('network')) {
    return 'network'
  }

  // Check for timeout
  if (error.message?.toLowerCase().includes('timeout')) {
    return 'timeout'
  }

  // Check status codes
  if (error.status === 401 || error.status === 403) {
    return error.status === 401 ? 'auth' : 'permission'
  }
  if (error.status === 404) {
    return 'not-found'
  }
  if (error.status === 429) {
    return 'rate-limit'
  }
  if (error.status >= 500) {
    return 'server'
  }

  return 'unknown'
}
