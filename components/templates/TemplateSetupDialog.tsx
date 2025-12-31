"use client"

import React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Table2, FileSpreadsheet, ExternalLink, Download } from "lucide-react"
import {
  getRequirementDisplay,
  normalizeOverviewNotes,
  resolvePrimaryTargetLabel,
  type RequirementLike,
} from "@/lib/templates/setupFormatting"
import type {
  TemplateSetupRequirement,
  AirtableSetupRequirement,
  GoogleSheetsSetupRequirement,
  TemplateSetupData,
} from "./AirtableSetupPanel"

interface TemplateSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: TemplateSetupData | null
}

export function TemplateSetupDialog({
  open,
  onOpenChange,
  data,
}: TemplateSetupDialogProps) {
  if (!data || !data.requirements || data.requirements.length === 0) {
    return null
  }

  const requirements = data.requirements
  const overview = data.overview ?? null
  const assets = data.assets ?? []
  const requirementsList = requirements as RequirementLike[]
  const primaryTargetLabel =
    resolvePrimaryTargetLabel(data.primarySetupTarget ?? null, requirementsList) || "Template"
  const overviewNotes = normalizeOverviewNotes(overview?.notes)

  const handleOpenPanel = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("airtable-panel-reopen"))
    }
    onOpenChange(false)
  }

  const airtableRequirement = requirements.find((req) => req.type === "airtable") as
    | AirtableSetupRequirement
    | undefined

  const otherRequirements = requirements.filter((req) => req.type !== "airtable")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-100 dark:bg-orange-900/50 p-2.5">
              <Table2 className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <DialogTitle className="text-2xl font-bold">{primaryTargetLabel} Setup Overview</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            Review the checklist and resources before running this template to ensure all prerequisites are ready.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-5">
          <div className="rounded-xl border border-orange-300 dark:border-orange-700 bg-gradient-to-r from-orange-50 to-orange-100/50 dark:from-orange-950/50 dark:to-orange-900/30 px-4 py-3.5 text-sm text-orange-900 dark:text-orange-100 shadow-sm">
            <p className="font-medium">
              💡 Access this checklist anytime via the shield icon in the top right corner of the builder toolbar.
            </p>
          </div>

          {overview?.summary && (
            <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-white/80 dark:bg-orange-950/30 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
              {overview.summary}
            </div>
          )}

          {overview?.sections && overview.sections.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Overview Checklist</h4>
              <div className="space-y-3">
                {overview.sections.map((section, index) => (
                  <div
                    key={`${section.title}-${index}`}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm text-slate-900 dark:text-slate-100">
                          {section.title || `Step ${index + 1}`}
                        </p>
                        {section.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                            {section.description}
                          </p>
                        )}
                        {section.items && section.items.length > 0 && (
                          <ul className="mt-2 space-y-1 list-disc pl-4 text-xs text-slate-600 dark:text-slate-400">
                            {section.items.map((item, itemIndex) => (
                              <li key={`${section.title ?? 'section'}-${itemIndex}`}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">Step {index + 1}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {overviewNotes.length > 0 && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              <ul className="list-disc space-y-1 pl-5">
                {overviewNotes.map((note, index) => (
                  <li key={`overview-note-${index}`}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {airtableRequirement && (
            <AirtableSummary requirement={airtableRequirement} />
          )}

          {otherRequirements.map((requirement, index) => (
            <RequirementSummary key={`${requirement.type}-${index}`} requirement={requirement} />
          ))}

          {assets.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Supporting Assets</h4>
              <ul className="space-y-2">
                {assets.map((asset) => (
                  <li
                    key={asset.id}
                    className="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  >
                    <div className="pr-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{asset.name}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
                        <Badge variant="outline" className="text-[11px] capitalize">
                          {asset.asset_type.replace(/[_-]/g, " ")}
                        </Badge>
                        {asset.mime_type && <span>{asset.mime_type}</span>}
                        <span>{new Date(asset.created_at).toLocaleDateString()}</span>
                      </div>
                      {asset.metadata?.description && (
                        <p className="text-xs text-muted-foreground mt-1">{asset.metadata.description}</p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a href={asset.download_url} target="_blank" rel="noreferrer">
                        <Download className="h-4 w-4 mr-2" /> Download
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-5 border-t border-slate-200 dark:border-slate-700">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-medium">
            Dismiss
          </Button>
          <Button onClick={handleOpenPanel} className="font-medium shadow-sm">
            View {primaryTargetLabel} Panel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface AirtableSummaryProps {
  requirement: AirtableSetupRequirement
}

function AirtableSummary({ requirement }: AirtableSummaryProps) {
  return (
    <div className="rounded-xl border border-orange-200/80 bg-gradient-to-br from-orange-50/80 to-white dark:from-orange-950/30 dark:to-slate-900/30 p-5 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-semibold text-lg text-slate-900 dark:text-slate-100">
            Airtable Base: {requirement.baseName}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Create this base with the tables and fields listed below before enabling the workflow.
          </p>
        </div>
        <Badge variant="secondary" className="font-medium">
          {requirement.tables.length} {requirement.tables.length === 1 ? 'table' : 'tables'}
        </Badge>
      </div>
      <Separator className="bg-slate-200 dark:bg-slate-700" />
      <div className="space-y-3">
        {requirement.tables.map((table, index) => (
          <div
            key={`${table.tableName}-${index}`}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-base text-slate-900 dark:text-slate-100">{table.tableName}</p>
              <Badge variant="outline" className="text-xs font-normal">
                {table.fields.length} field{table.fields.length === 1 ? '' : 's'}
              </Badge>
            </div>
            {table.description && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{table.description}</p>
            )}
            <ul className="space-y-2 text-xs">
              {table.fields.map((field, fieldIndex) => (
                <li key={`${field.name}-${fieldIndex}`} className="leading-relaxed p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{field.name}</span>
                  <span className="mx-1.5 text-slate-400">•</span>
                  <Badge variant="secondary" className="text-xs font-normal inline">
                    {field.type.replace(/([A-Z])/g, ' $1').trim()}
                  </Badge>
                  {field.options && field.options.length > 0 && (
                    <span className="ml-2 text-slate-600 dark:text-slate-400">({field.options.join(', ')})</span>
                  )}
                  {field.description && (
                    <div className="mt-1 text-slate-600 dark:text-slate-400">{field.description}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

interface RequirementSummaryProps {
  requirement: TemplateSetupRequirement
}

function RequirementSummary({ requirement }: RequirementSummaryProps) {
  const display = getRequirementDisplay(requirement as RequirementLike)

  if ((requirement as any).type === 'airtable') {
    return null
  }

  if ((requirement as GoogleSheetsSetupRequirement).type === 'google_sheets') {
    const sheetsRequirement = requirement as GoogleSheetsSetupRequirement
    return (
      <div className="rounded-xl border border-green-200/80 bg-gradient-to-br from-green-50/80 to-white dark:from-green-950/30 dark:to-slate-900/30 p-5 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-2">
              <FileSpreadsheet className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-lg text-slate-900 dark:text-slate-100">
                  {sheetsRequirement.title || `Google Sheet: ${sheetsRequirement.spreadsheetName}`}
                </p>
                <Badge variant="outline" className="font-medium">{display.badge}</Badge>
              </div>
            {sheetsRequirement.instructions && (
              <ol className="text-sm text-slate-700 dark:text-slate-300 space-y-2 list-decimal list-outside ml-6 leading-relaxed">
                {sheetsRequirement.instructions.map((step, index) => (
                  <li key={index} className="pl-2">{step}</li>
                ))}
              </ol>
            )}
          </div>
        </div>
        {sheetsRequirement.sampleSheets && sheetsRequirement.sampleSheets.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Sample CSV Downloads
            </p>
            <ul className="space-y-2">
              {sheetsRequirement.sampleSheets.map((sheet, index) => (
                <li
                  key={`${sheet.sheetName}-${index}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <div>
                    <a
                      href={sheet.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-orange-600 dark:text-orange-400 hover:underline"
                    >
                      {sheet.sheetName}
                    </a>
                    {sheet.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{sheet.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {sheetsRequirement.resources && sheetsRequirement.resources.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Resources
            </p>
            <ul className="space-y-2">
              {sheetsRequirement.resources.map((resource, index) => (
                <li
                  key={`${resource.name}-${index}`}
                  className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <ExternalLink className="h-4 w-4 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-orange-600 dark:text-orange-400 hover:underline"
                    >
                      {resource.name}
                    </a>
                    {resource.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{resource.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  const genericRequirement = requirement as { title?: string; instructions?: string[] }

  return (
    <div className="rounded-xl border border-orange-200/80 bg-gradient-to-br from-orange-50/80 to-white dark:from-orange-950/30 dark:to-slate-900/30 p-5 space-y-3 shadow-sm">
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="font-medium">
          {display.badge}
        </Badge>
        <p className="font-semibold text-base text-slate-900 dark:text-slate-100 flex-1">
          {display.title}
        </p>
      </div>
      {genericRequirement.instructions && (
        <ol className="text-sm text-slate-700 dark:text-slate-300 space-y-2 list-decimal list-outside ml-6 leading-relaxed">
          {genericRequirement.instructions.map((step, index) => (
            <li key={index} className="pl-2">{step}</li>
          ))}
        </ol>
      )}
    </div>
  )
}
