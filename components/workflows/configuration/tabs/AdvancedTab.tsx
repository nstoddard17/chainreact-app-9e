"use client"

import React, { useState, useEffect } from 'react'
import { AlertTriangle, Info, Clock, RotateCcw, FileText } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface AdvancedTabProps {
  initialPolicy?: {
    timeoutMs?: number
    retries?: number
    retryDelayMs?: number
  }
  initialMetadata?: {
    notes?: string
    errorHandling?: 'stop' | 'continue' | 'fallback'
  }
  onChange?: (data: { policy: any; metadata: any }) => void
}

/**
 * Advanced Tab - Power user settings for node execution
 *
 * Settings:
 * - Timeout duration (max execution time)
 * - Retry attempts and delay
 * - Error handling strategy
 * - Custom notes/metadata
 */
export function AdvancedTab({ initialPolicy, initialMetadata, onChange }: AdvancedTabProps) {
  // Execution policy state
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(
    (initialPolicy?.timeoutMs || 60000) / 1000
  )
  const [retries, setRetries] = useState<number>(initialPolicy?.retries || 0)
  const [retryDelayMs, setRetryDelayMs] = useState<number>(
    initialPolicy?.retryDelayMs || 1000
  )

  // Metadata state
  const [errorHandling, setErrorHandling] = useState<'stop' | 'continue' | 'fallback'>(
    initialMetadata?.errorHandling || 'stop'
  )
  const [notes, setNotes] = useState<string>(initialMetadata?.notes || '')

  // Notify parent of changes
  useEffect(() => {
    if (!onChange) return

    onChange({
      policy: {
        timeoutMs: timeoutSeconds * 1000,
        retries,
        retryDelayMs,
      },
      metadata: {
        errorHandling,
        notes,
      },
    })
  }, [timeoutSeconds, retries, retryDelayMs, errorHandling, notes, onChange])

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-foreground">Advanced Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure execution policies, timeouts, retries, and error handling
          </p>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            These settings control how this node executes during workflow runs. Changes only affect future executions.
          </AlertDescription>
        </Alert>

        {/* Execution Policy Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Execution Policy
            </CardTitle>
            <CardDescription>
              Control how long this node can run and how many times it retries on failure
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Timeout */}
            <div className="space-y-2">
              <Label htmlFor="timeout">Timeout (seconds)</Label>
              <Input
                id="timeout"
                type="number"
                min="1"
                max="600"
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                Maximum execution time before the node is considered failed (1-600 seconds)
              </p>
            </div>

            {/* Retries */}
            <div className="space-y-2">
              <Label htmlFor="retries">Retry Attempts</Label>
              <Input
                id="retries"
                type="number"
                min="0"
                max="10"
                value={retries}
                onChange={(e) => setRetries(Number(e.target.value))}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                Number of times to retry if the node fails (0-10 attempts)
              </p>
            </div>

            {/* Retry Delay */}
            {retries > 0 && (
              <div className="space-y-2">
                <Label htmlFor="retry-delay">Retry Delay (milliseconds)</Label>
                <Input
                  id="retry-delay"
                  type="number"
                  min="0"
                  max="300000"
                  value={retryDelayMs}
                  onChange={(e) => setRetryDelayMs(Number(e.target.value))}
                  className="max-w-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Delay between retry attempts (0-300000ms = 0-5 minutes)
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Error Handling Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Error Handling
            </CardTitle>
            <CardDescription>
              Choose what happens when this node encounters an error
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={errorHandling} onValueChange={(value: any) => setErrorHandling(value)}>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="stop" id="stop" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="stop" className="font-medium cursor-pointer">
                      Stop workflow on error
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Immediately halt the entire workflow if this node fails (default behavior)
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="continue" id="continue" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="continue" className="font-medium cursor-pointer">
                      Continue workflow and log error
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Log the error but continue executing downstream nodes (useful for non-critical steps)
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 opacity-50">
                  <RadioGroupItem value="fallback" id="fallback" disabled className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="fallback" className="font-medium cursor-not-allowed">
                      Trigger fallback action <span className="text-xs text-muted-foreground">(Coming soon)</span>
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Execute an alternative workflow path when this node fails
                    </p>
                  </div>
                </div>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Notes/Metadata Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Notes & Documentation
            </CardTitle>
            <CardDescription>
              Add notes or documentation for this node (optional)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Add notes about why this node is configured this way, important details, or documentation for your team..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground mt-2">
              These notes are saved with the workflow and visible to all team members
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
