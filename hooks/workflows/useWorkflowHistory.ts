import { useState, useCallback, useEffect, useRef } from 'react'
import type { Node, Edge } from '@xyflow/react'

interface HistoryState {
  nodes: Node[]
  edges: Edge[]
  timestamp: number
}

const MAX_HISTORY_SIZE = 50

export function useWorkflowHistory() {
  const [history, setHistory] = useState<HistoryState[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)

  // Track if we're in the middle of an undo/redo operation
  const isUndoRedoOperation = useRef(false)

  // Compute canUndo and canRedo as derived values instead of state
  const canUndo = currentIndex > 0
  const canRedo = currentIndex < history.length - 1

  // Push a new state to history
  const pushState = useCallback((nodes: Node[], edges: Edge[]) => {
    // Don't push state if we're undoing/redoing
    if (isUndoRedoOperation.current) {
      return
    }

    // Filter out UI-only nodes before saving to history
    const persistableNodes = nodes.filter(n =>
      n.type !== 'addAction' &&
      n.type !== 'chainPlaceholder' &&
      n.type !== 'insertAction'
    )

    // Filter out edges to/from UI nodes
    const persistableEdges = edges.filter(e => {
      const isUIEdge = e.source.includes('add-action') ||
                       e.target.includes('add-action') ||
                       e.source.includes('chain-placeholder') ||
                       e.target.includes('chain-placeholder')
      return !isUIEdge
    })

    const newState: HistoryState = {
      nodes: JSON.parse(JSON.stringify(persistableNodes)), // Deep clone
      edges: JSON.parse(JSON.stringify(persistableEdges)), // Deep clone
      timestamp: Date.now()
    }

    setHistory(prev => {
      // If we're not at the end of history, remove everything after current index
      let newHistory = currentIndex >= 0 ? prev.slice(0, currentIndex + 1) : []

      // Add the new state
      newHistory = [...newHistory, newState]

      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory = newHistory.slice(newHistory.length - MAX_HISTORY_SIZE)
      }

      // Update current index to point to the new state
      setCurrentIndex(newHistory.length - 1)

      return newHistory
    })
  }, [currentIndex])

  // Undo operation
  const undo = useCallback(() => {
    if (!canUndo || currentIndex <= 0) return null

    isUndoRedoOperation.current = true
    const newIndex = currentIndex - 1
    setCurrentIndex(newIndex)

    // Schedule reset of the flag
    setTimeout(() => {
      isUndoRedoOperation.current = false
    }, 100)

    return history[newIndex]
  }, [canUndo, currentIndex, history])

  // Redo operation
  const redo = useCallback(() => {
    if (!canRedo || currentIndex >= history.length - 1) return null

    isUndoRedoOperation.current = true
    const newIndex = currentIndex + 1
    setCurrentIndex(newIndex)

    // Schedule reset of the flag
    setTimeout(() => {
      isUndoRedoOperation.current = false
    }, 100)

    return history[newIndex]
  }, [canRedo, currentIndex, history])

  // Clear history (useful when loading a new workflow)
  const clearHistory = useCallback(() => {
    setHistory([])
    setCurrentIndex(-1)
  }, [])

  // Get current state
  const getCurrentState = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < history.length) {
      return history[currentIndex]
    }
    return null
  }, [currentIndex, history])

  return {
    pushState,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    getCurrentState,
    historySize: history.length,
    currentIndex
  }
}