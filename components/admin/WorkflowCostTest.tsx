'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Send,
  Calculator,
  CheckCircle,
  AlertCircle,
  Workflow,
  DollarSign,
  Hash,
  Plus,
  Trash2,
  Copy
} from 'lucide-react'

interface WorkflowStep {
  id: string
  type: 'prompt' | 'response' | 'function'
  model: string
  prompt?: string
  expectedTokens?: number
  functionCalls?: number
}

interface WorkflowTestResult {
  totalCost: number
  totalTokens: number
  steps: Array<{
    step: string
    model: string
    inputTokens: number
    outputTokens: number
    cost: number
  }>
  breakdown: {
    promptTokens: number
    completionTokens: number
    costByModel: Record<string, number>
  }
}

const MODEL_PRICING: Record<string, { prompt: number; completion: number }> = {
  'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
  'gpt-4': { prompt: 0.03, completion: 0.06 },
  'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
  'gpt-3.5-turbo-16k': { prompt: 0.003, completion: 0.004 },
}

export default function WorkflowCostTest() {
  const [workflowName, setWorkflowName] = useState('Customer Support Workflow')
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: '1',
      type: 'prompt',
      model: 'gpt-3.5-turbo',
      prompt: 'Analyze customer sentiment from: "I am very frustrated with your service"',
      expectedTokens: 50
    },
    {
      id: '2',
      type: 'prompt',
      model: 'gpt-4-turbo',
      prompt: 'Generate a professional response to address the customer frustration',
      expectedTokens: 150
    }
  ])
  const [testResult, setTestResult] = useState<WorkflowTestResult | null>(null)
  const [executionCount, setExecutionCount] = useState('100')

  const addStep = () => {
    const newStep: WorkflowStep = {
      id: Date.now().toString(),
      type: 'prompt',
      model: 'gpt-3.5-turbo',
      prompt: '',
      expectedTokens: 100
    }
    setSteps([...steps, newStep])
  }

  const removeStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id))
  }

  const updateStep = (id: string, updates: Partial<WorkflowStep>) => {
    setSteps(steps.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  const calculateWorkflowCost = () => {
    const result: WorkflowTestResult = {
      totalCost: 0,
      totalTokens: 0,
      steps: [],
      breakdown: {
        promptTokens: 0,
        completionTokens: 0,
        costByModel: {}
      }
    }

    steps.forEach((step, index) => {
      const pricing = MODEL_PRICING[step.model] || MODEL_PRICING['gpt-3.5-turbo']

      // Estimate tokens (rough approximation)
      const promptTokens = step.prompt ? Math.ceil(step.prompt.length / 4) : 20
      const completionTokens = step.expectedTokens || 100

      const promptCost = (promptTokens / 1000) * pricing.prompt
      const completionCost = (completionTokens / 1000) * pricing.completion
      const stepCost = promptCost + completionCost

      result.steps.push({
        step: `Step ${index + 1}`,
        model: step.model,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        cost: stepCost
      })

      result.totalCost += stepCost
      result.totalTokens += promptTokens + completionTokens
      result.breakdown.promptTokens += promptTokens
      result.breakdown.completionTokens += completionTokens

      if (!result.breakdown.costByModel[step.model]) {
        result.breakdown.costByModel[step.model] = 0
      }
      result.breakdown.costByModel[step.model] += stepCost
    })

    setTestResult(result)
  }

  const duplicateStep = (step: WorkflowStep) => {
    const newStep = {
      ...step,
      id: Date.now().toString()
    }
    setSteps([...steps, newStep])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Workflow className="h-5 w-5" />
          Workflow Cost Estimator
        </CardTitle>
        <CardDescription>
          Simulate a workflow to estimate AI token costs before implementation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Workflow Configuration */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="workflow-name">Workflow Name</Label>
            <Input
              id="workflow-name"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              placeholder="Enter workflow name..."
            />
          </div>

          <div>
            <Label htmlFor="execution-count">Expected Monthly Executions</Label>
            <Input
              id="execution-count"
              type="number"
              value={executionCount}
              onChange={(e) => setExecutionCount(e.target.value)}
              placeholder="100"
            />
            <p className="text-xs text-muted-foreground mt-1">
              How many times this workflow will run per month
            </p>
          </div>

          {/* Workflow Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Workflow Steps</Label>
              <Button variant="outline" size="sm" onClick={addStep}>
                <Plus className="h-4 w-4 mr-1" />
                Add Step
              </Button>
            </div>

            <div className="space-y-3">
              {steps.map((step, index) => (
                <div key={step.id} className="p-4 border rounded-lg space-y-3 bg-muted/50">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">Step {index + 1}</span>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => duplicateStep(step)}
                        title="Duplicate step"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeStep(step.id)}
                        disabled={steps.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Model</Label>
                      <Select
                        value={step.model}
                        onValueChange={(value) => updateStep(step.id, { model: value })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                          <SelectItem value="gpt-3.5-turbo-16k">GPT-3.5 Turbo 16K</SelectItem>
                          <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                          <SelectItem value="gpt-4">GPT-4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">Expected Output Tokens</Label>
                      <Input
                        type="number"
                        value={step.expectedTokens}
                        onChange={(e) => updateStep(step.id, { expectedTokens: parseInt(e.target.value) || 100 })}
                        placeholder="100"
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Prompt / Description</Label>
                    <Textarea
                      value={step.prompt}
                      onChange={(e) => updateStep(step.id, { prompt: e.target.value })}
                      placeholder="Describe what this step does or enter the prompt..."
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={calculateWorkflowCost} className="w-full">
            <Calculator className="h-4 w-4 mr-2" />
            Calculate Workflow Cost
          </Button>
        </div>

        {/* Test Results */}
        {testResult && (
          <div className="space-y-4">
            <Alert className="border-blue-200 bg-blue-50">
              <Calculator className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-900">Cost Estimation Complete</AlertTitle>
              <AlertDescription className="text-blue-800">
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between">
                    <span>Per Execution:</span>
                    <span className="font-mono font-medium">${testResult.totalCost.toFixed(6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Monthly Cost ({executionCount} runs):</span>
                    <span className="font-mono font-medium">
                      ${(testResult.totalCost * parseInt(executionCount || '0')).toFixed(2)}
                    </span>
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            {/* Step Breakdown */}
            <div className="p-4 bg-background border rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Step-by-Step Breakdown</span>
              </div>
              <div className="space-y-2">
                {testResult.steps.map((step, index) => (
                  <div key={index} className="flex justify-between text-sm py-1 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{step.step}:</span>
                      <Badge variant="outline" className="text-xs">{step.model}</Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-muted-foreground">
                        {step.inputTokens} + {step.outputTokens} tokens
                      </span>
                      <span className="font-mono">${step.cost.toFixed(6)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary Statistics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-background border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Token Summary</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Input:</span>
                    <span className="font-mono">{testResult.breakdown.promptTokens}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Output:</span>
                    <span className="font-mono">{testResult.breakdown.completionTokens}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Total:</span>
                    <span className="font-mono">{testResult.totalTokens}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-background border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Cost by Model</span>
                </div>
                <div className="space-y-1 text-sm">
                  {Object.entries(testResult.breakdown.costByModel).map(([model, cost]) => (
                    <div key={model} className="flex justify-between">
                      <span className="text-muted-foreground text-xs">{model}:</span>
                      <span className="font-mono">${cost.toFixed(6)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Projection */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Cost Projections</AlertTitle>
              <AlertDescription className="space-y-2 mt-2">
                <div>Daily: ${(testResult.totalCost * parseInt(executionCount || '0') / 30).toFixed(2)}</div>
                <div>Weekly: ${(testResult.totalCost * parseInt(executionCount || '0') / 4).toFixed(2)}</div>
                <div>Monthly: ${(testResult.totalCost * parseInt(executionCount || '0')).toFixed(2)}</div>
                <div>Yearly: ${(testResult.totalCost * parseInt(executionCount || '0') * 12).toFixed(2)}</div>
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  )
}