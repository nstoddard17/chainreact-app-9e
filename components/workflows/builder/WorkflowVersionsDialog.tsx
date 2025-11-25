"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { GitBranch, Clock, RotateCcw, Loader2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import type { Flow } from "@/src/lib/workflows/builder/schema"
import { flowApiUrl } from "@/src/lib/workflows/builder/api/paths"

interface WorkflowVersion {
  id: string
  version: number
  createdAt: string
  published?: boolean
  publishedAt?: string | null
}

interface VersionDiffSummary {
  nodesAdded: number
  nodesRemoved: number
  nodesChanged: number
  edgesAdded: number
  edgesRemoved: number
}

const BASELINE_DIFF: VersionDiffSummary = {
  nodesAdded: 0,
  nodesRemoved: 0,
  nodesChanged: 0,
  edgesAdded: 0,
  edgesRemoved: 0,
}

function stripPosition(metadata?: Record<string, any>) {
  if (!metadata) return undefined
  const next = { ...metadata }
  if (next.position) {
    delete next.position
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function normalizeNode(node: Flow["nodes"][number]) {
  const { metadata, ...rest } = node
  return {
    ...rest,
    metadata: stripPosition(metadata as Record<string, any> | undefined),
  }
}

function normalizeEdge(edge: Flow["edges"][number]) {
  const { metadata, ...rest } = edge
  return {
    ...rest,
    metadata: stripPosition(metadata as Record<string, any> | undefined),
  }
}

function canonicalize(value: any): any {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize((value as any)[key])
        return acc
      }, {} as Record<string, any>)
  }

  return value
}

function hashValue(value: any) {
  return JSON.stringify(canonicalize(value))
}

function summarizeDiff(prev: Flow | null, next: Flow | null): VersionDiffSummary {
  if (!next) {
    return BASELINE_DIFF
  }

  if (!prev) {
    return {
      nodesAdded: next.nodes?.length ?? 0,
      nodesRemoved: 0,
      nodesChanged: 0,
      edgesAdded: next.edges?.length ?? 0,
      edgesRemoved: 0,
    }
  }

  const prevNodes = new Map(prev.nodes.map((n) => [n.id, hashValue(normalizeNode(n))]))
  const nextNodes = new Map(next.nodes.map((n) => [n.id, hashValue(normalizeNode(n))]))

  let nodesAdded = 0
  let nodesRemoved = 0
  let nodesChanged = 0

  nextNodes.forEach((hash, id) => {
    const prevHash = prevNodes.get(id)
    if (!prevHash) {
      nodesAdded += 1
    } else if (prevHash !== hash) {
      nodesChanged += 1
    }
  })

  prevNodes.forEach((_, id) => {
    if (!nextNodes.has(id)) {
      nodesRemoved += 1
    }
  })

  const prevEdges = new Map(prev.edges.map((e) => [e.id, hashValue(normalizeEdge(e))]))
  const nextEdges = new Map(next.edges.map((e) => [e.id, hashValue(normalizeEdge(e))]))

  let edgesAdded = 0
  let edgesRemoved = 0

  nextEdges.forEach((_, id) => {
    if (!prevEdges.has(id)) {
      edgesAdded += 1
    }
  })

  prevEdges.forEach((_, id) => {
    if (!nextEdges.has(id)) {
      edgesRemoved += 1
    }
  })

  return {
    nodesAdded,
    nodesRemoved,
    nodesChanged,
    edgesAdded,
    edgesRemoved,
  }
}

interface WorkflowVersionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  onRestoreVersion?: (versionId: string) => Promise<void> | void
  activeRevisionId?: string
}

