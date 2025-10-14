"use client"

import { buildVariableReference, normalizeVariableExpression } from "./variableReferences"

export function insertVariableIntoTextInput(
  element: HTMLInputElement | HTMLTextAreaElement,
  variable: string,
  currentValue: string,
  updateValue: (nextValue: string) => void
) {
  const safeCurrentValue = currentValue ?? ""
  const start = element.selectionStart ?? safeCurrentValue.length
  const end = element.selectionEnd ?? start

  // These input types don't support setRangeText or selection APIs
  const nonSelectableTypes = ['number', 'email', 'date', 'time', 'datetime-local', 'month', 'week', 'color', 'file']
  const isNonSelectableInput = 'type' in element && nonSelectableTypes.includes(element.type)

  if (!isNonSelectableInput && typeof element.setRangeText === "function") {
    try {
      element.setRangeText(variable, start, end, "end")
      const updatedValue = element.value
      updateValue(updatedValue)
      queueMicrotask(() => {
        try {
          element.focus()
          const cursorPosition = start + variable.length
          element.setSelectionRange(cursorPosition, cursorPosition)
        } catch {
          /* Focus management best-effort */
        }
      })
      return element.value
    } catch {
      // Fallback to manual construction if setRangeText fails
    }
  }

  // For non-selectable inputs and fallback: construct new value manually
  const newValue =
    safeCurrentValue.slice(0, start) +
    variable +
    safeCurrentValue.slice(end)

  updateValue(newValue)

  queueMicrotask(() => {
    try {
      element.focus()
      // Don't try to set selection range on non-selectable inputs
      if (!isNonSelectableInput) {
        const cursorPosition = start + variable.length
        element.setSelectionRange(cursorPosition, cursorPosition)
      }
    } catch {
      /* Focus management best-effort */
    }
  })

  return newValue
}

export function insertVariableIntoContentEditable(
  element: HTMLElement,
  variable: string
) {
  element.focus()
  const selection = window.getSelection()

  if (!selection) {
    return element.innerHTML
  }

  if (selection.rangeCount === 0) {
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    selection.addRange(range)
  }

  const range = selection.getRangeAt(0)

  if (!element.contains(range.commonAncestorContainer)) {
    range.selectNodeContents(element)
    range.collapse(false)
  }

  range.deleteContents()
  const textNode = document.createTextNode(variable)
  range.insertNode(textNode)
  range.setStartAfter(textNode)
  range.collapse(true)

  selection.removeAllRanges()
  selection.addRange(range)

  return element.innerHTML
}

export function normalizeDraggedVariable(raw: string) {
  if (!raw) return ""

  const trimmed = raw.trim()

  const normalizeFormat = (value: string) => {
    const hasBraces = value.startsWith("{{") && value.endsWith("}}");
    const inner = hasBraces ? value.slice(2, -2) : value;
    const normalizedInner = normalizeVariableExpression(inner);
    return `{{${normalizedInner}}}`;
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed.variable === "string") {
        return normalizeFormat(parsed.variable)
      }
    } catch {
      return normalizeFormat(trimmed)
    }
  }

  return normalizeFormat(trimmed)
}

export { buildVariableReference, normalizeVariableExpression }
