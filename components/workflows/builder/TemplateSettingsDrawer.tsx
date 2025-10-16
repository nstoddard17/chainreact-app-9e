"use client"

import React from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import {
  Download,
  Trash2,
  Upload,
  Plus,
  FileSpreadsheet,
  ClipboardList,
  Hash,
  Layers,
  CheckCircle2,
} from "lucide-react"
import type {
  TemplateIntegrationSetup,
  AirtableIntegrationSetup,
  GoogleSheetsIntegrationSetup,
  TemplateSetupOverview,
  TemplateAsset,
} from "@/types/templateSetup"

interface TemplateDraftMetadata {
  primarySetupTarget: string | null
  setupOverview: TemplateSetupOverview | null
  integrationSetup: TemplateIntegrationSetup[]
  defaultFieldValues: Record<string, any>
  status: string
}

interface TemplatePublishedMetadata {
  primarySetupTarget: string | null
  setupOverview: TemplateSetupOverview | null
  integrationSetup: TemplateIntegrationSetup[]
  defaultFieldValues: Record<string, any>
  publishedAt?: string | null
}

interface TemplateSettingsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  metadata: TemplateDraftMetadata
  publishedMetadata?: TemplatePublishedMetadata | null
  onMetadataChange: (updates: Partial<TemplateDraftMetadata>) => void
  onSave: () => Promise<unknown> | unknown
  isSaving: boolean
  assets: TemplateAsset[]
  onAssetUpload: (file: File, options?: { name?: string; assetType?: string }) => Promise<TemplateAsset | null>
  onAssetDelete: (assetId: string) => Promise<void>
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready for Publish" },
  { value: "published", label: "Published" },
]

const PRIMARY_TARGET_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "airtable", label: "Airtable" },
  { value: "google_sheets", label: "Google Sheets" },
  { value: "gmail", label: "Gmail" },
  { value: "custom", label: "Custom" },
]

const DEFAULT_OVERVIEW: TemplateSetupOverview = {
  summary: "",
  sections: [],
  notes: "",
}

const AIRTABLE_FIELD_TYPES = [
  "singleLineText",
  "longText",
  "singleSelect",
  "multipleSelects",
  "number",
  "email",
  "url",
  "checkbox",
  "date",
  "phoneNumber",
  "multipleAttachments",
] as const

