"use client"

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GitBranch, ArrowRight, CircleDot } from 'lucide-react'
import { ConditionalPath } from './CriteriaBuilder'
import { cn } from '@/lib/utils'

interface LogicFlowPreviewProps {
  paths: ConditionalPath[]
  className?: string
}

export function LogicFlowPreview({ paths, className }: LogicFlowPreviewProps) {
  if (paths.length === 0) return null

  const formatCondition = (condition: any) => {
    const operatorLabels: Record<string, string> = {
      equals: '=',
      not_equals: '≠',
      contains: 'contains',
      not_contains: 'does not contain',
      starts_with: 'starts with',
      ends_with: 'ends with',
      greater_than: '>',
      less_than: '<',
      greater_equal: '≥',
      less_equal: '≤',
      is_empty: 'is empty',
      is_not_empty: 'is not empty',
      is_true: 'is true',
      is_false: 'is false',
    }

    const operator = operatorLabels[condition.operator] || condition.operator
    const field = condition.field.split('.').pop() || condition.field

    if (['is_empty', 'is_not_empty', 'is_true', 'is_false'].includes(condition.operator)) {
      return `${field} ${operator}`
    }

    return `${field} ${operator} "${condition.value}"`
  }

  return (
    <Card className={cn("border-purple-500/30 bg-gradient-to-br from-purple-50/50 to-blue-50/50 dark:from-purple-950/20 dark:to-blue-950/20", className)}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          Logic Flow Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Evaluation order note */}
          <div className="text-xs text-muted-foreground bg-background/60 rounded-md p-2 border border-dashed">
            Paths are evaluated in order from top to bottom. First match wins.
          </div>

          {/* Path evaluation flow */}
          <div className="space-y-2">
            {paths.map((path, pathIndex) => {
              const hasConditions = path.conditions.length > 0 && path.conditions.some(c => c.field)

              return (
                <div
                  key={path.id}
                  className="relative"
                >
                  {/* Connector line */}
                  {pathIndex > 0 && (
                    <div className="absolute left-[15px] -top-2 w-0.5 h-2 bg-border" />
                  )}

                  <Card className="border-border/60 bg-background/80 shadow-sm hover:shadow transition-shadow">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        {/* Path indicator */}
                        <div className="flex items-center gap-2 pt-0.5">
                          <div className="flex items-center justify-center h-7 w-7 rounded-full border-2 bg-background font-semibold text-sm"
                            style={{ borderColor: path.color }}
                          >
                            {pathIndex + 1}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Path name */}
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{path.name || `Path ${String.fromCharCode(65 + pathIndex)}`}</span>
                            <Badge
                              variant="outline"
                              className="text-xs"
                              style={{ borderColor: `${path.color}40` }}
                            >
                              {path.logicOperator.toUpperCase()} logic
                            </Badge>
                          </div>

                          {/* Conditions */}
                          {hasConditions ? (
                            <div className="space-y-1">
                              {path.conditions.filter(c => c.field).map((condition, condIdx) => (
                                <div key={condition.id} className="flex items-start gap-2 text-xs">
                                  {condIdx > 0 && (
                                    <span className="text-muted-foreground font-semibold mt-0.5">
                                      {path.logicOperator.toUpperCase()}
                                    </span>
                                  )}
                                  <div className="flex items-center gap-1.5 bg-muted/50 rounded px-2 py-1 font-mono flex-1">
                                    <CircleDot className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                    <span className="truncate">{formatCondition(condition)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground italic">
                              No conditions configured
                            </div>
                          )}

                          {/* Outcome */}
                          <div className="flex items-center gap-2 text-xs">
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">Execute</span>
                            <Badge
                              variant="secondary"
                              className="text-xs font-semibold"
                              style={{
                                backgroundColor: `${path.color}20`,
                                borderColor: `${path.color}40`
                              }}
                            >
                              {path.name}
                            </Badge>
                            <span className="text-muted-foreground">handle</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )
            })}

            {/* Else fallback */}
            <div className="relative">
              {/* Connector line */}
              <div className="absolute left-[15px] -top-2 w-0.5 h-2 bg-border" />

              <Card className="border-dashed border-border/60 bg-muted/30">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {/* Else indicator */}
                    <div className="flex items-center gap-2 pt-0.5">
                      <div className="flex items-center justify-center h-7 w-7 rounded-full border-2 border-dashed border-muted-foreground/50 bg-background text-muted-foreground font-semibold text-xs">
                        ↳
                      </div>
                    </div>

                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-muted-foreground">Else (fallback)</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        If no paths above match, workflow continues here
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Execute</span>
                        <Badge variant="secondary" className="text-xs font-semibold border-dashed">
                          Else
                        </Badge>
                        <span className="text-muted-foreground">handle</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Summary */}
          <div className="text-xs text-muted-foreground bg-background/60 rounded-md p-2 border">
            <strong>{paths.length}</strong> conditional {paths.length === 1 ? 'path' : 'paths'} +
            <strong className="ml-1">1</strong> fallback path =
            <strong className="ml-1">{paths.length + 1}</strong> total handles on canvas
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
