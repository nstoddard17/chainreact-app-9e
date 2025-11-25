import React, { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Trash2, Wrench, Download } from "lucide-react"

type ApiField = {
  key: string
  label: string
  type: string
  required?: boolean
  description?: string
  defaultValue?: any
  metadata?: Record<string, any>
}

type ApiContract = {
  inputs: ApiField[]
  outputs: ApiField[]
}

interface PublishFlowModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialContract?: ApiContract | null
  nodes?: Array<{ id: string; label?: string; type?: string }>
  isPublishing?: boolean
  onPublish: (contract: ApiContract) => Promise<void>
}

function normalizeField(field: ApiField): ApiField {
  return {
    key: field.key.trim(),
    label: field.label.trim() || field.key.trim(),
    type: field.type || "string",
    required: field.required ?? false,
    description: field.description?.trim() || undefined,
    defaultValue: field.defaultValue,
    metadata: field.metadata ?? {},
  }
}

export function PublishFlowModal({
  open,
  onOpenChange,
  initialContract,
  nodes = [],
  isPublishing = false,
  onPublish,
}: PublishFlowModalProps) {
  const [inputs, setInputs] = useState<ApiField[]>([])
  const [outputs, setOutputs] = useState<ApiField[]>([])
  const [activeTab, setActiveTab] = useState<"inputs" | "outputs">("inputs")

  useEffect(() => {
    if (open) {
      setInputs(initialContract?.inputs ?? [])
      setOutputs(initialContract?.outputs ?? [])
    }
  }, [initialContract, open])

  const nodeOptions = useMemo(
    () => nodes.map((n) => ({ id: n.id, label: n.label || n.type || n.id })),
    [nodes]
  )

  const addInput = () => {
    setInputs((prev) => [...prev, { key: "", label: "", type: "string", required: true }])
  }

  const addOutput = () => {
    setOutputs((prev) => [...prev, { key: "", label: "", type: "json", required: true, metadata: {} }])
  }

  const updateInput = (index: number, patch: Partial<ApiField>) => {
    setInputs((prev) => prev.map((field, i) => (i === index ? { ...field, ...patch } : field)))
  }

  const updateOutput = (index: number, patch: Partial<ApiField>) => {
    setOutputs((prev) => prev.map((field, i) => (i === index ? { ...field, ...patch } : field)))
  }

  const removeInput = (index: number) => {
    setInputs((prev) => prev.filter((_, i) => i !== index))
  }

  const removeOutput = (index: number) => {
    setOutputs((prev) => prev.filter((_, i) => i !== index))
  }

  const handlePublish = async () => {
    const cleanedInputs = inputs
      .map(normalizeField)
      .filter((field) => field.key.length > 0)

    const cleanedOutputs = outputs
      .map(normalizeField)
      .filter((field) => field.key.length > 0 && field.metadata?.nodeId)

    await onPublish({
      inputs: cleanedInputs,
      outputs: cleanedOutputs,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Publish workflow
          </DialogTitle>
          <DialogDescription>
            Save and publish this revision, then define which inputs are accepted and what outputs will be returned for Run via API.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "inputs" | "outputs")}>
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="inputs">API inputs</TabsTrigger>
            <TabsTrigger value="outputs">Returned outputs</TabsTrigger>
          </TabsList>

          <TabsContent value="inputs" className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              Choose which fields callers can send. Required fields are enforced; other fields are ignored at the edge.
            </div>
            <div className="space-y-3">
              {inputs.length === 0 && (
                <div className="text-sm text-muted-foreground border border-dashed rounded-md p-4">
                  No API inputs yet. Add the fields that callers can provide.
                </div>
              )}
              {inputs.map((field, idx) => (
                <div key={idx} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Wrench className="w-4 h-4" />
                      Field {idx + 1}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeInput(idx)}
                      className="text-muted-foreground"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Key</Label>
                      <Input
                        value={field.key}
                        onChange={(e) => updateInput(idx, { key: e.target.value })}
                        placeholder="customer_id"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Label</Label>
                      <Input
                        value={field.label}
                        onChange={(e) => updateInput(idx, { label: e.target.value })}
                        placeholder="Customer ID"
                      />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Type</Label>
                      <Input
                        value={field.type}
                        onChange={(e) => updateInput(idx, { type: e.target.value })}
                        placeholder="string, number, json..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-2">
                        Required
                        <Switch
                          checked={field.required ?? false}
                          onCheckedChange={(checked) => updateInput(idx, { required: checked })}
                        />
                      </Label>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description</Label>
                    <Textarea
                      value={field.description || ""}
                      onChange={(e) => updateInput(idx, { description: e.target.value })}
                      placeholder="Explain what this input controls"
                      rows={2}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addInput} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add input
            </Button>
          </TabsContent>

          <TabsContent value="outputs" className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              Pick which node results to return. If you specify a path, only that portion of the node output is included.
            </div>
            <div className="space-y-3">
              {outputs.length === 0 && (
                <div className="text-sm text-muted-foreground border border-dashed rounded-md p-4">
                  No outputs selected. Add a node output you want to expose.
                </div>
              )}
              {outputs.map((field, idx) => (
                <div key={idx} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Wrench className="w-4 h-4" />
                      Output {idx + 1}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeOutput(idx)}
                      className="text-muted-foreground"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Key</Label>
                      <Input
                        value={field.key}
                        onChange={(e) => updateOutput(idx, { key: e.target.value })}
                        placeholder="result"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Label</Label>
                      <Input
                        value={field.label}
                        onChange={(e) => updateOutput(idx, { label: e.target.value })}
                        placeholder="Result"
                      />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Source node</Label>
                      <select
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={field.metadata?.nodeId || ""}
                        onChange={(e) =>
                          updateOutput(idx, {
                            metadata: { ...(field.metadata ?? {}), nodeId: e.target.value },
                          })
                        }
                      >
                        <option value="">Select a node</option>
                        {nodeOptions.map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Path (optional)</Label>
                      <Input
                        value={field.metadata?.path || ""}
                        onChange={(e) =>
                          updateOutput(idx, {
                            metadata: { ...(field.metadata ?? {}), path: e.target.value },
                          })
                        }
                        placeholder="data.value or leave blank for full output"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description</Label>
                    <Textarea
                      value={field.description || ""}
                      onChange={(e) => updateOutput(idx, { description: e.target.value })}
                      placeholder="Explain what the caller receives"
                      rows={2}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addOutput} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add output
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handlePublish} disabled={isPublishing}>
            {isPublishing ? "Publishing…" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
