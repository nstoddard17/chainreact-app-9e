"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, RefreshCw } from "lucide-react"

interface Execution {
  id: string
  status: "pending" | "running" | "success" | "error"
  started_at: string
  completed_at?: string
  execution_time_ms?: number
  error_message?: string
}

interface WorkflowExecutionsProps {
  workflowId: string
}

export default function WorkflowExecutions({ workflowId }: WorkflowExecutionsProps) {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)

  const fetchExecutions = async () => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/executions`)
      const data = await response.json()
      setExecutions(data)
    } catch (error) {
      console.error("Failed to fetch executions:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExecutions()
  }, [workflowId])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-700"
      case "error":
        return "bg-red-100 text-red-700"
      case "running":
        return "bg-blue-100 text-blue-700"
      default:
        return "bg-yellow-100 text-yellow-700"
    }
  }

  return (
    <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold text-slate-900">Execution History</CardTitle>
          <Button variant="outline" size="sm" onClick={fetchExecutions}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-slate-500">Loading executions...</div>
        ) : executions.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No executions yet</div>
        ) : (
          <div className="space-y-4">
            {executions.map((execution) => (
              <div
                key={execution.id}
                className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <Badge className={getStatusColor(execution.status)}>{execution.status}</Badge>
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {new Date(execution.started_at).toLocaleString()}
                    </div>
                    {execution.execution_time_ms && (
                      <div className="text-xs text-slate-500">Duration: {execution.execution_time_ms}ms</div>
                    )}
                    {execution.error_message && (
                      <div className="text-xs text-red-600 mt-1">{execution.error_message}</div>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  <Eye className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
