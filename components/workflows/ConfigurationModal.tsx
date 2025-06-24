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
import { Combobox } from "@/components/ui/combobox"
import { EmailAutocomplete } from "@/components/ui/email-autocomplete"
import { ConfigurationLoadingScreen } from "@/components/ui/loading-screen"

interface ConfigurationModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: Record<string, any>) => void
  nodeInfo: NodeComponent | null
  integrationName: string
  initialData?: Record<string, any>
}

export default function ConfigurationModal({
  isOpen,
  onClose,
  onSave,
  nodeInfo,
  integrationName,
  initialData = {},
}: ConfigurationModalProps) {
  const [config, setConfig] = useState<Record<string, any>>(initialData)
  const { loadIntegrationData, getIntegrationByProvider } = useIntegrationStore()
  const [dynamicOptions, setDynamicOptions] = useState<
    Record<string, { value: string; label: string }[]>
  >({})
  const [loadingDynamic, setLoadingDynamic] = useState(false)

  useEffect(() => {
    if (isOpen && nodeInfo) {
      // Initialize config with default or existing values
      const initialConfig =
        nodeInfo.configSchema?.reduce(
          (acc, field) => {
            acc[field.name] = initialData[field.name] || "" // Use initialData or default
            return acc
          },
          {} as Record<string, any>,
        ) || {}
      setConfig(initialConfig)

      // Fetch dynamic data if needed
      const fetchDynamicData = async () => {
        if (!nodeInfo?.providerId) return

        const integration = getIntegrationByProvider(nodeInfo.providerId)
        if (!integration) return

        setLoadingDynamic(true)
        const newOptions: Record<string, { value: string; label: string }[]> = {}
        for (const field of nodeInfo.configSchema || []) {
          if (field.dynamic === "slack-channels") {
            const data = await loadIntegrationData(
              nodeInfo.providerId,
              integration.id,
            )
            if (data) {
              newOptions[field.name] = data.map((ch: any) => ({
                value: ch.id,
                label: `#${ch.name}`,
              }))
            }
          } else if (field.dynamic === "google-contacts") {
            const data = await loadIntegrationData(
              nodeInfo.providerId,
              integration.id,
            )
            if (data) {
              newOptions[field.name] = data.map((c: any) => ({
                value: c.email,
                label: `${c.name} (${c.email})`,
              }))
            }
          } else if (field.dynamic === "gmail-recent-recipients") {
            const data = await loadIntegrationData(
              "gmail-recent-recipients",
              integration.id,
            )
            if (data) {
              newOptions[field.name] = data.map((recipient: any) => ({
                value: recipient.email,
                label: recipient.label,
                email: recipient.email,
                name: recipient.name,
              }))
            }
          } else if (field.dynamic === "gmail-enhanced-recipients") {
            const data = await loadIntegrationData(
              "gmail-enhanced-recipients",
              integration.id,
            )
            if (data) {
              newOptions[field.name] = data.map((recipient: any) => ({
                value: recipient.value,
                label: recipient.label,
                email: recipient.email,
                name: recipient.name,
                type: recipient.type,
                isGroup: recipient.isGroup,
                groupId: recipient.groupId,
                members: recipient.members,
              }))
            }
          } else if (field.dynamic === "gmail-contact-groups") {
            const data = await loadIntegrationData(
              "gmail-contact-groups",
              integration.id,
            )
            if (data) {
              newOptions[field.name] = data.map((group: any) => ({
                value: `@${group.name}`,
                label: `📧 ${group.name} (${group.memberCount} members)`,
                email: `@${group.name}`,
                name: group.name,
                type: 'contact_group',
                isGroup: true,
                groupId: group.id,
                members: group.emails,
              }))
            }
          } else if (field.dynamic === "google-calendars") {
            const data = await loadIntegrationData(
              nodeInfo.providerId,
              integration.id,
            )
            if (data) {
              newOptions[field.name] = data.map((cal: any) => ({
                value: cal.id,
                label: cal.summary,
              }))
            }
          } else if (
            field.dynamic === "google-drive-folders" ||
            field.dynamic === "google-drive-files"
          ) {
            const data = await loadIntegrationData(
              nodeInfo.providerId,
              integration.id,
            )
            if (data) {
              const items =
                field.dynamic === "google-drive-folders"
                  ? data.filter((f: any) => f.type === "folder")
                  : data
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
  }, [isOpen, nodeInfo, loadIntegrationData, getIntegrationByProvider, initialData])

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
        let selectOptions: { value: string; label: string }[] | undefined = dynamicOptions[field.name];

        if (!selectOptions && field.options) {
          if (field.options.every((opt): opt is string => typeof opt === 'string')) {
            // It's a string array
            selectOptions = (field.options as string[]).map(option => ({
              value: option,
              label: option.charAt(0).toUpperCase() + option.slice(1)
            }));
          } else {
            // It's already an array of { value, label }
            selectOptions = field.options as { value: string; label: string }[];
          }
        }

        const finalOptions = selectOptions || [];
        
        if (field.dynamic) {
          return (
            <Combobox
              options={finalOptions}
              value={value}
              onChange={handleSelectChange}
              placeholder={field.placeholder}
              searchPlaceholder="Search or type..."
              emptyPlaceholder={loadingDynamic ? "Loading..." : "No results found."}
              disabled={loadingDynamic}
            />
          )
        }

        return (
          <Select onValueChange={handleSelectChange} value={value} disabled={loadingDynamic}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {loadingDynamic && <SelectItem value="loading" disabled>Loading...</SelectItem>}
              {finalOptions.map((option) => (
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
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            data-form-type="other"
            data-lpignore="true"
          />
        )
      case "email-autocomplete":
        const emailOptions = dynamicOptions[field.name] || []
        const emailSuggestions = emailOptions.map((opt: any) => ({
          value: opt.value,
          label: opt.label,
          email: opt.email || opt.value,
          name: opt.name,
          type: opt.type,
          isGroup: opt.isGroup,
          groupId: opt.groupId,
          members: opt.members
        }))
        return (
          <EmailAutocomplete
            value={value}
            onChange={handleSelectChange}
            suggestions={emailSuggestions}
            placeholder={field.placeholder}
            disabled={loadingDynamic}
            isLoading={loadingDynamic}
            multiple={field.name === "to"} // Allow multiple recipients for "to" field
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
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            data-form-type="other"
            data-lpignore="true"
          />
        )
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Configure {nodeInfo?.title} on {integrationName}
          </DialogTitle>
          <DialogDescription>{nodeInfo?.description}</DialogDescription>
        </DialogHeader>
        
        {loadingDynamic ? (
          <ConfigurationLoadingScreen integrationName={integrationName} />
        ) : (
          // Configuration form once data is loaded
          <>
            <div className="space-y-4 py-4 max-h-96 overflow-y-auto">
              {nodeInfo?.configSchema?.map((field) => (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={field.name}>
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  {renderField(field)}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={loadingDynamic}>
                Save Configuration
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
