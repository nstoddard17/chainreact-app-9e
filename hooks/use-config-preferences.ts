import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "./use-auth"

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
  const [preferences, setPreferences] = useState<ConfigPreferences>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout>()
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

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
  const updateFields = useCallback((updates: Record<string, any>) => {
    const newPreferences = {
      ...preferences[nodeType],
      ...updates
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
  const getField = useCallback((fieldName: string, defaultValue?: any) => {
    return preferences[nodeType]?.[fieldName] ?? defaultValue
  }, [preferences, nodeType])

  // Get all fields for the current node type
  const getFields = useCallback(() => {
    return preferences[nodeType] || {}
  }, [preferences, nodeType])

  // Clear all preferences for the current node type
  const clearPreferences = useCallback(async () => {
    if (!user) return

    try {
      await fetch(`/api/user/config-preferences?nodeType=${encodeURIComponent(nodeType)}`, {
        method: "DELETE"
      })
      
      setPreferences(prev => {
        const newPrefs = { ...prev }
        delete newPrefs[nodeType]
        return newPrefs
      })
    } catch (error) {
      console.error("Error clearing preferences:", error)
    }
  }, [user, nodeType])

  // Clear a specific field
  const clearField = useCallback(async (fieldName: string) => {
    if (!user) return

    try {
      await fetch(
        `/api/user/config-preferences?nodeType=${encodeURIComponent(nodeType)}&fieldName=${encodeURIComponent(fieldName)}`,
        { method: "DELETE" }
      )
      
      setPreferences(prev => ({
        ...prev,
        [nodeType]: {
          ...prev[nodeType],
          [fieldName]: undefined
        }
      }))
    } catch (error) {
      console.error("Error clearing field:", error)
    }
  }, [user, nodeType])

  // Manual save function
  const save = useCallback(() => {
    if (preferences[nodeType]) {
      savePreferences(preferences[nodeType])
    }
  }, [preferences, nodeType, savePreferences])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  return {
    preferences: preferences[nodeType] || {},
    loading,
    saving,
    lastSaved,
    updateField,
    updateFields,
    getField,
    getFields,
    clearPreferences,
    clearField,
    save
  }
} 