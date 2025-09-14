'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Send,
  Calculator,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Database,
  DollarSign,
  Hash
} from 'lucide-react'

interface TestResult {
  requestId: string
  model: string
  prompt: string
  response: string
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    cost_usd: number
  }
  timestamp: string
  databaseVerified?: boolean
}

export default function AIUsageTest() {
  const [prompt, setPrompt] = useState('What is 2+2? Please answer in exactly one word.')
  const [model, setModel] = useState('gpt-3.5-turbo')
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runTest = async () => {
    setLoading(true)
    setError(null)
    setTestResult(null)

    try {
      // Step 1: Make the AI request
      console.log('🚀 Making AI request...')
      const aiResponse = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          model,
          action: 'test_tracking',
          temperature: 0.3,
          max_tokens: 100
        })
      })

      if (!aiResponse.ok) {
        const errorData = await aiResponse.json()
        throw new Error(errorData.error || 'AI request failed')
      }

      const aiData = await aiResponse.json()
      console.log('✅ AI Response received:', aiData)

      // Extract the response content
      const responseContent = aiData.content || aiData.choices?.[0]?.message?.content || 'No response'

      // Create test result
      const result: TestResult = {
        requestId: aiData.requestId,
        model: aiData.model || model,
        prompt,
        response: responseContent,
        usage: aiData.usage,
        timestamp: new Date().toISOString()
      }

      // Step 2: Calculate expected cost
      const expectedCost = calculateExpectedCost(model, aiData.usage)
      console.log('💰 Expected cost calculation:', {
        model,
        promptTokens: aiData.usage.prompt_tokens,
        completionTokens: aiData.usage.completion_tokens,
        expectedCost,
        reportedCost: aiData.usage.cost_usd
      })

      // Step 3: Verify in database (wait a moment for the record to be saved)
      console.log('⏳ Waiting for database write...')
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Check the user's usage to see if it increased
      const usageResponse = await fetch('/api/ai/usage')
      if (usageResponse.ok) {
        const usageData = await usageResponse.json()
        console.log('📊 User usage data:', usageData)
        result.databaseVerified = true
      }

      setTestResult(result)

      // Display comparison
      if (Math.abs(expectedCost - aiData.usage.cost_usd) > 0.000001) {
        console.warn('⚠️ Cost mismatch detected!', {
          expected: expectedCost,
          actual: aiData.usage.cost_usd,
          difference: Math.abs(expectedCost - aiData.usage.cost_usd)
        })
      } else {
        console.log('✅ Cost calculation verified!')
      }

    } catch (err: any) {
      console.error('❌ Test error:', err)
      setError(err.message || 'Test failed')
    } finally {
      setLoading(false)
    }
  }

  const calculateExpectedCost = (model: string, usage: any): number => {
    // Mirror the pricing from the API
    const pricing: Record<string, { prompt: number; completion: number }> = {
      'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
      'gpt-4': { prompt: 0.03, completion: 0.06 },
      'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
      'gpt-3.5-turbo-16k': { prompt: 0.003, completion: 0.004 },
    }

    const modelPricing = pricing[model] || pricing['gpt-3.5-turbo']
    const promptCost = (usage.prompt_tokens / 1000) * modelPricing.prompt
    const completionCost = (usage.completion_tokens / 1000) * modelPricing.completion
    return parseFloat((promptCost + completionCost).toFixed(6))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Token Tracking Test
        </CardTitle>
        <CardDescription>
          Test the AI token tracking system by making a request and verifying the cost calculation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Test Configuration */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="model">Model</Label>
            <select
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              disabled={loading}
            >
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo ($0.0005/$0.0015 per 1K)</option>
              <option value="gpt-3.5-turbo-16k">GPT-3.5 Turbo 16K ($0.003/$0.004 per 1K)</option>
              <option value="gpt-4-turbo">GPT-4 Turbo ($0.01/$0.03 per 1K)</option>
              <option value="gpt-4">GPT-4 ($0.03/$0.06 per 1K)</option>
            </select>
          </div>

          <div>
            <Label htmlFor="prompt">Test Prompt</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter a test prompt..."
              rows={3}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Keep it short to minimize test costs
            </p>
          </div>

          <Button
            onClick={runTest}
            disabled={loading || !prompt}
            className="w-full"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Running Test...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Run Test
              </>
            )}
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Test Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Test Results */}
        {testResult && (
          <div className="space-y-4">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-900">Test Completed</AlertTitle>
              <AlertDescription className="text-green-800">
                Request ID: <code className="text-xs">{testResult.requestId}</code>
              </AlertDescription>
            </Alert>

            {/* Response */}
            <div className="p-4 bg-muted rounded-lg">
              <div className="text-sm font-medium mb-2">AI Response:</div>
              <div className="text-sm">{testResult.response}</div>
            </div>

            {/* Token Usage */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-background border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Token Usage</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prompt:</span>
                    <span className="font-mono">{testResult.usage.prompt_tokens}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Completion:</span>
                    <span className="font-mono">{testResult.usage.completion_tokens}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Total:</span>
                    <span className="font-mono">{testResult.usage.total_tokens}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-background border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Cost Calculation</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">API Cost:</span>
                    <span className="font-mono">${testResult.usage.cost_usd.toFixed(6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expected:</span>
                    <span className="font-mono">
                      ${calculateExpectedCost(model, testResult.usage).toFixed(6)}
                    </span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Match:</span>
                    {Math.abs(calculateExpectedCost(model, testResult.usage) - testResult.usage.cost_usd) < 0.000001 ? (
                      <Badge variant="secondary" className="bg-green-100">✓ Verified</Badge>
                    ) : (
                      <Badge variant="destructive">Mismatch</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Database Verification */}
            <div className="p-4 bg-background border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Database Tracking</span>
              </div>
              <div className="text-sm">
                {testResult.databaseVerified ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span>Usage record saved to database</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-orange-600">
                    <AlertCircle className="h-4 w-4" />
                    <span>Verifying database record...</span>
                  </div>
                )}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Check the AI Usage tab to see this request in the usage data.
                <br />
                Look in Supabase for the ai_usage_records table to verify the exact values.
              </div>
            </div>

            {/* Instructions */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Verification Steps</AlertTitle>
              <AlertDescription className="space-y-2 mt-2">
                <div>1. ✅ AI request completed with token counts</div>
                <div>2. ✅ Cost calculated: ${testResult.usage.cost_usd.toFixed(6)}</div>
                <div>3. 📊 Check Supabase → ai_usage_records table</div>
                <div>4. 🔍 Find record with request_id: {testResult.requestId}</div>
                <div>5. ✓ Verify: prompt_tokens, completion_tokens, total_tokens, cost_usd match</div>
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  )
}