/**
 * Integration Testing Dashboard
 * Admin-only dashboard for testing OAuth connections and API calls for all integrations
 */

"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Link2,
  Zap,
  Webhook,
  TestTube
} from 'lucide-react'
import { useDebugStore } from '@/stores/debugStore'

interface IntegrationTestResult {
  provider: string
  name: string
  category: string
  oAuthConfigured: boolean
  connectionAvailable: boolean
  tokenValid: boolean
  apiCallSuccessful: boolean
  webhookSupported: boolean
  passed: boolean
  duration: number
  error?: string
  warnings: string[]
  details: {
    authUrl?: string
    scopes?: string[]
    hasRefreshToken?: boolean
    expiresAt?: string
    lastAPICall?: string
    rateLimit?: {
      limit: number
      remaining: number
      reset: string
    }
  }
}

// All available integration providers (based on actual node providers)
const ALL_INTEGRATIONS = [
  // Communication
  { id: 'gmail', name: 'Gmail', category: 'Communication' },
  { id: 'outlook', name: 'Outlook', category: 'Communication' },
  { id: 'slack', name: 'Slack', category: 'Communication' },
  { id: 'discord', name: 'Discord', category: 'Communication' },
  { id: 'teams', name: 'Microsoft Teams', category: 'Communication' },

  // Productivity & Collaboration
  { id: 'notion', name: 'Notion', category: 'Productivity' },
  { id: 'google-drive', name: 'Google Drive', category: 'Productivity' },
  { id: 'google-docs', name: 'Google Docs', category: 'Productivity' },
  { id: 'google-sheets', name: 'Google Sheets', category: 'Productivity' },
  { id: 'google-calendar', name: 'Google Calendar', category: 'Productivity' },
  { id: 'microsoft-excel', name: 'Microsoft Excel', category: 'Productivity' },
  { id: 'onedrive', name: 'OneDrive', category: 'Productivity' },
  { id: 'onenote', name: 'OneNote', category: 'Productivity' },
  { id: 'dropbox', name: 'Dropbox', category: 'Productivity' },
  { id: 'trello', name: 'Trello', category: 'Productivity' },
  { id: 'monday', name: 'Monday.com', category: 'Productivity' },

  // Business & CRM
  { id: 'hubspot', name: 'HubSpot', category: 'Business' },
  { id: 'airtable', name: 'Airtable', category: 'Business' },
  { id: 'stripe', name: 'Stripe', category: 'Business' },
  { id: 'shopify', name: 'Shopify', category: 'Business' },

  // Marketing
  { id: 'mailchimp', name: 'Mailchimp', category: 'Marketing' },

  // Social Media
  { id: 'twitter', name: 'Twitter (X)', category: 'Social' },
  { id: 'facebook', name: 'Facebook', category: 'Social' },

  // Developer Tools
  { id: 'github', name: 'GitHub', category: 'Developer' },

  // Analytics
  { id: 'google-analytics', name: 'Google Analytics', category: 'Analytics' },
] as const

