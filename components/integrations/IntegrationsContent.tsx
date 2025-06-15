"use client"

import type React from "react"
import { useEffect } from "react"
import { useIntegrationStore } from "@/stores/integration-store"

const IntegrationsContent: React.FC = () => {
  // Add this useEffect to check for pending connections
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Check for pending connections on page load
      setTimeout(() => {
        const { checkPendingConnection } = useIntegrationStore.getState()
        if (checkPendingConnection) {
          checkPendingConnection()
        }
      }, 1000)
    }
  }, [])

  return <div>{/* Your integrations content here */}</div>
}

export default IntegrationsContent
