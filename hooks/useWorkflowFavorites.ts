"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuthStore } from "@/stores/authStore"

const MAX_RECENT_ITEMS = 10
const STORAGE_KEY_FAVORITES = "workflow_favorites"
const STORAGE_KEY_RECENT = "workflow_recent"

interface RecentItem {
  id: string
  name: string
  accessedAt: string
}

/**
 * Hook to manage workflow favorites and recently accessed workflows
 * Stores data in localStorage per user
 */
export function useWorkflowFavorites() {
  const { user } = useAuthStore()
  const [favorites, setFavorites] = useState<string[]>([])
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  // Get storage keys based on user ID
  const getFavoritesKey = useCallback(() => {
    return user?.id ? `${STORAGE_KEY_FAVORITES}_${user.id}` : STORAGE_KEY_FAVORITES
  }, [user?.id])

  const getRecentKey = useCallback(() => {
    return user?.id ? `${STORAGE_KEY_RECENT}_${user.id}` : STORAGE_KEY_RECENT
  }, [user?.id])

  // Load data from localStorage on mount
  useEffect(() => {
    if (!user) return

    try {
      const favoritesData = localStorage.getItem(getFavoritesKey())
      const recentData = localStorage.getItem(getRecentKey())

      if (favoritesData) {
        setFavorites(JSON.parse(favoritesData))
      }

      if (recentData) {
        setRecentItems(JSON.parse(recentData))
      }
    } catch (e) {
      console.error("Failed to load favorites/recent from localStorage:", e)
    }

    setIsLoaded(true)
  }, [user, getFavoritesKey, getRecentKey])

  // Save favorites to localStorage
  const saveFavorites = useCallback((newFavorites: string[]) => {
    try {
      localStorage.setItem(getFavoritesKey(), JSON.stringify(newFavorites))
      setFavorites(newFavorites)
    } catch (e) {
      console.error("Failed to save favorites:", e)
    }
  }, [getFavoritesKey])

  // Save recent items to localStorage
  const saveRecent = useCallback((newRecent: RecentItem[]) => {
    try {
      localStorage.setItem(getRecentKey(), JSON.stringify(newRecent))
      setRecentItems(newRecent)
    } catch (e) {
      console.error("Failed to save recent items:", e)
    }
  }, [getRecentKey])

  // Toggle favorite status
  const toggleFavorite = useCallback((workflowId: string) => {
    const newFavorites = favorites.includes(workflowId)
      ? favorites.filter(id => id !== workflowId)
      : [...favorites, workflowId]
    saveFavorites(newFavorites)
    return !favorites.includes(workflowId)
  }, [favorites, saveFavorites])

  // Add to favorites
  const addFavorite = useCallback((workflowId: string) => {
    if (!favorites.includes(workflowId)) {
      saveFavorites([...favorites, workflowId])
    }
  }, [favorites, saveFavorites])

  // Remove from favorites
  const removeFavorite = useCallback((workflowId: string) => {
    saveFavorites(favorites.filter(id => id !== workflowId))
  }, [favorites, saveFavorites])

  // Check if a workflow is favorited
  const isFavorite = useCallback((workflowId: string) => {
    return favorites.includes(workflowId)
  }, [favorites])

  // Track workflow access (for recent items)
  const trackAccess = useCallback((workflow: { id: string; name: string }) => {
    const now = new Date().toISOString()
    const newRecent = [
      { id: workflow.id, name: workflow.name, accessedAt: now },
      ...recentItems.filter(item => item.id !== workflow.id)
    ].slice(0, MAX_RECENT_ITEMS)
    saveRecent(newRecent)
  }, [recentItems, saveRecent])

  // Remove from recent items
  const removeFromRecent = useCallback((workflowId: string) => {
    saveRecent(recentItems.filter(item => item.id !== workflowId))
  }, [recentItems, saveRecent])

  // Clear all recent items
  const clearRecent = useCallback(() => {
    saveRecent([])
  }, [saveRecent])

  // Get recent items that still exist in the provided workflow list
  const getValidRecentItems = useCallback((workflowIds: string[]) => {
    return recentItems.filter(item => workflowIds.includes(item.id))
  }, [recentItems])

  // Get favorite IDs that still exist in the provided workflow list
  const getValidFavorites = useCallback((workflowIds: string[]) => {
    return favorites.filter(id => workflowIds.includes(id))
  }, [favorites])

  return {
    favorites,
    recentItems,
    isLoaded,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    isFavorite,
    trackAccess,
    removeFromRecent,
    clearRecent,
    getValidRecentItems,
    getValidFavorites
  }
}
