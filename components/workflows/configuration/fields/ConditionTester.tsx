"use client"

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Play, CheckCircle, XCircle, AlertTriangle, Copy } from 'lucide-react'
import { ConditionalPath } from './CriteriaBuilder'

interface ConditionTesterProps {
  paths: ConditionalPath[]
  onClose?: () => void
}

interface TestResult {
  pathId: string
  pathName: string
  matched: boolean
  conditionResults: Array<{
    field: string
    operator: string
    value: string
    result: boolean
    actualValue?: any
  }>
}

export function ConditionTester({ paths, onClose }: ConditionTesterProps) {
  const [testData, setTestData] = useState('')
  const [results, setResults] = useState<TestResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [matchedPath, setMatchedPath] = useState<string | null>(null)

  const sampleData = {
    email: {
      subject: "Urgent: Project Deadline",
      from: "boss@company.com",
      priority: 9,
      hasAttachments: true,
    },
    slack: {
      channel: "engineering",
      message: "Deploy successful",
      userId: "U123456",
      reactionCount: 5,
    }
  }

  const loadSampleData = (type: 'email' | 'slack') => {
    setTestData(JSON.stringify(sampleData[type], null, 2))
  }

  const evaluateCondition = (condition: any, data: any) => {
    try {
      // Extract the value from the data using the field path
      const fieldPath = condition.field.split('.')
      let actualValue = data

      for (const key of fieldPath) {
        if (actualValue && typeof actualValue === 'object') {
          actualValue = actualValue[key]
        } else {
          actualValue = undefined
          break
        }
      }

      let result = false

      switch (condition.operator) {
        case 'equals':
          result = actualValue == condition.value
          break
        case 'not_equals':
          result = actualValue != condition.value
          break
        case 'contains':
          result = String(actualValue || '').toLowerCase().includes(String(condition.value).toLowerCase())
          break
        case 'not_contains':
          result = !String(actualValue || '').toLowerCase().includes(String(condition.value).toLowerCase())
          break
        case 'starts_with':
          result = String(actualValue || '').toLowerCase().startsWith(String(condition.value).toLowerCase())
          break
        case 'ends_with':
          result = String(actualValue || '').toLowerCase().endsWith(String(condition.value).toLowerCase())
          break
        case 'greater_than':
          result = Number(actualValue) > Number(condition.value)
          break
        case 'less_than':
          result = Number(actualValue) < Number(condition.value)
          break
        case 'greater_equal':
          result = Number(actualValue) >= Number(condition.value)
          break
        case 'less_equal':
          result = Number(actualValue) <= Number(condition.value)
          break
        case 'is_empty':
          result = !actualValue || actualValue === ''
          break
        case 'is_not_empty':
          result = !!actualValue && actualValue !== ''
          break
        case 'is_true':
          result = actualValue === true
          break
        case 'is_false':
          result = actualValue === false
          break
        default:
          result = false
      }

      return { result, actualValue }
    } catch (err) {
      return { result: false, actualValue: undefined }
    }
  }

  const testConditions = () => {
    setError(null)
    setResults(null)
    setMatchedPath(null)

    try {
      const data = JSON.parse(testData)
      const testResults: TestResult[] = []
      let firstMatch: string | null = null

      paths.forEach(path => {
        const conditionResults = path.conditions.map(condition => {
          const { result, actualValue } = evaluateCondition(condition, data)
          return {
            field: condition.field,
            operator: condition.operator,
            value: condition.value,
            result,
            actualValue
          }
        })

        // Evaluate path based on logic operator
        const matched = path.logicOperator === 'and'
          ? conditionResults.every(r => r.result)
          : conditionResults.some(r => r.result)

        testResults.push({
          pathId: path.id,
          pathName: path.name,
          matched,
          conditionResults
        })

        // Track first matching path
        if (matched && !firstMatch) {
          firstMatch = path.name
        }
      })

      setResults(testResults)
      setMatchedPath(firstMatch)
    } catch (err: any) {
      setError(`Invalid JSON: ${err.message}`)
    }
  }

  return (
    <Card className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Play className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Test Conditions
            </CardTitle>
            <CardDescription>
              Test your path conditions with sample data to see which path would be taken
            </CardDescription>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Sample data buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadSampleData('email')}
          >
            Load Email Sample
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadSampleData('slack')}
          >
            Load Slack Sample
          </Button>
        </div>

        {/* JSON input */}
        <div>
          <Textarea
            value={testData}
            onChange={(e) => setTestData(e.target.value)}
            placeholder='Paste sample JSON data here, e.g.:\n{\n  "subject": "Urgent",\n  "from": "user@example.com",\n  "priority": 9\n}'
            className="font-mono text-sm min-h-[150px]"
          />
        </div>

        {/* Error message */}
        {error && (
          <Alert className="border-red-500/50 bg-red-50 dark:bg-red-950/30">
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertDescription className="text-sm ml-2 text-red-900 dark:text-red-100">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Test button */}
        <Button
          type="button"
          onClick={testConditions}
          disabled={!testData.trim()}
          className="w-full"
        >
          <Play className="h-4 w-4 mr-2" />
          Test Paths
        </Button>

        {/* Results */}
        {results && (
          <div className="space-y-3 pt-2">
            {/* Matched path highlight */}
            {matchedPath ? (
              <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/30">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-sm ml-2 text-green-900 dark:text-green-100">
                  <strong>Path "{matchedPath}"</strong> would execute for this data
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/30">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <AlertDescription className="text-sm ml-2 text-yellow-900 dark:text-yellow-100">
                  No paths matched - <strong>Else</strong> handle would execute
                </AlertDescription>
              </Alert>
            )}

            {/* Detailed results */}
            <div className="space-y-2">
              {results.map(result => (
                <Card
                  key={result.pathId}
                  className={result.matched ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20' : ''}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">
                        {result.pathName}
                      </CardTitle>
                      <Badge
                        variant={result.matched ? "default" : "secondary"}
                        className={result.matched ? "bg-green-600" : ""}
                      >
                        {result.matched ? (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Matched
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 mr-1" />
                            Not matched
                          </>
                        )}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1.5 text-xs">
                      {result.conditionResults.map((condition, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 p-2 rounded bg-background/60"
                        >
                          {condition.result ? (
                            <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-mono">
                              <span className="text-muted-foreground">{condition.field}</span>
                              {' '}<span className="font-semibold">{condition.operator}</span>{' '}
                              {condition.value && (
                                <span className="text-blue-600 dark:text-blue-400">"{condition.value}"</span>
                              )}
                            </div>
                            {condition.actualValue !== undefined && (
                              <div className="text-muted-foreground mt-0.5">
                                Actual: <span className="font-medium">{JSON.stringify(condition.actualValue)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
