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
import { AlertCircle } from "lucide-react"

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
  const [errors, setErrors] = useState<Record<string, string>>({})
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
      setErrors({}) // Clear errors when opening modal

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

  const validateRequiredFields = (): boolean => {
    const newErrors: Record<string, string> = {}
    let isValid = true

    if (nodeInfo.configSchema) {
      for (const field of nodeInfo.configSchema) {
        if (field.required) {
          const value = config[field.name]
          if (!value || (typeof value === 'string' && value.trim() === '')) {
            newErrors[field.name] = `${field.label} is required`
            isValid = false
          }
        }
      }
    }

    setErrors(newErrors)
    return isValid
  }

  const handleSave = () => {
    if (validateRequiredFields()) {
      onSave(config)
      onClose()
    }
  }

  const renderField = (field: ConfigField) => {
    const value = config[field.name] || ""
    const hasError = !!errors[field.name]

    const handleChange = (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      const newValue = e.target.value
      setConfig({ ...config, [field.name]: newValue })
      
      // Clear error when user starts typing
      if (hasError && newValue.trim() !== '') {
        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors[field.name]
          return newErrors
        })
      }
    }

    const handleSelectChange = (newValue: string) => {
      setConfig({ ...config, [field.name]: newValue })
      
      // Clear error when user selects a value
      if (hasError && newValue) {
        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors[field.name]
          return newErrors
        })
      }
    }

    const inputClassName = `${hasError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`

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
            <div className="space-y-1">
              <div className={hasError ? 'ring-2 ring-red-500 rounded-md' : ''}>
                <Combobox
                  options={finalOptions}
                  value={value}
                  onChange={handleSelectChange}
                  placeholder={field.placeholder}
                  searchPlaceholder="Search or type..."
                  emptyPlaceholder={loadingDynamic ? "Loading..." : "No results found."}
                  disabled={loadingDynamic}
                />
              </div>
              {hasError && (
                <div className="flex items-center gap-1 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4" />
                  {errors[field.name]}
                </div>
              )}
            </div>
          )
        }

        return (
          <div className="space-y-1">
            <Select onValueChange={handleSelectChange} value={value} disabled={loadingDynamic}>
              <SelectTrigger className={inputClassName}>
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
            {hasError && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {errors[field.name]}
              </div>
            )}
          </div>
        )
      case "textarea":
        return (
          <div className="space-y-1">
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
              data-1p-ignore="true"
              data-bwignore="true"
              className={inputClassName}
            />
            {hasError && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {errors[field.name]}
              </div>
            )}
          </div>
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
          <div className="space-y-1">
            <EmailAutocomplete
              value={value}
              onChange={handleSelectChange}
              suggestions={emailSuggestions}
              placeholder={field.placeholder}
              disabled={loadingDynamic}
              isLoading={loadingDynamic}
              multiple={field.name === "to"} // Allow multiple recipients for "to" field
              className={inputClassName}
            />
            {hasError && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {errors[field.name]}
              </div>
            )}
          </div>
        )
      default:
        return (
          <div className="space-y-1">
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
              data-1p-ignore="true"
              data-bwignore="true"
              className={inputClassName}
            />
            {hasError && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {errors[field.name]}
              </div>
            )}
          </div>
        )
    }
  }

  const hasRequiredFields = nodeInfo.configSchema?.some(field => field.required) || false
  const hasErrors = Object.keys(errors).length > 0

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
            <div className="space-y-4 py-4 max-h-96 overflow-y-auto pr-2" style={{ paddingRight: '8px' }}>
              {nodeInfo?.configSchema?.map((field) => (
                <div key={field.name} className="space-y-2" style={{ marginRight: '4px' }}>
                  <Label htmlFor={field.name}>
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  <div style={{ paddingRight: '4px' }}>
                    {renderField(field)}
                  </div>
                </div>
              ))}
            </div>
            
            {hasRequiredFields && (
              <div className="text-xs text-muted-foreground px-1">
                * Required fields must be filled out before saving
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={loadingDynamic || hasErrors}
                className={hasErrors ? 'opacity-50 cursor-not-allowed' : ''}
              >
                Save Configuration
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
