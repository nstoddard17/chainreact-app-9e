"use client"

/**
 * Test Data Confirmation Dialog
 *
 * Shows a confirmation dialog when testing a node that will use
 * sample data or data from a previous workflow run.
 */

import React from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Clock, FlaskConical, Info } from 'lucide-react'
import {
  TestDataAnalysis,
  UpstreamDependency,
  getActionFriendlyName,
  formatTimestamp
} from '@/lib/workflows/testing/testDataUtils'

interface TestDataConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  analysis: TestDataAnalysis
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Get the appropriate icon for the data source
 */
function DataSourceIcon({ dataSource }: { dataSource: 'live' | 'previous_execution' | 'sample' }) {
  switch (dataSource) {
    case 'sample':
      return <FlaskConical className="h-5 w-5 text-amber-500" />
    case 'previous_execution':
      return <Clock className="h-5 w-5 text-blue-500" />
    default:
      return <Info className="h-5 w-5 text-green-500" />
  }
}

/**
 * Render a single dependency item showing what value will be used
 */
function DependencyItem({ dep }: { dep: UpstreamDependency }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-sm font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
            {dep.variable.fullMatch}
          </code>
          {dep.hasExecutionData ? (
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
              Previous Run
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800">
              Sample Data
            </Badge>
          )}
        </div>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          <span className="text-slate-400 dark:text-slate-500">Will use: </span>
          <span className="text-slate-600 dark:text-slate-300 font-medium">
            {dep.hasExecutionData ? (
              <>Cached data from {formatTimestamp(dep.executionDataTimestamp!)}</>
            ) : (
              <>&quot;{dep.sampleValue}&quot;</>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}

export function TestDataConfirmationDialog({
  open,
  onOpenChange,
  analysis,
  onConfirm,
  onCancel
}: TestDataConfirmationDialogProps) {
  const actionName = getActionFriendlyName(analysis.actionType)

  // Group dependencies by data source
  const sampleDeps = analysis.dependencies.filter(d => !d.hasExecutionData)
  const cachedDeps = analysis.dependencies.filter(d => d.hasExecutionData)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <AlertDialogTitle className="text-lg">
              Test with {analysis.dataSource === 'sample' ? 'Sample' : 'Cached'} Data?
            </AlertDialogTitle>
          </div>
        </AlertDialogHeader>

        <AlertDialogDescription asChild>
          <div className="space-y-4">
            {/* Warning message */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <DataSourceIcon dataSource={analysis.dataSource} />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-1">
                  This action will actually execute
                </p>
                <p className="text-amber-700 dark:text-amber-300">
                  The <strong>{actionName}</strong> action will run with {analysis.dataSource === 'sample' ? 'placeholder' : 'previously cached'} values.
                  This may send real emails, create records, or perform other live actions.
                </p>
              </div>
            </div>

            {/* Show variables that will use sample data */}
            {sampleDeps.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-amber-500" />
                  Using Sample Data ({sampleDeps.length})
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {sampleDeps.slice(0, 5).map((dep, i) => (
                    <DependencyItem key={i} dep={dep} />
                  ))}
                  {sampleDeps.length > 5 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 pl-3">
                      ...and {sampleDeps.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Show variables that will use cached data */}
            {cachedDeps.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  Using Previous Run Data ({cachedDeps.length})
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {cachedDeps.slice(0, 3).map((dep, i) => (
                    <DependencyItem key={i} dep={dep} />
                  ))}
                  {cachedDeps.length > 3 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 pl-3">
                      ...and {cachedDeps.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Recommendation */}
            <div className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <p className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  For accurate results with real data, run the full workflow from the trigger or test the upstream nodes first.
                </span>
              </p>
            </div>
          </div>
        </AlertDialogDescription>

        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            Test Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Banner to show in results tab indicating what data source was used
 */
interface TestDataSourceBannerProps {
  dataSource: 'live' | 'previous_execution' | 'sample'
  dependencyCount: number
  timestamp?: string
  className?: string
}

export function TestDataSourceBanner({
  dataSource,
  dependencyCount,
  timestamp,
  className = ''
}: TestDataSourceBannerProps) {
  // Don't show banner for live data
  if (dataSource === 'live') return null

  const isSample = dataSource === 'sample'

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
        isSample
          ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
          : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
      } ${className}`}
    >
      {isSample ? (
        <FlaskConical className="h-4 w-4 flex-shrink-0" />
      ) : (
        <Clock className="h-4 w-4 flex-shrink-0" />
      )}
      <span>
        {isSample ? (
          <>
            Tested with <strong>sample data</strong> for {dependencyCount} variable{dependencyCount > 1 ? 's' : ''}.
            Run full workflow for real data.
          </>
        ) : (
          <>
            Tested with <strong>cached data</strong> from {timestamp ? formatTimestamp(timestamp) : 'previous run'}.
          </>
        )}
      </span>
    </div>
  )
}
