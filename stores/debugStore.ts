import { create } from 'zustand'

export type DebugEventType =
  | 'api_call'
  | 'api_response'
  | 'api_error'
  | 'state_change'
  | 'user_action'
  | 'error'
  | 'warning'
  | 'info'

export interface DebugEvent {
  id: string
  timestamp: string
  type: DebugEventType
  category: string
  message: string
  data?: any
  duration?: number
}

interface DebugStore {
  events: DebugEvent[]
  maxEvents: number
  enabled: boolean

  // Actions
  logEvent: (type: DebugEventType, category: string, message: string, data?: any) => void
  logApiCall: (method: string, url: string, params?: any) => string // Returns request ID
  logApiResponse: (requestId: string, status: number, data?: any, duration?: number) => void
  logApiError: (requestId: string, error: any, duration?: number) => void
  logStateChange: (storeName: string, change: string, data?: any) => void
  clearEvents: () => void
  setEnabled: (enabled: boolean) => void
  getEventsByCategory: (category: string) => DebugEvent[]
  getEventsByType: (type: DebugEventType) => DebugEvent[]
}

// Only enable for admin users - will be set from AdminDebugPanel
let isAdminUser = false

export const setDebugAdmin = (isAdmin: boolean) => {
  isAdminUser = isAdmin
}

export const useDebugStore = create<DebugStore>((set, get) => ({
  events: [],
  maxEvents: 1000, // Keep last 1000 events
  enabled: true,

  logEvent: (type, category, message, data) => {
    if (!isAdminUser || !get().enabled) return

    const event: DebugEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type,
      category,
      message,
      data,
    }

    set(state => ({
      events: [...state.events.slice(-state.maxEvents + 1), event]
    }))
  },

  logApiCall: (method, url, params) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    get().logEvent('api_call', 'API', `${method} ${url}`, {
      requestId,
      method,
      url,
      params,
      startTime: Date.now(),
    })

    return requestId
  },

  logApiResponse: (requestId, status, data, duration) => {
    get().logEvent('api_response', 'API', `Response ${status}`, {
      requestId,
      status,
      data,
      duration,
      success: status >= 200 && status < 300,
    })
  },

  logApiError: (requestId, error, duration) => {
    get().logEvent('api_error', 'API', `Error: ${error?.message || 'Unknown'}`, {
      requestId,
      error: error?.message || error,
      stack: error?.stack,
      duration,
    })
  },

  logStateChange: (storeName, change, data) => {
    get().logEvent('state_change', storeName, change, data)
  },

  clearEvents: () => set({ events: [] }),

  setEnabled: (enabled) => set({ enabled }),

  getEventsByCategory: (category) => {
    return get().events.filter(e => e.category === category)
  },

  getEventsByType: (type) => {
    return get().events.filter(e => e.type === type)
  },
}))
