import { useCallback } from 'react'

interface UseDragDropProps {
  onVariableDrop?: (variable: string) => void
}

export function useDragDrop({ onVariableDrop }: UseDragDropProps) {
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.preventDefault) {
      e.preventDefault()
    }
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (e.preventDefault) {
      e.preventDefault()
    }
    const variable = e.dataTransfer.getData('text/plain')
    if (variable && onVariableDrop) {
      onVariableDrop(variable)
    }
  }, [onVariableDrop])

  return {
    handleDragOver,
    handleDrop
  }
} 