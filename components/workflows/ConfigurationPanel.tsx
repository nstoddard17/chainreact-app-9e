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

interface ConfigField {
  key: string
  label: string
  type: string
  placeholder?: string
  options?: string[]
}

const NODE_CONFIGS: Record<string, ConfigField[]> = {
  // Triggers
  webhook: [
    { key: "method", label: "HTTP Method", type: "select", options: ["GET", "POST", "PUT", "DELETE"] },
    { key: "path", label: "Path", type: "text", placeholder: "/webhook" },
    { key: "auth_required", label: "Authentication Required", type: "select", options: ["true", "false"] },
  ],
  schedule: [
    { key: "cron_expression", label: "Cron Expression", type: "text", placeholder: "0 9 * * 1-5" },
    {
      key: "timezone",
      label: "Timezone",
      type: "select",
      options: ["UTC", "America/New_York", "Europe/London", "Asia/Tokyo"],
    },
    { key: "enabled", label: "Enabled", type: "select", options: ["true", "false"] },
  ],
  email_trigger: [
    { key: "email_address", label: "Trigger Email", type: "email", placeholder: "trigger@yourworkflow.com" },
    { key: "subject_filter", label: "Subject Filter", type: "text", placeholder: "Optional subject filter" },
    { key: "sender_filter", label: "Sender Filter", type: "text", placeholder: "Optional sender filter" },
  ],
  file_upload: [
    { key: "provider", label: "Provider", type: "select", options: ["dropbox", "google_drive", "onedrive"] },
    { key: "folder_path", label: "Folder Path", type: "text", placeholder: "/watched-folder" },
    { key: "file_types", label: "File Types", type: "text", placeholder: ".pdf,.docx,.xlsx" },
  ],

  // Actions
  slack_message: [
    { key: "channel", label: "Channel", type: "text", placeholder: "#general" },
    { key: "message", label: "Message", type: "textarea", placeholder: "Hello from ChainReact!" },
    { key: "username", label: "Username", type: "text", placeholder: "ChainReact Bot" },
  ],
  calendar_event: [
    { key: "title", label: "Event Title", type: "text", placeholder: "Meeting" },
    { key: "duration", label: "Duration (minutes)", type: "number", placeholder: "60" },
    { key: "description", label: "Description", type: "textarea", placeholder: "Event description" },
  ],
  sheets_append: [
    {
      key: "spreadsheet_id",
      label: "Spreadsheet ID",
      type: "text",
      placeholder: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    },
    { key: "sheet_name", label: "Sheet Name", type: "text", placeholder: "Sheet1" },
    {
      key: "values",
      label: "Values (JSON array)",
      type: "textarea",
      placeholder: '["{{data.name}}", "{{data.email}}"]',
    },
  ],
  send_email: [
    { key: "to", label: "To", type: "email", placeholder: "user@example.com" },
    { key: "subject", label: "Subject", type: "text", placeholder: "Email Subject" },
    { key: "body", label: "Body", type: "textarea", placeholder: "Email content..." },
    { key: "html", label: "HTML Email", type: "select", options: ["true", "false"] },
  ],
  webhook_call: [
    { key: "url", label: "URL", type: "text", placeholder: "https://api.example.com/endpoint" },
    { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "DELETE", "PATCH"] },
    { key: "headers", label: "Headers (JSON)", type: "textarea", placeholder: '{"Content-Type": "application/json"}' },
    { key: "body", label: "Body", type: "textarea", placeholder: "Request body" },
  ],

  // Logic & Control
  if_condition: [
    {
      key: "condition",
      label: "Condition",
      type: "textarea",
      placeholder: "data.status === 'active' && data.count > 10",
    },
    { key: "true_path", label: "True Path Label", type: "text", placeholder: "Success" },
    { key: "false_path", label: "False Path Label", type: "text", placeholder: "Failed" },
  ],
  switch_case: [
    { key: "switch_value", label: "Switch Value", type: "text", placeholder: "data.type" },
    {
      key: "cases",
      label: "Cases (JSON)",
      type: "textarea",
      placeholder: '{"case1": "value1", "case2": "value2", "default": "defaultValue"}',
    },
  ],
  filter: [
    { key: "condition", label: "Filter Condition", type: "textarea", placeholder: "data.value > 100" },
    { key: "operation", label: "Operation", type: "select", options: ["include", "exclude"] },
  ],
  delay: [
    {
      key: "duration",
      label: "Duration",
      type: "select",
      options: ["1s", "5s", "10s", "30s", "1m", "5m", "10m", "30m", "1h"],
    },
    { key: "dynamic", label: "Dynamic Duration", type: "text", placeholder: "data.delay_seconds" },
  ],
  loop: [
    { key: "array_path", label: "Array Path", type: "text", placeholder: "data.items" },
    { key: "item_variable", label: "Item Variable", type: "text", placeholder: "item" },
    { key: "max_iterations", label: "Max Iterations", type: "number", placeholder: "100" },
  ],

  // Data Operations
  data_transform: [
    { key: "input_format", label: "Input Format", type: "select", options: ["json", "xml", "csv", "yaml"] },
    { key: "output_format", label: "Output Format", type: "select", options: ["json", "xml", "csv", "yaml"] },
    {
      key: "transformation",
      label: "Transformation (JSONata)",
      type: "textarea",
      placeholder: "{ 'name': $.firstName & ' ' & $.lastName }",
    },
  ],
  template: [
    {
      key: "template",
      label: "Template",
      type: "textarea",
      placeholder: "Hello {{data.name}}, your order {{data.orderId}} is ready!",
    },
    { key: "engine", label: "Template Engine", type: "select", options: ["handlebars", "mustache", "liquid"] },
  ],
  javascript: [
    {
      key: "code",
      label: "JavaScript Code",
      type: "textarea",
      placeholder: "// Your JavaScript code here\nreturn { result: data.value * 2 };",
    },
    { key: "timeout", label: "Timeout (ms)", type: "number", placeholder: "5000" },
  ],
  variable_set: [
    { key: "variable_name", label: "Variable Name", type: "text", placeholder: "myVariable" },
    { key: "value", label: "Value", type: "textarea", placeholder: "data.someValue" },
    { key: "scope", label: "Scope", type: "select", options: ["workflow", "global"] },
  ],
  variable_get: [
    { key: "variable_name", label: "Variable Name", type: "text", placeholder: "myVariable" },
    { key: "default_value", label: "Default Value", type: "text", placeholder: "defaultValue" },
  ],

  // Error Handling
  try_catch: [
    { key: "max_retries", label: "Max Retries", type: "number", placeholder: "3" },
    { key: "retry_delay", label: "Retry Delay (ms)", type: "number", placeholder: "1000" },
    { key: "catch_all", label: "Catch All Errors", type: "select", options: ["true", "false"] },
  ],
  retry: [
    { key: "max_attempts", label: "Max Attempts", type: "number", placeholder: "3" },
    { key: "backoff_strategy", label: "Backoff Strategy", type: "select", options: ["linear", "exponential", "fixed"] },
    { key: "initial_delay", label: "Initial Delay (ms)", type: "number", placeholder: "1000" },
    { key: "max_delay", label: "Max Delay (ms)", type: "number", placeholder: "30000" },
  ],
}

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
          onChange={(e) => {
            const value = field.type === "number" ? Number(e.target.value) : e.target.value
            handleConfigChange(field.key, value)
          }}
          placeholder={field.placeholder}
        />
      )
    }
  }

  if (!selectedNode) {
    return (
      <div className="w-80 bg-white border-l border-slate-200 p-4">
        <div className="flex items-center space-x-2 mb-4">
          <Settings className="w-5 h-5 text-slate-400" />
          <h3 className="font-semibold text-slate-900">Configuration</h3>
        </div>
        <div className="text-sm text-slate-500 text-center py-8">Select a component to configure its settings</div>
      </div>
    )
  }

  const nodeType = selectedNode.data?.type
  const configFields = NODE_CONFIGS[nodeType] || []
  const requiredIntegration = getRequiredIntegration(nodeType)
  const integrationConnected = requiredIntegration ? isIntegrationConnected(requiredIntegration) : true

  return (
    <div className="w-80 bg-white border-l border-slate-200 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Settings className="w-5 h-5 text-slate-600" />
          <h3 className="font-semibold text-slate-900">Configuration</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setSelectedNode(null)}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{selectedNode.data?.title}</CardTitle>
          <p className="text-xs text-slate-500">{selectedNode.data?.description}</p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-xs text-slate-600">
            <div>ID: {selectedNode.id}</div>
            <div>Type: {nodeType}</div>
          </div>
        </CardContent>
      </Card>

      {requiredIntegration && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Integration Required</div>
              <Badge variant={integrationConnected ? "default" : "destructive"}>
                {integrationConnected ? "Connected" : "Not Connected"}
              </Badge>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {requiredIntegration.charAt(0).toUpperCase() + requiredIntegration.slice(1)}
            </div>
            {!integrationConnected && (
              <div className="text-xs text-red-600 mt-2">
                Please connect this integration in the Integrations page to use this component.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>
        
        <TabsContent value="basic" className="space-y-4 mt-4">
          {configFields.slice(0, 3).map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key} className="text-sm font-medium">
                {field.label}
              </Label>
              {renderConfigField(field)}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4 mt-4">
          {configFields.slice(3).map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key} className="text-sm font-medium">
                {field.label}
              </Label>
              {renderConfigField(field)}
            </div>
          ))}

          {nodeType === "javascript" && (
            <Card className="mt-4">
              <CardContent className="pt-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Code className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium">Available Variables</span>
                </div>
                <div className="text-xs text-slate-600 space-y-1">
                  <div><code>data</code> - Input data from previous node</div>
                  <div><code>variables</code> - Workflow variables</div>
                  <div><code>context</code> - Execution context</div>
                </div>
              </CardContent>
            </Card>
          )}

          {nodeType === "data_transform" && (
            <Card className="mt-4">
              <CardContent className="pt-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Database className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium">JSONata Examples</span>
                </div>
                <div className="text-xs text-slate-600 space-y-1">
                  <div><code>$.name</code> - Extract name field</div>
                  <div><code>$map(items, function($v) &#123;&#123;&quot;id&quot;: $v.id&#125;&#125;)</code> - Transform array</div>
                  <div><code>$filter(items, function($v) &#123;&#123;$v.active&#125;&#125;)</code> - Filter items</div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {configFields.length === 0 && (
        <div className="text-sm text-slate-500 text-center py-4">
          No configuration options available for this component.
        </div>
      )}
    </div>
  )
}
