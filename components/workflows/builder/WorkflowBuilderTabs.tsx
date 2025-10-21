"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Workflow, History, Settings } from "lucide-react"

interface WorkflowBuilderTabsProps {
  workflowId: string | null
  builderContent: React.ReactNode
  historyContent?: React.ReactNode
  settingsContent?: React.ReactNode
}

export function WorkflowBuilderTabs({
  workflowId,
  builderContent,
  historyContent,
  settingsContent
}: WorkflowBuilderTabsProps) {
  const [activeTab, setActiveTab] = useState("builder")

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
      {/* Tab Navigation */}
      <div className="border-b bg-background px-6">
        <TabsList className="h-12 bg-transparent p-0">
          <TabsTrigger
            value="builder"
            className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            <Workflow className="w-4 h-4 mr-2" />
            Builder
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            disabled={!workflowId}
          >
            <History className="w-4 h-4 mr-2" />
            History
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            disabled={!workflowId}
          >
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Tab Content */}
      <TabsContent value="builder" className="flex-1 m-0 overflow-hidden">
        {builderContent}
      </TabsContent>

      <TabsContent value="history" className="flex-1 m-0 overflow-hidden">
        {historyContent || (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">History tab coming soon</p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="settings" className="flex-1 m-0 overflow-hidden">
        {settingsContent || (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Settings tab coming soon</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}
