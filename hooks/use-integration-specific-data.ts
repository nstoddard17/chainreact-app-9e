import { useState, useCallback } from 'react'
import { useAuth } from './use-auth'
import { useAuthStore } from '@/stores/authStore'
import { apiClient } from '@/lib/apiClient'

interface UseIntegrationSpecificDataOptions {
  integrationId?: string
  providerId?: string
}

export function useIntegrationSpecificData({ integrationId, providerId }: UseIntegrationSpecificDataOptions = {}) {
  const { user } = useAuth()
  const { refreshSession } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Helper function to handle authentication failures
  const handleAuthFailure = useCallback(async (originalError: any) => {
    console.log("🔄 Authentication failed, attempting session refresh...")
    
    try {
      const refreshSuccess = await refreshSession()
      if (refreshSuccess) {
        console.log("✅ Session refreshed successfully")
        return true
      } else {
        console.error("❌ Session refresh failed")
        return false
      }
    } catch (refreshError) {
      console.error("❌ Session refresh error:", refreshError)
      return false
    }
  }, [refreshSession])

  // Discord-specific data loading
  const loadDiscordData = useCallback(async (dataType: string, options: any = {}) => {
    if (!user || !integrationId || providerId !== 'discord') {
      console.warn('Cannot load Discord data: missing user, integrationId, or wrong provider')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.post('/api/integrations/fetch-user-data', {
        integrationId,
        dataType,
        options
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to load Discord data')
      }

      return response.data
               } catch (err: any) {
             // Check if it's an authentication error
             if (err.message?.includes('Authorization header required') || err.message?.includes('Unauthorized') || err.message?.includes('Not authenticated')) {
               console.log("🔐 Authentication error detected, attempting session refresh...")
               const refreshSuccess = await handleAuthFailure(err)
               
               if (refreshSuccess) {
                 // Retry the request after successful refresh
                 try {
                   const retryResponse = await apiClient.post('/api/integrations/fetch-user-data', {
                     integrationId,
                     dataType,
                     options
                   })

                   if (!retryResponse.success) {
                     throw new Error(retryResponse.error || 'Failed to load Discord data after refresh')
                   }

                   return retryResponse.data
                 } catch (retryErr: any) {
                   const errorMessage = retryErr.message || 'Failed to load Discord data after refresh'
                   setError(errorMessage)
                   console.error('Discord data loading retry error:', retryErr)
                   return null
                 }
               }
             }
             
             const errorMessage = err.message || 'Failed to load Discord data'
             setError(errorMessage)
             console.error('Discord data loading error:', err)
             return null
           } finally {
             setLoading(false)
           }
  }, [user, integrationId, providerId])

  // Notion-specific data loading
  const loadNotionData = useCallback(async (dataType: string, options: any = {}) => {
    if (!user || !integrationId || providerId !== 'notion') {
      console.warn('Cannot load Notion data: missing user, integrationId, or wrong provider')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.post('/api/integrations/fetch-user-data', {
        integrationId,
        dataType,
        options
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to load Notion data')
      }

      return response.data
               } catch (err: any) {
             // Check if it's an authentication error
             if (err.message?.includes('Authorization header required') || err.message?.includes('Unauthorized') || err.message?.includes('Not authenticated')) {
               console.log("🔐 Authentication error detected, attempting session refresh...")
               const refreshSuccess = await handleAuthFailure(err)
               
               if (refreshSuccess) {
                 // Retry the request after successful refresh
                 try {
                   const retryResponse = await apiClient.post('/api/integrations/fetch-user-data', {
                     integrationId,
                     dataType,
                     options
                   })

                   if (!retryResponse.success) {
                     throw new Error(retryResponse.error || 'Failed to load Notion data after refresh')
                   }

                   return retryResponse.data
                 } catch (retryErr: any) {
                   const errorMessage = retryErr.message || 'Failed to load Notion data after refresh'
                   setError(errorMessage)
                   console.error('Notion data loading retry error:', retryErr)
                   return null
                 }
               }
             }
             
             const errorMessage = err.message || 'Failed to load Notion data'
             setError(errorMessage)
             console.error('Notion data loading error:', err)
             return null
           } finally {
             setLoading(false)
           }
  }, [user, integrationId, providerId])

  // Slack-specific data loading
  const loadSlackData = useCallback(async (dataType: string, options: any = {}) => {
    if (!user || !integrationId || providerId !== 'slack') {
      console.warn('Cannot load Slack data: missing user, integrationId, or wrong provider')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      let response
      
      // Use Slack-specific endpoint for channels
      if (dataType === 'slack-channels') {
        response = await apiClient.post('/api/integrations/slack/load-data', {
          integrationId
        })
      } else {
        // Use generic endpoint for other Slack data
        response = await apiClient.post('/api/integrations/fetch-user-data', {
          integrationId,
          dataType,
          options
        })
      }

      if (!response.success) {
        throw new Error(response.error || 'Failed to load Slack data')
      }

      return response.data
               } catch (err: any) {
             // Check if it's an authentication error
             if (err.message?.includes('Authorization header required') || err.message?.includes('Unauthorized') || err.message?.includes('Not authenticated')) {
               console.log("🔐 Authentication error detected, attempting session refresh...")
               const refreshSuccess = await handleAuthFailure(err)
               
               if (refreshSuccess) {
                 // Retry the request after successful refresh
                 try {
                   let retryResponse
                   
                   // Use Slack-specific endpoint for channels
                   if (dataType === 'slack-channels') {
                     retryResponse = await apiClient.post('/api/integrations/slack/load-data', {
                       integrationId
                     })
                   } else {
                     // Use generic endpoint for other Slack data
                     retryResponse = await apiClient.post('/api/integrations/fetch-user-data', {
                       integrationId,
                       dataType,
                       options
                     })
                   }

                   if (!retryResponse.success) {
                     throw new Error(retryResponse.error || 'Failed to load Slack data after refresh')
                   }

                   return retryResponse.data
                 } catch (retryErr: any) {
                   const errorMessage = retryErr.message || 'Failed to load Slack data after refresh'
                   setError(errorMessage)
                   console.error('Slack data loading retry error:', retryErr)
                   return null
                 }
               }
             }
             
             const errorMessage = err.message || 'Failed to load Slack data'
             setError(errorMessage)
             console.error('Slack data loading error:', err)
             return null
           } finally {
             setLoading(false)
           }
  }, [user, integrationId, providerId])

  // Trello-specific data loading
  const loadTrelloData = useCallback(async (dataType: string, options: any = {}) => {
    if (!user || !integrationId || providerId !== 'trello') {
      console.warn('Cannot load Trello data: missing user, integrationId, or wrong provider')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.post('/api/integrations/fetch-user-data', {
        integrationId,
        dataType,
        options
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to load Trello data')
      }

      return response.data
               } catch (err: any) {
             // Check if it's an authentication error
             if (err.message?.includes('Authorization header required') || err.message?.includes('Unauthorized') || err.message?.includes('Not authenticated')) {
               console.log("🔐 Authentication error detected, attempting session refresh...")
               const refreshSuccess = await handleAuthFailure(err)
               
               if (refreshSuccess) {
                 // Retry the request after successful refresh
                 try {
                   const retryResponse = await apiClient.post('/api/integrations/fetch-user-data', {
                     integrationId,
                     dataType,
                     options
                   })

                   if (!retryResponse.success) {
                     throw new Error(retryResponse.error || 'Failed to load Trello data after refresh')
                   }

                   return retryResponse.data
                 } catch (retryErr: any) {
                   const errorMessage = retryErr.message || 'Failed to load Trello data after refresh'
                   setError(errorMessage)
                   console.error('Trello data loading retry error:', retryErr)
                   return null
                 }
               }
             }
             
             const errorMessage = err.message || 'Failed to load Trello data'
             setError(errorMessage)
             console.error('Trello data loading error:', err)
             return null
           } finally {
             setLoading(false)
           }
  }, [user, integrationId, providerId])

  // Google Sheets-specific data loading
  const loadGoogleSheetsData = useCallback(async (dataType: string, options: any = {}) => {
    if (!user || !integrationId || providerId !== 'google-sheets') {
      console.warn('Cannot load Google Sheets data: missing user, integrationId, or wrong provider')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.post('/api/integrations/fetch-user-data', {
        integrationId,
        dataType,
        options
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to load Google Sheets data')
      }

      return response.data
               } catch (err: any) {
             // Check if it's an authentication error
             if (err.message?.includes('Authorization header required') || err.message?.includes('Unauthorized') || err.message?.includes('Not authenticated')) {
               console.log("🔐 Authentication error detected, attempting session refresh...")
               const refreshSuccess = await handleAuthFailure(err)
               
               if (refreshSuccess) {
                 // Retry the request after successful refresh
                 try {
                   const retryResponse = await apiClient.post('/api/integrations/fetch-user-data', {
                     integrationId,
                     dataType,
                     options
                   })

                   if (!retryResponse.success) {
                     throw new Error(retryResponse.error || 'Failed to load Google Sheets data after refresh')
                   }

                   return retryResponse.data
                 } catch (retryErr: any) {
                   const errorMessage = retryErr.message || 'Failed to load Google Sheets data after refresh'
                   setError(errorMessage)
                   console.error('Google Sheets data loading retry error:', retryErr)
                   return null
                 }
               }
             }
             
             const errorMessage = err.message || 'Failed to load Google Sheets data'
             setError(errorMessage)
             console.error('Google Sheets data loading error:', err)
             return null
           } finally {
             setLoading(false)
           }
  }, [user, integrationId, providerId])

  // Gmail-specific data loading
  const loadGmailData = useCallback(async (dataType: string, options: any = {}) => {
    if (!user || !integrationId || providerId !== 'gmail') {
      console.warn('Cannot load Gmail data: missing user, integrationId, or wrong provider')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.post('/api/integrations/fetch-user-data', {
        integrationId,
        dataType,
        options
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to load Gmail data')
      }

      return response.data
               } catch (err: any) {
             // Check if it's an authentication error
             if (err.message?.includes('Authorization header required') || err.message?.includes('Unauthorized') || err.message?.includes('Not authenticated')) {
               console.log("🔐 Authentication error detected, attempting session refresh...")
               const refreshSuccess = await handleAuthFailure(err)
               
               if (refreshSuccess) {
                 // Retry the request after successful refresh
                 try {
                   const retryResponse = await apiClient.post('/api/integrations/fetch-user-data', {
                     integrationId,
                     dataType,
                     options
                   })

                   if (!retryResponse.success) {
                     throw new Error(retryResponse.error || 'Failed to load Gmail data after refresh')
                   }

                   return retryResponse.data
                 } catch (retryErr: any) {
                   const errorMessage = retryErr.message || 'Failed to load Gmail data after refresh'
                   setError(errorMessage)
                   console.error('Gmail data loading retry error:', retryErr)
                   return null
                 }
               }
             }
             
             const errorMessage = err.message || 'Failed to load Gmail data'
             setError(errorMessage)
             console.error('Gmail data loading error:', err)
             return null
           } finally {
             setLoading(false)
           }
  }, [user, integrationId, providerId])

  // HubSpot-specific data loading
  const loadHubSpotData = useCallback(async (dataType: string, options: any = {}) => {
    if (!user || !integrationId || providerId !== 'hubspot') {
      console.warn('Cannot load HubSpot data: missing user, integrationId, or wrong provider')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.post('/api/integrations/fetch-user-data', {
        integrationId,
        dataType,
        options
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to load HubSpot data')
      }

      return response.data
               } catch (err: any) {
             // Check if it's an authentication error
             if (err.message?.includes('Authorization header required') || err.message?.includes('Unauthorized') || err.message?.includes('Not authenticated')) {
               console.log("🔐 Authentication error detected, attempting session refresh...")
               const refreshSuccess = await handleAuthFailure(err)
               
               if (refreshSuccess) {
                 // Retry the request after successful refresh
                 try {
                   const retryResponse = await apiClient.post('/api/integrations/fetch-user-data', {
                     integrationId,
                     dataType,
                     options
                   })

                   if (!retryResponse.success) {
                     throw new Error(retryResponse.error || 'Failed to load HubSpot data after refresh')
                   }

                   return retryResponse.data
                 } catch (retryErr: any) {
                   const errorMessage = retryErr.message || 'Failed to load HubSpot data after refresh'
                   setError(errorMessage)
                   console.error('HubSpot data loading retry error:', retryErr)
                   return null
                 }
               }
             }
             
             const errorMessage = err.message || 'Failed to load HubSpot data'
             setError(errorMessage)
             console.error('HubSpot data loading error:', err)
             return null
           } finally {
             setLoading(false)
           }
  }, [user, integrationId, providerId])

  // Airtable-specific data loading
  const loadAirtableData = useCallback(async (dataType: string, options: any = {}) => {
    if (!user || !integrationId || providerId !== 'airtable') {
      console.warn('Cannot load Airtable data: missing user, integrationId, or wrong provider')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.post('/api/integrations/fetch-user-data', {
        integrationId,
        dataType,
        options
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to load Airtable data')
      }

      return response.data
    } catch (err: any) {
      // Check if it's an authentication error
      if (err.message?.includes('Authorization header required') || err.message?.includes('Unauthorized') || err.message?.includes('Not authenticated')) {
        console.log("🔐 Authentication error detected, attempting session refresh...")
        const refreshSuccess = await handleAuthFailure(err)
        
        if (refreshSuccess) {
          // Retry the request after successful refresh
          try {
            const retryResponse = await apiClient.post('/api/integrations/fetch-user-data', {
              integrationId,
              dataType,
              options
            })

            if (!retryResponse.success) {
              throw new Error(retryResponse.error || 'Failed to load Airtable data after refresh')
            }

            return retryResponse.data
          } catch (retryErr: any) {
            const errorMessage = retryErr.message || 'Failed to load Airtable data after refresh'
            setError(errorMessage)
            console.error('Airtable data loading retry error:', retryErr)
            return null
          }
        }
      }
      
      const errorMessage = err.message || 'Failed to load Airtable data'
      setError(errorMessage)
      console.error('Airtable data loading error:', err)
      return null
    } finally {
      setLoading(false)
    }
  }, [user, integrationId, providerId])

  // Notion database properties loading
  const loadNotionDatabaseProperties = useCallback(async (databaseId: string) => {
    if (!user || !integrationId || providerId !== 'notion') {
      console.warn('Cannot load Notion database properties: missing user, integrationId, or wrong provider')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.post('/api/integrations/fetch-user-data', {
        integrationId,
        dataType: 'notion_database_properties',
        options: { context: { database: databaseId } }
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to load Notion database properties')
      }

      return response.data
    } catch (err: any) {
      // Check if it's an authentication error
      if (err.message?.includes('Authorization header required') || err.message?.includes('Unauthorized') || err.message?.includes('Not authenticated')) {
        console.log("🔐 Authentication error detected, attempting session refresh...")
        const refreshSuccess = await handleAuthFailure(err)
        
        if (refreshSuccess) {
          // Retry the request after successful refresh
          try {
            const retryResponse = await apiClient.post('/api/integrations/fetch-user-data', {
              integrationId,
              dataType: 'notion_database_properties',
              options: { context: { database: databaseId } }
            })

            if (!retryResponse.success) {
              throw new Error(retryResponse.error || 'Failed to load Notion database properties after refresh')
            }

            return retryResponse.data
          } catch (retryErr: any) {
            const errorMessage = retryErr.message || 'Failed to load Notion database properties after refresh'
            setError(errorMessage)
            console.error('Notion database properties loading retry error:', retryErr)
            return null
          }
        }
      }
      
      const errorMessage = err.message || 'Failed to load Notion database properties'
      setError(errorMessage)
      console.error('Notion database properties loading error:', err)
      return null
    } finally {
      setLoading(false)
    }
  }, [user, integrationId, providerId])

  // Generic data loading function that routes to the appropriate provider-specific function
  const loadData = useCallback(async (dataType: string, options: any = {}) => {
    if (!providerId) {
      console.warn('Cannot load data: providerId is required')
      return null
    }

    switch (providerId) {
      case 'discord':
        return loadDiscordData(dataType, options)
      case 'notion':
        return loadNotionData(dataType, options)
      case 'slack':
        return loadSlackData(dataType, options)
      case 'trello':
        return loadTrelloData(dataType, options)
      case 'google-sheets':
        return loadGoogleSheetsData(dataType, options)
      case 'gmail':
        return loadGmailData(dataType, options)
      case 'hubspot':
        return loadHubSpotData(dataType, options)
      case 'airtable':
        return loadAirtableData(dataType, options)
      default:
        console.warn(`No specific data loader for provider: ${providerId}`)
        return null
    }
  }, [providerId, loadDiscordData, loadNotionData, loadSlackData, loadTrelloData, loadGoogleSheetsData, loadGmailData, loadHubSpotData, loadAirtableData])

  return {
    loading,
    error,
    loadData,
    loadDiscordData,
    loadNotionData,
    loadNotionDatabaseProperties,
    loadSlackData,
    loadTrelloData,
    loadGoogleSheetsData,
    loadGmailData,
    loadHubSpotData,
    loadAirtableData
  }
} 