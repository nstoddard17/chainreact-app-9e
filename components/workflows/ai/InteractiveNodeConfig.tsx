/**
 * Interactive Node Configuration
 *
 * Kadabra-style interactive configuration in chat:
 * - OAuth buttons inline
 * - Text inputs with "Press Enter ↵" label
 * - Array inputs that build a list
 * - Skip/Continue buttons
 * - Real-time value display
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { CheckCircle, X, Loader2 } from 'lucide-react'
import type { ConfigField } from '@/lib/workflows/ai/SequentialWorkflowBuilder'

interface InteractiveNodeConfigProps {
  nodeTitle: string
  field: ConfigField
  onValueProvided: (value: any) => void
  onSkip: () => void
  needsAuth?: boolean
  authProvider?: string
  isAuthenticating?: boolean
  onConnect?: () => void
}

export function InteractiveNodeConfig({
  nodeTitle,
  field,
  onValueProvided,
  onSkip,
  needsAuth = false,
  authProvider,
  isAuthenticating = false,
  onConnect
}: InteractiveNodeConfigProps) {
  const [currentInput, setCurrentInput] = useState('')
  const [arrayValues, setArrayValues] = useState<string[]>([])
  const [showAuth, setShowAuth] = useState(needsAuth)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Focus input when field changes
    if (!needsAuth && inputRef.current) {
      inputRef.current.focus()
    }
  }, [field.name, needsAuth])

  const handleAddArrayValue = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && currentInput.trim()) {
      e.preventDefault()
      const newValue = currentInput.trim()
      const updated = [...arrayValues, newValue]
      setArrayValues(updated)
      setCurrentInput('')

      // Auto-focus back to input
      if (inputRef.current) {
        inputRef.current.focus()
      }
    }
  }

  const handleRemoveArrayValue = (index: number) => {
    setArrayValues(arrayValues.filter((_, i) => i !== index))
  }

  const handleContinue = () => {
    let value: any

    switch (field.type) {
      case 'text_array':
        value = arrayValues.length > 0 ? arrayValues : (field.defaultValue || [])
        break
      case 'text':
        value = currentInput.trim() || field.defaultValue || ''
        break
      case 'number':
        value = currentInput ? parseFloat(currentInput) : (field.defaultValue || 0)
        break
      case 'boolean':
        value = currentInput.toLowerCase() === 'true' || currentInput.toLowerCase() === 'yes'
        break
      case 'select':
        value = currentInput || field.defaultValue
        break
      default:
        value = currentInput
    }

    onValueProvided(value)
  }

  const handleSkip = () => {
    onSkip()
  }

  if (showAuth && needsAuth) {
    return (
      <div className="space-y-3 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-900 mb-1">
              Connect to {authProvider}
            </div>
            <div className="text-xs text-gray-600 mb-3">
              Let's connect the service first — pick a saved connection or make a new one
            </div>
            <button
              onClick={() => {
                if (onConnect) onConnect()
                setShowAuth(false)
              }}
              disabled={isAuthenticating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isAuthenticating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  Connect to {authProvider}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Field Label */}
      <div className="space-y-1">
        <div className="text-sm font-medium text-gray-900">
          {field.label}
        </div>
        {field.description && (
          <div className="text-xs text-gray-600">
            {field.description}
          </div>
        )}
      </div>

      {/* Text Array Input */}
      {field.type === 'text_array' && (
        <div className="space-y-2">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyDown={handleAddArrayValue}
              placeholder={field.placeholder || `Type a value and press Enter`}
              className="w-full px-3 py-2 pr-20 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
              Press Enter ↵
            </div>
          </div>

          {/* Array Values List */}
          {arrayValues.length > 0 && (
            <div className="space-y-1">
              {arrayValues.map((value, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-sm bg-green-50 px-3 py-2 rounded-lg border border-green-200"
                >
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="flex-1 text-gray-900">{value}</span>
                  <button
                    onClick={() => handleRemoveArrayValue(i)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Regular Text Input */}
      {field.type === 'text' && (
        <input
          ref={inputRef}
          type="text"
          value={currentInput}
          onChange={(e) => setCurrentInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
          placeholder={field.placeholder || field.label}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      )}

      {/* Number Input */}
      {field.type === 'number' && (
        <input
          ref={inputRef}
          type="number"
          value={currentInput}
          onChange={(e) => setCurrentInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
          placeholder={field.placeholder || field.label}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      )}

      {/* Select Input */}
      {field.type === 'select' && field.options && (
        <select
          value={currentInput}
          onChange={(e) => setCurrentInput(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">Select an option...</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      {/* Boolean Input */}
      {field.type === 'boolean' && (
        <div className="flex gap-3">
          <button
            onClick={() => {
              setCurrentInput('true')
              setTimeout(() => handleContinue(), 100)
            }}
            className="flex-1 px-4 py-2 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
          >
            Yes
          </button>
          <button
            onClick={() => {
              setCurrentInput('false')
              setTimeout(() => handleContinue(), 100)
            }}
            className="flex-1 px-4 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
          >
            No
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={handleContinue}
          className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Continue
        </button>
        <button
          onClick={handleSkip}
          className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