const deepClone = <T,>(value: T): T => {
  if (value === undefined || value === null) return value
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

export function TemplateSettingsDrawer({
  open,
  onOpenChange,
  metadata,
  publishedMetadata,
  onMetadataChange,
  onSave,
  isSaving,
  assets,
  onAssetUpload,
  onAssetDelete,
}: TemplateSettingsDrawerProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = React.useState("overview")
  const [defaultValuesText, setDefaultValuesText] = React.useState(
    JSON.stringify(metadata.defaultFieldValues ?? {}, null, 2)
  )
  const [defaultValuesError, setDefaultValuesError] = React.useState<string | null>(null)
  const [assetType, setAssetType] = React.useState("resource")
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const csvInputRef = React.useRef<HTMLInputElement>(null)
  const csvTargetTableIndex = React.useRef<number>(0)

  const overview = React.useMemo(
    () => metadata.setupOverview ?? deepClone(DEFAULT_OVERVIEW),
    [metadata.setupOverview]
  )

  const integrationSetup = React.useMemo(
    () => metadata.integrationSetup ?? [],
    [metadata.integrationSetup]
  )

  const airtableSetup = React.useMemo(() => {
    return integrationSetup.find((setup) => setup.type === "airtable") as AirtableIntegrationSetup | undefined
  }, [integrationSetup])

  const googleSheetsSetup = React.useMemo(() => {
    return integrationSetup.find((setup) => setup.type === "google_sheets") as GoogleSheetsIntegrationSetup | undefined
  }, [integrationSetup])

  React.useEffect(() => {
    setDefaultValuesText(JSON.stringify(metadata.defaultFieldValues ?? {}, null, 2))
    setDefaultValuesError(null)
  }, [metadata.defaultFieldValues])

  const handleDefaultValuesChange = (value: string) => {
    setDefaultValuesText(value)
    if (!value.trim()) {
      onMetadataChange({ defaultFieldValues: {} })
      setDefaultValuesError(null)
      return
    }

    try {
      const parsed = JSON.parse(value)
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Default values must be a JSON object")
      }
      onMetadataChange({ defaultFieldValues: parsed })
      setDefaultValuesError(null)
    } catch (error: any) {
      setDefaultValuesError(error.message || "Invalid JSON")
    }
  }

  const applyIntegrationSetupUpdate = (updater: (current: TemplateIntegrationSetup[]) => TemplateIntegrationSetup[]) => {
    const current = integrationSetup ?? []
    const next = updater(deepClone(current))
    onMetadataChange({ integrationSetup: next })
  }

  const ensureAirtableSetup = (): AirtableIntegrationSetup => {
    if (airtableSetup) return deepClone(airtableSetup)
    return {
      type: "airtable",
      baseName: "",
      instructions: [],
      tables: [],
    }
  }

  const ensureGoogleSheetsSetup = (): GoogleSheetsIntegrationSetup => {
    if (googleSheetsSetup) return deepClone(googleSheetsSetup)
    return {
      type: "google_sheets",
      spreadsheetName: "",
      instructions: [],
      sampleSheets: [],
      templateUrl: "",
    }
  }

  const handlePrimaryTargetChange = (value: string) => {
    onMetadataChange({ primarySetupTarget: value })
    if (value === "airtable" && !airtableSetup) {
      applyIntegrationSetupUpdate((current) => [...current, ensureAirtableSetup()])
    }
    if (value === "google_sheets" && !googleSheetsSetup) {
      applyIntegrationSetupUpdate((current) => [...current, ensureGoogleSheetsSetup()])
    }
  }

  const handleAddOverviewSection = () => {
    const sections = overview.sections ?? []
    const updatedOverview: TemplateSetupOverview = {
      ...overview,
      sections: [
        ...sections,
        {
          title: `Section ${sections.length + 1}`,
          description: "",
        },
      ],
    }
    onMetadataChange({ setupOverview: updatedOverview })
  }

  const handleOverviewSectionChange = (index: number, field: "title" | "description", value: string) => {
    const sections = overview.sections ?? []
    const updatedSections = sections.map((section, idx) =>
      idx === index ? { ...section, [field]: value } : section
    )
    const updatedOverview: TemplateSetupOverview = {
      ...overview,
      sections: updatedSections,
    }
    onMetadataChange({ setupOverview: updatedOverview })
  }

  const handleRemoveOverviewSection = (index: number) => {
    const sections = overview.sections ?? []
    const updatedSections = sections.filter((_, idx) => idx !== index)
    const updatedOverview: TemplateSetupOverview = {
      ...overview,
      sections: updatedSections,
    }
    onMetadataChange({ setupOverview: updatedOverview })
  }

  const handleAirtableBaseChange = (value: string) => {
    const next = ensureAirtableSetup()
    next.baseName = value
    applyIntegrationSetupUpdate((current) => {
      const index = current.findIndex((setup) => setup.type === "airtable")
      if (index === -1) return [...current, next]
      const updated = [...current]
      updated[index] = next
      return updated
    })
  }

  const handleAirtableInstructionsChange = (value: string) => {
    const instructions = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    const next = ensureAirtableSetup()
    next.instructions = instructions
    applyIntegrationSetupUpdate((current) => {
      const updated = [...current]
      const index = updated.findIndex((setup) => setup.type === "airtable")
      if (index === -1) updated.push(next)
      else updated[index] = next
      return updated
    })
  }

  const handleAirtableTableChange = (
    index: number,
    field: "tableName" | "description",
    value: string
  ) => {
    const next = ensureAirtableSetup()
    const tables = next.tables ?? []
    const updatedTables = tables.map((table, idx) =>
      idx === index ? { ...table, [field]: value } : table
    )
    next.tables = updatedTables
    applyIntegrationSetupUpdate((current) => {
      const updated = [...current]
      const setupIndex = updated.findIndex((setup) => setup.type === "airtable")
      if (setupIndex === -1) updated.push(next)
      else updated[setupIndex] = next
      return updated
    })
  }

  const handleAddAirtableTable = () => {
    const next = ensureAirtableSetup()
    const tables = next.tables ?? []
    next.tables = [
      ...tables,
      {
        tableName: `Table ${tables.length + 1}`,
        description: "",
        fields: [],
      },
    ]
    applyIntegrationSetupUpdate((current) => {
      const updated = [...current]
      const index = updated.findIndex((setup) => setup.type === "airtable")
      if (index === -1) updated.push(next)
      else updated[index] = next
      return updated
    })
  }

  const handleRemoveAirtableTable = (index: number) => {
    const next = ensureAirtableSetup()
    next.tables = (next.tables ?? []).filter((_, idx) => idx !== index)
    applyIntegrationSetupUpdate((current) => {
      const updated = [...current]
      const setupIndex = updated.findIndex((setup) => setup.type === "airtable")
      if (setupIndex === -1) return updated
      updated[setupIndex] = next
      return updated
    })
  }

  const handleAirtableFieldChange = (
    tableIndex: number,
    fieldIndex: number,
    key: "name" | "type" | "description",
    value: string
  ) => {
    const next = ensureAirtableSetup()
    const tables = next.tables ?? []
    const table = tables[tableIndex]
    if (!table) return
    const fields = table.fields ?? []
    const updatedFields = fields.map((field, idx) =>
      idx === fieldIndex ? { ...field, [key]: value } : field
    )
    tables[tableIndex] = { ...table, fields: updatedFields }
    next.tables = tables
    applyIntegrationSetupUpdate((current) => {
      const updated = [...current]
      const setupIndex = updated.findIndex((setup) => setup.type === "airtable")
      if (setupIndex === -1) updated.push(next)
      else updated[setupIndex] = next
      return updated
    })
  }

  const handleAddAirtableField = (tableIndex: number) => {
    const next = ensureAirtableSetup()
    const tables = next.tables ?? []
    const table = tables[tableIndex]
    if (!table) return
    const fields = table.fields ?? []
    tables[tableIndex] = {
      ...table,
      fields: [
        ...fields,
        {
          name: `Field ${fields.length + 1}`,
          type: "singleLineText",
          description: "",
        },
      ],
    }
    next.tables = tables
    applyIntegrationSetupUpdate((current) => {
      const updated = [...current]
      const setupIndex = updated.findIndex((setup) => setup.type === "airtable")
      if (setupIndex === -1) updated.push(next)
      else updated[setupIndex] = next
      return updated
    })
  }

  const handleRemoveAirtableField = (tableIndex: number, fieldIndex: number) => {
    const next = ensureAirtableSetup()
    const tables = next.tables ?? []
    const table = tables[tableIndex]
    if (!table) return
    const fields = table.fields ?? []
    tables[tableIndex] = {
      ...table,
      fields: fields.filter((_, idx) => idx !== fieldIndex),
    }
    next.tables = tables
    applyIntegrationSetupUpdate((current) => {
      const updated = [...current]
      const setupIndex = updated.findIndex((setup) => setup.type === "airtable")
      if (setupIndex === -1) updated.push(next)
      else updated[setupIndex] = next
      return updated
    })
  }

  const handleCsvExtractFields = async (file: File, tableIndex = 0) => {
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      if (!lines.length) {
        toast({
          title: "CSV is empty",
          description: "Upload a CSV with a header row to generate fields.",
          variant: "destructive",
        })
        return
      }
      const headerLine = lines[0]
      const columns = headerLine.split(",").map((column) => column.trim()).filter(Boolean)
      if (!columns.length) {
        toast({
          title: "No columns found",
          description: "The uploaded CSV must contain a header row.",
          variant: "destructive",
        })
        return
      }
      const inferredFields = columns.map((name) => ({
        name,
        type: "singleLineText",
        description: "",
      }))
      const next = ensureAirtableSetup()
      const tables = next.tables ?? []
      const targetTable = tables[tableIndex] ?? {
        tableName: file.name.replace(/\.[^.]+$/, ""),
        description: "",
        fields: [],
      }
      tables[tableIndex] = {
        ...targetTable,
        fields: inferredFields,
      }
      next.tables = tables
      applyIntegrationSetupUpdate((current) => {
        const updated = [...current]
        const setupIndex = updated.findIndex((setup) => setup.type === "airtable")
        if (setupIndex === -1) updated.push(next)
        else updated[setupIndex] = next
        return updated
      })
      toast({
        title: "Fields generated",
        description: `Added ${inferredFields.length} fields from ${file.name}.`,
      })
    } catch (error: any) {
      toast({
        title: "CSV import failed",
        description: error?.message || "Unable to read the CSV file.",
        variant: "destructive",
      })
    }
  }

  const handleGoogleSheetChange = (field: keyof GoogleSheetsIntegrationSetup, value: any) => {
    const next = ensureGoogleSheetsSetup()
    ;(next as any)[field] = value
    applyIntegrationSetupUpdate((current) => {
      const updated = [...current]
      const index = updated.findIndex((setup) => setup.type === "google_sheets")
      if (index === -1) updated.push(next)
      else updated[index] = next
      return updated
    })
  }

  const handleAddSampleSheet = () => {
    const setup = ensureGoogleSheetsSetup()
    const sheets = setup.sampleSheets ?? []
    setup.sampleSheets = [
      ...sheets,
      {
        sheetName: `Sheet ${sheets.length + 1}`,
        description: "",
        downloadUrl: "",
      },
    ]
    handleGoogleSheetChange("sampleSheets", setup.sampleSheets)
  }

  const handleSampleSheetChange = (index: number, field: "sheetName" | "description" | "downloadUrl", value: string) => {
    const setup = ensureGoogleSheetsSetup()
    const sheets = setup.sampleSheets ?? []
    const updated = sheets.map((sheet, idx) => (idx === index ? { ...sheet, [field]: value } : sheet))
    handleGoogleSheetChange("sampleSheets", updated)
  }

  const handleRemoveSampleSheet = (index: number) => {
    const setup = ensureGoogleSheetsSetup()
    const sheets = setup.sampleSheets ?? []
    const updated = sheets.filter((_, idx) => idx !== index)
    handleGoogleSheetChange("sampleSheets", updated)
  }

  const handleSaveDraft = async () => {
    try {
      await onSave()
      toast({
        title: "Template draft saved",
        description: "All template settings are up to date.",
      })
    } catch (error: any) {
      toast({
        title: "Failed to save draft",
        description: error?.message || "Unable to save the template draft.",
        variant: "destructive",
      })
    }
  }

  const handleAssetUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleAssetFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files?.length) return
    const file = files[0]
    try {
      await onAssetUpload(file, { name: file.name, assetType })
    } catch (error) {
      // Upload errors are surfaced by the parent handler via toast
    } finally {
      event.target.value = ""
    }
  }

  const handleCsvFileChange = async (event: React.ChangeEvent<HTMLInputElement>, tableIndex = 0) => {
    const files = event.target.files
    if (!files?.length) return
    const file = files[0]
    try {
      await handleCsvExtractFields(file, tableIndex)
    } finally {
      event.target.value = ""
    }
  }

  const handleAssetRemove = async (assetId: string) => {
    try {
      await onAssetDelete(assetId)
    } catch (error) {
      // Deletion errors already surface a toast via the parent handler
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-3xl w-full">
        <SheetHeader className="mb-4">
          <SheetTitle>Template Settings</SheetTitle>
          <SheetDescription>
            Configure the setup guide, overview, default values, and supporting assets for this template.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between mb-4">
          <Badge variant="outline" className="capitalize">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            {metadata.status || "draft"}
          </Badge>
          <Button onClick={handleSaveDraft} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save Draft"}
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-[calc(100%-4rem)]">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="setup">Setup Guide</TabsTrigger>
            <TabsTrigger value="defaults">Defaults</TabsTrigger>
            <TabsTrigger value="assets">Assets</TabsTrigger>
          </TabsList>
          <div className="mt-4 flex-1 overflow-hidden">
            <TabsContent value="overview" className="h-full">
              <ScrollArea className="h-full pr-4">
                <div className="space-y-6 pb-8">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 block">
                        Template status
                      </label>
                      <Select
                        value={metadata.status || "draft"}
                        onValueChange={(value) => onMetadataChange({ status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 block">
                        Primary integration
                      </label>
                      <Select
                        value={metadata.primarySetupTarget ?? ""}
                        onValueChange={handlePrimaryTargetChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select integration" />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIMARY_TARGET_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Overview summary
                    </label>
                    <Textarea
                      placeholder="Briefly explain what this template does and any prerequisites."
                      value={overview.summary ?? ""}
                      onChange={(event) =>
                        onMetadataChange({
                          setupOverview: {
                            ...overview,
                            summary: event.target.value,
                          },
                        })
                      }
                      rows={4}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Overview sections
                      </label>
                      <Button variant="outline" size="sm" onClick={handleAddOverviewSection}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add section
                      </Button>
                    </div>
                    {(overview.sections ?? []).length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Add sections to highlight important steps or prerequisites for this template.
                      </p>
                    )}

                    <div className="space-y-4">
                      {(overview.sections ?? []).map((section, index) => (
                        <div
                          key={`${section.title}-${index}`}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              Section {index + 1}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveOverviewSection(index)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <Input
                            placeholder="Section title"
                            value={section.title ?? ""}
                            onChange={(event) => handleOverviewSectionChange(index, "title", event.target.value)}
                          />
                          <Textarea
                            placeholder="Describe what happens in this part of the template"
                            value={section.description ?? ""}
                            onChange={(event) =>
                              handleOverviewSectionChange(index, "description", event.target.value)
                            }
                            rows={3}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {publishedMetadata?.publishedAt && (
                    <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3 text-xs text-muted-foreground">
                      Last published on{" "}
                      {new Date(publishedMetadata.publishedAt).toLocaleString()}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="setup" className="h-full">
              <ScrollArea className="h-full pr-4">
                <div className="space-y-6 pb-8">
                  {metadata.primarySetupTarget === "airtable" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Airtable base name
                        </label>
                        <Input
                          placeholder="Customer Success Automation"
                          value={airtableSetup?.baseName ?? ""}
                          onChange={(event) => handleAirtableBaseChange(event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Setup instructions
                          </label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAirtableInstructionsChange("")}
                          >
                            Clear
                          </Button>
                        </div>
                        <Textarea
                          placeholder="Enter one instruction per line"
                          value={(airtableSetup?.instructions ?? []).join("\n")}
                          onChange={(event) => handleAirtableInstructionsChange(event.target.value)}
                          rows={4}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Tables
                        </label>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAddAirtableTable}
                          >
                            <Layers className="h-4 w-4 mr-2" />
                            Add table
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              csvTargetTableIndex.current = 0
                              csvInputRef.current?.click()
                            }}
                          >
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Import CSV
                          </Button>
                          <input
                            ref={csvInputRef}
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(event) => handleCsvFileChange(event, csvTargetTableIndex.current)}
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        {(airtableSetup?.tables ?? []).length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            Define the tables that must exist in the Airtable base. You can manually add fields
                            or upload a CSV to generate them from column headers.
                          </p>
                        )}

                        {(airtableSetup?.tables ?? []).map((table, tableIndex) => (
                          <div
                            key={`${table.tableName}-${tableIndex}`}
                            className="rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Hash className="h-4 w-4 text-blue-500" />
                                <Input
                                  placeholder="Table name"
                                  value={table.tableName ?? ""}
                                  onChange={(event) =>
                                    handleAirtableTableChange(tableIndex, "tableName", event.target.value)
                                  }
                                />
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveAirtableTable(tableIndex)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <Textarea
                              placeholder="Describe the purpose of this table"
                              value={table.description ?? ""}
                              onChange={(event) =>
                                handleAirtableTableChange(tableIndex, "description", event.target.value)
                              }
                              rows={2}
                            />
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                                  Fields
                                </span>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      csvTargetTableIndex.current = tableIndex
                                      csvInputRef.current?.click()
                                    }}
                                  >
                                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                                    Import fields
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleAddAirtableField(tableIndex)}
                                  >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add field
                                  </Button>
                                  <input
                                    type="file"
                                    accept=".csv"
                                    className="hidden"
                                    onChange={(event) => handleCsvFileChange(event, tableIndex)}
                                  />
                                </div>
                              </div>
                              <div className="space-y-2">
                                {(table.fields ?? []).map((field, fieldIndex) => (
                                  <div
                                    key={`${field.name}-${fieldIndex}`}
                                    className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_150px_auto]"
                                  >
                                    <Input
                                      placeholder="Field name"
                                      value={field.name ?? ""}
                                      onChange={(event) =>
                                        handleAirtableFieldChange(tableIndex, fieldIndex, "name", event.target.value)
                                      }
                                    />
                                    <Select
                                      value={field.type ?? "singleLineText"}
                                      onValueChange={(value) =>
                                        handleAirtableFieldChange(tableIndex, fieldIndex, "type", value)
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {AIRTABLE_FIELD_TYPES.map((type) => (
                                          <SelectItem key={type} value={type}>
                                            {type}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <div className="flex items-center gap-2">
                                      <Textarea
                                        placeholder="Notes"
                                        value={field.description ?? ""}
                                        onChange={(event) =>
                                          handleAirtableFieldChange(
                                            tableIndex,
                                            fieldIndex,
                                            "description",
                                            event.target.value,
                                          )
                                        }
                                        rows={1}
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleRemoveAirtableField(tableIndex, fieldIndex)}
                                        className="text-muted-foreground hover:text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {metadata.primarySetupTarget === "google_sheets" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Spreadsheet name
                        </label>
                        <Input
                          placeholder="Social Content Calendar"
                          value={googleSheetsSetup?.spreadsheetName ?? ""}
                          onChange={(event) =>
                            handleGoogleSheetChange("spreadsheetName", event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Template link
                        </label>
                        <Input
                          placeholder="https://docs.google.com/spreadsheets/..."
                          value={googleSheetsSetup?.templateUrl ?? ""}
                          onChange={(event) => handleGoogleSheetChange("templateUrl", event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Setup instructions
                        </label>
                        <Textarea
                          placeholder="Enter one instruction per line"
                          value={(googleSheetsSetup?.instructions ?? []).join("\n")}
                          onChange={(event) =>
                            handleGoogleSheetChange(
                              "instructions",
                              event.target.value
                                .split(/\r?\n/)
                                .map((line) => line.trim())
                                .filter(Boolean)
                            )
                          }
                          rows={4}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Sample data sheets
                          </label>
                          <Button variant="outline" size="sm" onClick={handleAddSampleSheet}>
                            <ClipboardList className="h-4 w-4 mr-2" />
                            Add sample
                          </Button>
                        </div>
                        {(googleSheetsSetup?.sampleSheets ?? []).length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            Link to sample CSVs or sheets that users can import to get started quickly.
                          </p>
                        )}
                        <div className="space-y-3">
                          {(googleSheetsSetup?.sampleSheets ?? []).map((sheet, index) => (
                            <div
                              key={`${sheet.sheetName}-${index}`}
                              className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                                  Sample {index + 1}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveSampleSheet(index)}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <Input
                                placeholder="Sheet name"
                                value={sheet.sheetName ?? ""}
                                onChange={(event) =>
                                  handleSampleSheetChange(index, "sheetName", event.target.value)
                                }
                              />
                              <Textarea
                                placeholder="Describe what this sample contains"
                                value={sheet.description ?? ""}
                                onChange={(event) =>
                                  handleSampleSheetChange(index, "description", event.target.value)
                                }
                                rows={2}
                              />
                              <Input
                                placeholder="https://..."
                                value={sheet.downloadUrl ?? ""}
                                onChange={(event) =>
                                  handleSampleSheetChange(index, "downloadUrl", event.target.value)
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {!metadata.primarySetupTarget && (
                    <p className="text-sm text-muted-foreground">
                      Select a primary integration to begin customizing the setup guide.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="defaults" className="h-full">
              <div className="flex flex-col h-full">
                <p className="text-sm text-muted-foreground mb-4">
                  Provide default values for nodes or fields in the workflow. These will be applied when a user
                  creates a workflow from this template.
                </p>
                <Textarea
                  className="flex-1 font-mono text-sm"
                  value={defaultValuesText}
                  onChange={(event) => handleDefaultValuesChange(event.target.value)}
                />
                {defaultValuesError && (
                  <p className="mt-2 text-sm text-destructive">{defaultValuesError}</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="assets" className="h-full">
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Select value={assetType} onValueChange={setAssetType}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Asset type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="resource">Resource</SelectItem>
                        <SelectItem value="csv">CSV</SelectItem>
                        <SelectItem value="guide">Guide</SelectItem>
                        <SelectItem value="template">Template</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={handleAssetUploadClick}>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload asset
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleAssetFileChange}
                    />
                  </div>
                </div>
                <ScrollArea className="flex-1 border rounded-lg bg-slate-50 dark:bg-slate-900/30 p-3">
                  <div className="space-y-3">
                    {assets.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No assets uploaded yet. Add CSVs, documentation, or templates that help users set up the workflow
                        quickly.
                      </p>
                    )}
                    {assets.map((asset) => (
                      <div
                        key={asset.id}
                        className="flex items-center justify-between rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium">{asset.name}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span className="capitalize">{asset.asset_type}</span>
                            <span>{asset.mime_type}</span>
                            <span>{new Date(asset.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" asChild>
                            <a href={asset.download_url} target="_blank" rel="noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAssetRemove(asset.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
