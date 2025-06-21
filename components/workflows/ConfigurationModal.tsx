"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { ConfigField, NodeComponent } from "@/lib/workflows/availableNodes"
import { useIntegrationStore } from "@/stores/integrationStore"

interface ConfigurationModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: Record<string, any>) => void
  nodeInfo: NodeComponent | null
  integrationName: string
}

export default function ConfigurationModal({ isOpen, onClose, onSave, nodeInfo, integrationName }: ConfigurationModalProps) {
  const [config, setConfig] = useState<Record<string, any>>({})
  const { loadIntegrationData, integrationData } = useIntegrationStore()
  const [dynamicOptions, setDynamicOptions] = useState<
    Record<string, { value: string; label: string }[]>
  >({})
  const [loadingDynamic, setLoadingDynamic] = useState(false)

  useEffect(() => {
    if (isOpen && nodeInfo) {
      // Initialize config with default or existing values
      const initialConfig = nodeInfo.configSchema?.reduce(
        (acc, field) => {
          acc[field.name] = "" // Set a default empty value
          return acc
        },
        {} as Record<string, any>,
      )
      setConfig(initialConfig || {})

      // Fetch dynamic data if needed
      const fetchDynamicData = async () => {
        setLoadingDynamic(true)
        const newOptions: Record<string, { value: string; label: string }[]> = {}
        for (const field of nodeInfo.configSchema || []) {
          if (field.dynamic === "slack-channels" && nodeInfo.providerId) {
            const data = await loadIntegrationData(nodeInfo.providerId)
            if (data && data.channels) {
              newOptions[field.name] = data.channels.map((ch: any) => ({
                value: ch.id,
                label: `#${ch.name}`,
              }))
            }
          } else if (
            field.dynamic === "google-contacts" &&
            nodeInfo.providerId
          ) {
            const data = await loadIntegrationData(nodeInfo.providerId)
            if (data && data.contacts) {
              newOptions[field.name] = data.contacts.map((c: any) => ({
                value: c.email,
                label: `${c.name} (${c.email})`,
              }))
            }
          } else if (
            field.dynamic === "google-calendars" &&
            nodeInfo.providerId
          ) {
            const data = await loadIntegrationData(nodeInfo.providerId)
            if (data && data.calendars) {
              newOptions[field.name] = data.calendars.map((cal: any) => ({
                value: cal.id,
                label: cal.summary,
              }))
            }
          } else if (
            (field.dynamic === "google-drive-folders" ||
              field.dynamic === "google-drive-files") &&
            nodeInfo.providerId
          ) {
            const data = await loadIntegrationData(nodeInfo.providerId)
            if (data && data.files) {
              const items =
                field.dynamic === "google-drive-folders"
                  ? data.files.filter((f: any) => f.type === "folder")
                  : data.files
              newOptions[field.name] = items.map((item: any) => ({
                value: item.id,
                label: item.name,
              }))
            }
          }
        }
        setDynamicOptions(newOptions)
        setLoadingDynamic(false)
      }

      fetchDynamicData()
    }
  }, [isOpen, nodeInfo, loadIntegrationData])

  if (!nodeInfo) {
    return null
  }

  const handleSave = () => {
    onSave(config)
    onClose()
  }

  const renderField = (field: ConfigField) => {
    const value = config[field.name] || ""

    const handleChange = (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setConfig({ ...config, [field.name]: e.target.value })
    }

    const handleSelectChange = (newValue: string) => {
      setConfig({ ...config, [field.name]: newValue })
    }

    switch (field.type) {
      case "select":
        const options = dynamicOptions[field.name] || field.options || []
        return (
          <Select onValueChange={handleSelectChange} value={value}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {loadingDynamic && <SelectItem value="loading" disabled>Loading...</SelectItem>}
              {(options as any[]).map((option: any) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      case "textarea":
        return (
          <Textarea
            id={field.name}
            value={value}
            onChange={handleChange}
            placeholder={field.placeholder}
            required={field.required}
          />
        )
      default:
        return (
          <Input
            id={field.name}
            type={field.type}
            value={value}
            onChange={handleChange}
            placeholder={field.placeholder}
            required={field.required}
          />
        )
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Configure {nodeInfo?.title} on {integrationName}
          </DialogTitle>
          <DialogDescription>{nodeInfo?.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {nodeInfo?.configSchema?.map((field) => (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={field.name}>{field.label}</Label>
              {renderField(field)}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 