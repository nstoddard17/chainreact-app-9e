/**
 * Node Testing Dashboard
 * Admin-only dashboard for testing all 247 workflow nodes
 */

"use client"

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Zap,
  ChevronDown,
  ChevronRight,
  Filter
} from 'lucide-react'
import { logger } from '@/lib/utils/logger'

interface NodeTestResult {
  nodeType: string
  nodeTitle: string
  category: string
  provider: string
  isTrigger: boolean
  passed: boolean
  duration: number
  error?: string
  warnings: string[]
  details: {
    configSchemaValid: boolean
    outputSchemaValid: boolean
    requiredFieldsValid: boolean
    executionSuccessful?: boolean
    apiCallSuccessful?: boolean
    webhookSetupSuccessful?: boolean
  }
}

interface TestRunSummary {
  totalNodes: number
  totalActions: number
  totalTriggers: number
  passed: number
  failed: number
  warnings: number
  duration: number
  passRate: number
  results: NodeTestResult[]
  failedNodes: NodeTestResult[]
  nodesByProvider: Record<string, NodeTestResult[]>
  nodesByCategory: Record<string, NodeTestResult[]>
}

export function NodeTestingDashboard() {
  const [summary, setSummary] = useState<TestRunSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = useState<'all' | 'passed' | 'failed' | 'warnings'>('all')

  // Run quick validation test (no real API calls)
  const runValidationTest = async () => {
    try {
      setLoading(true)

      const response = await fetch('/api/testing/nodes', {
        method: 'GET'
      })

      if (response.ok) {
        const data = await response.json()
        setSummary(data.summary)
        logger.info('[NodeTesting] Validation test complete:', data.summary)
      } else {
        logger.error('[NodeTesting] Validation test failed')
      }

    } catch (error) {
      logger.error('[NodeTesting] Error running validation test:', error)
    } finally {
      setLoading(false)
    }
  }

  // Run full test with real API calls
  const runFullTest = async () => {
    if (!confirm('This will test all 247 nodes with REAL API calls. This may:\n\n' +
      '- Send actual emails, messages, etc.\n' +
      '- Take 5-10 minutes\n' +
      '- Consume API rate limits\n\n' +
      'Are you sure?')) {
      return
    }

    try {
      setTesting(true)

      const response = await fetch('/api/testing/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testRealAPIs: true,
          maxParallel: 10,
          timeout: 30000
        })
      })

      if (response.ok) {
        const data = await response.json()
        setSummary(data.summary)
        logger.info('[NodeTesting] Full test complete:', data.summary)
      } else {
        logger.error('[NodeTesting] Full test failed')
      }

    } catch (error) {
      logger.error('[NodeTesting] Error running full test:', error)
    } finally {
      setTesting(false)
    }
  }

  // Toggle provider expansion
  const toggleProvider = (provider: string) => {
    const newSet = new Set(expandedProviders)
    if (newSet.has(provider)) {
      newSet.delete(provider)
    } else {
      newSet.add(provider)
    }
    setExpandedProviders(newSet)
  }

  // Filter results
  const getFilteredResults = (results: NodeTestResult[]) => {
    switch (filterStatus) {
      case 'passed':
        return results.filter(r => r.passed && r.warnings.length === 0)
      case 'failed':
        return results.filter(r => !r.passed)
      case 'warnings':
        return results.filter(r => r.passed && r.warnings.length > 0)
      default:
        return results
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Node Testing Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Automated testing for all 247 workflow nodes
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={runValidationTest}
            disabled={loading || testing}
            variant="outline"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Validating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Quick Validation
              </>
            )}
          </Button>
          <Button
            onClick={runFullTest}
            disabled={loading || testing}
            variant="default"
          >
            {testing ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Full Test
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Nodes</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.totalNodes}</div>
                <p className="text-xs text-muted-foreground">
                  {summary.totalActions} actions, {summary.totalTriggers} triggers
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {summary.passRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary.passed} passed, {summary.failed} failed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Warnings</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {summary.warnings}
                </div>
                <p className="text-xs text-muted-foreground">
                  Issues to review
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Duration</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(summary.duration / 1000).toFixed(1)}s
                </div>
                <p className="text-xs text-muted-foreground">
                  {(summary.duration / summary.totalNodes).toFixed(0)}ms per node
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="by-provider" className="space-y-4">
            <TabsList>
              <TabsTrigger value="by-provider">
                By Provider ({Object.keys(summary.nodesByProvider).length})
              </TabsTrigger>
              <TabsTrigger value="by-category">
                By Category ({Object.keys(summary.nodesByCategory).length})
              </TabsTrigger>
              <TabsTrigger value="failed">
                Failed ({summary.failedNodes.length})
              </TabsTrigger>
              <TabsTrigger value="all">
                All Results ({summary.results.length})
              </TabsTrigger>
            </TabsList>

            {/* By Provider */}
            <TabsContent value="by-provider" className="space-y-4">
              {Object.entries(summary.nodesByProvider)
                .sort((a, b) => b[1].length - a[1].length)
                .map(([provider, nodes]) => {
                  const passed = nodes.filter(n => n.passed).length
                  const failed = nodes.filter(n => !n.passed).length
                  const warnings = nodes.reduce((sum, n) => sum + n.warnings.length, 0)
                  const isExpanded = expandedProviders.has(provider)

                  return (
                    <Card key={provider}>
                      <CardHeader
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => toggleProvider(provider)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                            <CardTitle className="text-base">{provider}</CardTitle>
                            <Badge variant="secondary">{nodes.length} nodes</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {passed > 0 && (
                              <Badge variant="default" className="bg-green-600">
                                {passed} passed
                              </Badge>
                            )}
                            {failed > 0 && (
                              <Badge variant="destructive">
                                {failed} failed
                              </Badge>
                            )}
                            {warnings > 0 && (
                              <Badge variant="secondary" className="bg-yellow-600/10 text-yellow-600">
                                {warnings} warnings
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>

                      {isExpanded && (
                        <CardContent>
                          <div className="space-y-2">
                            {nodes.map((node) => (
                              <div
                                key={node.nodeType}
                                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  {node.passed ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{node.nodeTitle}</div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {node.nodeType}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Badge variant={node.isTrigger ? 'default' : 'secondary'} className="text-xs">
                                    {node.isTrigger ? 'Trigger' : 'Action'}
                                  </Badge>
                                  {node.warnings.length > 0 && (
                                    <Badge variant="secondary" className="text-xs bg-yellow-600/10 text-yellow-600">
                                      {node.warnings.length} warnings
                                    </Badge>
                                  )}
                                  {!node.passed && node.error && (
                                    <div className="text-xs text-red-600 max-w-xs truncate">
                                      {node.error}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  )
                })}
            </TabsContent>

            {/* By Category */}
            <TabsContent value="by-category" className="space-y-4">
              {Object.entries(summary.nodesByCategory)
                .sort((a, b) => b[1].length - a[1].length)
                .map(([category, nodes]) => (
                  <Card key={category}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">{category}</CardTitle>
                          <CardDescription>{nodes.length} nodes</CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="default" className="bg-green-600">
                            {nodes.filter(n => n.passed).length} passed
                          </Badge>
                          {nodes.filter(n => !n.passed).length > 0 && (
                            <Badge variant="destructive">
                              {nodes.filter(n => !n.passed).length} failed
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
            </TabsContent>

            {/* Failed Only */}
            <TabsContent value="failed" className="space-y-4">
              {summary.failedNodes.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-8">
                    <CheckCircle2 className="w-12 h-12 text-green-600 mb-2" />
                    <p className="text-lg font-semibold">All nodes passed!</p>
                    <p className="text-sm text-muted-foreground">No failures detected</p>
                  </CardContent>
                </Card>
              ) : (
                summary.failedNodes.map((node) => (
                  <Card key={node.nodeType} className="border-red-200 dark:border-red-900">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-base flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-600" />
                            {node.nodeTitle}
                          </CardTitle>
                          <CardDescription>{node.nodeType}</CardDescription>
                        </div>
                        <Badge variant="destructive">Failed</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {node.error && (
                        <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-900">
                          <p className="text-sm text-red-900 dark:text-red-100">{node.error}</p>
                        </div>
                      )}
                      {node.warnings.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Warnings:</p>
                          {node.warnings.map((warning, i) => (
                            <p key={i} className="text-xs text-yellow-600 pl-2">• {warning}</p>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* All Results */}
            <TabsContent value="all" className="space-y-4">
              <div className="flex gap-2 mb-4">
                <Button
                  variant={filterStatus === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('all')}
                >
                  All ({summary.results.length})
                </Button>
                <Button
                  variant={filterStatus === 'passed' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('passed')}
                >
                  Passed ({summary.results.filter(r => r.passed && r.warnings.length === 0).length})
                </Button>
                <Button
                  variant={filterStatus === 'failed' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('failed')}
                >
                  Failed ({summary.failed})
                </Button>
                <Button
                  variant={filterStatus === 'warnings' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('warnings')}
                >
                  Warnings ({summary.results.filter(r => r.passed && r.warnings.length > 0).length})
                </Button>
              </div>

              <div className="space-y-2">
                {getFilteredResults(summary.results).map((node) => (
                  <div
                    key={node.nodeType}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {node.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{node.nodeTitle}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {node.provider} • {node.nodeType}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {node.warnings.length > 0 && (
                        <Badge variant="secondary" className="text-xs bg-yellow-600/10 text-yellow-600">
                          {node.warnings.length} warnings
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{node.duration}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Empty State */}
      {!summary && !loading && !testing && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Play className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Ready to test</h3>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
              Run a quick validation test to check all node schemas,
              or run a full test to execute real API calls.
            </p>
            <div className="flex gap-2">
              <Button onClick={runValidationTest} variant="outline">
                <Zap className="w-4 h-4 mr-2" />
                Quick Validation
              </Button>
              <Button onClick={runFullTest}>
                <Play className="w-4 h-4 mr-2" />
                Full Test
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
