"use client"

import type React from "react"
import { useEffect } from "react"
import { useIntegrationStore } from "@/stores/integrationStore"

const DashboardContent: React.FC = () => {
  const { ensureDataPreloaded, globalPreloadingData, preloadProgress } = useIntegrationStore()

  useEffect(() => {
    // Ensure data is preloaded when dashboard is accessed
    ensureDataPreloaded()
  }, [ensureDataPreloaded])

  return (
    <div>
      <h1>Dashboard Content</h1>
      {globalPreloadingData ? (
        <div>
          <p>Preloading data... {preloadProgress}%</p>
        </div>
      ) : (
        <p>Welcome to the dashboard!</p>
      )}
    </div>
  )
}

export default DashboardContent