export function WorkflowVersionsDialog({
  open,
  onOpenChange,
  workflowId,
  onRestoreVersion,
}: WorkflowVersionsDialogProps) {
  const [versions, setVersions] = useState<WorkflowVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [diffs, setDiffs] = useState<Record<string, VersionDiffSummary>>({})
  const [diffsLoading, setDiffsLoading] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const { toast } = useToast()
  const revisionCacheRef = useRef<Record<string, Flow>>({})

  const loadVersions = useCallback(
    async (signal?: AbortSignal) => {
      if (!workflowId) return

      setLoading(true)
      setLoadError(null)
      setDiffs({})
      setDiffsLoading(false)
      revisionCacheRef.current = {}

      try {
        const response = await fetch(flowApiUrl(workflowId, '/revisions'), {
          method: "GET",
          cache: "no-store",
          signal,
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch versions: ${response.status}`)
        }

        const payload: { ok: boolean; revisions?: WorkflowVersion[]; error?: string } = await response.json()

        if (!payload.ok) {
          throw new Error(payload.error || "Failed to load version history")
        }

        if (!signal?.aborted) {
          setVersions(payload.revisions || [])
        }
      } catch (error: any) {
        if (signal?.aborted) return
        console.error("Error loading versions:", error)
        setLoadError("Unable to load version history right now.")
        setVersions([])
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [workflowId]
  )

  const fetchRevisionGraph = useCallback(
    async (revisionId: string, signal?: AbortSignal): Promise<Flow | null> => {
      if (revisionCacheRef.current[revisionId]) {
        return revisionCacheRef.current[revisionId]
      }

      const response = await fetch(flowApiUrl(workflowId, `/revisions/${revisionId}`), {
        method: "GET",
        cache: "no-store",
        signal,
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch revision ${revisionId}`)
      }

      const payload: { revision: { graph: Flow } } = await response.json()
      const graph = payload.revision?.graph
      if (graph && !signal?.aborted) {
        revisionCacheRef.current[revisionId] = graph
      }
      return graph ?? null
    },
    [workflowId]
  )

  const computeDiffs = useCallback(
    async (currentVersions: WorkflowVersion[], signal?: AbortSignal) => {
      if (!currentVersions || currentVersions.length === 0) {
        setDiffs({})
        return
      }

      setDiffsLoading(true)
      try {
        const ordered = [...currentVersions].sort((a, b) => a.version - b.version)
        const diffMap: Record<string, VersionDiffSummary> = {}
        let previousFlow: Flow | null = null

        for (const revision of ordered) {
          if (signal?.aborted) return
          const flow = await fetchRevisionGraph(revision.id, signal)
          if (signal?.aborted) return
          diffMap[revision.id] = summarizeDiff(previousFlow, flow)
          previousFlow = flow
        }

        if (!signal?.aborted) {
          setDiffs(diffMap)
        }
      } catch (error) {
        if (!signal?.aborted) {
          console.error("Error computing version diffs:", error)
        }
      } finally {
        if (!signal?.aborted) {
          setDiffsLoading(false)
        }
      }
    },
    [fetchRevisionGraph]
  )

  useEffect(() => {
    if (!open || !workflowId) return

    const controller = new AbortController()
    setVersions([])
    loadVersions(controller.signal)

    return () => controller.abort()
  }, [open, workflowId, loadVersions])

  useEffect(() => {
    if (!open || versions.length === 0) return
    const controller = new AbortController()
    computeDiffs(versions, controller.signal)
    return () => controller.abort()
  }, [computeDiffs, open, versions])

  const handleRestore = async (versionId: string) => {
    if (!onRestoreVersion) return

    setRestoringId(versionId)
    try {
      await onRestoreVersion(versionId)
      toast({
        title: "Version Restored",
        description: "Workflow has been restored to this version",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to restore version",
        variant: "destructive",
      })
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] sm:w-[92vw] md:max-w-3xl lg:max-w-4xl max-w-[1100px] max-h-[85vh] rounded-xl sm:rounded-2xl">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <GitBranch className="w-5 h-5 shrink-0" />
            Version History
          </DialogTitle>
          <DialogDescription>
            View and restore previous revisions of this workflow.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-muted-foreground">
            Latest version appears at the top. Data refreshes each time you open this modal.
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setVersions([])
              loadVersions()
            }}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4 mr-2" />
            )}
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>

        {loading ? (
          <div className="space-y-4 py-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading version history…</span>
            </div>
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-[90px] rounded-xl border bg-muted/40 animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : loadError ? (
          <div className="py-12 text-center space-y-3">
            <GitBranch className="w-12 h-12 mx-auto text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <div className="flex justify-center">
              <Button onClick={() => loadVersions()}>
                Try again
              </Button>
            </div>
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <GitBranch className="w-12 h-12 mx-auto mb-4 opacity-60" />
            <p className="text-sm">No version history yet</p>
            <p className="text-xs mt-2">
              Save changes to create your first revision.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-2 sm:pr-3">
            <div className="space-y-3">
              {versions.map((version, index) => {
                const isLatest = index === 0
                const isPublished = Boolean(version.published)
                const isActive = activeRevisionId === version.id
                const diff = diffs[version.id]
                const isRestoring = restoringId === version.id
                const canRestore = Boolean(onRestoreVersion) && !isActive

                return (
                  <div
                    key={version.id}
                    role={canRestore ? "button" : "group"}
                    tabIndex={canRestore ? 0 : -1}
                    onClick={() => {
                      if (canRestore) {
                        void handleRestore(version.id)
                      }
                    }}
                    className={`p-4 sm:p-5 border rounded-xl bg-background/80 backdrop-blur-sm shadow-sm hover:border-primary/40 transition-colors ${canRestore ? "cursor-pointer" : "cursor-default"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={isLatest ? "default" : "secondary"}>
                            v{version.version}
                          </Badge>
                          {isLatest && (
                            <Badge variant="outline" className="text-xs">
                              Latest
                            </Badge>
                          )}
                          {isActive && (
                            <Badge variant="outline" className="text-xs bg-primary/10 text-primary">
                              Viewing
                            </Badge>
                          )}
                          {isPublished && (
                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600">
                              Published
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            <span>
                              {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          {isPublished && version.publishedAt && (
                            <div className="flex items-center gap-2">
                              <RotateCcw className="w-4 h-4" />
                              <span>Published {formatDistanceToNow(new Date(version.publishedAt), { addSuffix: true })}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                          <span className="text-muted-foreground">Changes vs previous:</span>
                          {diff ? (
                            <>
                              {(diff.nodesAdded > 0 || diff.nodesRemoved > 0 || diff.nodesChanged > 0) ? (
                                <>
                                  {diff.nodesAdded > 0 && (
                                    <Badge variant="outline" className="text-green-600 bg-green-500/10 border-green-200">
                                      +{diff.nodesAdded} nodes
                                    </Badge>
                                  )}
                                  {diff.nodesRemoved > 0 && (
                                    <Badge variant="outline" className="text-red-600 bg-red-500/10 border-red-200">
                                      -{diff.nodesRemoved} nodes
                                    </Badge>
                                  )}
                                  {diff.nodesChanged > 0 && (
                                    <Badge variant="outline" className="text-blue-600 bg-blue-500/10 border-blue-200">
                                      ~{diff.nodesChanged} nodes
                                    </Badge>
                                  )}
                                </>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">
                                  No node changes
                                </Badge>
                              )}
                              {(diff.edgesAdded > 0 || diff.edgesRemoved > 0) && (
                                <>
                                  {diff.edgesAdded > 0 && (
                                    <Badge variant="outline" className="text-emerald-700 bg-emerald-500/10 border-emerald-200">
                                      +{diff.edgesAdded} edges
                                    </Badge>
                                  )}
                                  {diff.edgesRemoved > 0 && (
                                    <Badge variant="outline" className="text-rose-700 bg-rose-500/10 border-rose-200">
                                      -{diff.edgesRemoved} edges
                                    </Badge>
                                  )}
                                </>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">
                              {diffsLoading ? "Calculating changes…" : "—"}
                            </span>
                          )}
                        </div>
                      </div>

                      {onRestoreVersion && (
                        <div className="flex items-center gap-2 sm:pl-4">
                          <Button
                            variant={isActive ? "secondary" : "outline"}
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (canRestore) {
                                void handleRestore(version.id)
                              }
                            }}
                            disabled={!canRestore || isRestoring}
                          >
                            {isRestoring ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <RotateCcw className="w-4 h-4 mr-2" />
                                {isActive ? "Current" : "Restore"}
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
