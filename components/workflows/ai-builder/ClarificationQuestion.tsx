"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle2, HelpCircle, X, Check } from "lucide-react"

export interface ClarificationAnswer {
  value: string | string[]
  displayValue?: string
}

interface ClarificationQuestionProps {
  question: {
    id: string
    question: string
    fieldType: 'dropdown' | 'text' | 'multiselect'
    dataEndpoint?: string
    nodeType: string
    configField: string
    required: boolean
    tooltip?: string
    allowCustom?: boolean
    isMultiSelect?: boolean
  }
  onAnswer: (questionId: string, answer: ClarificationAnswer) => void
  answer?: ClarificationAnswer
}

const normalizeString = (value: unknown): string =>
  typeof value === 'string' ? value : ''

const ensureArray = (value: unknown): string[] =>
  Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []

export function ClarificationQuestion({ question, onAnswer, answer }: ClarificationQuestionProps) {
  const [options, setOptions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedValue, setSelectedValue] = useState<string | null>(
    typeof answer?.value === 'string' ? answer.value : null
  )
  const [selectedValues, setSelectedValues] = useState<string[]>(ensureArray(answer?.value))
  const [textValue, setTextValue] = useState<string>(normalizeString(answer?.value))
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [displayValue, setDisplayValue] = useState<string>(normalizeString(answer?.displayValue))
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)

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
          const optionsList = data.channels || data.senders || data.options || data.items || []
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

  // Keep selection state in sync with answer prop
  useEffect(() => {
    if (question.fieldType === 'text') {
      const newValue = normalizeString(answer?.value)
      if (newValue !== textValue) {
        setTextValue(newValue)
      }
      if (answer?.displayValue) {
        setDisplayValue(answer.displayValue)
      }
      return
    }

    if (question.isMultiSelect) {
      const newValues = ensureArray(answer?.value)
      const current = selectedValues.slice().sort()
      const incoming = newValues.slice().sort()
      if (JSON.stringify(current) !== JSON.stringify(incoming)) {
        setSelectedValues(newValues)
      }
      return
    }

    const newValue = typeof answer?.value === 'string' ? answer.value : null
    if (newValue !== selectedValue) {
      setSelectedValue(newValue)
    }
    if (answer?.displayValue) {
      setDisplayValue(answer.displayValue)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, question.fieldType, question.isMultiSelect])

  // Update display value when selection changes
  useEffect(() => {
    if (question.isMultiSelect) {
      if (selectedValues.length === 0) {
        setDisplayValue('')
      } else if (selectedValues.length === 1) {
        const opt = options.find(o => o.value === selectedValues[0] || o.id === selectedValues[0])
        setDisplayValue(opt ? opt.label || opt.name : selectedValues[0])
      } else {
        setDisplayValue(`${selectedValues.length} selected`)
      }
      return
    }

    if (selectedValue) {
      const opt = options.find(o => o.value === selectedValue || o.id === selectedValue)
      setDisplayValue(opt ? opt.label || opt.name : selectedValue)
      return
    }

    if (!question.isMultiSelect && !selectedValue && answer?.displayValue) {
      setDisplayValue(answer.displayValue)
    } else {
      setDisplayValue('')
    }
  }, [selectedValue, selectedValues, options, question.isMultiSelect, answer?.displayValue])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
        setSearchQuery('')
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  const handleDropdownSelect = (value: string) => {
    const option = options.find(o => o.value === value || o.id === value)
    const optionLabel = option ? option.label || option.name : value

    if (question.isMultiSelect) {
      const newValues = selectedValues.includes(value)
        ? selectedValues.filter(v => v !== value)
        : [...selectedValues, value]

      setSelectedValues(newValues)
      onAnswer(question.id, {
        value: newValues,
        displayValue: newValues
          .map(val => {
            const opt = options.find(o => o.value === val || o.id === val)
            return opt ? opt.label || opt.name : val
          })
          .join(', ')
      })
      setSearchQuery('')
      return
    }

    setSelectedValue(value)
    onAnswer(question.id, { value, displayValue: optionLabel })
    setIsDropdownOpen(false)
    setSearchQuery('')
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (!isDropdownOpen) {
      setIsDropdownOpen(true)
    }
  }

  const handleSearchSubmit = () => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return

    if (question.isMultiSelect) {
      const newValues = [...selectedValues, trimmed]
      setSelectedValues(newValues)
      onAnswer(question.id, {
        value: newValues,
        displayValue: newValues.join(', ')
      })
      setSearchQuery('')
      return
    }

    setSelectedValue(trimmed)
    onAnswer(question.id, { value: trimmed, displayValue: trimmed })
    setIsDropdownOpen(false)
    setSearchQuery('')
  }

  const handleRemoveValue = (valueToRemove: string) => {
    const newValues = selectedValues.filter(v => v !== valueToRemove)
    setSelectedValues(newValues)
    onAnswer(question.id, {
      value: newValues,
      displayValue: newValues.join(', ')
    })
  }

  const handleTextSubmit = () => {
    const trimmed = textValue.trim()
    if (!trimmed) return
    onAnswer(question.id, { value: trimmed, displayValue: trimmed })
  }

  const filteredOptions = searchQuery.trim()
    ? options.filter(opt => {
        const label = (opt.label || opt.name || '').toLowerCase()
        const email = (opt.email || opt.value || '').toLowerCase()
        const query = searchQuery.toLowerCase()
        return label.includes(query) || email.includes(query)
      })
    : options

  const isCustomValue =
    !!searchQuery.trim() &&
    !options.some(opt =>
      opt.value === searchQuery.trim() || opt.email === searchQuery.trim()
    ) &&
    !selectedValues.includes(searchQuery.trim())

  const isAnswered = question.isMultiSelect
    ? selectedValues.length > 0
    : !!(typeof selectedValue === 'string' && selectedValue.trim().length > 0)

  return (
    <div className="bg-accent/50 border border-border rounded-lg p-4 space-y-3">
      {/* Question text */}
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {question.question}
              {question.required && <span className="text-red-500 ml-1">*</span>}
            </p>
            {question.tooltip && (
              <div className="relative">
                <button
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  onClick={() => setShowTooltip(!showTooltip)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
                {showTooltip && (
                  <div className="absolute left-0 top-6 z-50 w-64 bg-popover border border-border rounded-md shadow-lg p-3">
                    <p className="text-xs text-popover-foreground">{question.tooltip}</p>
                  </div>
                )}
              </div>
            )}
          </div>
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
            <div className="relative" ref={dropdownRef}>
              {/* Selected values as tags (for multi-select) */}
              {question.isMultiSelect && selectedValues.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {selectedValues.map((val) => {
                    const opt = options.find(o => o.value === val || o.id === val)
                    return (
                      <div
                        key={val}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-primary/10 text-primary rounded-md"
                      >
                        <span>{opt ? opt.label || opt.name : val}</span>
                        <button
                          onClick={() => handleRemoveValue(val)}
                          className="hover:bg-primary/20 rounded-sm p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Searchable combobox input */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery || (question.isMultiSelect ? '' : displayValue)}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => setIsDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSearchSubmit()
                    } else if (e.key === 'Escape') {
                      setIsDropdownOpen(false)
                      setSearchQuery('')
                    } else if (e.key === 'Backspace' && !searchQuery && question.isMultiSelect && selectedValues.length > 0) {
                      handleRemoveValue(selectedValues[selectedValues.length - 1])
                    }
                  }}
                  placeholder={question.isMultiSelect ? "Search or type to add..." : (question.allowCustom ? "Search or type custom value..." : "Search...")}
                  className="w-full px-3 py-2 pr-8 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <svg
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* Dropdown options */}
              {isDropdownOpen && (
                <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {filteredOptions.length === 0 && !isCustomValue ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No options found
                    </div>
                  ) : (
                    <>
                      {filteredOptions.map((option) => {
                        const optValue = option.value || option.id
                        const isSelected = question.isMultiSelect
                          ? selectedValues.includes(optValue)
                          : selectedValue === optValue

                        return (
                          <button
                            key={option.id || option.value}
                            onClick={() => handleDropdownSelect(optValue)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                          >
                            {question.isMultiSelect && (
                              <div className={`w-4 h-4 border border-border rounded flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'bg-background'}`}>
                                {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                              </div>
                            )}
                            <span>{option.label || option.name}</span>
                          </button>
                        )
                      })}

                      {/* Custom value option */}
                      {question.allowCustom && isCustomValue && (
                        <button
                          onClick={() => handleDropdownSelect(searchQuery.trim())}
                          className="w-full text-left px-3 py-2 text-sm bg-primary/10 hover:bg-primary/20 transition-colors border-t border-border flex items-center gap-2"
                        >
                          {question.isMultiSelect && (
                            <div className="w-4 h-4 border border-primary rounded flex items-center justify-center bg-background"></div>
                          )}
                          <span className="text-primary font-medium">+ Use "{searchQuery.trim()}"</span>
                        </button>
                      )}
                    </>
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
