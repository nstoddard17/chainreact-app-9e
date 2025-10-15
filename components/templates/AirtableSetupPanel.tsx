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
import {
  normalizeOverviewNotes,
  resolvePrimaryTargetLabel,
  getRequirementDisplay,
  type RequirementLike,
} from '@/lib/templates/setupFormatting'
import type {
  TemplateSetupResource,
  TemplateSetupOverview,
  TemplateAsset,
  AirtableSetupRequirementResponse,
  GoogleSheetsSetupRequirementResponse,
  TemplateSetupRequirementResponse,
} from '@/types/templateSetup'
import { toast } from 'sonner'

type PanelState = 'expanded' | 'minimized' | 'closed'

export interface TemplateSetupPanelProps {
  templateId: string
  workflowId?: string
  onSetupLoaded?: (data: TemplateSetupData) => void
}

type AirtableSetupRequirement = AirtableSetupRequirementResponse
type GoogleSheetsSetupRequirement = GoogleSheetsSetupRequirementResponse
type TemplateSetupRequirement = TemplateSetupRequirementResponse

interface TemplateSetupResponse {
  requirements: TemplateSetupRequirement[]
  overview?: TemplateSetupOverview | null
  primarySetupTarget?: string | null
  assets?: TemplateAsset[]
}

export interface TemplateSetupData extends TemplateSetupResponse {}

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

const CreateBaseContext = React.createContext<{
  handleCreateBase: (() => Promise<void> | void) | null
  isCreatingBase: boolean
}>({
  handleCreateBase: null,
  isCreatingBase: false,
})

