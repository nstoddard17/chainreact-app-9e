"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Download,
  FileText,
  Table2,
  CheckCircle2,
  AlertCircle,
  X,
  Minimize2,
  FileSpreadsheet,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { TemplateSetupResource } from '@/types/templateSetup'

type PanelState = 'expanded' | 'minimized' | 'closed'

export interface TemplateSetupPanelProps {
  templateId: string
  workflowId?: string
  onSetupLoaded?: (requirements: TemplateSetupRequirement[]) => void
}

export interface AirtableSetupRequirement {
  type: 'airtable'
  title?: string
  baseName: string
  instructions: string[]
  tables: Array<{
    tableName: string
    description?: string
    fields: Array<{
      name: string
      type: string
      options?: string[]
      description?: string
    }>
  }>
  csvFiles: Array<{
    tableName: string
    filename: string
    downloadUrl: string
  }>
  guideDownloadUrl: string
}

export interface GoogleSheetsSetupRequirement {
  type: 'google_sheets'
  title?: string
  spreadsheetName: string
  instructions?: string[]
  sampleSheets?: Array<{
    sheetName: string
    description?: string
    downloadUrl: string
  }>
  templateUrl?: string
  resources?: TemplateSetupResource[]
}

export type TemplateSetupRequirement =
  | AirtableSetupRequirement
  | GoogleSheetsSetupRequirement
  | {
      type: string
      title?: string
      instructions?: string[]
      resources?: TemplateSetupResource[]
    }

interface TemplateSetupResponse {
  requirements: TemplateSetupRequirement[]
}

function isAirtableRequirement(requirement: TemplateSetupRequirement): requirement is AirtableSetupRequirement {
  return requirement.type === 'airtable'
}

function isGoogleSheetsRequirement(requirement: TemplateSetupRequirement): requirement is GoogleSheetsSetupRequirement {
  return requirement.type === 'google_sheets'
}

const FALLBACK_AIRTABLE_STEPS = [
  'Create a new Airtable base using the name listed below',
  'Add tables that match the provided structure',
  'Import the CSV files to seed the tables before running the workflow',
]

