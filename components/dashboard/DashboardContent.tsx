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

  // Calculate progress percentage properly
  const loaded = Object.values(preloadProgress).filter(Boolean).length
  const total = Object.keys(preloadProgress).length
  const progressPercent = total ? Math.round((loaded / total) * 100) : 0

  return (
    <div>
      <h1>Dashboard Content</h1>
      {globalPreloadingData ? (
        <div>
          <p>Preloading data... {progressPercent}%</p>
        </div>
      ) : (
        <p>Welcome to the dashboard!</p>
      )}
    </div>
  )
}

export default DashboardContent
