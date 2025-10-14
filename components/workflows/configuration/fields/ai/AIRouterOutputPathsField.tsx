"use client"

import React, { useMemo } from "react"
import { v4 as uuidv4 } from "uuid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Trash2, Plus } from "lucide-react"

export type AIRouterOutputPath = {
  id: string
  name: string
  description?: string
  color: string
  chainId?: string
  condition: {
    type: "ai_decision" | "keyword" | "regex" | "confidence" | "fallback"
    value?: string
    minConfidence?: number
  }
}

interface AIRouterOutputPathsFieldProps {
  value?: AIRouterOutputPath[]
  onChange: (paths: AIRouterOutputPath[]) => void
  error?: string
  workflowData?: { nodes: any[]; edges: any[] }
  parentValues?: Record<string, any>
  currentNodeId?: string
}

const randomColor = () => `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`

export function AIRouterOutputPathsField({
  value,
  onChange,
  error,
  workflowData,
  parentValues,
  currentNodeId,
}: AIRouterOutputPathsFieldProps) {
  const paths = useMemo(() => {
    if (Array.isArray(value) && value.length > 0) {
      return value.map((path) => ({
        ...path,
        id: path.id || uuidv4(),
        color: path.color || randomColor(),
        condition: path.condition || { type: "ai_decision", minConfidence: 0.7 },
      }))
    }
    return []
  }, [value])

  const ensureCondition = (condition?: AIRouterOutputPath["condition"]): AIRouterOutputPath["condition"] => {
    if (!condition) {
      return { type: "ai_decision", minConfidence: 0.7 }
    }
    if (condition.type === "ai_decision" || condition.type === "confidence") {
      return { ...condition, minConfidence: condition.minConfidence ?? 0.7 }
    }
    return { ...condition }
  }

  const handleUpdate = (pathId: string, updates: Partial<AIRouterOutputPath>) => {
    const updated = paths.map((path) =>
      path.id === pathId
        ? {
            ...path,
            ...updates,
            condition: ensureCondition(
              updates.condition
                ? { ...path.condition, ...updates.condition }
                : path.condition
            ),
          }
        : path
    )
    onChange(updated)
  }

  const handleDelete = (pathId: string) => {
    const updated = paths.filter((path) => path.id !== pathId)
    onChange(updated)
  }

  const handleAdd = () => {
    const newPath: AIRouterOutputPath = {
      id: uuidv4(),
      name: `Output ${paths.length + 1}`,
      description: "",
      color: randomColor(),
      condition: { type: "ai_decision", minConfidence: 0.7 },
    }
    onChange([...paths, newPath])
  }

  const chainsFromConfig: any[] = useMemo(() => {
    if (Array.isArray(parentValues?.chains)) {
      return parentValues?.chains
    }
    return []
  }, [parentValues?.chains])

  const usingTemplate = Boolean(parentValues?.template && parentValues.template !== "custom")

  const chainOptions = useMemo(() => {
    if (chainsFromConfig.length > 0) {
      return chainsFromConfig.map((chain) => {
        const firstAction = (chain.nodes || []).find((node: any) => {
          const data = node?.data || node
          const type = data?.type || node?.type
          return type && !String(type).includes("placeholder")
        })

        const firstActionTitle =
          firstAction?.data?.title ||
          firstAction?.title ||
          firstAction?.data?.label ||
          firstAction?.data?.type ||
          ""

        return {
          id: chain.id,
          label: chain.name || chain.id,
          firstAction: firstActionTitle,
        }
      })
    }

    // Fallback: attempt to infer from workflow graph using parentChainIndex metadata
    const nodes = workflowData?.nodes ?? []
    const seen = new Set<string>()
    const byIndex = new Map<number, any[]>()

    nodes.forEach((node: any) => {
      const chainIndex = node?.data?.parentChainIndex ?? node?.parentChainIndex
      if (chainIndex === undefined || chainIndex === null) return
      const arr = byIndex.get(chainIndex) ?? []
      arr.push(node)
      byIndex.set(chainIndex, arr)
    })

    const options: Array<{ id: string; label: string; firstAction?: string }> = []

    if (byIndex.size > 0) {
      Array.from(byIndex.entries())
        .sort(([a], [b]) => a - b)
        .forEach(([index, nodesInChain]) => {
          const sorted = nodesInChain.sort((a: any, b: any) => {
            const ax = a.position?.x ?? 0
            const bx = b.position?.x ?? 0
            if (ax !== bx) return ax - bx
            return (a.position?.y ?? 0) - (b.position?.y ?? 0)
          })

          const first = sorted[0]
          const firstTitle =
            first?.data?.title || first?.data?.label || first?.data?.type || first?.title || first?.type
          const chainId =
            first?.data?.parentChainId || first?.data?.parentChainNodeId || first?.id

          if (!chainId || seen.has(chainId)) {
            return
          }
          seen.add(chainId)
          options.push({
            id: String(chainId),
            label: `Chain ${index + 1}`,
            firstAction: firstTitle,
          })
        })
    }

    if (options.length === 0 && currentNodeId) {
      const edges = workflowData?.edges ?? []
      const outgoing = edges.filter((edge: any) => edge.source === currentNodeId)

      outgoing.forEach((edge: any) => {
        const targetNode = nodes.find((n: any) => n.id === edge.target)
        const firstAction =
          targetNode?.data?.title ||
          targetNode?.data?.label ||
          targetNode?.data?.type ||
          targetNode?.title ||
          targetNode?.type

        const label =
          edge.sourceHandle ||
          firstAction ||
          edge.target

        if (!seen.has(edge.target)) {
          seen.add(edge.target)
          options.push({
            id: edge.target,
            label,
            firstAction,
          })
        }
      })
    }

    return options
  }, [chainsFromConfig, workflowData?.nodes, workflowData?.edges, currentNodeId])

  const getOptionLabel = (option: { label: string; firstAction?: string }) => {
    if (option.firstAction) {
      return `${option.label} — ${option.firstAction}`
    }
    return option.label
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <div className="font-medium text-slate-700">Getting started</div>
        <ol className="mt-2 list-decimal list-inside space-y-1">
          <li>Name the possible outcomes the AI should recognise.</li>
          <li>Save and add a chain (or action sequence) to each router handle in the canvas.</li>
          <li>Return here to link each path to its chain so it runs automatically.</li>
        </ol>
        {usingTemplate && (
          <p className="mt-2 text-xs text-muted-foreground">
            Using a template? If you rename paths or change their purpose, update the system prompt (or switch to Custom Router) so the AI describes the same outcomes you have connected.
          </p>
        )}
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label className="text-sm font-medium text-slate-700">Output Paths</Label>
          <p className="text-xs text-muted-foreground">
            Configure at least two paths. The AI router decides which path(s) to trigger.
          </p>
        </div>
        <Button type="button" size="sm" onClick={handleAdd} disabled={paths.length >= 10}>
          <Plus className="h-4 w-4 mr-1" />
          Add Path
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {paths.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">No output paths yet</CardTitle>
            <CardDescription>Add at least two paths so the router can branch.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          {paths.map((path, index) => {
            return (
              <Card key={path.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Path {index + 1}</CardTitle>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(path.id)}
                      aria-label="Remove path"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  <CardDescription className="text-xs text-muted-foreground">
                    Name the outcome and link it to a chain (optional).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Name</Label>
                      <Input
                        value={path.name}
                        onChange={(e) => handleUpdate(path.id, { name: e.target.value })}
                        placeholder={`Output ${index + 1}`}
                      />
                    </div>
                    <div>
                      <Label>Linked Chain (optional)</Label>
                      {chainOptions.length > 0 ? (
                        <Select
                          value={path.chainId || "none"}
                          onValueChange={(option) =>
                            handleUpdate(path.id, {
                              chainId: option === "none" ? undefined : option,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select chain" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No chain</SelectItem>
                            {chainOptions.map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                {getOptionLabel(option)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={path.chainId || ""}
                          onChange={(e) =>
                            handleUpdate(path.id, { chainId: e.target.value || undefined })
                          }
                          placeholder="Add chains to enable selection"
                          disabled
                        />
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">
                      Description (optional — helps the AI choose)
                    </Label>
                    <Input
                      value={path.description || ""}
                      onChange={(e) => handleUpdate(path.id, { description: e.target.value })}
                      placeholder="When should this path run?"
                      className="mt-1"
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
      {chainOptions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No chains detected yet. After you connect a chain to this router in the builder, it will appear in the dropdown above.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Tip: Link each path to the chain that should run when that outcome is chosen.
        </p>
      )}
    </div>
  )
}
