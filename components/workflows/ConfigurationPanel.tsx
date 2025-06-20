"use client"

import { useState, useEffect } from "react"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { X, Settings, Code, Database } from "lucide-react"
import { ConfigField } from "@/lib/workflows/availableNodes"

export default function ConfigurationPanel() {
  const { selectedNode, updateNode, setSelectedNode } = useWorkflowStore()
  const { integrations } = useIntegrationStore()
  const [config, setConfig] = useState<Record<string, any>>({})

  useEffect(() => {
    if (selectedNode) {
      setConfig(selectedNode.data?.config || {})
    }
  }, [selectedNode])

  const handleConfigChange = (key: string, value: any) => {
    const newConfig = { ...config, [key]: value }
    setConfig(newConfig)

    if (selectedNode) {
      updateNode(selectedNode.id, {
        data: {
          ...selectedNode.data,
          config: newConfig,
        },
      })
    }
  }

  const getRequiredIntegration = (nodeType: string) => {
    const integrationMap: Record<string, string> = {
      slack_message: "slack",
      calendar_event: "google-calendar",
      sheets_append: "google-sheets",
      file_upload: "google-drive",
    }
    return integrationMap[nodeType]
  }

  const isIntegrationConnected = (provider: string) => {
    return integrations.some((integration) => integration.provider === provider && integration.status === "connected")
  }

  const renderConfigField = (field: ConfigField) => {
    if (field.type === "select") {
      return (
        <Select value={config[field.key] || ""} onValueChange={(value) => handleConfigChange(field.key, value)}>
          <SelectTrigger>
            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    } else if (field.type === "textarea") {
      return (
        <Textarea
          id={field.key}
          value={config[field.key] || ""}
          onChange={(e) => handleConfigChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={3}
        />
      )
    } else {
      return (
        <Input
          id={field.key}
          type={field.type}
          value={config[field.key] || ""}
          onChange={(e) => handleConfigChange(field.key, e.target.value)}
          placeholder={field.placeholder}
        />
      )
    }
  }

  if (!selectedNode) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-center bg-slate-50">
        <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
          <Settings className="w-8 h-8 text-slate-500" />
        </div>
        <h3 className="text-lg font-medium text-slate-800">Select a node</h3>
        <p className="text-sm text-slate-500">Select a node to view and edit its configuration.</p>
      </div>
    )
  }

  const nodeConfigSchema = selectedNode.data?.configSchema || []

  const requiredIntegration = getRequiredIntegration(selectedNode.data.type)
  const isConnected = requiredIntegration ? isIntegrationConnected(requiredIntegration) : true

  return (
    <div className="h-full bg-white flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        <h2 className="text-lg font-semibold">{selectedNode.data.title}</h2>
        <Button variant="ghost" size="sm" onClick={() => setSelectedNode(null)}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <Tabs defaultValue="settings" className="flex-grow flex flex-col">
        <TabsList className="m-4">
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-2" /> Settings
          </TabsTrigger>
          <TabsTrigger value="data">
            <Database className="w-4 h-4 mr-2" /> Node Data
          </TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className="flex-grow overflow-y-auto px-4">
          {!isConnected && (
            <Card className="mb-4 bg-yellow-50 border-yellow-200">
              <CardHeader>
                <CardTitle className="text-yellow-800">Integration not connected</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-yellow-700 mb-4">
                  This node requires the {requiredIntegration} integration. Please connect it to continue.
                </p>
                <Button>Connect {requiredIntegration}</Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-6">
            {nodeConfigSchema.length > 0 ? (
              nodeConfigSchema.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  {renderConfigField(field)}
                </div>
              ))
            ) : (
              <p className="text-slate-500 text-sm">This node has no configuration options.</p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="data" className="flex-grow overflow-y-auto p-4 bg-slate-50">
          <h3 className="text-md font-semibold mb-2">Current Configuration</h3>
          <pre className="text-xs bg-white p-2 rounded border border-slate-200">
            {JSON.stringify(config, null, 2)}
          </pre>
          <h3 className="text-md font-semibold mt-4 mb-2">Full Node Data</h3>
          <pre className="text-xs bg-white p-2 rounded border border-slate-200">
            {JSON.stringify(selectedNode, null, 2)}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  )
}
