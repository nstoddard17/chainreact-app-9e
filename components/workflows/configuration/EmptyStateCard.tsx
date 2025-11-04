"use client"

/**
 * EmptyStateCard Component
 *
 * Intelligent empty state cards that provide context-aware guidance
 * when no data is available. Much better than "No compatible fields found".
 *
 * Features:
 * - Context-aware messaging based on field type
 * - Actionable suggestions
 * - Visual icons
 * - Quick action buttons
 * - Integration-specific guidance
 */

import React from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  FileText,
  Mail,
  Calendar,
  Image,
  Database,
  Table,
  Folder,
  Link,
  Users,
  Tag,
  Lightbulb,
  Plus,
  ArrowRight
} from 'lucide-react'
import { cn } from '@/lib/utils'

type EmptyStateType =
  | 'files'
  | 'tables'
  | 'emails'
  | 'calendar'
  | 'images'
  | 'database'
  | 'links'
  | 'contacts'
  | 'tags'
  | 'generic'

interface EmptyStateCardProps {
  /** Type of empty state to show */
  type: EmptyStateType
  /** Custom title (overrides default) */
  title?: string
  /** Custom description (overrides default) */
  description?: string
  /** What the user needs to do */
  suggestion?: string
  /** Action button label */
  actionLabel?: string
  /** Action button callback */
  onAction?: () => void
  /** Secondary action label */
  secondaryActionLabel?: string
  /** Secondary action callback */
  onSecondaryAction?: () => void
  /** Custom className */
  className?: string
  /** Show as compact version */
  compact?: boolean
}

