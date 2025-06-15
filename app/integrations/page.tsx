"use client"

import { useEffect, useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import { useRouter } from "next/navigation"
import IntegrationsContent from "@/components/integrations/IntegrationsContent"

export default function IntegrationsPage() {
  const [isClient, setIsClient] = useState(false)
  const { user, initialized, loading } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (isClient && initialized && !loading && !user) {
      router.push("/auth/login")
    }
  }, [isClient, initialized, loading, user, router])

  if (!isClient || !initialized || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Required</h2>
          <p className="text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  return <IntegrationsContent />
}
