"use client"

/**
 * Test Error Dialog
 *
 * Shows error details when an action/trigger test fails during workflow configuration.
 * Allows users to report issues to the ChainReact team with contextual information.
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { useToast } from "@/hooks/use-toast"

interface TestErrorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  error: {
    code: string
    message: string
    details?: any
  }
  context: {
    nodeId: string
    nodeType: string
    providerId: string
    config: Record<string, any>
  }
  onRetry?: () => void
}

export function TestErrorDialog({
  open,
  onOpenChange,
  error,
  context,
  onRetry
}: TestErrorDialogProps) {
  const { toast } = useToast()
  const [userDescription, setUserDescription] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [includeConfig, setIncludeConfig] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmitReport = async () => {
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/error-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          nodeType: context.nodeType,
          providerId: context.providerId,
          config: includeConfig ? context.config : undefined,
          userDescription,
          userEmail: userEmail || undefined,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent
        })
      })

      if (!response.ok) {
        throw new Error('Failed to submit error report')
      }

      setSubmitted(true)

      toast({
        title: "Report Submitted",
        description: "Thank you! We'll investigate and reach out if needed.",
      })

      // Auto-close after 2 seconds
      setTimeout(() => {
        onOpenChange(false)
        setSubmitted(false)
      }, 2000)

    } catch (err: any) {
      toast({
        title: "Failed to Submit Report",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const getSuggestions = () => {
    const suggestions: string[] = []

    if (error.message.includes('channel')) {
      suggestions.push('Verify the channel exists in your workspace')
      suggestions.push('Check that the bot has been invited to the channel')
    }

    if (error.message.includes('permission') || error.message.includes('auth')) {
      suggestions.push('Check that you have permission to perform this action')
      suggestions.push('Try reconnecting your integration')
    }

    if (error.message.includes('token') || error.message.includes('credentials')) {
      suggestions.push('Your integration may have expired')
      suggestions.push('Go to Settings → Integrations to reconnect')
    }

    if (error.message.includes('not found')) {
      suggestions.push('The selected resource may have been deleted')
      suggestions.push('Try selecting a different option')
    }

    if (suggestions.length === 0) {
      suggestions.push('Check your configuration and try again')
      suggestions.push('Ensure your integration is properly connected')
    }

    return suggestions
  }

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-6 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">Report Submitted!</h3>
              <p className="text-sm text-muted-foreground mt-2">
                We'll investigate this issue and reach out if needed.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Test Failed: {context.providerId} {context.nodeType.split('_').pop()}
          </DialogTitle>
          <DialogDescription>
            The test encountered an error. Here's what happened and how to fix it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Error Details */}
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold mb-1">Error: {error.code}</div>
              <div className="text-sm">{error.message}</div>
            </AlertDescription>
          </Alert>

          {/* Suggestions */}
          <div>
            <Label className="text-base font-semibold">🔧 Suggestions</Label>
            <ul className="list-disc list-inside space-y-1 mt-2 text-sm text-muted-foreground">
              {getSuggestions().map((suggestion, i) => (
                <li key={i}>{suggestion}</li>
              ))}
            </ul>
          </div>

          {/* Report Issue Section */}
          <div className="border-t pt-4">
            <Label className="text-base font-semibold">Report this issue to ChainReact</Label>
            <p className="text-sm text-muted-foreground mt-1 mb-3">
              Help us improve by sharing details about what happened
            </p>

            <div className="space-y-3">
              <div>
                <Label htmlFor="description">What were you trying to do? (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="I was testing sending a message to #general but..."
                  value={userDescription}
                  onChange={(e) => setUserDescription(e.target.value)}
                  className="mt-1.5"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="email">Your email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  We'll only use this to follow up about this specific issue
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-config"
                  checked={includeConfig}
                  onCheckedChange={(checked) => setIncludeConfig(checked as boolean)}
                />
                <label
                  htmlFor="include-config"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Include node configuration (tokens excluded)
                </label>
              </div>

              <Alert>
                <AlertDescription className="text-xs">
                  ⚠️ We will NOT collect access tokens, API keys, or other sensitive credentials
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <div className="flex gap-2">
            {onRetry && (
              <Button variant="outline" onClick={onRetry}>
                Try Again
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
          <Button
            onClick={handleSubmitReport}
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