export function EmptyStateCard({
  type,
  title,
  description,
  suggestion,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className,
  compact = false,
}: EmptyStateCardProps) {
  const config = getEmptyStateConfig(type)
  const Icon = config.icon

  const finalTitle = title || config.title
  const finalDescription = description || config.description
  // Only use config suggestion if suggestion prop is undefined (not passed)
  const finalSuggestion = suggestion !== undefined ? suggestion : config.suggestion
  const finalActionLabel = actionLabel || config.actionLabel

  if (compact) {
    return (
      <div className={cn(
        "flex items-center gap-3 p-3 border border-dashed rounded-lg bg-slate-50/50 dark:bg-slate-900/50",
        className
      )}>
        <div className={cn("flex-shrink-0", config.iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {finalTitle}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
            {finalDescription}
          </p>
        </div>
        {onAction && (
          <Button variant="outline" size="sm" onClick={onAction} className="flex-shrink-0">
            {finalActionLabel}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className={cn(
      "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900 dark:to-slate-800/50",
      className
    )}>
      {/* Icon */}
      <div className={cn(
        "w-16 h-16 rounded-full flex items-center justify-center mb-4",
        "bg-gradient-to-br",
        config.iconBg
      )}>
        <Icon className={cn("h-8 w-8", config.iconColor)} />
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2 text-center">
        {finalTitle}
      </h3>

      {/* Description */}
      <p className="text-sm text-slate-600 dark:text-slate-400 text-center max-w-md mb-4">
        {finalDescription}
      </p>

      {/* Suggestion */}
      {finalSuggestion && (
        <Alert className="mb-4 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
          <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertTitle className="text-sm text-blue-900 dark:text-blue-100">Suggestion</AlertTitle>
          <AlertDescription className="text-xs text-blue-700 dark:text-blue-300">
            {finalSuggestion}
          </AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {onAction && (
          <Button onClick={onAction} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            {finalActionLabel}
          </Button>
        )}
        {onSecondaryAction && secondaryActionLabel && (
          <Button onClick={onSecondaryAction} variant="outline" size="sm" className="gap-2">
            {secondaryActionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Get configuration for each empty state type
 */
function getEmptyStateConfig(type: EmptyStateType) {
  const configs: Record<EmptyStateType, {
    icon: React.ElementType
    iconColor: string
    iconBg: string
    title: string
    description: string
    suggestion: string
    actionLabel: string
  }> = {
    files: {
      icon: FileText,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBg: 'from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800',
      title: 'No Files Available',
      description: 'This field requires files from a previous step in your workflow, but none are available yet.',
      suggestion: 'Add a File Upload node or connect a cloud storage service (Dropbox, Google Drive) earlier in your workflow to provide files.',
      actionLabel: 'Add File Source',
    },
    tables: {
      icon: Table,
      iconColor: 'text-green-600 dark:text-green-400',
      iconBg: 'from-green-100 to-green-200 dark:from-green-900 dark:to-green-800',
      title: 'No Tables Available',
      description: 'This field expects table or spreadsheet data, but none have been loaded yet.',
      suggestion: 'Connect an Airtable, Google Sheets, or Excel node earlier in your workflow to provide table data.',
      actionLabel: 'Add Data Source',
    },
    emails: {
      icon: Mail,
      iconColor: 'text-purple-600 dark:text-purple-400',
      iconBg: 'from-purple-100 to-purple-200 dark:from-purple-900 dark:to-purple-800',
      title: 'No Email Data Available',
      description: 'This field needs email data from a previous step.',
      suggestion: 'Add a Gmail or Outlook trigger to your workflow to capture email data.',
      actionLabel: 'Add Email Trigger',
    },
    calendar: {
      icon: Calendar,
      iconColor: 'text-orange-600 dark:text-orange-400',
      iconBg: 'from-orange-100 to-orange-200 dark:from-orange-900 dark:to-orange-800',
      title: 'No Calendar Events',
      description: 'This field requires calendar event data.',
      suggestion: 'Connect Google Calendar or Outlook Calendar to access event data.',
      actionLabel: 'Add Calendar',
    },
    images: {
      icon: Image,
      iconColor: 'text-pink-600 dark:text-pink-400',
      iconBg: 'from-pink-100 to-pink-200 dark:from-pink-900 dark:to-pink-800',
      title: 'No Images Available',
      description: 'This field needs image files from your workflow.',
      suggestion: 'Add a file upload or image generation node to provide images.',
      actionLabel: 'Add Image Source',
    },
    database: {
      icon: Database,
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      iconBg: 'from-indigo-100 to-indigo-200 dark:from-indigo-900 dark:to-indigo-800',
      title: 'No Database Records',
      description: 'This field requires records from a database.',
      suggestion: 'Connect a database like Airtable, PostgreSQL, or MongoDB to query records.',
      actionLabel: 'Add Database',
    },
    links: {
      icon: Link,
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      iconBg: 'from-cyan-100 to-cyan-200 dark:from-cyan-900 dark:to-cyan-800',
      title: 'No Links Available',
      description: 'This field needs URL data from previous steps.',
      suggestion: 'Make sure earlier nodes in your workflow output URL fields.',
      actionLabel: 'Browse Variables',
    },
    contacts: {
      icon: Users,
      iconColor: 'text-teal-600 dark:text-teal-400',
      iconBg: 'from-teal-100 to-teal-200 dark:from-teal-900 dark:to-teal-800',
      title: 'No Contacts Available',
      description: 'This field requires contact information.',
      suggestion: 'Connect a CRM like HubSpot or Salesforce, or add a form trigger to collect contact data.',
      actionLabel: 'Add Contact Source',
    },
    tags: {
      icon: Tag,
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'from-amber-100 to-amber-200 dark:from-amber-900 dark:to-amber-800',
      title: 'No Tags Available',
      description: 'This field expects tag or category data.',
      suggestion: 'Add tags manually or connect a data source that provides tagging information.',
      actionLabel: 'Add Tags',
    },
    generic: {
      icon: Folder,
      iconColor: 'text-slate-600 dark:text-slate-400',
      iconBg: 'from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700',
      title: 'No Data Available',
      description: 'No compatible data found from previous workflow steps.',
      suggestion: 'Make sure earlier nodes in your workflow output the data type needed for this field.',
      actionLabel: 'Browse Nodes',
    },
  }

  return configs[type]
}

/**
 * Usage Examples:
 *
 * // Files
 * <EmptyStateCard
 *   type="files"
 *   onAction={() => openNodeCatalog('file')}
 * />
 *
 * // Tables with custom message
 * <EmptyStateCard
 *   type="tables"
 *   description="Connect Airtable to use table data in email templates"
 *   onAction={() => openNodeCatalog('airtable')}
 *   secondaryActionLabel="Learn More"
 *   onSecondaryAction={() => openDocs()}
 * />
 *
 * // Compact version
 * <EmptyStateCard
 *   type="files"
 *   compact
 *   onAction={() => openNodeCatalog('file')}
 * />
 */
