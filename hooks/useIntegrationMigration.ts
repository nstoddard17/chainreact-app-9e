import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'

import { logger } from '@/lib/utils/logger'

/**
 * Hook to automatically detect and fix user ID mismatches in integrations
 * This runs once per session when a user is authenticated
 */
export function useIntegrationMigration() {
  const { user } = useAuthStore()
  const hasChecked = useRef(false)

  useEffect(() => {
    // Only run once per session and only if user is authenticated
    if (!user || hasChecked.current) return

    const checkAndMigrateIntegrations = async () => {
      try {
        // Mark as checked to prevent multiple runs
        hasChecked.current = true

        // Check if there might be orphaned integrations
        const response = await fetch('/api/integrations/check-orphaned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })

        if (!response.ok) {
          logger.warn('Could not check for orphaned integrations')
          return
        }

        const data = await response.json()
        
        if (data.hasOrphaned) {
          logger.debug('🔄 Found orphaned integrations, attempting migration...')
          
          // Attempt automatic migration
          const migrateResponse = await fetch('/api/integrations/migrate-user-id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })

          if (migrateResponse.ok) {
            const migrateData = await migrateResponse.json()
            logger.debug(`✅ Successfully migrated ${migrateData.migrated} integrations`)
            
            // Refresh integrations if any were migrated
            if (migrateData.migrated > 0) {
              // Trigger a refresh of the integration store
              window.dispatchEvent(new CustomEvent('integrations-migrated'))
            }
          }
        }
      } catch (error) {
        logger.error('Error checking for integration migration:', error)
      }
    }

    checkAndMigrateIntegrations()
  }, [user])
}

/**
 * Manual migration trigger for admin use or debugging
 */
export async function manualIntegrationMigration(oldUserId: string, newUserId: string) {
  try {
    const response = await fetch('/api/integrations/admin-migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldUserId, newUserId })
    })

    if (!response.ok) {
      throw new Error('Migration failed')
    }

    const data = await response.json()
    return data
  } catch (error) {
    logger.error('Manual migration failed:', error)
    throw error
  }
}