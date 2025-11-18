"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, User, Users, Building2, Folder } from "lucide-react"
import { Integration } from "@/stores/integrationStore"
import { useWorkspaces } from "@/hooks/useWorkspaces"

interface GroupedIntegrations {
  personal: Integration[]
  teams: Record<string, Integration[]>
  organizations: Record<string, Integration[]>
}

interface AppsWorkspaceGroupViewProps {
  integrations: Integration[]
  renderAppCard: (integration: Integration) => React.ReactNode
}

export function AppsWorkspaceGroupView({ integrations, renderAppCard }: AppsWorkspaceGroupViewProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const { teams, organizations } = useWorkspaces()

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

  // Group integrations by workspace
  const grouped: GroupedIntegrations = integrations.reduce((acc, integration) => {
    if (integration.workspace_type === 'personal' || !integration.workspace_type) {
      acc.personal.push(integration)
    } else if (integration.workspace_type === 'team' && integration.workspace_id) {
      if (!acc.teams[integration.workspace_id]) {
        acc.teams[integration.workspace_id] = []
      }
      acc.teams[integration.workspace_id].push(integration)
    } else if (integration.workspace_type === 'organization' && integration.workspace_id) {
      if (!acc.organizations[integration.workspace_id]) {
        acc.organizations[integration.workspace_id] = []
      }
      acc.organizations[integration.workspace_id].push(integration)
    }
    return acc
  }, {
    personal: [],
    teams: {},
    organizations: {}
  } as GroupedIntegrations)

  const renderSection = (
    sectionId: string,
    title: string,
    icon: React.ReactNode,
    apps: Integration[],
    subtitle?: string
  ) => {
    if (apps.length === 0) return null

    const isCollapsed = collapsedSections.has(sectionId)

    return (
      <div key={sectionId} className="space-y-3">
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
            {apps.length}
          </span>
        </button>

        {!isCollapsed && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pl-4">
            {apps.map(integration => (
              <div key={integration.id}>
                {renderAppCard(integration)}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Helper to get team/org name
  const getTeamName = (teamId: string) => {
    const team = teams.find(t => t.id === teamId)
    return team?.name || 'Team Workspace'
  }

  const getOrgName = (orgId: string) => {
    const org = organizations.find(o => o.id === orgId)
    return org?.name || 'Organization Workspace'
  }

  const hasAnyApps =
    grouped.personal.length > 0 ||
    Object.keys(grouped.teams).length > 0 ||
    Object.keys(grouped.organizations).length > 0

  if (!hasAnyApps) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Folder className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" />
        <p className="text-lg font-medium text-slate-600 dark:text-slate-400">No connected apps</p>
        <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Connect your first app to get started</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Personal Apps */}
      {renderSection(
        'personal',
        'Personal Workspace',
        <User className="w-5 h-5 text-blue-600" />,
        grouped.personal,
        'Your private integrations'
      )}

      {/* Organization Apps */}
      {Object.entries(grouped.organizations).map(([orgId, orgApps]) => {
        return renderSection(
          `org-${orgId}`,
          getOrgName(orgId),
          <Building2 className="w-5 h-5 text-purple-600" />,
          orgApps,
          `${orgApps.length} connected apps`
        )
      })}

      {/* Team Apps */}
      {Object.entries(grouped.teams).map(([teamId, teamApps]) => {
        return renderSection(
          `team-${teamId}`,
          getTeamName(teamId),
          <Users className="w-5 h-5 text-green-600" />,
          teamApps,
          `${teamApps.length} connected apps`
        )
      })}
    </div>
  )
}
