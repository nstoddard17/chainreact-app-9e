/**
 * Template Analytics Dashboard
 * Admin-only dashboard for viewing template performance and cost savings
 */

"use client"

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Zap,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react'
import { logger } from '@/lib/utils/logger'

interface TemplatePerformance {
  templateId: string
  templateSource: string
  totalUses: number
  successRate: number
  plansBuilt: number
  plansExecuted: number
  totalCostSaved: number
  executionRate: number
  lastUsedAt: string
}

interface CostSavingsSummary {
  totalPrompts: number
  templateUses: number
  llmUses: number
  totalCostSaved: number
  totalCostSpent: number
  templateHitRate: number
  avgCostPerPrompt: number
}

interface TemplateCandidate {
  prompt: string
  frequency: number
  providersUsed: string[]
  avgComplexity: number
  buildCount: number
  lastSeen: string
}

export function TemplateAnalyticsDashboard() {
  const [templates, setTemplates] = useState<TemplatePerformance[]>([])
  const [summary, setSummary] = useState<CostSavingsSummary | null>(null)
  const [candidates, setCandidates] = useState<TemplateCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingTemplates, setGeneratingTemplates] = useState(false)

  // Fetch analytics data
  const fetchAnalytics = async () => {
    try {
      setLoading(true)

      // Fetch template performance
      const templateRes = await fetch('/api/analytics/templates')
      if (templateRes.ok) {
        const data = await templateRes.json()
        setTemplates(data.templates || [])
        setSummary(data.summary || null)
      }

      // Fetch template candidates
      const candidatesRes = await fetch('/api/analytics/template-candidates')
      if (candidatesRes.ok) {
        const data = await candidatesRes.json()
        setCandidates(data.candidates || [])
      }

    } catch (error) {
      logger.error('[TemplateAnalytics] Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  // Generate templates from clusters
  const handleGenerateTemplates = async () => {
    try {
      setGeneratingTemplates(true)

      const response = await fetch('/api/analytics/generate-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minSimilarPrompts: 5,
          minConfidence: 70
        })
      })

      if (response.ok) {
        const data = await response.json()
        logger.info('[TemplateAnalytics] Generated templates:', data.results)

        // Refresh data
        await fetchAnalytics()
      } else {
        logger.error('[TemplateAnalytics] Failed to generate templates')
      }

    } catch (error) {
      logger.error('[TemplateAnalytics] Error generating templates:', error)
    } finally {
      setGeneratingTemplates(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Prompts</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalPrompts || 0}</div>
            <p className="text-xs text-muted-foreground">
              {summary?.templateUses || 0} template hits
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Template Hit Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.templateHitRate?.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {summary?.llmUses || 0} LLM fallbacks
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost Saved</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${summary?.totalCostSaved?.toFixed(2) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              vs ${summary?.totalCostSpent?.toFixed(2) || '0.00'} spent
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Cost/Prompt</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${summary?.avgCostPerPrompt?.toFixed(4) || '0.0000'}
            </div>
            <p className="text-xs text-muted-foreground">
              {((1 - (summary?.avgCostPerPrompt || 0) / 0.03) * 100).toFixed(0)}% reduction
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates">
            Templates ({templates.length})
          </TabsTrigger>
          <TabsTrigger value="candidates">
            Candidates ({candidates.length})
          </TabsTrigger>
        </TabsList>

        {/* Template Performance Tab */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Template Performance</h3>
              <p className="text-sm text-muted-foreground">
                Usage metrics for all templates
              </p>
            </div>
            <Button onClick={fetchAnalytics} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          <div className="grid gap-4">
            {templates.map((template) => (
              <Card key={template.templateId}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">{template.templateId}</CardTitle>
                      <CardDescription>
                        {template.templateSource === 'built_in' ? 'Built-in' : 'Dynamic'} template
                      </CardDescription>
                    </div>
                    <Badge variant={template.successRate >= 80 ? 'default' : 'secondary'}>
                      {template.successRate.toFixed(0)}% success
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Uses</div>
                      <div className="font-semibold">{template.totalUses}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Built</div>
                      <div className="font-semibold">{template.plansBuilt}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Executed</div>
                      <div className="font-semibold">{template.plansExecuted}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Cost Saved</div>
                      <div className="font-semibold text-green-600">
                        ${template.totalCostSaved.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {templates.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <Clock className="w-12 h-12 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No template data yet</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Template Candidates Tab */}
        <TabsContent value="candidates" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Template Candidates</h3>
              <p className="text-sm text-muted-foreground">
                Frequent prompts that should become templates
              </p>
            </div>
            <Button
              onClick={handleGenerateTemplates}
              variant="default"
              size="sm"
              disabled={generatingTemplates || candidates.length === 0}
            >
              {generatingTemplates ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Generate Templates
                </>
              )}
            </Button>
          </div>

          <div className="grid gap-4">
            {candidates.slice(0, 20).map((candidate, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-normal">
                      {candidate.prompt}
                    </CardTitle>
                    <Badge variant="secondary">
                      {candidate.frequency}× used
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>Providers: {candidate.providersUsed.join(', ') || 'None'}</span>
                    <span>•</span>
                    <span>Built: {candidate.buildCount} times</span>
                    <span>•</span>
                    <span>Complexity: {candidate.avgComplexity.toFixed(1)} nodes</span>
                  </div>
                </CardContent>
              </Card>
            ))}

            {candidates.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <CheckCircle className="w-12 h-12 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No template candidates yet</p>
                  <p className="text-sm text-muted-foreground">
                    Need at least 3 similar prompts to create a candidate
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
