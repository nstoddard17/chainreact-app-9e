"use client"

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Loader2, AlertCircle, Key, Settings } from 'lucide-react'
import { logger } from '@/lib/utils/logger'

export interface GuidedSetupNode {
  id: string
  title: string
  type: string
  providerId?: string
  icon?: React.ComponentType<{ className?: string }>
  requiredSecrets?: string[]
  configSchema?: any[]
  config?: Record<string, any>
}

export interface SetupResult {
  success: boolean
  error?: string
  testData?: any
}

interface GuidedSetupCardProps {
  node: GuidedSetupNode
  onContinue: (nodeId: string) => Promise<SetupResult>
  onSkip: (nodeId: string) => void
  isProcessing?: boolean
}

/**
 * Guided Setup Card
 * Shows setup interface for a single node during build flow
 */
export function GuidedSetupCard({
  node,
  onContinue,
  onSkip,
  isProcessing = false
}: GuidedSetupCardProps) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<SetupResult | null>(null)
  const [showError, setShowError] = useState(false)

  const hasMissingSecrets = (node.requiredSecrets || []).length > 0
  const hasConfigFields = (node.configSchema || []).length > 0
  const IconComponent = node.icon

  const handleContinue = async () => {
    setTesting(true)
    setResult(null)
    setShowError(false)

    try {
      const setupResult = await onContinue(node.id)
      setResult(setupResult)

      if (!setupResult.success) {
        setShowError(true)
      }
    } catch (error: any) {
      logger.error('Setup failed', { error, nodeId: node.id })
      setResult({
        success: false,
        error: error.message || 'Setup failed'
      })
      setShowError(true)
    } finally {
      setTesting(false)
    }
  }

  const handleRetry = () => {
    setResult(null)
    setShowError(false)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-start gap-3">
          {IconComponent && (
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <IconComponent className="w-5 h-5 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-base">{node.title}</CardTitle>
              {result?.success && (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Ready
                </Badge>
              )}
            </div>
            <CardDescription className="text-sm">
              Configure this node to continue
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Missing Secrets */}
        {hasMissingSecrets && (
          <Alert>
            <Key className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <div className="font-medium mb-2">Required connections:</div>
              <ul className="space-y-1">
                {node.requiredSecrets.map(secret => (
                  <li key={secret} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    {secret.replace('secret:', '')}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  // TODO: Open secret picker/connection flow
                  logger.info('Connect secrets', { secrets: node.requiredSecrets })
                }}
              >
                <Key className="w-3 h-3 mr-1" />
                Connect
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Config Fields */}
        {hasConfigFields && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Settings className="w-4 h-4" />
              Configuration
            </div>
            <div className="text-xs text-muted-foreground">
              {node.configSchema.length} field{node.configSchema.length !== 1 ? 's' : ''} available
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // TODO: Open configuration drawer
                logger.info('Configure node', { nodeId: node.id })
              }}
            >
              Configure
            </Button>
          </div>
        )}

        {/* Error Display */}
        {showError && result?.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <div className="font-medium mb-1">Setup failed</div>
              <div className="text-xs">{result.error}</div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={handleRetry}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Success Display */}
        {result?.success && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-sm text-green-800">
              Node tested successfully!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button
          onClick={handleContinue}
          disabled={testing || isProcessing || result?.success}
          className="flex-1"
        >
          {testing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {result?.success ? 'Completed' : 'Continue'}
        </Button>
        <Button
          variant="outline"
          onClick={() => onSkip(node.id)}
          disabled={testing || isProcessing}
        >
          Skip
        </Button>
      </CardFooter>
    </Card>
  )
}
