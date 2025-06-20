"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { ConfigField, NodeComponent } from "@/lib/workflows/availableNodes"

interface ConfigurationModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: Record<string, any>) => void
  nodeInfo: NodeComponent | null
  integrationName: string
}

export default function ConfigurationModal({ isOpen, onClose, onSave, nodeInfo, integrationName }: ConfigurationModalProps) {
  const [config, setConfig] = useState<Record<string, any>>({})

  useEffect(() => {
    // Reset config when modal opens for a new node
    if (isOpen) {
      setConfig({})
    }
  }, [isOpen])

  if (!nodeInfo) {
    return null
  }

  const handleSave = () => {
    onSave(config)
    onClose()
  }

  const renderConfigField = (field: ConfigField) => {
    const value = config[field.key] || ""
    const handleConfigChange = (key: string, value: any) => {
      setConfig(prev => ({ ...prev, [key]: value }))
    }

    if (field.type === "select") {
      return (
        <Select value={value} onValueChange={(value) => handleConfigChange(field.key, value)}>
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
          value={value}
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
          value={value}
          onChange={(e) => handleConfigChange(field.key, e.target.value)}
          placeholder={field.placeholder}
        />
      )
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure {nodeInfo.title}</DialogTitle>
          <DialogDescription>
            Set up the parameters for your {integrationName} node.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {nodeInfo.configSchema && nodeInfo.configSchema.length > 0 ? (
            nodeInfo.configSchema.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                {renderConfigField(field)}
              </div>
            ))
          ) : (
            <p className="text-slate-500 text-sm">This node has no configuration options.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 