export function AirtableSetupPanel({ templateId, workflowId, onSetupLoaded }: TemplateSetupPanelProps) {
  const [requirements, setRequirements] = useState<TemplateSetupRequirement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [panelState, setPanelState] = useState<PanelState>('expanded')
  const [expandedTable, setExpandedTable] = useState<string | null>(null)
  const hasNotifiedRef = useRef(false)

  const storageKey = useMemo(
    () => `template-setup-panel-${workflowId || templateId}`,
    [workflowId, templateId]
  )

  useEffect(() => {
    hasNotifiedRef.current = false
  }, [templateId])

  const fetchSetup = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/templates/${templateId}/setup`)

      if (!response.ok) {
        if (response.status === 404) {
          setRequirements([])
          return
        }
        throw new Error('Failed to fetch template setup requirements')
      }

      const data: TemplateSetupResponse = await response.json()
      setRequirements(data.requirements || [])

      if (!hasNotifiedRef.current && data.requirements?.length) {
        onSetupLoaded?.(data.requirements)
        hasNotifiedRef.current = true
      }
    } catch (err) {
      console.error('[TemplateSetupPanel] Fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load setup information')
    } finally {
      setLoading(false)
    }
  }, [templateId, onSetupLoaded])

  useEffect(() => {
    if (typeof window === 'undefined') return

    void fetchSetup()

    const savedState = localStorage.getItem(storageKey)
    if (savedState === 'minimized' || savedState === 'closed') {
      setPanelState(savedState as PanelState)
    }

    const handleReopenEvent = () => {
      setPanelState('expanded')
      localStorage.setItem(storageKey, 'expanded')
    }

    window.addEventListener('airtable-panel-reopen', handleReopenEvent)
    return () => window.removeEventListener('airtable-panel-reopen', handleReopenEvent)
  }, [fetchSetup, storageKey])

  const handleDownloadFile = async (downloadUrl: string, filename: string) => {
    try {
      const response = await fetch(downloadUrl)
      if (!response.ok) throw new Error('Download failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('[TemplateSetupPanel] Download error:', err)
      alert('Failed to download file. Please try again.')
    }
  }

  const handleDownloadGuide = async (requirement: AirtableSetupRequirement) => {
    const slug = requirement.baseName.toLowerCase().replace(/\s+/g, '-')
    await handleDownloadFile(requirement.guideDownloadUrl, `${slug}-setup-guide.md`)
  }

  const handleMinimize = () => {
    setPanelState('minimized')
    localStorage.setItem(storageKey, 'minimized')
  }

  const handleClose = () => {
    setPanelState('closed')
    localStorage.setItem(storageKey, 'closed')
  }

  const handleExpand = () => {
    setPanelState('expanded')
    localStorage.setItem(storageKey, 'expanded')
  }

  const airtableRequirement = useMemo(
    () => requirements.find((req) => req.type === 'airtable') as AirtableSetupRequirement | undefined,
    [requirements]
  )

  const totalTables = useMemo(() => {
    if (!airtableRequirement) return 0
    return airtableRequirement.tables.length
  }, [airtableRequirement])

  if (loading || error || !requirements.length) {
    return null
  }

  if (panelState === 'minimized') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          className="fixed bottom-6 right-6 z-[90] cursor-pointer group"
          onClick={handleExpand}
        >
          <div className="relative">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 group-hover:scale-105">
              <Table2 className="h-7 w-7 text-white" />
            </div>
            <div className="absolute -top-1.5 -right-1.5 bg-gradient-to-br from-blue-700 to-blue-800 text-white text-xs rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1.5 font-semibold shadow-md border-2 border-white">
              {requirements.length}
            </div>
            <div className="absolute inset-0 w-14 h-14 bg-blue-500 rounded-2xl animate-ping opacity-20" />
          </div>
        </motion.div>
      </AnimatePresence>
    )
  }

  if (panelState === 'closed') {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-blue-300 dark:border-blue-800 bg-gradient-to-br from-blue-50/90 via-white to-blue-50/60 dark:from-blue-950/40 dark:via-slate-900 dark:to-blue-950/20 shadow-lg">
        <CardHeader className="pb-5 border-b border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-100/50 to-transparent dark:from-blue-900/30">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <div className="rounded-lg bg-blue-100 dark:bg-blue-900/50 p-2.5">
                <Table2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 space-y-1.5">
                <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Template Setup Required
                </CardTitle>
                <CardDescription className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {requirements.length} integration setup step{requirements.length === 1 ? '' : 's'} detected. Complete before running for the best experience.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                onClick={handleMinimize}
                title="Minimize"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                onClick={handleClose}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {airtableRequirement && (
            <AirtableRequirementCard
              requirement={airtableRequirement}
              totalTables={totalTables}
              expandedTable={expandedTable}
              onToggleTable={setExpandedTable}
              onDownloadGuide={handleDownloadGuide}
              onDownloadCsv={handleDownloadFile}
            />
          )}

          {requirements
            .filter((req) => req.type !== 'airtable')
            .map((requirement, index) => (
              <GenericRequirementCard
                key={`${requirement.type}-${index}`}
                requirement={requirement}
                onDownload={handleDownloadFile}
              />
            ))}

          {!airtableRequirement && !requirements.some((req) => req.type !== 'airtable') && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              No specific setup instructions were provided for this template yet.
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

interface AirtableRequirementCardProps {
  requirement: AirtableSetupRequirement
  totalTables: number
  expandedTable: string | null
  onToggleTable: (tableName: string | null) => void
  onDownloadGuide: (requirement: AirtableSetupRequirement) => Promise<void>
  onDownloadCsv: (downloadUrl: string, filename: string) => Promise<void>
}

function AirtableRequirementCard({
  requirement,
  totalTables,
  expandedTable,
  onToggleTable,
  onDownloadGuide,
  onDownloadCsv,
}: AirtableRequirementCardProps) {
  const instructions = requirement.instructions?.length ? requirement.instructions : FALLBACK_AIRTABLE_STEPS

  // Create a map of CSV files by table name for easy lookup
  const csvFileMap = useMemo(() => {
    const map = new Map<string, typeof requirement.csvFiles[0]>()
    requirement.csvFiles.forEach(file => {
      map.set(file.tableName, file)
    })
    return map
  }, [requirement.csvFiles])

  return (
    <div className="space-y-6">
      {/* Quick Setup Section */}
      <div className="rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 to-white dark:from-blue-950/30 dark:to-slate-900/30 p-6 space-y-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-2">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
                {requirement.title || `Create Airtable base: ${requirement.baseName}`}
              </h4>
              <Badge variant="secondary" className="font-medium">{totalTables} {totalTables === 1 ? 'table' : 'tables'}</Badge>
            </div>
          </div>
        </div>

        <ol className="text-sm text-slate-700 dark:text-slate-300 space-y-3 list-decimal list-outside ml-6 leading-relaxed">
          {instructions.map((step, index) => (
            <li key={index} className="pl-2">{step}</li>
          ))}
        </ol>

        <div className="pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDownloadGuide(requirement)}
            className="font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <FileText className="h-4 w-4 mr-2" />
            Download Complete Setup Guide
          </Button>
        </div>
      </div>

      {/* Tables Section - Combined CSV Import + Schema */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Required Tables
          </h5>
        </div>

        <div className="space-y-4">
          {requirement.tables.map((table, index) => {
            const isExpanded = expandedTable === table.tableName
            const csvFile = csvFileMap.get(table.tableName)

            return (
              <div
                key={`${table.tableName}-${index}`}
                className={cn(
                  "rounded-xl border bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all duration-200",
                  isExpanded ? "border-blue-300 dark:border-blue-700 shadow-md" : "border-slate-200 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-800"
                )}
              >
                {/* Table Header - Single Line Layout */}
                <div className="px-6 py-5 flex items-center gap-4 bg-gradient-to-r from-slate-50/50 to-transparent dark:from-slate-800/50">
                  <button
                    type="button"
                    onClick={() => onToggleTable(isExpanded ? null : table.tableName)}
                    className="flex items-center gap-4 min-w-0 group flex-1"
                  >
                    {/* Table Name */}
                    <p className="font-semibold text-base text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors whitespace-nowrap">
                      {table.tableName}
                    </p>

                    {/* Field Count Badge */}
                    <Badge variant="outline" className="text-xs font-normal whitespace-nowrap flex-shrink-0">
                      {table.fields.length} {table.fields.length === 1 ? 'field' : 'fields'}
                    </Badge>

                    {/* Description */}
                    {table.description && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 truncate flex-1">
                        {table.description}
                      </p>
                    )}
                  </button>

                  {/* CSV Download Button */}
                  {csvFile && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDownloadCsv(csvFile.downloadUrl, csvFile.filename)
                      }}
                      className="flex-shrink-0 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 whitespace-nowrap"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Import CSV
                    </Button>
                  )}
                </div>

                {/* Expandable Field Schema */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="border-t border-slate-200 dark:border-slate-700"
                    >
                      <div className="px-5 py-4 bg-slate-50/50 dark:bg-slate-800/30">
                        <h6 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3">
                          Field Schema
                        </h6>
                        <ul className="space-y-3">
                          {table.fields.map((field, fieldIndex) => (
                            <li
                              key={`${field.name}-${fieldIndex}`}
                              className="flex flex-col gap-1 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            >
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                                  {field.name}
                                </span>
                                <Badge variant="secondary" className="text-xs font-normal">
                                  {field.type.replace(/([A-Z])/g, ' $1').trim()}
                                </Badge>
                                {field.options && field.options.length > 0 && (
                                  <span className="text-xs text-slate-600 dark:text-slate-400">
                                    Options: {field.options.join(', ')}
                                  </span>
                                )}
                              </div>
                              {field.description && (
                                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                  {field.description}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface GenericRequirementCardProps {
  requirement: TemplateSetupRequirement
  onDownload: (downloadUrl: string, filename: string) => Promise<void>
}

function GenericRequirementCard({ requirement, onDownload }: GenericRequirementCardProps) {
  if (isGoogleSheetsRequirement(requirement)) {
    return (
      <div className="rounded-xl border border-green-200/80 bg-gradient-to-br from-green-50/80 to-white dark:from-green-950/30 dark:to-slate-900/30 p-6 space-y-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
                {requirement.title || `Prepare Google Sheet: ${requirement.spreadsheetName}`}
              </h4>
              <Badge variant="outline" className="font-medium">Google Sheets</Badge>
            </div>
            {requirement.instructions && (
              <ol className="text-sm text-slate-700 dark:text-slate-300 space-y-3 list-decimal list-outside ml-6 leading-relaxed">
                {requirement.instructions.map((step, index) => (
                  <li key={index} className="pl-2">{step}</li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {requirement.templateUrl && (
          <Button
            variant="outline"
            size="sm"
            asChild
            className="font-medium hover:bg-green-50 dark:hover:bg-green-900/20"
          >
            <a href={requirement.templateUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Spreadsheet Template
            </a>
          </Button>
        )}

        {requirement.sampleSheets && requirement.sampleSheets.length > 0 && (
          <div className="space-y-3">
            <h6 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Sample Data
            </h6>
            <div className="space-y-2">
              {requirement.sampleSheets.map((sheet, index) => (
                <div
                  key={`${sheet.sheetName}-${index}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm text-slate-900 dark:text-slate-100">{sheet.sheetName}</p>
                    {sheet.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{sheet.description}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDownload(sheet.downloadUrl, `${sheet.sheetName.replace(/\s+/g, '-')}.csv`)}
                    className="flex-shrink-0 font-medium hover:bg-green-50 dark:hover:bg-green-900/20"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {requirement.resources && requirement.resources.length > 0 && (
          <div className="space-y-3">
            <h6 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Helpful Resources
            </h6>
            <ul className="space-y-2">
              {requirement.resources.map((resource, index) => (
                <li
                  key={`${resource.name}-${index}`}
                  className="flex items-start gap-2 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
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

  const genericInstructions = (requirement as any).instructions as string[] | undefined
  const genericResources = (requirement as any).resources as TemplateSetupResource[] | undefined
  const title = (requirement as any).title || `Complete ${requirement.type} setup`

  return (
    <div className="rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 to-white dark:from-blue-950/30 dark:to-slate-900/30 p-6 space-y-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-2">
          <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-lg text-slate-900 dark:text-slate-100">{title}</h4>
            <Badge variant="outline" className="capitalize font-medium">{requirement.type}</Badge>
          </div>
          {genericInstructions && (
            <ol className="text-sm text-slate-700 dark:text-slate-300 space-y-3 list-decimal list-outside ml-6 leading-relaxed">
              {genericInstructions.map((step, index) => (
                <li key={index} className="pl-2">{step}</li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {genericResources && genericResources.length > 0 && (
        <div className="space-y-3">
          <h6 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Resources
          </h6>
          <ul className="space-y-2">
            {genericResources.map((resource, index) => (
              <li
                key={`${resource.name}-${index}`}
                className="flex items-start gap-2 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
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
