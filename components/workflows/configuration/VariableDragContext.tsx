"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState
} from "react"

interface ActiveField {
  id: string
  label?: string
  element: HTMLElement | null
  insert: (variable: string) => void
}

interface VariableDragContextValue {
  activeField: ActiveField | null
  setActiveField: (field: ActiveField) => void
  clearActiveField: (fieldId?: string) => void
  insertIntoActiveField: (variable: string) => boolean
}

const VariableDragContext = createContext<VariableDragContextValue | undefined>(undefined)

export function VariableDragProvider({ children }: { children: React.ReactNode }) {
  const [activeField, setActiveFieldState] = useState<ActiveField | null>(null)

  const setActiveField = useCallback((field: ActiveField) => {
    setActiveFieldState(prev => {
      if (prev && prev.id === field.id) {
        return field
      }
      return field
    })
  }, [])

  const clearActiveField = useCallback((fieldId?: string) => {
    setActiveFieldState(prev => {
      if (!prev) return null
      if (!fieldId || prev.id === fieldId) {
        return null
      }
      return prev
    })
  }, [])

  const insertIntoActiveField = useCallback((variable: string) => {
    if (!activeField) return false
    const targetElement = activeField.element
    if (targetElement && typeof (targetElement as HTMLElement).focus === "function") {
      try {
        targetElement.focus()
      } catch (error) {
        console.warn("[VariableDragContext] Failed to focus active field element", error)
      }
    }
    try {
      activeField.insert(variable)
      return true
    } catch (error) {
      console.error("[VariableDragContext] Failed to insert variable into active field", {
        error,
        fieldId: activeField.id,
        variable
      })
      return false
    }
  }, [activeField])

  const value = useMemo<VariableDragContextValue>(() => ({
    activeField,
    setActiveField,
    clearActiveField,
    insertIntoActiveField
  }), [activeField, setActiveField, clearActiveField, insertIntoActiveField])

  return (
    <VariableDragContext.Provider value={value}>
      {children}
    </VariableDragContext.Provider>
  )
}

export function useVariableDragContext() {
  const context = useContext(VariableDragContext)
  if (!context) {
    throw new Error("useVariableDragContext must be used within a VariableDragProvider")
  }
  return context
}