export function IntegrationTestingDashboard() {
  const { logEvent, logApiCall, logApiResponse, logApiError } = useDebugStore()
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [testResult, setTestResult] = useState<IntegrationTestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [allResults, setAllResults] = useState<IntegrationTestResult[]>([])
  const [testingAll, setTestingAll] = useState(false)

  // Test single integration
  const testIntegration = async (providerId: string) => {
    try {
      setLoading(true)
      setTestResult(null)

      const integration = ALL_INTEGRATIONS.find(i => i.id === providerId)
      if (!integration) {
        throw new Error('Integration not found')
      }

      logEvent('info', 'IntegrationTest', `Testing ${integration.name}...`)
      const startTime = Date.now()
      const requestId = logApiCall('POST', '/api/admin/test-integration', { provider: providerId })

      const response = await fetch('/api/admin/test-integration-oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId })
      })

      const duration = Date.now() - startTime

      if (response.ok) {
        const result = await response.json()
        setTestResult(result)
        logApiResponse(requestId, response.status, { passed: result.passed }, duration)
        logEvent('info', 'IntegrationTest', `Test complete: ${result.passed ? 'PASSED' : 'FAILED'}`)
      } else {
        const error = await response.json()
        logApiError(requestId, new Error(error.error), duration)
        logEvent('error', 'IntegrationTest', `Test failed: ${error.error}`)
        setTestResult({
          provider: providerId,
          name: integration.name,
          category: integration.category,
          oAuthConfigured: false,
          connectionAvailable: false,
          tokenValid: false,
          apiCallSuccessful: false,
          webhookSupported: false,
          passed: false,
          duration,
          error: error.error,
          warnings: [],
          details: {}
        })
      }

    } catch (error: any) {
      logEvent('error', 'IntegrationTest', 'Test error', { error: error.message })
      const integration = ALL_INTEGRATIONS.find(i => i.id === providerId)
      if (integration) {
        setTestResult({
          provider: providerId,
          name: integration.name,
          category: integration.category,
          oAuthConfigured: false,
          connectionAvailable: false,
          tokenValid: false,
          apiCallSuccessful: false,
          webhookSupported: false,
          passed: false,
          duration: 0,
          error: error.message,
          warnings: [],
          details: {}
        })
      }
    } finally {
      setLoading(false)
    }
  }

  // Test all integrations
  const testAllIntegrations = async () => {
    if (!confirm('This will test ALL 45+ integrations. This may take several minutes and consume rate limits. Continue?')) {
      return
    }

    try {
      setTestingAll(true)
      setAllResults([])
      logEvent('info', 'IntegrationTest', 'Testing all integrations...')

      const results: IntegrationTestResult[] = []

      // Test in batches of 5 to avoid overwhelming the system
      const batchSize = 5
      for (let i = 0; i < ALL_INTEGRATIONS.length; i += batchSize) {
        const batch = ALL_INTEGRATIONS.slice(i, i + batchSize)

        const batchResults = await Promise.allSettled(
          batch.map(async (integration) => {
            const response = await fetch('/api/admin/test-integration-oauth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider: integration.id })
            })

            if (response.ok) {
              return await response.json()
            } else {
              const error = await response.json()
              return {
                provider: integration.id,
                name: integration.name,
                category: integration.category,
                oAuthConfigured: false,
                connectionAvailable: false,
                tokenValid: false,
                apiCallSuccessful: false,
                webhookSupported: false,
                passed: false,
                duration: 0,
                error: error.error,
                warnings: [],
                details: {}
              }
            }
          })
        )

        const successfulResults = batchResults
          .filter((result): result is PromiseFulfilledResult<IntegrationTestResult> =>
            result.status === 'fulfilled'
          )
          .map(result => result.value)

        results.push(...successfulResults)
        setAllResults([...results])
      }

      const passed = results.filter(r => r.passed).length
      const failed = results.filter(r => !r.passed).length
      logEvent('info', 'IntegrationTest', `All tests complete: ${passed} passed, ${failed} failed`)

    } catch (error: any) {
      logEvent('error', 'IntegrationTest', 'Error testing all integrations', { error: error.message })
    } finally {
      setTestingAll(false)
    }
  }

  // Get summary statistics
  const getSummary = () => {
    if (allResults.length === 0) return null

    const passed = allResults.filter(r => r.passed).length
    const failed = allResults.filter(r => !r.passed).length
    const withWarnings = allResults.filter(r => r.warnings.length > 0).length
    const avgDuration = allResults.reduce((sum, r) => sum + r.duration, 0) / allResults.length

    return {
      total: allResults.length,
      passed,
      failed,
      withWarnings,
      avgDuration,
      passRate: (passed / allResults.length) * 100
    }
  }

  const summary = getSummary()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Integration Testing Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Test OAuth connections and API calls for all {ALL_INTEGRATIONS.length} integrations
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={testAllIntegrations}
            disabled={loading || testingAll}
            variant="default"
          >
            {testingAll ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Testing All...
              </>
            ) : (
              <>
                <TestTube className="w-4 h-4 mr-2" />
                Test All Integrations
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tested</CardTitle>
              <TestTube className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total}</div>
              <p className="text-xs text-muted-foreground">
                of {ALL_INTEGRATIONS.length} integrations
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Passed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{summary.passed}</div>
              <p className="text-xs text-muted-foreground">
                {summary.passRate.toFixed(1)}% pass rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{summary.failed}</div>
              <p className="text-xs text-muted-foreground">
                Need attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Warnings</CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{summary.withWarnings}</div>
              <p className="text-xs text-muted-foreground">
                Minor issues
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.avgDuration.toFixed(0)}ms</div>
              <p className="text-xs text-muted-foreground">
                Per integration
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Test Single Integration */}
      <Card>
        <CardHeader>
          <CardTitle>Test Single Integration</CardTitle>
          <CardDescription>
            Select an integration to test its OAuth connection and API functionality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select an integration..." />
              </SelectTrigger>
              <SelectContent className="max-h-[400px]">
                {Object.entries(
                  ALL_INTEGRATIONS.reduce((acc, integration) => {
                    if (!acc[integration.category]) {
                      acc[integration.category] = []
                    }
                    acc[integration.category].push(integration)
                    return acc
                  }, {} as Record<string, typeof ALL_INTEGRATIONS[number][]>)
                ).map(([category, integrations]) => (
                  <React.Fragment key={category}>
                    <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                      {category}
                    </div>
                    {integrations.map((integration) => (
                      <SelectItem key={integration.id} value={integration.id}>
                        {integration.name}
                      </SelectItem>
                    ))}
                  </React.Fragment>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => selectedProvider && testIntegration(selectedProvider)}
              disabled={!selectedProvider || loading}
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Test Integration
                </>
              )}
            </Button>
          </div>

          {/* Single Test Result */}
          {testResult && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  {testResult.passed ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600" />
                  )}
                  <div>
                    <h3 className="font-semibold text-lg">{testResult.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {testResult.category} • {testResult.duration}ms
                    </p>
                  </div>
                </div>
                <Badge variant={testResult.passed ? 'default' : 'destructive'}>
                  {testResult.passed ? 'PASSED' : 'FAILED'}
                </Badge>
              </div>

              {/* Test Details */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2 p-3 border rounded-lg">
                  <Link2 className={`w-4 h-4 ${testResult.oAuthConfigured ? 'text-green-600' : 'text-red-600'}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">OAuth Config</p>
                    <p className="text-sm font-medium">
                      {testResult.oAuthConfigured ? 'Configured' : 'Missing'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 border rounded-lg">
                  <Zap className={`w-4 h-4 ${testResult.connectionAvailable ? 'text-green-600' : 'text-red-600'}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">Connection</p>
                    <p className="text-sm font-medium">
                      {testResult.connectionAvailable ? 'Available' : 'None'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 border rounded-lg">
                  <CheckCircle2 className={`w-4 h-4 ${testResult.tokenValid ? 'text-green-600' : 'text-red-600'}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">Token</p>
                    <p className="text-sm font-medium">
                      {testResult.tokenValid ? 'Valid' : 'Invalid'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 border rounded-lg">
                  <Zap className={`w-4 h-4 ${testResult.apiCallSuccessful ? 'text-green-600' : 'text-red-600'}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">API Call</p>
                    <p className="text-sm font-medium">
                      {testResult.apiCallSuccessful ? 'Success' : 'Failed'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 border rounded-lg">
                  <Webhook className={`w-4 h-4 ${testResult.webhookSupported ? 'text-green-600' : 'text-gray-400'}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">Webhooks</p>
                    <p className="text-sm font-medium">
                      {testResult.webhookSupported ? 'Supported' : 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 border rounded-lg">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="text-sm font-medium">{testResult.duration}ms</p>
                  </div>
                </div>
              </div>

              {/* Error */}
              {testResult.error && (
                <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg">
                  <p className="text-sm font-medium text-red-900 dark:text-red-100 mb-1">Error:</p>
                  <p className="text-sm text-red-800 dark:text-red-200">{testResult.error}</p>
                </div>
              )}

              {/* Warnings */}
              {testResult.warnings.length > 0 && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-900 rounded-lg">
                  <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-2">Warnings:</p>
                  <ul className="space-y-1">
                    {testResult.warnings.map((warning, i) => (
                      <li key={i} className="text-sm text-yellow-800 dark:text-yellow-200">
                        • {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Additional Details */}
              {Object.keys(testResult.details).length > 0 && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">Additional Details:</p>
                  <pre className="text-xs overflow-auto">
                    {JSON.stringify(testResult.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Results */}
      {allResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>All Test Results</CardTitle>
            <CardDescription>
              Results from testing all integrations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {allResults.map((result) => (
                <div
                  key={result.provider}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {result.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{result.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {result.category} • {result.provider}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {result.warnings.length > 0 && (
                      <Badge variant="secondary" className="text-xs bg-yellow-600/10 text-yellow-600">
                        {result.warnings.length} warnings
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{result.duration}ms</span>
                    {result.error && (
                      <div className="text-xs text-red-600 max-w-xs truncate">
                        {result.error}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!testResult && allResults.length === 0 && !loading && !testingAll && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <TestTube className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Ready to test integrations</h3>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
              Select an integration from the dropdown to test its OAuth connection and API functionality,
              or test all integrations at once.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
