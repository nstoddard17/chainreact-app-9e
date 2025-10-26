import React, { useMemo, useCallback } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Copy, Database } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useVariableDragContext } from "./VariableDragContext"
import { extractNodeOutputs, sanitizeAlias } from "./autoMapping"

interface ConfigurationDataInspectorProps {
  workflowData?: { nodes: any[]; edges: any[] }
  currentNodeId?: string
}

interface UpstreamNodeInfo {
  id: string
  alias: string
  title: string
  providerId?: string
  outputs: { name: string; type?: string; label?: string }[]
}

function buildUpstreamGraph(workflowData?: { nodes: any[]; edges: any[] }) {
  if (!workflowData) return { nodeById: new Map<string, any>(), incoming: new Map<string, string[]>() }

  const nodeById = new Map<string, any>()
  for (const node of workflowData.nodes ?? []) {
    nodeById.set(node.id, node)
  }

  const incoming = new Map<string, string[]>()
  for (const edge of workflowData.edges ?? []) {
    if (!edge?.target || !edge?.source) continue
    if (!incoming.has(edge.target)) incoming.set(edge.target, [])
    incoming.get(edge.target)!.push(edge.source)
  }

  return { nodeById, incoming }
}

function findUpstreamNodes(
  nodeId: string | undefined,
  graph: ReturnType<typeof buildUpstreamGraph>
): any[] {
  if (!nodeId) return []

  const { nodeById, incoming } = graph
  const visited = new Set<string>()
  const queue: string[] = []

  queue.push(nodeId)

  const upstreamNodes: any[] = []

  while (queue.length) {
    const target = queue.shift()!
    const sources = incoming.get(target) ?? []

    for (const sourceId of sources) {
      if (visited.has(sourceId)) continue
      visited.add(sourceId)

      const node = nodeById.get(sourceId)
      if (node) {
        upstreamNodes.push(node)
        queue.push(sourceId)
      }
    }
  }

  return upstreamNodes
}

export function ConfigurationDataInspector({
  workflowData,
  currentNodeId,
}: ConfigurationDataInspectorProps) {
  const { toast } = useToast()
  const { insertIntoActiveField, activeField } = useVariableDragContext()

  const upstreamNodes = useMemo<UpstreamNodeInfo[]>(() => {
    if (!workflowData || !currentNodeId) return []
    const graph = buildUpstreamGraph(workflowData)
    const nodes = findUpstreamNodes(currentNodeId, graph)

    return nodes
      .map((node) => {
        const outputs = extractNodeOutputs(node)
        if (!outputs.length) return null
        const alias = sanitizeAlias(
          node.data?.label ||
          node.data?.title ||
          node.data?.type ||
          node.id
        )

        return {
          id: node.id,
          alias,
          title: node.data?.title || node.data?.label || node.data?.type || "Step",
          providerId: node.data?.providerId,
          outputs,
        } as UpstreamNodeInfo
      })
      .filter(Boolean) as UpstreamNodeInfo[]
  }, [workflowData, currentNodeId])

  const handleCopy = useCallback((token: string) => {
    navigator.clipboard?.writeText(token).then(() => {
      toast({
        title: "Copied",
        description: `${token} copied to clipboard.`,
      })
    }).catch(() => {
      toast({
        title: "Copy failed",
        description: "Unable to copy this token. Try selecting it manually.",
        variant: "destructive",
      })
    })
  }, [toast])

  const handleInsert = useCallback((token: string) => {
    const inserted = insertIntoActiveField(token)
    if (inserted) {
      toast({
        title: "Inserted",
        description: `Added ${token} to ${activeField?.label || 'the active field'}.`,
      })
    } else {
      toast({
        title: "No active field",
        description: "Click into a field before inserting variables.",
        variant: "destructive",
      })
    }
  }, [insertIntoActiveField, activeField, toast])

  if (!upstreamNodes.length) {
    return null
  }

  return (
    <Card className="mt-4">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Database className="h-4 w-4 text-slate-500" />
          Available data from previous steps
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="max-h-60 pr-2">
          <div className="space-y-4">
            {upstreamNodes.map((node) => (
              <div key={node.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm text-slate-900 truncate">
                    {node.title}
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {node.alias}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {node.outputs.map((field) => {
                    const token = `{{${node.alias}.${field.name}}}`
                    return (
                      <div
                        key={field.name}
                        className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-mono text-slate-700 truncate">
                            {token}
                          </div>
                          {field.label && (
                            <div className="text-[11px] text-slate-500 truncate">
                              {field.label}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => handleInsert(token)}
                          >
                            Insert
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => handleCopy(token)}
                          >
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            Copy
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
