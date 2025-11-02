'use client'

import React, { useState } from 'react'
import { useWorkflowStore, type Workflow } from '@/stores/workflowStore'
import { ChevronDown, ChevronRight, User, Users, Building2, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WorkspaceGroupViewProps {
  workflows: Workflow[]
  renderWorkflowCard: (workflow: Workflow) => React.ReactNode
}

export function WorkspaceGroupView({ workflows, renderWorkflowCard }: WorkspaceGroupViewProps) {
  const { getGroupedWorkflows } = useWorkflowStore()
  const grouped = getGroupedWorkflows()

  // State for collapsed/expanded sections
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  const isSectionCollapsed = (sectionId: string) => collapsedSections.has(sectionId)

  // Helper to render a workspace section
  const renderSection = (
    sectionId: string,
    title: string,
    icon: React.ReactNode,
    workflows: Workflow[],
    subtitle?: string
  ) => {
    if (workflows.length === 0) return null

    const isCollapsed = isSectionCollapsed(sectionId)

    return (
      <div key={sectionId} className="mb-6">
        {/* Section Header */}
        <button
          onClick={() => toggleSection(sectionId)}
          className="flex items-center gap-3 w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors group"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          )}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {icon}
            <div className="flex flex-col items-start min-w-0">
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{title}</span>
              {subtitle && (
                <span className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>
              )}
            </div>
          </div>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 bg-slate-300 dark:bg-slate-600 px-2 py-1 rounded">
            {workflows.length}
          </span>
        </button>

        {/* Section Content */}
        {!isCollapsed && (
          <div className="mt-3 space-y-2 pl-4">
            {workflows.map(workflow => (
              <div key={workflow.id}>
                {renderWorkflowCard(workflow)}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Personal Workflows */}
      {renderSection(
        'personal',
        'Personal Workflows',
        <User className="w-5 h-5 text-blue-600" />,
        grouped.personal,
        'Your private workflows'
      )}

      {/* Organization Workflows */}
      {Object.entries(grouped.organizations).map(([orgId, orgWorkflows]) => {
        // You might want to fetch organization names here
        // For now, just show the count
        return renderSection(
          `org-${orgId}`,
          `Organization Workspace`,
          <Building2 className="w-5 h-5 text-purple-600" />,
          orgWorkflows,
          `${orgWorkflows.length} workflows`
        )
      })}

      {/* Team Workflows */}
      {Object.entries(grouped.teams).map(([teamId, teamWorkflows]) => {
        // You might want to fetch team names here
        // For now, just show the count
        return renderSection(
          `team-${teamId}`,
          `Team Workspace`,
          <Users className="w-5 h-5 text-green-600" />,
          teamWorkflows,
          `${teamWorkflows.length} workflows`
        )
      })}

      {/* No workflows message */}
      {grouped.personal.length === 0 &&
       Object.keys(grouped.organizations).length === 0 &&
       Object.keys(grouped.teams).length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <Folder className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-lg font-medium">No workflows found</p>
          <p className="text-sm">Create your first workflow to get started</p>
        </div>
      )}
    </div>
  )
}
