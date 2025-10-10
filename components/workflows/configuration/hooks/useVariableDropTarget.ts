"use client"

import type { DragEvent } from "react"
import { useCallback, useMemo, useState } from "react"
import { useVariableDragContext } from "../VariableDragContext"

interface UseVariableDropTargetOptions {
  fieldId: string
  fieldLabel?: string
  elementRef: React.RefObject<HTMLElement | null>
  onInsert: (variable: string, event?: DragEvent) => void
}

interface DropEventHandlers {
  onFocus: () => void
  onBlur: () => void
  onDragOver: (event: DragEvent) => void
  onDragLeave: (event: DragEvent) => void
  onDrop: (event: DragEvent) => void
}

export function useVariableDropTarget({
  fieldId,
  fieldLabel,
  elementRef,
  onInsert
}: UseVariableDropTargetOptions) {
  const { setActiveField, clearActiveField } = useVariableDragContext()
  const [isDragOver, setIsDragOver] = useState(false)

  const focusField = useCallback(() => {
    const element = elementRef.current
    setActiveField({
      id: fieldId,
      label: fieldLabel,
      element,
      insert: (variable: string) => onInsert(variable)
    })
  }, [elementRef, fieldId, fieldLabel, onInsert, setActiveField])

  const blurField = useCallback(() => {
    clearActiveField(fieldId)
    setIsDragOver(false)
  }, [clearActiveField, fieldId])

  const handleDragOver = useCallback((event: DragEvent) => {
    if (!elementRef.current) return
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(true)
    focusField()
    event.dataTransfer.dropEffect = "copy"
  }, [elementRef, focusField])

  const handleDragLeave = useCallback((event: DragEvent) => {
    if (!elementRef.current) return
    event.stopPropagation()

    const relatedTarget = event.relatedTarget as Node | null
    if (relatedTarget && elementRef.current.contains(relatedTarget)) {
      return
    }

    setIsDragOver(false)
  }, [elementRef])

  const handleDrop = useCallback((event: DragEvent) => {
    if (!elementRef.current) return
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)
    focusField()

    const variable =
      event.dataTransfer.getData("text/plain") ||
      event.dataTransfer.getData("application/json")

    if (variable) {
      onInsert(variable, event)
    }
  }, [elementRef, focusField, onInsert])

  const eventHandlers = useMemo<DropEventHandlers>(() => ({
    onFocus: focusField,
    onBlur: blurField,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop
  }), [blurField, focusField, handleDragLeave, handleDragOver, handleDrop])

  return {
    isDragOver,
    eventHandlers
  }
}
