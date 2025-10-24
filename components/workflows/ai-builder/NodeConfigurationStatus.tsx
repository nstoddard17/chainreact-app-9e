"use client"

import React from "react"
import { Loader2, CheckCircle2, AlertTriangle, Settings, TestTube, Sparkles, CheckCheck } from "lucide-react"
import { cn } from "@/lib/utils"

interface ConfigField {
  key: string
  value: any
  status: 'pending' | 'configuring' | 'complete' | 'error'
  displayValue?: string
}

interface NodeConfigurationStatusProps {
  status: 'idle' | 'preparing' | 'configuring' | 'testing' | 'fixing' | 'retesting' | 'complete' | 'error'
  fields?: ConfigField[]
  testResult?: {
    success: boolean
    message: string
  }
  fixAttempt?: number
  maxAttempts?: number
  nodeName?: string
  className?: string
}

export function NodeConfigurationStatus({
  status,
  fields = [],
  testResult,
  fixAttempt,
  maxAttempts = 2,
  nodeName,
  className
}: NodeConfigurationStatusProps) {
  const getStatusIcon = () => {
    switch (status) {
      case 'preparing':
      case 'configuring':
        return <Loader2 className="w-4 h-4 animate-spin" />
      case 'testing':
      case 'retesting':
        return <TestTube className="w-4 h-4 animate-pulse" />
      case 'fixing':
        return <Settings className="w-4 h-4 animate-spin" />
      case 'complete':
        return <CheckCheck className="w-4 h-4" />
      case 'error':
        return <AlertTriangle className="w-4 h-4" />
      default:
        return <Sparkles className="w-4 h-4" />
    }
  }

  const getStatusLabel = () => {
    switch (status) {
      case 'preparing':
        return 'Preparing node...'
      case 'configuring':
        return 'Configuring fields...'
      case 'testing':
        return 'Testing configuration...'
      case 'fixing':
        return fixAttempt ? `Fixing issues (attempt ${fixAttempt}/${maxAttempts})...` : 'Fixing configuration...'
      case 'retesting':
        return 'Re-testing with fixed configuration...'
      case 'complete':
        return 'Configuration complete'
      case 'error':
        return 'Configuration error - manual fix needed'
      default:
        return 'Ready'
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'preparing':
      case 'configuring':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'testing':
      case 'retesting':
        return 'text-amber-600 bg-amber-50 border-amber-200'
      case 'fixing':
        return 'text-orange-600 bg-orange-50 border-orange-200'
      case 'complete':
        return 'text-emerald-600 bg-emerald-50 border-emerald-200'
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const formatFieldName = (key: string): string => {
    // Convert camelCase to Title Case
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim()
      .replace(/^(Id|Url|Api)$/i, match => match.toUpperCase())
  }

  const formatFieldValue = (value: any): string => {
    if (value === null || value === undefined) return 'Not set'
    if (value === '') return 'Empty'
    if (typeof value === 'object') return JSON.stringify(value).substring(0, 50) + '...'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'

    const strValue = String(value)

    // Check for AI field placeholder
    if (strValue.includes('{{AI_FIELD:')) {
      return '✨ AI will generate'
    }

    // Check for variable reference
    if (strValue.includes('{{')) {
      const varMatch = strValue.match(/\{\{([^}]+)\}\}/)
      if (varMatch) {
        return `📎 From ${varMatch[1]}`
      }
    }

    // Truncate long values
    if (strValue.length > 50) {
      return strValue.substring(0, 50) + '...'
    }

    return strValue
  }

  if (status === 'idle') return null

  return (
    <div className={cn(
      "relative border rounded-lg overflow-hidden transition-all duration-300",
      getStatusColor(),
      className
    )}>
      {/* Status Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b bg-white/50">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-sm font-medium">{getStatusLabel()}</span>
        </div>
        {nodeName && (
          <span className="text-xs text-muted-foreground">{nodeName}</span>
        )}
      </div>

      {/* Fields List - Shows during configuration */}
      {(status === 'configuring' || status === 'testing' || status === 'complete') && fields.length > 0 && (
        <div className="px-4 py-3 space-y-2">
          {fields.map((field, index) => (
            <div
              key={field.key}
              className={cn(
                "flex items-start justify-between gap-2 text-xs transition-all duration-300",
                field.status === 'complete' ? 'opacity-100' : 'opacity-60'
              )}
              style={{
                animation: field.status === 'configuring'
                  ? 'pulse 1s ease-in-out infinite'
                  : undefined
              }}
            >
              <div className="flex items-center gap-2 flex-1">
                {/* Field Status Icon */}
                <div className="w-4 h-4 flex items-center justify-center">
                  {field.status === 'configuring' && (
                    <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                  )}
                  {field.status === 'complete' && (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  )}
                  {field.status === 'pending' && (
                    <div className="w-2 h-2 rounded-full bg-gray-300" />
                  )}
                  {field.status === 'error' && (
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                  )}
                </div>

                {/* Field Name */}
                <span className="font-medium text-gray-700">
                  {formatFieldName(field.key)}:
                </span>
              </div>

              {/* Field Value */}
              <span className={cn(
                "text-gray-600 max-w-[200px] text-right",
                field.status === 'complete' && 'font-medium'
              )}>
                {field.displayValue || formatFieldValue(field.value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Test Results - Shows during/after testing */}
      {status === 'testing' && (
        <div className="px-4 py-3 border-t bg-amber-50/50">
          <div className="flex items-center gap-2 text-xs">
            <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
            <span className="text-amber-700">Running tests on configuration...</span>
          </div>
        </div>
      )}

      {/* Fixing Status - Shows when automatically fixing errors */}
      {status === 'fixing' && (
        <div className="px-4 py-3 border-t bg-orange-50/50">
          <div className="flex items-center gap-2 text-xs">
            <Settings className="w-3 h-3 animate-spin text-orange-600" />
            <span className="text-orange-700">
              {fixAttempt
                ? `Automatically fixing configuration issues (attempt ${fixAttempt}/${maxAttempts})...`
                : 'Analyzing and fixing configuration issues...'}
            </span>
          </div>
        </div>
      )}

      {/* Retesting Status - Shows when retesting after fix */}
      {status === 'retesting' && (
        <div className="px-4 py-3 border-t bg-amber-50/50">
          <div className="flex items-center gap-2 text-xs">
            <TestTube className="w-3 h-3 animate-pulse text-amber-600" />
            <span className="text-amber-700">Re-testing with updated configuration...</span>
          </div>
        </div>
      )}

      {testResult && (status === 'complete' || status === 'error') && (
        <div className={cn(
          "px-4 py-3 border-t",
          testResult.success ? "bg-emerald-50/50" : "bg-red-50/50"
        )}>
          <div className="flex items-center gap-2 text-xs">
            {testResult.success ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span className="text-emerald-700">{testResult.message || 'All tests passed'}</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3 h-3 text-red-600" />
                <span className="text-red-700">{testResult.message || 'Tests failed'}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Completion Message */}
      {status === 'complete' && !testResult && (
        <div className="px-4 py-3 border-t bg-emerald-50/50">
          <div className="flex items-center gap-2 text-xs">
            <CheckCheck className="w-3 h-3 text-emerald-600" />
            <span className="text-emerald-700">Node successfully configured</span>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200">
        <div
          className={cn(
            "h-full transition-all duration-500",
            status === 'preparing' && "w-1/6 bg-blue-500",
            status === 'configuring' && "w-2/6 bg-blue-500",
            status === 'testing' && "w-3/6 bg-amber-500",
            status === 'fixing' && "w-4/6 bg-orange-500",
            status === 'retesting' && "w-5/6 bg-amber-500",
            status === 'complete' && "w-full bg-emerald-500",
            status === 'error' && "w-full bg-red-500"
          )}
          style={{
            animation: (status === 'configuring' || status === 'testing' || status === 'fixing' || status === 'retesting')
              ? 'shimmer 2s ease-in-out infinite'
              : undefined
          }}
        />
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}