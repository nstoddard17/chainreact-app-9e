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
import { Table2, FileSpreadsheet, ExternalLink } from "lucide-react"
import type {
  TemplateSetupRequirement,
  AirtableSetupRequirement,
  GoogleSheetsSetupRequirement,
} from "./AirtableSetupPanel"

interface TemplateSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  requirements: TemplateSetupRequirement[]
}

export function TemplateSetupDialog({
  open,
  onOpenChange,
  requirements,
}: TemplateSetupDialogProps) {
  if (!requirements || requirements.length === 0) {
    return null
  }

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
            <div className="rounded-lg bg-blue-100 dark:bg-blue-900/50 p-2.5">
              <Table2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <DialogTitle className="text-2xl font-bold">Template Setup Overview</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            Complete the following steps before running the workflow to ensure
            integrations like Airtable and Google Sheets are ready.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-5">
          <div className="rounded-xl border border-blue-300 dark:border-blue-700 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30 px-4 py-3.5 text-sm text-blue-900 dark:text-blue-100 shadow-sm">
            <p className="font-medium">
              💡 Access this checklist anytime via the shield icon in the top right corner of the builder toolbar.
            </p>
          </div>

          {airtableRequirement && (
            <AirtableSummary requirement={airtableRequirement} />
          )}

          {otherRequirements.map((requirement, index) => (
            <RequirementSummary key={`${requirement.type}-${index}`} requirement={requirement} />
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 pt-5 border-t border-slate-200 dark:border-slate-700">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-medium">
            Dismiss
          </Button>
          <Button onClick={handleOpenPanel} className="font-medium shadow-sm">
            View Setup Panel
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
    <div className="rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 to-white dark:from-blue-950/30 dark:to-slate-900/30 p-5 space-y-4 shadow-sm">
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
              <Badge variant="outline" className="font-medium">Google Sheets</Badge>
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
                      className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
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
                  <ExternalLink className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
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
    <div className="rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 to-white dark:from-blue-950/30 dark:to-slate-900/30 p-5 space-y-3 shadow-sm">
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="capitalize font-medium">
          {requirement.type}
        </Badge>
        <p className="font-semibold text-base text-slate-900 dark:text-slate-100 flex-1">
          {genericRequirement.title || `Complete ${requirement.type} setup`}
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
