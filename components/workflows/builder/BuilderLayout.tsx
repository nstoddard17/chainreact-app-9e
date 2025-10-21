"use client"

import { ReactNode } from "react"
import { BuilderHeader } from "./BuilderHeader"
import { WorkflowBuilderTabs } from "./WorkflowBuilderTabs"
import { HistoryTab } from "./HistoryTab"
import { SettingsTab } from "./SettingsTab"

interface BuilderLayoutProps {
  children: ReactNode
  headerProps?: any
  workflowId?: string | null
  useTabs?: boolean
}

export function BuilderLayout({ children, headerProps, workflowId, useTabs = true }: BuilderLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Full Width Canvas - No Sidebar for Maximum Space */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <BuilderHeader {...headerProps} />

        {/* Canvas Content with Tabs */}
        <main className="flex-1 overflow-hidden relative flex flex-col">
          {useTabs && workflowId ? (
            <WorkflowBuilderTabs
              workflowId={workflowId}
              builderContent={children}
              historyContent={<HistoryTab workflowId={workflowId} />}
              settingsContent={<SettingsTab workflowId={workflowId} />}
            />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  )
}
