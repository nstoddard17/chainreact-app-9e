import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Trash2, AlertTriangle } from 'lucide-react'
import { useIntegrationStore } from '@/stores/integrationStore'
import { cn } from '@/lib/utils'
import { ConfigurationSectionHeader } from '../../components/ConfigurationSectionHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { logger } from '@/lib/utils/logger'

interface NotionDeletableBlocksFieldProps {
  value: any
  onChange: (value: any) => void
  field: any
  values: Record<string, any>
  loadOptions?: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean) => Promise<void>
  setFieldValue?: (field: string, value: any) => void
}

interface DeletableBlock {
  id: string
  type: string
  label: string
  blockType: string
  content: string
  hasChildren: boolean
  value: boolean
}

interface BlockSection {
  id: string
  type: string
  properties: DeletableBlock[]
  hasChildren: boolean
}

export function NotionDeletableBlocksField({
  value = {},
  onChange,
  field,
  values,
  loadOptions,
  setFieldValue
}: NotionDeletableBlocksFieldProps) {
  logger.debug('🗑️ [NotionDeletableBlocksField] Component rendering with:', {
    hasValue: !!value,
    valueKeys: Object.keys(value || {}),
    page: values?.page,
    workspace: values?.workspace,
    selectionMode: values?.selectionMode
  })

  const [blocks, setBlocks] = useState<BlockSection[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedBlocks, setSelectedBlocks] = useState<Record<string, boolean>>(value || {})
  const lastFetchedPageRef = useRef<string | null>(null)
  const pendingUpdateRef = useRef<Record<string, boolean> | null>(null)
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Notify parent of changes with debouncing to prevent cascades
  useEffect(() => {
    // Clear any pending timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current)
    }

    // If there's a pending update, schedule notification to parent
    if (pendingUpdateRef.current !== null) {
      const updated = pendingUpdateRef.current
      pendingUpdateRef.current = null

      updateTimeoutRef.current = setTimeout(() => {
        const selectedBlockIds = Object.entries(updated)
          .filter(([_, selected]) => selected)
          .map(([id]) => id)
        onChange({ selectedBlockIds, ...updated })
      }, 50) // Small delay to batch rapid clicks
    }

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }
    }
  }, [selectedBlocks, onChange])

  const { getIntegrationByProvider } = useIntegrationStore()

  // Fetch blocks when page changes
  useEffect(() => {
    logger.debug('🗑️ [NotionDeletableBlocksField] useEffect triggered with:', {
      page: values.page,
      workspace: values.workspace,
      lastFetchedPage: lastFetchedPageRef.current,
      currentLoading: loading,
      blocksLength: blocks.length
    })

    const fetchBlocks = async () => {
      if (!values.page || !values.workspace) {
        logger.debug('🗑️ [NotionDeletableBlocksField] Missing page or workspace, skipping fetch')
        setBlocks([])
        return
      }

      // Prevent duplicate fetches
      if (lastFetchedPageRef.current === values.page && blocks.length > 0) {
        logger.debug('🗑️ [NotionDeletableBlocksField] Already fetched for this page, skipping')
        return
      }

      setLoading(true)
      lastFetchedPageRef.current = values.page

      try {
        const integration = getIntegrationByProvider('notion')
        if (!integration) {
          logger.debug('🗑️ [NotionDeletableBlocksField] No Notion integration found')
          setBlocks([])
          return
        }

        logger.debug('🗑️ [NotionDeletableBlocksField] Fetching deletable blocks for page:', values.page)

        const response = await fetch('/api/integrations/notion/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            integrationId: integration.id,
            dataType: 'page_blocks_deletable',
            options: {
              pageId: values.page,
              workspaceId: values.workspace
            }
          })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || 'Failed to fetch blocks')
        }

        const result = await response.json()
        const data = result.data || result

        logger.debug('🗑️ [NotionDeletableBlocksField] Received blocks:', data)

        if (Array.isArray(data)) {
          setBlocks(data)
        } else {
          setBlocks([])
        }
      } catch (error: any) {
        logger.error('🗑️ [NotionDeletableBlocksField] Failed to fetch blocks:', error)
        setBlocks([])
      } finally {
        setLoading(false)
      }
    }

    fetchBlocks()
  }, [values.page, values.workspace])

  // Handle block selection change - memoized to prevent unnecessary re-renders
  const handleBlockSelect = useCallback((blockId: string, checked: boolean) => {
    setSelectedBlocks(prev => {
      const updated = { ...prev, [blockId]: checked }

      // Remove unchecked blocks from the object
      if (!checked) {
        delete updated[blockId]
      }

      // Mark for parent notification (will be handled by useEffect)
      pendingUpdateRef.current = updated

      return updated
    })
  }, [])

  // Toggle block selection - reads current state inside the callback to avoid stale closures
  const handleBlockToggle = useCallback((blockId: string) => {
    setSelectedBlocks(prev => {
      const isCurrentlySelected = prev[blockId] || false
      const updated = { ...prev, [blockId]: !isCurrentlySelected }

      // Remove unchecked blocks from the object
      if (isCurrentlySelected) {
        delete updated[blockId]
      }

      // Mark for parent notification (will be handled by useEffect)
      pendingUpdateRef.current = updated

      return updated
    })
  }, [])

  // Select/deselect all blocks - memoized to prevent unnecessary re-renders
  const handleSelectAll = useCallback((checked: boolean) => {
    const allBlocks = blocks.flatMap(section => section.properties || [])
    const updated: Record<string, boolean> = {}

    allBlocks.forEach(block => {
      if (checked) {
        updated[block.id] = true
      }
    })

    // Mark for parent notification (will be handled by useEffect)
    pendingUpdateRef.current = updated
    setSelectedBlocks(updated)
  }, [blocks])

  // Get selected count
  const selectedCount = Object.values(selectedBlocks).filter(Boolean).length
  const totalBlocks = blocks.reduce((acc, section) => acc + (section.properties?.length || 0), 0)

  // Get block type icon/color
  const getBlockTypeStyle = (blockType: string): string => {
    const styles: Record<string, string> = {
      'paragraph': 'bg-gray-100 dark:bg-gray-800',
      'heading_1': 'bg-purple-100 dark:bg-purple-900/30',
      'heading_2': 'bg-purple-100 dark:bg-purple-900/30',
      'heading_3': 'bg-purple-100 dark:bg-purple-900/30',
      'bulleted_list_item': 'bg-blue-100 dark:bg-blue-900/30',
      'numbered_list_item': 'bg-blue-100 dark:bg-blue-900/30',
      'to_do': 'bg-green-100 dark:bg-green-900/30',
      'toggle': 'bg-yellow-100 dark:bg-yellow-900/30',
      'code': 'bg-orange-100 dark:bg-orange-900/30',
      'quote': 'bg-indigo-100 dark:bg-indigo-900/30',
      'callout': 'bg-pink-100 dark:bg-pink-900/30',
      'image': 'bg-cyan-100 dark:bg-cyan-900/30',
      'video': 'bg-cyan-100 dark:bg-cyan-900/30',
      'file': 'bg-slate-100 dark:bg-slate-800',
      'divider': 'bg-gray-200 dark:bg-gray-700',
    }
    return styles[blockType] || 'bg-gray-100 dark:bg-gray-800'
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>{field.label}</Label>
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span>Loading page blocks...</span>
        </div>
      </div>
    )
  }

  if (!values.page) {
    return (
      <div className="space-y-2">
        <Label>{field.label}</Label>
        <p className="text-sm text-muted-foreground">
          Select a page first to see available blocks.
        </p>
      </div>
    )
  }

  if (blocks.length === 0 || totalBlocks === 0) {
    return (
      <div className="space-y-2">
        <Label>{field.label}</Label>
        <p className="text-sm text-muted-foreground">
          No content blocks found on this page.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>{field.label}</Label>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            {selectedCount} of {totalBlocks} selected
          </span>
          <button
            type="button"
            onClick={() => handleSelectAll(selectedCount < totalBlocks)}
            className="text-primary hover:underline"
          >
            {selectedCount < totalBlocks ? 'Select all' : 'Deselect all'}
          </button>
        </div>
      </div>

      {selectedCount > 0 && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {selectedCount} block{selectedCount > 1 ? 's' : ''} will be deleted.
            Deleted blocks are moved to trash and can be recovered within 30 days.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2 max-h-[400px] overflow-y-auto border rounded-md p-2">
        {blocks.map((section) => (
          <div key={section.id}>
            {section.properties?.map((block) => (
              <div
                key={block.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-md transition-colors cursor-pointer",
                  getBlockTypeStyle(block.blockType),
                  selectedBlocks[block.id] && "ring-2 ring-destructive/50 bg-destructive/10"
                )}
                onClick={(e) => {
                  // Find and click the checkbox inside this row
                  const checkbox = e.currentTarget.querySelector('button[role="checkbox"]') as HTMLButtonElement
                  if (checkbox && e.target !== checkbox) {
                    checkbox.click()
                  }
                }}
              >
                <Checkbox
                  id={`block-${block.id}`}
                  checked={selectedBlocks[block.id] || false}
                  onCheckedChange={(checked) => handleBlockSelect(block.id, checked === true)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Trash2 className={cn(
                      "h-4 w-4 flex-shrink-0",
                      selectedBlocks[block.id] ? "text-destructive" : "text-muted-foreground"
                    )} />
                    <span className="text-sm font-medium truncate">
                      {block.label}
                    </span>
                  </div>
                  {block.hasChildren && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ⚠️ Has nested content that will also be deleted
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {field.description && (
        <p className="text-xs text-muted-foreground">
          {field.description}
        </p>
      )}
    </div>
  )
}
