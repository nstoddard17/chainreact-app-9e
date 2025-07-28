import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "./use-auth"
import { useAuthStore } from "@/stores/authStore"

interface ConfigPreferences {
  [nodeType: string]: {
    [fieldName: string]: any
  }
}

interface UseConfigPreferencesOptions {
  nodeType: string
  providerId: string
  autoSave?: boolean
  autoLoad?: boolean
  debounceMs?: number
}

export function useConfigPreferences({
  nodeType,
  providerId,
  autoSave = true,
  autoLoad = true,
  debounceMs = 1000
}: UseConfigPreferencesOptions) {
  const { user } = useAuth()
  const { refreshSession } = useAuthStore()
  const [preferences, setPreferences] = useState<ConfigPreferences>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout>()
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Helper function to handle authentication failures
  const handleAuthFailure = useCallback(async (originalError: any) => {
    console.log("🔄 Authentication failed in config preferences, attempting session refresh...")
    
    try {
      const refreshSuccess = await refreshSession()
      if (refreshSuccess) {
        console.log("✅ Session refreshed successfully in config preferences")
        return true
      } else {
        console.error("❌ Session refresh failed in config preferences")
        return false
      }
    } catch (refreshError) {
      console.error("❌ Session refresh error in config preferences:", refreshError)
      return false
    }
  }, [refreshSession])

  // Load preferences when component mounts or when user/nodeType changes
  useEffect(() => {
    if (!user || !autoLoad) return

    const loadPreferences = async () => {
      setLoading(true)
      try {
        const response = await fetch(
          `/api/user/config-preferences?nodeType=${encodeURIComponent(nodeType)}&providerId=${encodeURIComponent(providerId)}`
        )
        
        if (response.ok) {
          const data = await response.json()
          setPreferences(data.preferences || {})
        } else if (response.status === 401) {
          // Authentication error, try to refresh session
          console.log("🔐 Authentication error in config preferences, attempting session refresh...")
          const refreshSuccess = await handleAuthFailure(null)
          
          if (refreshSuccess) {
            // Retry the request after successful refresh
            try {
              const retryResponse = await fetch(
                `/api/user/config-preferences?nodeType=${encodeURIComponent(nodeType)}&providerId=${encodeURIComponent(providerId)}`
              )
              
              if (retryResponse.ok) {
                const retryData = await retryResponse.json()
                setPreferences(retryData.preferences || {})
              }
            } catch (retryError) {
              console.error("Error retrying config preferences load:", retryError)
            }
          }
        }
      } catch (error) {
        console.error("Error loading config preferences:", error)
      } finally {
        setLoading(false)
      }
    }

    loadPreferences()
  }, [user, nodeType, providerId, autoLoad])

  // Save preferences to database
  const savePreferences = useCallback(async (newPreferences: Record<string, any>) => {
    if (!user) return

    setSaving(true)
    try {
      const response = await fetch("/api/user/config-preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nodeType,
          providerId,
          preferences: newPreferences
        }),
      })

      if (response.ok) {
        setLastSaved(new Date())
      } else if (response.status === 401) {
        // Authentication error, try to refresh session
        console.log("🔐 Authentication error in config preferences save, attempting session refresh...")
        const refreshSuccess = await handleAuthFailure(null)
        
        if (refreshSuccess) {
          // Retry the save after successful refresh
          try {
            const retryResponse = await fetch("/api/user/config-preferences", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                nodeType,
                providerId,
                preferences: newPreferences
              }),
            })

            if (retryResponse.ok) {
              setLastSaved(new Date())
            } else {
              console.error("Failed to save preferences after refresh")
            }
          } catch (retryError) {
            console.error("Error retrying config preferences save:", retryError)
          }
        } else {
          console.error("Failed to save preferences - authentication failed")
        }
      } else {
        console.error("Failed to save preferences")
      }
    } catch (error) {
      console.error("Error saving config preferences:", error)
    } finally {
      setSaving(false)
    }
  }, [user, nodeType, providerId])

  // Debounced save function
  const debouncedSave = useCallback((newPreferences: Record<string, any>) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      savePreferences(newPreferences)
    }, debounceMs)
  }, [savePreferences, debounceMs])

  // Update a specific field value
  const updateField = useCallback((fieldName: string, value: any) => {
    const newPreferences = {
      ...preferences[nodeType],
      [fieldName]: value
    }
    
    setPreferences(prev => ({
      ...prev,
      [nodeType]: newPreferences
    }))
    
    if (autoSave) {
      debouncedSave(newPreferences)
    }
  }, [preferences, nodeType, autoSave, debouncedSave])

  // Update multiple fields at once
  const updateFields = useCallback((fields: Record<string, any>) => {
    const newPreferences = {
      ...preferences[nodeType],
      ...fields
    }
    
    setPreferences(prev => ({
      ...prev,
      [nodeType]: newPreferences
    }))
    
    if (autoSave) {
      debouncedSave(newPreferences)
    }
  }, [preferences, nodeType, autoSave, debouncedSave])

  // Get a specific field value
  const getField = useCallback((fieldName: string) => {
    return preferences[nodeType]?.[fieldName]
  }, [preferences, nodeType])

  // Get all fields for the current node type
  const getFields = useCallback(() => {
    return preferences[nodeType] || {}
  }, [preferences, nodeType])

  // Clear all preferences for the current node type
  const clearPreferences = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/user/config-preferences?nodeType=${encodeURIComponent(nodeType)}&providerId=${encodeURIComponent(providerId)}`,
        { method: "DELETE" }
      )
      
      if (response.ok) {
        setPreferences(prev => {
          const newPrefs = { ...prev }
          delete newPrefs[nodeType]
          return newPrefs
        })
      }
    } catch (error) {
      console.error("Error clearing preferences:", error)
    }
  }, [nodeType, providerId])

  // Clear a specific field
  const clearField = useCallback(async (fieldName: string) => {
    try {
      const response = await fetch(
        `/api/user/config-preferences?nodeType=${encodeURIComponent(nodeType)}&providerId=${encodeURIComponent(providerId)}&fieldName=${encodeURIComponent(fieldName)}`,
        { method: "DELETE" }
      )
      
      if (response.ok) {
        setPreferences(prev => ({
          ...prev,
          [nodeType]: {
            ...prev[nodeType],
            [fieldName]: undefined
          }
        }))
      }
    } catch (error) {
      console.error("Error clearing field:", error)
    }
  }, [nodeType, providerId])

  return {
    preferences,
    loading,
    saving,
    lastSaved,
    updateField,
    updateFields,
    getField,
    getFields,
    clearPreferences,
    clearField,
    savePreferences
  }
} 