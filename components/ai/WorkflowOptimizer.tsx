"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Zap, TrendingUp, AlertTriangle, CheckCircle, Loader2 } from "lucide-react"

interface OptimizationSuggestion {
  id: string
  type: "performance" | "cost" | "reliability" | "security"
  title: string
  description: string
  impact: "low" | "medium" | "high"
  effort: "low" | "medium" | "high"
  savings?: string
}

interface WorkflowOptimizerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflow: any
}

export function WorkflowOptimizer({ open, onOpenChange, workflow }: WorkflowOptimizerProps) {
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (open && workflow) {
      fetchOptimizations()
    }
  }, [open, workflow])

  const fetchOptimizations = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/ai/workflow-optimization", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflowId: workflow.id,
          workflowData: workflow,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setSuggestions(data.suggestions || [])
      } else {
        console.error("Failed to fetch optimizations:", data.error)
        // Mock data for demo
        setSuggestions([
          {
            id: "1",
            type: "performance",
            title: "Reduce API Calls",
            description: "Batch multiple API calls to reduce latency and improve performance.",
            impact: "high",
            effort: "medium",
            savings: "30% faster execution",
          },
          {
            id: "2",
            type: "cost",
            title: "Optimize Trigger Frequency",
            description: "Reduce trigger frequency during low-activity hours to save costs.",
            impact: "medium",
            effort: "low",
            savings: "$50/month",
          },
          {
            id: "3",
            type: "reliability",
            title: "Add Error Handling",
            description: "Add retry logic and error handling to improve workflow reliability.",
            impact: "high",
            effort: "medium",
          },
        ])
      }
    } catch (error) {
      console.error("Error fetching optimizations:", error)
    } finally {
      setLoading(false)
    }
  }

  const applySuggestion = async (suggestionId: string) => {
    try {
      const response = await fetch("/api/ai/apply-optimization", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflowId: workflow.id,
          suggestionId,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setAppliedSuggestions((prev) => new Set([...prev, suggestionId]))
      } else {
        console.error("Failed to apply optimization:", data.error)
      }
    } catch (error) {
      console.error("Error applying optimization:", error)
    }
  }

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case "high":
        return "bg-red-100 text-red-800"
      case "medium":
        return "bg-yellow-100 text-yellow-800"
      case "low":
        return "bg-green-100 text-green-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "performance":
        return <Zap className="h-4 w-4" />
      case "cost":
        return <TrendingUp className="h-4 w-4" />
      case "reliability":
        return <AlertTriangle className="h-4 w-4" />
      case "security":
        return <CheckCircle className="h-4 w-4" />
      default:
        return <Zap className="h-4 w-4" />
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Workflow Optimizer
              </CardTitle>
              <CardDescription>AI-powered suggestions to improve your workflow</CardDescription>
            </div>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              ×
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Analyzing workflow...</span>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No optimization suggestions available.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {suggestions.map((suggestion) => (
                <Card key={suggestion.id} className="border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getTypeIcon(suggestion.type)}
                          <h3 className="font-semibold">{suggestion.title}</h3>
                          <Badge variant="outline" className="capitalize">
                            {suggestion.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">{suggestion.description}</p>
                        <div className="flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">Impact:</span>
                            <Badge variant="secondary" className={getImpactColor(suggestion.impact)}>
                              {suggestion.impact}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">Effort:</span>
                            <Badge variant="secondary" className={getImpactColor(suggestion.effort)}>
                              {suggestion.effort}
                            </Badge>
                          </div>
                          {suggestion.savings && (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">Savings:</span>
                              <span className="font-medium text-green-600">{suggestion.savings}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="ml-4">
                        {appliedSuggestions.has(suggestion.id) ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Applied
                          </Badge>
                        ) : (
                          <Button size="sm" onClick={() => applySuggestion(suggestion.id)}>
                            Apply
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
