"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle2 } from "lucide-react"

interface ClarificationQuestionProps {
  question: {
    id: string
    question: string
    fieldType: 'dropdown' | 'text' | 'multiselect'
    dataEndpoint?: string
    nodeType: string
    configField: string
    required: boolean
  }
  onAnswer: (questionId: string, answer: any) => void
  answer?: any
}

export function ClarificationQuestion({ question, onAnswer, answer }: ClarificationQuestionProps) {
  const [options, setOptions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedValue, setSelectedValue] = useState<string | null>(answer || null)
  const [textValue, setTextValue] = useState<string>(answer || '')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // Fetch options for dropdown fields
  useEffect(() => {
    if (question.fieldType === 'dropdown' && question.dataEndpoint) {
      const fetchOptions = async () => {
        setLoading(true)
        try {
          const response = await fetch(question.dataEndpoint!)
          if (!response.ok) throw new Error('Failed to fetch options')

          const data = await response.json()

          // Handle different response formats
          const optionsList = data.channels || data.options || data.items || []
          setOptions(optionsList)
        } catch (error) {
          console.error('[CLARIFICATION] Failed to load options:', error)
          setOptions([])
        } finally {
          setLoading(false)
        }
      }

      fetchOptions()
    }
  }, [question.fieldType, question.dataEndpoint, question.id])

  const handleDropdownSelect = (value: string) => {
    setSelectedValue(value)
    onAnswer(question.id, value)
    setIsDropdownOpen(false)
  }

  const handleTextSubmit = () => {
    if (textValue.trim()) {
      onAnswer(question.id, textValue.trim())
    }
  }

  const selectedOption = options.find(opt => opt.value === selectedValue || opt.id === selectedValue)
  const isAnswered = !!answer

  return (
    <div className="bg-accent/50 border border-border rounded-lg p-4 space-y-3">
      {/* Question text */}
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            {question.question}
            {question.required && <span className="text-red-500 ml-1">*</span>}
          </p>
        </div>
        {isAnswered && (
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
        )}
      </div>

      {/* Input field based on type */}
      {question.fieldType === 'dropdown' && (
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading options...</span>
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full text-left px-3 py-2 text-sm border border-border rounded-md bg-background hover:bg-accent transition-colors flex items-center justify-between"
              >
                <span className={selectedOption ? 'text-foreground' : 'text-muted-foreground'}>
                  {selectedOption ? selectedOption.label || selectedOption.name : 'Select an option...'}
                </span>
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isDropdownOpen && (
                <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {options.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No options available
                    </div>
                  ) : (
                    options.map((option) => (
                      <button
                        key={option.id || option.value}
                        onClick={() => handleDropdownSelect(option.value || option.id)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                      >
                        {option.label || option.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {question.fieldType === 'text' && (
        <div className="space-y-2">
          <input
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleTextSubmit()
              }
            }}
            placeholder="Type your answer..."
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {!isAnswered && textValue.trim() && (
            <Button
              size="sm"
              onClick={handleTextSubmit}
              className="w-full"
            >
              Submit
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
