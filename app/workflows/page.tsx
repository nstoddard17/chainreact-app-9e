"use client"

import { useEffect } from "react"
import { useIntegrationStore } from "@/stores/integrationStore"

export default function WorkflowsPage() {
  useEffect(() => {
    // Ensure data is preloaded when workflows page is accessed
    const { ensureDataPreloaded } = useIntegrationStore.getState()
    ensureDataPreloaded()
  }, [])

  return (
    <div>
      <h1>Workflows Page</h1>
      {/* Add your workflows content here */}
    </div>
  )
}
