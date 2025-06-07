"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

interface Integration {
  id: string
  provider: string
  status: "connected" | "disconnected"
  createdAt: string
  updatedAt: string
}

interface IntegrationContextType {
  integrations: Integration[]
  loading: boolean
  error: string | null
  fetchIntegrations: () => Promise<void>
}

const IntegrationContext = createContext<IntegrationContextType | undefined>(undefined)

export function IntegrationProvider({ children }: { children: ReactNode }) {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchIntegrations = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/integrations")
      if (!response.ok) {
        throw new Error("Failed to fetch integrations")
      }
      const data = await response.json()
      setIntegrations(data.integrations || [])
    } catch (err: any) {
      setError(err.message)
      console.error("Error fetching integrations:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchIntegrations()
  }, [])

  return (
    <IntegrationContext.Provider
      value={{
        integrations,
        loading,
        error,
        fetchIntegrations,
      }}
    >
      {children}
    </IntegrationContext.Provider>
  )
}

export function useIntegrationContext() {
  const context = useContext(IntegrationContext)
  if (context === undefined) {
    throw new Error("useIntegrationContext must be used within an IntegrationProvider")
  }
  return context
}
