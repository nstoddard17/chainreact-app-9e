"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Play, Pause, Settings, MoreVertical } from "lucide-react"

export default function WorkflowsContent() {
  const [workflows] = useState([
    {
      id: 1,
      name: "Email to Slack Notification",
      description: "Automatically post new emails to Slack channel",
      status: "active",
      lastRun: "2 hours ago",
      runs: 45,
    },
    {
      id: 2,
      name: "GitHub to Discord",
      description: "Send GitHub notifications to Discord",
      status: "paused",
      lastRun: "1 day ago",
      runs: 23,
    },
    {
      id: 3,
      name: "Calendar Sync",
      description: "Sync Google Calendar with Notion",
      status: "active",
      lastRun: "30 minutes ago",
      runs: 156,
    },
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Workflows</h1>
          <p className="text-slate-600 mt-1">Automate your tasks with powerful workflows</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Create Workflow
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workflows.map((workflow) => (
          <Card key={workflow.id} className="bg-white border border-slate-200 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg font-semibold text-slate-900">{workflow.name}</CardTitle>
                  <p className="text-sm text-slate-600 mt-1">{workflow.description}</p>
                </div>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge
                  variant={workflow.status === "active" ? "default" : "secondary"}
                  className={
                    workflow.status === "active"
                      ? "bg-green-100 text-green-800 border-green-200"
                      : "bg-gray-100 text-gray-800 border-gray-200"
                  }
                >
                  {workflow.status === "active" ? "Active" : "Paused"}
                </Badge>
                <div className="text-sm text-slate-500">{workflow.runs} runs</div>
              </div>

              <div className="text-sm text-slate-600">
                <span className="font-medium">Last run:</span> {workflow.lastRun}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 bg-white text-black border border-slate-200 hover:bg-slate-100"
                >
                  {workflow.status === "active" ? (
                    <>
                      <Pause className="w-4 h-4 mr-2" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Resume
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white text-black border border-slate-200 hover:bg-slate-100"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {workflows.length === 0 && (
        <div className="text-center py-12">
          <div className="text-slate-400 text-lg mb-2">No workflows yet</div>
          <p className="text-slate-500 mb-4">Create your first workflow to get started</p>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Create Your First Workflow
          </Button>
        </div>
      )}
    </div>
  )
}