export function AirtableSetupPanel({ templateId, workflowId, onSetupLoaded }: TemplateSetupPanelProps) {
  const [setupData, setSetupData] = useState<TemplateSetupData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [panelState, setPanelState] = useState<PanelState>('expanded')
  const [expandedTable, setExpandedTable] = useState<string | null>(null)
  const [isCreatingBase, setIsCreatingBase] = useState(false)
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
          const emptyData: TemplateSetupData = {
            requirements: [],
            overview: null,
            primarySetupTarget: null,
            assets: [],
          }
          setSetupData(emptyData)
          if (!hasNotifiedRef.current) {
            onSetupLoaded?.(emptyData)
            hasNotifiedRef.current = true
          }
          return
        }
        throw new Error('Failed to fetch template setup requirements')
      }

      const data: TemplateSetupResponse = await response.json()
      const normalized: TemplateSetupData = {
        requirements: data.requirements || [],
        overview: data.overview ?? null,
        primarySetupTarget: data.primarySetupTarget ?? null,
        assets: data.assets ?? [],
      }
      setSetupData(normalized)

      if (!hasNotifiedRef.current) {
        onSetupLoaded?.(normalized)
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

  const handleCreateBase = useCallback(async () => {
    if (isCreatingBase) return
    setIsCreatingBase(true)
    try {
      const response = await fetch(`/api/templates/${templateId}/airtable-setup/create-base`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message = payload?.error || 'Failed to create Airtable base'
        throw new Error(message)
      }

      const baseName = payload?.base?.name || setupData?.overview?.summary || 'Airtable Base'
      const baseUrl = payload?.base?.url

      toast.success('Airtable base created', {
        description: baseUrl ? `Created "${baseName}". Open it to finish configuring.` : `Created "${baseName}" successfully.`,
        action: baseUrl
          ? {
              label: 'Open',
              onClick: () => {
                if (typeof window !== 'undefined') {
                  window.open(baseUrl, '_blank', 'noopener')
                }
              },
            }
          : undefined,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create Airtable base'
      toast.error('Failed to create Airtable base', {
        description: message,
      })
    } finally {
      setIsCreatingBase(false)
    }
  }, [isCreatingBase, setupData?.overview?.summary, templateId])

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

  const requirements = useMemo(() => setupData?.requirements ?? [], [setupData?.requirements])

  const airtableRequirement = useMemo(
    () => requirements.find((req) => req.type === 'airtable') as AirtableSetupRequirement | undefined,
    [requirements]
  )

  const totalTables = useMemo(() => {
    if (!airtableRequirement) return 0
    return airtableRequirement.tables.length
  }, [airtableRequirement])

  const overview = useMemo(() => setupData?.overview ?? null, [setupData?.overview])
  const overviewNotes = useMemo(() => normalizeOverviewNotes(overview?.notes), [overview])
  const assets = useMemo(() => setupData?.assets ?? [], [setupData?.assets])
  const primaryTargetLabel = useMemo(
    () => resolvePrimaryTargetLabel(setupData?.primarySetupTarget ?? null, requirements as RequirementLike[]),
    [setupData?.primarySetupTarget, requirements]
  )

  if (loading || error || !setupData || !requirements.length) {
    return null
  }

  if (panelState === 'minimized') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          className="fixed bottom-20 right-4 sm:bottom-24 sm:right-6 z-[90] cursor-pointer group"
          onClick={handleExpand}
        >
          <div className="relative">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 group-hover:scale-105">
              <Table2 className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 bg-gradient-to-br from-blue-700 to-blue-800 text-white text-xs rounded-full min-w-[20px] h-[20px] sm:min-w-[22px] sm:h-[22px] flex items-center justify-center px-1 sm:px-1.5 font-semibold shadow-md border-2 border-white">
              {requirements.length}
            </div>
            <div className="absolute inset-0 w-12 h-12 sm:w-14 sm:h-14 bg-blue-500 rounded-xl sm:rounded-2xl animate-ping opacity-20" />
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
      className="w-full max-w-full"
    >
      <Card className="w-full border-blue-300 dark:border-blue-800 bg-gradient-to-br from-blue-50/90 via-white to-blue-50/60 dark:from-blue-950/40 dark:via-slate-900 dark:to-blue-950/20 shadow-lg">
        <CardHeader className="pb-4 sm:pb-5 border-b border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-100/50 to-transparent dark:from-blue-900/30 px-4 sm:px-6 pt-4 sm:pt-6">
          <div className="flex items-start justify-between gap-2 sm:gap-4">
            <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
              <div className="rounded-lg bg-blue-100 dark:bg-blue-900/50 p-1.5 sm:p-2.5 flex-shrink-0">
                <Table2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 space-y-1 sm:space-y-2 min-w-0">
                <CardTitle className="text-base sm:text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
                  {primaryTargetLabel ? `${primaryTargetLabel} Setup Required` : 'Template Setup Required'}
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {requirements.length} integration setup step{requirements.length === 1 ? '' : 's'} detected. Complete these before running the workflow for the best experience.
                </CardDescription>
                {overview?.summary && (
                  <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-white/80 dark:bg-blue-950/20 px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                    {overview.summary}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                onClick={handleMinimize}
                title="Minimize"
              >
                <Minimize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                onClick={handleClose}
                title="Close"
              >
                <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6 pt-4 sm:pt-6 px-4 sm:px-6 pb-4 sm:pb-6">
          {overview?.sections && overview.sections.length > 0 && (
            <div className="space-y-2 sm:space-y-3">
              <h5 className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                Overview Checklist
              </h5>
              <div className="space-y-2 sm:space-y-3">
                {overview.sections.map((section, index) => (
                  <div
                    key={`${section.title}-${index}`}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 sm:px-4 sm:py-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                          {section.title || `Section ${index + 1}`}
                        </p>
                        {section.description && (
                          <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 mt-1">
                            {section.description}
                          </p>
                        )}
                        {section.items && section.items.length > 0 && (
                          <ul className="mt-1.5 sm:mt-2 space-y-0.5 sm:space-y-1 list-disc pl-3 sm:pl-4 text-[11px] sm:text-xs text-slate-600 dark:text-slate-400">
                            {section.items.map((item, itemIndex) => (
                              <li key={`${section.title ?? 'section'}-${itemIndex}`}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] sm:text-xs flex-shrink-0">Step {index + 1}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {overviewNotes.length > 0 && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-900/20 px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm text-amber-800 dark:text-amber-200">
              <ul className="list-disc space-y-0.5 sm:space-y-1 pl-4 sm:pl-5">
                {overviewNotes.map((note, index) => (
                  <li key={`setup-note-${index}`}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          <CreateBaseContext.Provider value={{ handleCreateBase, isCreatingBase }}>
            {airtableRequirement && (
              <AirtableRequirementCard
                requirement={airtableRequirement}
                totalTables={totalTables}
                expandedTable={expandedTable}
                onToggleTable={setExpandedTable}
                onDownloadGuide={handleDownloadGuide}
              />
            )}
          </CreateBaseContext.Provider>

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
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span>No specific setup instructions were provided for this template yet.</span>
            </div>
          )}

          {assets.length > 0 && (
            <div className="space-y-2 sm:space-y-3">
              <h5 className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 sm:gap-2">
                <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Supporting Assets
              </h5>
              <div className="space-y-2">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 sm:px-3 sm:py-2 text-xs sm:text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm sm:text-base text-slate-900 dark:text-slate-100 break-words">{asset.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground mt-1">
                        <Badge variant="outline" className="text-[10px] sm:text-[11px] capitalize">
                          {asset.asset_type.replace(/[_-]/g, ' ')}
                        </Badge>
                        {asset.mime_type && <span>{asset.mime_type}</span>}
                        <span>{new Date(asset.created_at).toLocaleDateString()}</span>
                      </div>
                      {asset.metadata?.description && (
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{asset.metadata.description}</p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" asChild className="flex-shrink-0 text-xs sm:text-sm h-8 sm:h-9 w-full sm:w-auto">
                      <a href={asset.download_url} target="_blank" rel="noreferrer">
                        <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" /> Download
                      </a>
                    </Button>
                  </div>
                ))}
              </div>
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
}

function AirtableRequirementCard({
  requirement,
  totalTables,
  expandedTable,
  onToggleTable,
  onDownloadGuide,
}: AirtableRequirementCardProps) {
  const { handleCreateBase, isCreatingBase } = React.useContext(CreateBaseContext)
  const createButtonVisible = Boolean(handleCreateBase)

  const instructions = requirement.instructions?.length ? requirement.instructions : FALLBACK_AIRTABLE_STEPS

  // Create a map of CSV files by table name for easy lookup
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Quick Setup Section */}
      <div className="rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 to-white dark:from-blue-950/30 dark:to-slate-900/30 p-4 sm:p-6 space-y-3 sm:space-y-5 shadow-sm">
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-1.5 sm:p-2 flex-shrink-0">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <h4 className="font-semibold text-sm sm:text-lg text-slate-900 dark:text-slate-100">
                  {requirement.title || `Create Airtable Base${requirement.baseName ? `: ${requirement.baseName}` : ''}`}
                </h4>
                <Badge variant="secondary" className="font-medium text-[10px] sm:text-xs inline-flex">
                  {totalTables} {totalTables === 1 ? 'table' : 'tables'}
                </Badge>
              </div>
            </div>

        <ol className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 space-y-2 sm:space-y-3 list-decimal list-outside ml-4 sm:ml-6 leading-relaxed">
          {instructions.map((step, index) => (
            <li key={index} className="pl-1 sm:pl-2">{step}</li>
          ))}
        </ol>

        <div className="pt-1 sm:pt-2 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDownloadGuide(requirement)}
              className="font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs sm:text-sm h-8 sm:h-9"
            >
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
              Download Setup Guide
            </Button>
            {createButtonVisible && handleCreateBase && (
              <>
                <Button
                  size="sm"
                  onClick={() => void handleCreateBase()}
                  disabled={isCreatingBase}
                  className="font-medium text-xs sm:text-sm h-8 sm:h-9"
                >
                  {isCreatingBase ? 'Creating Airtable Base…' : 'Create Airtable Base'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs sm:text-sm h-8 sm:h-9"
                >
                  <a href="https://airtable.com/create" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                    Create Manually
                  </a>
                </Button>
              </>
            )}
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            {createButtonVisible ?
              "Create the base automatically, or create it manually in Airtable using the schema below." :
              "We'll create the base and tables in your connected Airtable account using this schema."}
          </p>
        </div>
      </div>

      {/* Tables Section - Combined CSV Import + Schema */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Table2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600 dark:text-slate-400" />
          <h5 className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Required Tables
          </h5>
        </div>

        <div className="space-y-3 sm:space-y-4">
          {requirement.tables.map((table, index) => {
            const isExpanded = expandedTable === table.tableName

            return (
              <div
                key={`${table.tableName}-${index}`}
                className={cn(
                  "rounded-lg sm:rounded-xl border bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all duration-200 sm:min-w-[520px]",
                  isExpanded ? "border-blue-300 dark:border-blue-700 shadow-md" : "border-slate-200 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-800"
                )}
              >
                {/* Table Header - Responsive Layout */}
                <div className="px-3 py-3 sm:px-6 sm:py-5 bg-gradient-to-r from-slate-50/50 to-transparent dark:from-slate-800/50">
                  {/* Mobile Layout - Stacked */}
                  <div className="sm:hidden space-y-2">
                    <button
                      type="button"
                      onClick={() => onToggleTable(isExpanded ? null : table.tableName)}
                      className="w-full text-left group"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors break-words">
                          {table.tableName}
                        </p>
                        <Badge variant="outline" className="text-[10px] font-normal whitespace-nowrap flex-shrink-0">
                          {table.fields.length} {table.fields.length === 1 ? 'field' : 'fields'}
                        </Badge>
                      </div>
                    </button>
                  </div>

                  {/* Desktop Layout - Single Line */}
                  <button
                    type="button"
                    onClick={() => onToggleTable(isExpanded ? null : table.tableName)}
                    className="hidden sm:flex items-center gap-3 w-full text-left group"
                  >
                    {/* Table Name */}
                    <p className="font-semibold text-base text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors whitespace-nowrap flex-shrink-0">
                      {table.tableName}
                    </p>

                    {/* Field Count Badge */}
                    <Badge variant="outline" className="text-xs font-normal whitespace-nowrap flex-shrink-0">
                      {table.fields.length} {table.fields.length === 1 ? 'field' : 'fields'}
                    </Badge>

                    {/* Description - Takes remaining space */}
                    {table.description && (
                      <p
                        className="text-sm text-slate-600 dark:text-slate-400 flex-1 min-w-0 truncate"
                        title={table.description}
                      >
                        {table.description}
                      </p>
                    )}

                    {/* CSV Download Button */}
                  </button>
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
                      <div className="px-3 py-3 sm:px-5 sm:py-4 bg-slate-50/50 dark:bg-slate-800/30">
                        <h6 className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2 sm:mb-3">
                          Field Schema
                        </h6>
                        <ul className="space-y-2 sm:space-y-3">
                          {table.fields.map((field, fieldIndex) => (
                            <li
                              key={`${field.name}-${fieldIndex}`}
                              className="flex flex-col gap-1 p-2 sm:p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            >
                              <div className="flex items-baseline gap-1.5 sm:gap-2 flex-wrap">
                                <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                                  {field.name}
                                </span>
                                <Badge variant="secondary" className="text-[10px] sm:text-xs font-normal">
                                  {field.type.replace(/([A-Z])/g, ' $1').trim()}
                                </Badge>
                                {field.options && field.options.length > 0 && (
                                  <span className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400">
                                    Options: {field.options.join(', ')}
                                  </span>
                                )}
                              </div>
                              {field.description && (
                                <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
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
  const display = getRequirementDisplay(requirement as RequirementLike)

  if (isGoogleSheetsRequirement(requirement)) {
    return (
      <div className="rounded-xl border border-green-200/80 bg-gradient-to-br from-green-50/80 to-white dark:from-green-950/30 dark:to-slate-900/30 p-4 sm:p-6 space-y-3 sm:space-y-5 shadow-sm">
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-1.5 sm:p-2 flex-shrink-0">
            <FileSpreadsheet className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1 space-y-1 sm:space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-sm sm:text-lg text-slate-900 dark:text-slate-100">
                {requirement.title || `Prepare Google Sheet: ${requirement.spreadsheetName}`}
              </h4>
              <Badge variant="outline" className="font-medium text-[10px] sm:text-xs">{display.badge}</Badge>
            </div>
            {requirement.instructions && (
              <ol className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 space-y-2 sm:space-y-3 list-decimal list-outside ml-4 sm:ml-6 leading-relaxed">
                {requirement.instructions.map((step, index) => (
                  <li key={index} className="pl-1 sm:pl-2">{step}</li>
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
            className="font-medium hover:bg-green-50 dark:hover:bg-green-900/20 text-xs sm:text-sm h-8 sm:h-9"
          >
            <a href={requirement.templateUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
              Open Spreadsheet Template
            </a>
          </Button>
        )}

        {requirement.sampleSheets && requirement.sampleSheets.length > 0 && (
          <div className="space-y-2 sm:space-y-3">
            <h6 className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Sample Data
            </h6>
            <div className="space-y-2">
              {requirement.sampleSheets.map((sheet, index) => (
                <div
                  key={`${sheet.sheetName}-${index}`}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 sm:px-4 sm:py-3 shadow-sm"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs sm:text-sm text-slate-900 dark:text-slate-100">{sheet.sheetName}</p>
                    {sheet.description && (
                      <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 mt-0.5">{sheet.description}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDownload(sheet.downloadUrl, `${sheet.sheetName.replace(/\s+/g, '-')}.csv`)}
                    className="flex-shrink-0 font-medium hover:bg-green-50 dark:hover:bg-green-900/20 text-xs sm:text-sm h-8 sm:h-9 w-full sm:w-auto"
                  >
                    <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                    Download CSV
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {requirement.resources && requirement.resources.length > 0 && (
          <div className="space-y-2 sm:space-y-3">
            <h6 className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Helpful Resources
            </h6>
            <ul className="space-y-2">
              {requirement.resources.map((resource, index) => (
                <li
                  key={`${resource.name}-${index}`}
                  className="flex items-start gap-1.5 sm:gap-2 p-2 sm:p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                >
                  <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline break-words"
                    >
                      {resource.name}
                    </a>
                    {resource.description && (
                      <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 mt-0.5">{resource.description}</p>
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

  return (
    <div className="rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 to-white dark:from-blue-950/30 dark:to-slate-900/30 p-4 sm:p-6 space-y-3 sm:space-y-5 shadow-sm">
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-1.5 sm:p-2 flex-shrink-0">
          <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 space-y-1 sm:space-y-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm sm:text-lg text-slate-900 dark:text-slate-100">{display.title}</h4>
            <Badge variant="outline" className="font-medium text-[10px] sm:text-xs">{display.badge}</Badge>
          </div>
          {genericInstructions && (
            <ol className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 space-y-2 sm:space-y-3 list-decimal list-outside ml-4 sm:ml-6 leading-relaxed">
              {genericInstructions.map((step, index) => (
                <li key={index} className="pl-1 sm:pl-2">{step}</li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {genericResources && genericResources.length > 0 && (
        <div className="space-y-2 sm:space-y-3">
          <h6 className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Resources
          </h6>
          <ul className="space-y-2">
            {genericResources.map((resource, index) => (
              <li
                key={`${resource.name}-${index}`}
                className="flex items-start gap-1.5 sm:gap-2 p-2 sm:p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              >
                <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline break-words"
                  >
                    {resource.name}
                  </a>
                  {resource.description && (
                    <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 mt-0.5">{resource.description}</p>
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

export type {
  TemplateSetupData,
  TemplateSetupRequirement,
  AirtableSetupRequirement,
  GoogleSheetsSetupRequirement,
}
