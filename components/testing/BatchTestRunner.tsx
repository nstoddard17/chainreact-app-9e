"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Play, CheckCircle2, XCircle, Clock, Loader2,
  ChevronDown, ChevronRight, Copy, ArrowLeft, RotateCcw
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import type { NodeComponent } from '@/lib/workflows/nodes/types'
import { useIntegrationStore } from '@/stores/integrationStore'
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'
import Link from 'next/link'

interface TestResult {
  nodeType: string
  nodeTitle: string
  providerId: string
  success: boolean
  duration: number
  message: string
  error?: string
  errorStack?: string
  output?: any
}

interface ProviderGroup {
  providerId: string
  displayName: string
  connected: boolean
  integrationId?: string
  actions: NodeComponent[]
}

type TestStatus = 'idle' | 'running' | 'done'

export function BatchTestRunner() {
  const { toast } = useToast()
  const { integrations, fetchIntegrations } = useIntegrationStore()
  const [status, setStatus] = useState<TestStatus>('idle')
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<TestResult[]>([])
  const [currentTest, setCurrentTest] = useState<string | null>(null)
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set())
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set())
  const [filterMode, setFilterMode] = useState<'all' | 'connected'>('connected')
  const [resultFilter, setResultFilter] = useState<'all' | 'passed' | 'failed'>('all')
  const abortRef = useRef(false)

  // Load integrations on mount
  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  // Build provider groups from ALL_NODE_COMPONENTS
  const providerGroups: ProviderGroup[] = React.useMemo(() => {
    const actionNodes = ALL_NODE_COMPONENTS.filter(
      n => !n.isTrigger && !n.comingSoon && !n.deprecated && !n.isSystemNode && n.providerId
    )

    const groupMap = new Map<string, ProviderGroup>()

    for (const node of actionNodes) {
      const pid = node.providerId!
      if (!groupMap.has(pid)) {
        const integration = integrations.find(i =>
          i.provider === pid && i.status === 'connected'
        )
        groupMap.set(pid, {
          providerId: pid,
          displayName: pid.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          connected: !!integration,
          integrationId: integration?.id,
          actions: [],
        })
      }
      groupMap.get(pid)!.actions.push(node)
    }

    // Sort: connected first, then alphabetical
    return [...groupMap.values()].sort((a, b) => {
      if (a.connected !== b.connected) return a.connected ? -1 : 1
      return a.displayName.localeCompare(b.displayName)
    })
  }, [integrations])

  const filteredGroups = filterMode === 'connected'
    ? providerGroups.filter(g => g.connected)
    : providerGroups

  // Selection helpers
  const toggleProvider = useCallback((providerId: string) => {
    const group = providerGroups.find(g => g.providerId === providerId)
    if (!group) return

    setSelectedNodes(prev => {
      const next = new Set(prev)
      const allSelected = group.actions.every(a => next.has(a.type))
      for (const action of group.actions) {
        if (allSelected) {
          next.delete(action.type)
        } else {
          next.add(action.type)
        }
      }
      return next
    })
  }, [providerGroups])

  const toggleNode = useCallback((nodeType: string) => {
    setSelectedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeType)) next.delete(nodeType)
      else next.add(nodeType)
      return next
    })
  }, [])

  const selectAllConnected = useCallback(() => {
    const connected = providerGroups.filter(g => g.connected)
    const allTypes = connected.flatMap(g => g.actions.map(a => a.type))
    setSelectedNodes(new Set(allTypes))
  }, [providerGroups])

  const clearSelection = useCallback(() => {
    setSelectedNodes(new Set())
  }, [])

  // Run tests
  const runTests = useCallback(async () => {
    if (selectedNodes.size === 0) {
      toast({ title: 'No actions selected', description: 'Select at least one action to test', variant: 'destructive' })
      return
    }

    setStatus('running')
    setResults([])
    setExpandedErrors(new Set())
    abortRef.current = false

    const nodeTypes = [...selectedNodes]

    // Run in batches of 5 to avoid overwhelming the server
    const batchSize = 5
    for (let i = 0; i < nodeTypes.length; i += batchSize) {
      if (abortRef.current) break

      const batch = nodeTypes.slice(i, i + batchSize)
      setCurrentTest(batch[0])

      try {
        const response = await fetchWithTimeout('/api/testing/batch-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodeTypes: batch }),
        }, 180000) // 3 min timeout for batch

        const data = await response.json()

        if (data.results) {
          setResults(prev => [...prev, ...data.results])
        }
      } catch (error: any) {
        // If fetch fails entirely, mark all batch items as failed
        for (const nodeType of batch) {
          const node = ALL_NODE_COMPONENTS.find(n => n.type === nodeType)
          setResults(prev => [...prev, {
            nodeType,
            nodeTitle: node?.title || nodeType,
            providerId: node?.providerId || 'unknown',
            success: false,
            duration: 0,
            message: `Request failed: ${error.message}`,
            error: error.message,
          }])
        }
      }
    }

    setCurrentTest(null)
    setStatus('done')
  }, [selectedNodes, toast])

  const stopTests = useCallback(() => {
    abortRef.current = true
  }, [])

  // Retest only the failed ones
  const retestFailed = useCallback(async () => {
    const failedTypes = results.filter(r => !r.success).map(r => r.nodeType)
    if (failedTypes.length === 0) return

    // Remove old failed results, keep passed ones
    setResults(prev => prev.filter(r => r.success))
    setStatus('running')
    setResultFilter('all')
    abortRef.current = false

    const batchSize = 5
    for (let i = 0; i < failedTypes.length; i += batchSize) {
      if (abortRef.current) break

      const batch = failedTypes.slice(i, i + batchSize)
      setCurrentTest(batch[0])

      try {
        const response = await fetchWithTimeout('/api/testing/batch-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodeTypes: batch }),
        }, 180000)

        const data = await response.json()

        if (data.results) {
          setResults(prev => [...prev, ...data.results])
        }
      } catch (error: any) {
        for (const nodeType of batch) {
          const node = ALL_NODE_COMPONENTS.find(n => n.type === nodeType)
          setResults(prev => [...prev, {
            nodeType,
            nodeTitle: node?.title || nodeType,
            providerId: node?.providerId || 'unknown',
            success: false,
            duration: 0,
            message: `Request failed: ${error.message}`,
            error: error.message,
          }])
        }
      }
    }

    setCurrentTest(null)
    setStatus('done')
  }, [results])

  // Copy error details for sharing
  const copyErrorDetails = useCallback((result: TestResult) => {
    const details = [
      `## Failed Test: ${result.nodeTitle}`,
      `- **Node Type:** \`${result.nodeType}\``,
      `- **Provider:** ${result.providerId}`,
      `- **Duration:** ${result.duration}ms`,
      `- **Error:** ${result.error || result.message}`,
      result.errorStack ? `\n**Stack:**\n\`\`\`\n${result.errorStack}\n\`\`\`` : '',
      result.output ? `\n**Output:**\n\`\`\`json\n${JSON.stringify(result.output, null, 2)}\n\`\`\`` : '',
    ].filter(Boolean).join('\n')

    navigator.clipboard.writeText(details)
    toast({ title: 'Copied', description: 'Error details copied to clipboard' })
  }, [toast])

  const copyAllFailures = useCallback(() => {
    const failures = results.filter(r => !r.success)
    if (failures.length === 0) return

    const report = [
      `# Batch Test Report — ${new Date().toLocaleDateString()}`,
      `**Total:** ${results.length} | **Passed:** ${results.filter(r => r.success).length} | **Failed:** ${failures.length}`,
      '',
      ...failures.map(r => [
        `## ${r.nodeTitle} (\`${r.nodeType}\`)`,
        `- **Provider:** ${r.providerId}`,
        `- **Error:** ${r.error || r.message}`,
        r.errorStack ? `\`\`\`\n${r.errorStack}\n\`\`\`` : '',
        '',
      ].join('\n'))
    ].join('\n')

    navigator.clipboard.writeText(report)
    toast({ title: 'Copied', description: `${failures.length} failure(s) copied to clipboard` })
  }, [results, toast])

  // Stats
  const passed = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/test-actions" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-bold">Batch Action Tester</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Select actions to test with real API calls. Uses your connected integrations and auto-generated test data.
        </p>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left: Action Selection */}
        <div className="w-[400px] border-r flex flex-col min-h-0">
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={selectAllConnected} className="text-xs h-7">
                Select All Connected
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelection} className="text-xs h-7">
                Clear
              </Button>
              <Badge variant="outline" className="ml-auto text-xs">
                {selectedNodes.size} selected
              </Badge>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm" variant={filterMode === 'connected' ? 'default' : 'ghost'}
                onClick={() => setFilterMode('connected')} className="text-xs h-6 px-2"
              >
                Connected
              </Button>
              <Button
                size="sm" variant={filterMode === 'all' ? 'default' : 'ghost'}
                onClick={() => setFilterMode('all')} className="text-xs h-6 px-2"
              >
                All
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {filteredGroups.map(group => {
                const isExpanded = expandedProviders.has(group.providerId)
                const selectedCount = group.actions.filter(a => selectedNodes.has(a.type)).length
                const allSelected = selectedCount === group.actions.length

                return (
                  <div key={group.providerId}>
                    <div
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
                      onClick={() => setExpandedProviders(prev => {
                        const next = new Set(prev)
                        if (next.has(group.providerId)) next.delete(group.providerId)
                        else next.add(group.providerId)
                        return next
                      })}
                    >
                      {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={() => toggleProvider(group.providerId)}
                        onClick={e => e.stopPropagation()}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-sm font-medium flex-1">{group.displayName}</span>
                      {group.connected ? (
                        <Badge variant="outline" className="text-[10px] h-4 bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">
                          Connected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-4 text-muted-foreground">
                          Not connected
                        </Badge>
                      )}
                      {selectedCount > 0 && (
                        <Badge variant="secondary" className="text-[10px] h-4 min-w-[20px] justify-center">
                          {selectedCount}
                        </Badge>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="ml-6 space-y-0.5 mb-1">
                        {group.actions.map(action => (
                          <label
                            key={action.type}
                            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedNodes.has(action.type)}
                              onCheckedChange={() => toggleNode(action.type)}
                              className="h-3 w-3"
                            />
                            <span className="text-xs">{action.title}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>

          <div className="p-3 border-t">
            {status === 'running' ? (
              <div className="space-y-2">
                <Button size="sm" variant="destructive" onClick={stopTests} className="w-full">
                  Stop Tests
                </Button>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Testing: {currentTest || '...'}
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={runTests}
                disabled={selectedNodes.size === 0}
                className="w-full gap-2"
              >
                <Play className="h-3.5 w-3.5" />
                Run {selectedNodes.size} Test{selectedNodes.size !== 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </div>

        {/* Right: Results */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Results header */}
          {results.length > 0 && (
            <div className="px-4 py-3 border-b space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {passed} passed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <XCircle className="h-4 w-4 text-red-500" />
                    {failed} failed
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {Math.round(results.reduce((s, r) => s + r.duration, 0) / 1000)}s total
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  {failed > 0 && status === 'done' && (
                    <Button size="sm" variant="default" onClick={retestFailed} className="text-xs h-7 gap-1.5">
                      <RotateCcw className="h-3 w-3" />
                      Retest {failed} Failed
                    </Button>
                  )}
                  {failed > 0 && (
                    <Button size="sm" variant="outline" onClick={copyAllFailures} className="text-xs h-7 gap-1.5">
                      <Copy className="h-3 w-3" />
                      Copy Failures
                    </Button>
                  )}
                  {status === 'done' && (
                    <Button size="sm" variant="ghost" onClick={() => { setResults([]); setStatus('idle'); setResultFilter('all') }} className="text-xs h-7 gap-1.5">
                      <RotateCcw className="h-3 w-3" />
                      Reset
                    </Button>
                  )}
                </div>
              </div>
              {/* Result filter tabs */}
              <div className="flex gap-1">
                <Button
                  size="sm" variant={resultFilter === 'all' ? 'secondary' : 'ghost'}
                  onClick={() => setResultFilter('all')} className="text-xs h-6 px-2"
                >
                  All ({results.length})
                </Button>
                <Button
                  size="sm" variant={resultFilter === 'failed' ? 'secondary' : 'ghost'}
                  onClick={() => setResultFilter('failed')} className="text-xs h-6 px-2"
                >
                  Failed ({failed})
                </Button>
                <Button
                  size="sm" variant={resultFilter === 'passed' ? 'secondary' : 'ghost'}
                  onClick={() => setResultFilter('passed')} className="text-xs h-6 px-2"
                >
                  Passed ({passed})
                </Button>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {status === 'running' && selectedNodes.size > 0 && (
            <div className="px-4 py-1">
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary rounded-full h-1.5 transition-all duration-300"
                  style={{ width: `${(results.length / selectedNodes.size) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {results.length} / {selectedNodes.size} completed
              </p>
            </div>
          )}

          {/* Results list */}
          <ScrollArea className="flex-1">
            {results.length === 0 && status === 'idle' && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select actions from the left panel and click Run to start testing
              </div>
            )}

            <div className="p-2 space-y-1">
              {results
              .filter(r => resultFilter === 'all' ? true : resultFilter === 'failed' ? !r.success : r.success)
              .map((result, i) => {
                const isErrorExpanded = expandedErrors.has(result.nodeType)

                return (
                  <div
                    key={`${result.nodeType}-${i}`}
                    className={cn(
                      'rounded border p-3',
                      result.success
                        ? 'border-green-500/20 bg-green-500/5'
                        : 'border-red-500/20 bg-red-500/5'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {result.success ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{result.nodeTitle}</span>
                          <Badge variant="outline" className="text-[10px] h-4">{result.providerId}</Badge>
                          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{result.duration}ms</span>
                        </div>
                        <p className={cn('text-xs mt-0.5', result.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400')}>
                          {result.message}
                        </p>
                      </div>
                      {!result.success && (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="sm" variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => copyErrorDetails(result)}
                            title="Copy error details"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => setExpandedErrors(prev => {
                              const next = new Set(prev)
                              if (next.has(result.nodeType)) next.delete(result.nodeType)
                              else next.add(result.nodeType)
                              return next
                            })}
                          >
                            {isErrorExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Expanded error details */}
                    {!result.success && isErrorExpanded && (
                      <div className="mt-2 ml-6 space-y-2">
                        {result.error && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Error</p>
                            <pre className="text-xs bg-background/80 rounded p-2 overflow-x-auto border whitespace-pre-wrap">
                              {result.error}
                            </pre>
                          </div>
                        )}
                        {result.errorStack && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Stack Trace</p>
                            <pre className="text-[10px] bg-background/80 rounded p-2 overflow-x-auto border whitespace-pre-wrap max-h-40">
                              {result.errorStack}
                            </pre>
                          </div>
                        )}
                        {result.output && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Output</p>
                            <pre className="text-[10px] bg-background/80 rounded p-2 overflow-x-auto border whitespace-pre-wrap max-h-40">
                              {JSON.stringify(result.output, null, 2)}
                            </pre>
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Node type: {result.nodeType}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
