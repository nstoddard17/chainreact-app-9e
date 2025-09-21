"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { supabase } from "@/utils/supabaseClient"
import { useEffect } from "react"

interface User {
  id: string
  email: string
  name?: string
  first_name?: string
  last_name?: string
  full_name?: string
  avatar?: string
}

interface Profile {
  id: string
  full_name?: string
  first_name?: string
  last_name?: string
  avatar_url?: string
  company?: string
  job_title?: string
  username?: string
  secondary_email?: string
  phone_number?: string
  provider?: string
  role?: string
  created_at?: string
  updated_at?: string
}

interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean
  initialized: boolean
  error: string | null
  hydrated: boolean
  initialize: () => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, metadata?: Record<string, any>) => Promise<void>
  signInWithGoogle: () => Promise<void>
  getCurrentUserId: () => string | null
  setHydrated: () => void
  checkUsernameAndRedirect: () => void
  refreshSession: () => Promise<boolean>
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      loading: false,
      initialized: false,
      error: null,
      hydrated: false,

      setHydrated: () => {
        set({ hydrated: true })
      },

      initialize: async () => {
        const state = get()
        if (state.initialized || state.loading) {
          console.log('Auth already initialized or loading, skipping...')
          return
        }
        
        // Temporary bypass for debugging
        if (typeof window !== 'undefined' && window.location.search.includes('bypass_auth=true')) {
          console.warn('Auth bypass enabled - skipping auth initialization')
          set({ loading: false, initialized: true, error: null, user: null })
          return
        }

        // Add timeout protection for initialization
        const initTimeout = setTimeout(() => {
          console.warn('Auth initialization timed out, forcing completion...')
          set({ loading: false, initialized: true, error: null, user: null })
        }, 5000) // 5 seconds timeout for initialization

        try {
          set({ loading: true, error: null })

          // Handle hash fragment for magic links
          if (typeof window !== 'undefined') {
            const hash = window.location.hash
            if (hash && hash.includes('access_token')) {
              // Extract access token from hash
              const urlParams = new URLSearchParams(hash.substring(1));
              const accessToken = urlParams.get('access_token');
              const refreshToken = urlParams.get('refresh_token');
              
              if (accessToken && refreshToken) {
                const { data, error } = await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken,
                });
                
                if (error) {
                } else if (data.session) {
                  // Clear the hash
                  window.location.hash = ''
                  // Redirect to dashboard
                  window.location.href = '/dashboard'
                  clearTimeout(initTimeout)
                  return
                }
              }
            }
          }

          // Get current user from Supabase with timeout
          console.log('Fetching user from Supabase...')
          const userPromise = supabase.auth.getUser()
          const userTimeout = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('User fetch timeout')), 2000) // 2 seconds timeout for user fetch
          )
          
          let userResult
          try {
            userResult = await Promise.race([userPromise, userTimeout])
            console.log('User fetch completed successfully')
          } catch (timeoutError) {
            console.warn('User fetch timed out, trying fallback...', timeoutError)
            // Try one more time without timeout as fallback
            try {
              userResult = await userPromise
              console.log('Fallback user fetch completed')
            } catch (fallbackError) {
              console.error('Fallback user fetch failed:', fallbackError)
              set({ user: null, loading: false, initialized: true })
              clearTimeout(initTimeout)
              return
            }
          }
          
          const { data: { user }, error: userError } = userResult

          if (userError) {
            set({ user: null, loading: false, initialized: true })
            clearTimeout(initTimeout)
            return
          }

          if (user) {
            const userObj: User = {
              id: user.id,
              email: user.email || "",
              name: user.user_metadata?.full_name || user.user_metadata?.name,
              avatar: user.user_metadata?.avatar_url,
            }

            // Check if profile exists first, create if it doesn't
            let profile: Profile | null = null
            
            try {
              // First, try to fetch existing profile
              const fetchResult = await supabase
                .from('user_profiles')
                .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, role, created_at, updated_at')
                .eq('id', user.id)
                .single()

              if (fetchResult.error) {
                // If fetch fails, try to create a new profile
                // For Google users, extract first and last name from metadata
                const isGoogleUser = user.app_metadata?.provider === 'google' || 
                                   user.app_metadata?.providers?.includes('google') ||
                                   user.identities?.some(id => id.provider === 'google')
                
                let firstName = user.user_metadata?.given_name || ''
                let lastName = user.user_metadata?.family_name || ''
                let fullName = user.user_metadata?.full_name || user.user_metadata?.name || ''
                
                // If we don't have first/last name but have full name, split it
                if ((!firstName || !lastName) && fullName) {
                  const nameParts = fullName.split(' ')
                  firstName = firstName || nameParts[0] || ''
                  lastName = lastName || nameParts.slice(1).join(' ') || ''
                }
                
                const createProfileData = {
                  id: user.id,
                  full_name: fullName,
                  first_name: firstName,
                  last_name: lastName,
                  avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
                  email: user.email,  // Include the email
                  provider: isGoogleUser ? 'google' : 'email',
                  role: 'free',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  // Don't set username for Google users - they'll set it on the setup page
                  username: isGoogleUser ? null : undefined,
                }

                const createResult = await supabase
                  .from('user_profiles')
                  .insert(createProfileData)
                  .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, role, created_at, updated_at')
                  .single()

                if (createResult.error) {
                  // Create a fallback profile from auth metadata
                  const detectedProvider = user.app_metadata?.provider || 
                                         user.app_metadata?.providers?.[0] || 
                                         (user.identities?.some(id => id.provider === 'google') ? 'google' : 'email')
                      
                  // Extract name from user metadata
                  const fullName = user.user_metadata?.full_name || 
                                  user.user_metadata?.name || 
                                  user.email?.split('@')[0] || 'User'
                      
                  const nameParts = fullName.split(' ')
                  const firstName = nameParts[0] || ''
                  const lastName = nameParts.slice(1).join(' ') || ''
                      
                  profile = {
                    id: user.id,
                    full_name: fullName,
                    first_name: firstName,
                    last_name: lastName,
                    avatar_url: user.user_metadata?.avatar_url,
                    provider: detectedProvider,
                    role: 'free',
                    // Don't auto-generate username for Google users
                    username: detectedProvider === 'google' ? null : (user.email?.split('@')[0] || 'user'),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  }
                      
                  // Update user object with extracted data
                  userObj.first_name = firstName
                  userObj.last_name = lastName
                  userObj.full_name = fullName
                } else {
                  const createdProfileData = createResult.data
                  
                  if (createdProfileData) {
                    userObj.first_name = createdProfileData.first_name
                    userObj.last_name = createdProfileData.last_name
                    userObj.full_name = createdProfileData.full_name || userObj.name
                    profile = createdProfileData
                  } else {
                    throw new Error('No profile data returned from creation')
                  }
                }
              } else {
                const fetchedProfileData = fetchResult.data
                
                if (fetchedProfileData) {
                  userObj.first_name = fetchedProfileData.first_name
                  userObj.last_name = fetchedProfileData.last_name
                  userObj.full_name = fetchedProfileData.full_name || userObj.name
                  profile = fetchedProfileData
                } else {
                  throw new Error('No profile data found')
                }
              }

              // Ensure profile is set before continuing
              if (!profile) {
                throw new Error('Profile was not properly initialized')
              }

              set({ user: userObj, profile, loading: false, initialized: true })

              // Check for missing username and redirect if needed
              setTimeout(() => {
                get().checkUsernameAndRedirect()
              }, 100)

              // Set current user ID in integration store (reduced delay)
              setTimeout(async () => {
                try {
                  const { useIntegrationStore } = await import("./integrationStore")
                  useIntegrationStore.getState().setCurrentUserId(user.id)
                } catch (error) {
                  console.error("Error updating integration store user ID on init:", error)
                }
              }, 50) // Reduced from 100ms to 50ms

              // Start lightweight background data preloading (only essential data)
              setTimeout(async () => {
                try {
                  const { useIntegrationStore } = await import("./integrationStore")
                  const integrationStore = useIntegrationStore.getState()

                  // Only start if not already started and only fetch basic integration list
                  if (!integrationStore.preloadStarted && !integrationStore.globalPreloadingData) {
                    // Don't force refresh on initial load to avoid conflicts
                    await integrationStore.fetchIntegrations(false)
                  }
                } catch (error) {
                  console.log("Background integration preload skipped:", error.message)
                  // Don't fail auth initialization for background preload errors
                }
              }, 3000) // Increased delay to prioritize UI responsiveness and avoid conflicts
            } catch (profileError) {
              set({ user: userObj, profile: null, loading: false, initialized: true })
            }
          } else {
            set({ user: null, loading: false, initialized: true })
            
            // Clear integration store when no user is found
            setTimeout(async () => {
              try {
                const { useIntegrationStore } = await import("./integrationStore")
                const integrationStore = useIntegrationStore.getState()
                integrationStore.setCurrentUserId(null)
                integrationStore.clearAllData()
              } catch (error) {
                console.error("Error clearing integration store on init:", error)
              }
            }, 50) // Reduced from 100ms to 50ms
          }

          // Set up auth state listener (only once)
          if (!state.initialized) {
            supabase.auth.onAuthStateChange(async (event, session) => {
              if (event === "SIGNED_IN" && session?.user) {
                const user: User = {
                  id: session.user.id,
                  email: session.user.email || "",
                  name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
                  avatar: session.user.user_metadata?.avatar_url,
                }

                // Fetch additional profile data from user_profiles table
                const { data: profileData, error: profileError } = await supabase
                  .from('user_profiles')
                  .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, role, created_at, updated_at')
                  .eq('id', session.user.id)
                  .single()

                let profile: Profile
                
                if (profileError) {
                  // Try fetching without the role column in case it doesn't exist yet
                  const fallbackResult = await supabase
                    .from('user_profiles')
                    .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, created_at, updated_at')
                    .eq('id', session.user.id)
                    .single()
                  
                  if (fallbackResult.error) {
                    // Create a new profile if none exists
                    const detectedProvider = session.user.app_metadata?.provider || 
                                           session.user.app_metadata?.providers?.[0] || 
                                           (session.user.identities?.some(id => id.provider === 'google') ? 'google' : 'email')
                    
                    profile = {
                      id: session.user.id,
                      full_name: user.name,
                      avatar_url: user.avatar,
                      provider: detectedProvider,
                      role: 'free'
                    }
                  } else {
                    const fallbackProfileData = fallbackResult.data
                    if (fallbackProfileData) {
                      user.first_name = fallbackProfileData.first_name
                      user.last_name = fallbackProfileData.last_name
                      user.full_name = fallbackProfileData.full_name || user.name
                      profile = { ...fallbackProfileData, role: 'free' }
                    } else {
                      // Create a new profile if none exists
                      const detectedProvider = session.user.app_metadata?.provider || 
                                             session.user.app_metadata?.providers?.[0] || 
                                             (session.user.identities?.some(id => id.provider === 'google') ? 'google' : 'email')
                      
                      profile = {
                        id: session.user.id,
                        full_name: user.name,
                        avatar_url: user.avatar,
                        provider: detectedProvider,
                        role: 'free'
                      }
                    }
                  }
                } else if (profileData) {
                  user.first_name = profileData.first_name
                  user.last_name = profileData.last_name
                  user.full_name = profileData.full_name || user.name
                  profile = profileData
                } else {
                  // Create a new profile if none exists
                  const detectedProvider = session.user.app_metadata?.provider || 
                                         session.user.app_metadata?.providers?.[0] || 
                                         (session.user.identities?.some(id => id.provider === 'google') ? 'google' : 'email')
                  
                  profile = {
                    id: session.user.id,
                    full_name: user.name,
                    avatar_url: user.avatar,
                    provider: detectedProvider,
                    role: 'free'
                  }
                }

                set({ user, profile, error: null })
                
                // Check for missing username and redirect if needed
                setTimeout(() => {
                  get().checkUsernameAndRedirect()
                }, 100)
                
                // Update integration store with new user ID
                setTimeout(async () => {
                  try {
                    const { useIntegrationStore } = await import("./integrationStore")
                    useIntegrationStore.getState().setCurrentUserId(session.user.id)
                  } catch (error) {
                    console.error("Error updating integration store user ID:", error)
                  }
                }, 100)
              } else if (event === "SIGNED_OUT") {
                set({ user: null, profile: null, loading: false, error: null })
                
                // Clear integration store when user signs out
                setTimeout(async () => {
                  try {
                    const { useIntegrationStore } = await import("./integrationStore")
                    const integrationStore = useIntegrationStore.getState()
                    integrationStore.setCurrentUserId(null)
                    integrationStore.clearAllData()
                  } catch (error) {
                    console.error("Error clearing integration store on sign out:", error)
                  }
                }, 100)
              }
            })

            // Add visibility change listener to handle tab switching
            if (typeof window !== 'undefined') {
              const handleVisibilityChange = () => {
                if (document.visibilityState === 'visible') {
                  setTimeout(async () => {
                    const { data: { user } } = await supabase.auth.getUser()
                    const currentState = get()
                    
                    if (user && !currentState.user) {
                      setTimeout(() => {
                        get().initialize()
                      }, 100)
                    }
                  }, 500)
                }
              }

              document.addEventListener('visibilitychange', handleVisibilityChange)
            }
          }
        } catch (error: any) {
          set({ user: null, error: error.message, loading: false, initialized: true })
        } finally {
          clearTimeout(initTimeout)
        }
      },

      signOut: async () => {
        try {
          console.log("🔐 Starting sign out process...")
          
          // Clear local state immediately and mark as signed out
          set({ 
            user: null, 
            profile: null, 
            loading: false, 
            error: null, 
            initialized: true, // Keep initialized as true to prevent re-initialization
            hydrated: true 
          })
          
          console.log("✅ Local state cleared")

          // Clear localStorage immediately to prevent rehydration
          if (typeof window !== 'undefined') {
            localStorage.removeItem('chainreact-auth')
            localStorage.removeItem('pendingSignup')
            
            // Clear any Supabase session data that might be cached
            const keys = Object.keys(localStorage)
            keys.forEach(key => {
              if (key.startsWith('sb-') || key.includes('supabase')) {
                localStorage.removeItem(key)
              }
            })
          }

          // Clear all stores immediately
          try {
            // Clear integration store
            const { useIntegrationStore } = await import("./integrationStore")
            const integrationStore = useIntegrationStore.getState()
            integrationStore.setCurrentUserId(null)
            integrationStore.clearAllData()
            
            // Clear other stores if they exist
            try {
              const { useWorkflowStore } = await import("./workflowStore")
              const workflowStore = useWorkflowStore.getState()
              if (workflowStore.clearAllData) {
                workflowStore.clearAllData()
              }
            } catch (e) {
              // Workflow store might not exist, ignore
            }
            
            try {
              const { useAnalyticsStore } = await import("./analyticsStore")
              const analyticsStore = useAnalyticsStore.getState()
              if (analyticsStore.clearAllData) {
                analyticsStore.clearAllData()
              }
            } catch (e) {
              // Analytics store might not exist, ignore
            }
            
            try {
              const { useAdminStore } = await import("./adminStore")
              const adminStore = useAdminStore.getState()
              if (adminStore.clearAllData) {
                adminStore.clearAllData()
              }
            } catch (e) {
              // Admin store might not exist, ignore
            }
          } catch (error) {
            console.error("Error clearing stores:", error)
          }
          
          // Stop any ongoing activities by dispatching a custom event
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('user-signout'))
          }

          // Note: Navigation is handled by the component calling signOut
          // This ensures proper Next.js router usage
          console.log("🚀 Sign out complete, navigation handled by caller")

          // Sign out from Supabase in the background (don't wait)
          console.log("🔄 Signing out from Supabase...")
          supabase.auth.signOut().then(() => {
            console.log("✅ Supabase sign out successful")
          }).catch((error) => {
            console.error("❌ Supabase sign out error:", error)
          })
          
        } catch (error: any) {
          console.error("Sign out error:", error)
          
          // Clear everything even if sign out failed
          set({ 
            user: null, 
            profile: null, 
            loading: false, 
            error: null, 
            initialized: true, // Keep initialized to show signed out state
            hydrated: true 
          })
          
          // Clear localStorage even if sign out failed
          if (typeof window !== 'undefined') {
            localStorage.removeItem('chainreact-auth')
            localStorage.removeItem('pendingSignup')
            
            // Clear any Supabase session data
            const keys = Object.keys(localStorage)
            keys.forEach(key => {
              if (key.startsWith('sb-') || key.includes('supabase')) {
                localStorage.removeItem(key)
              }
            })
            
            // Note: Navigation is handled by the component calling signOut
          }
        }
      },

      updateProfile: async (updates: Partial<Profile>) => {
        try {
          const { user } = get()
          if (!user) throw new Error("No user logged in")

          // First, update the user metadata in Supabase Auth
          const { error: authError } = await supabase.auth.updateUser({
            data: {
              full_name: updates.full_name,
              avatar_url: updates.avatar_url,
            },
          })

          if (authError) throw authError

          // Then, update the user_profiles table with all profile fields
          const { error: profileError } = await supabase
            .from('user_profiles')
            .upsert({
              id: user.id,
              full_name: updates.full_name,
              first_name: updates.first_name,
              last_name: updates.last_name,
              username: updates.username,
              email: updates.email || user.email,  // Include email, fallback to user's email
              company: updates.company,
              job_title: updates.job_title,
              secondary_email: updates.secondary_email,
              phone_number: updates.phone_number,
              provider: updates.provider,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'id'
            })

          if (profileError) throw profileError

          // Update the local state
          const { profile } = get()
          set({
            user: {
              ...user,
              name: updates.full_name,
              first_name: updates.first_name,
              last_name: updates.last_name,
              full_name: updates.full_name,
            },
            profile: {
              ...profile,
              ...updates,
              id: user.id,
            }
          })
        } catch (error: any) {
          console.error("Profile update error:", error)
          set({ error: error.message })
          throw error
        }
      },

      signIn: async (email: string, password: string) => {
        // Add timeout protection for the entire sign-in process
        const signInTimeout = setTimeout(() => {
          console.error('Sign-in timed out after 10 seconds')
          set({ error: 'Sign-in timed out. Please try again.', loading: false })
        }, 10000) // 10 second timeout

        try {
          set({ loading: true, error: null })

          // Sign in with timeout protection
          const signInPromise = supabase.auth.signInWithPassword({
            email,
            password,
          })

          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Sign-in timeout')), 8000) // 8 second timeout
          )

          let result
          try {
            result = await Promise.race([signInPromise, timeoutPromise])
          } catch (timeoutError) {
            clearTimeout(signInTimeout)
            console.error('Sign-in request timed out:', timeoutError)
            set({ error: 'Sign-in timed out. Please try again.', loading: false })
            throw new Error('Sign-in timed out. Please try again.')
          }

          const { data, error } = result

          if (error) {
            clearTimeout(signInTimeout)
            // Make sure to reset loading state before throwing
            set({ error: error.message, loading: false })
            throw error
          }

          if (data.user) {
            const user: User = {
              id: data.user.id,
              email: data.user.email || "",
              name: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
              avatar: data.user.user_metadata?.avatar_url,
            }

            // Fetch profile data after successful login with timeout
            try {
              const profilePromise = supabase
                .from('user_profiles')
                .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, role, created_at, updated_at')
                .eq('id', data.user.id)
                .single()

              const profileTimeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Profile fetch timeout')), 2000) // 2 second timeout
              )

              const profileResult = await Promise.race([profilePromise, profileTimeoutPromise])
              const { data: profileData } = profileResult

              let profile: Profile | null = null
              if (profileData) {
                profile = profileData
                user.first_name = profileData.first_name
                user.last_name = profileData.last_name
                user.full_name = profileData.full_name || user.name
              }

              clearTimeout(signInTimeout)
              set({ user, profile, loading: false, initialized: true })
            } catch (profileError) {
              console.warn('Profile fetch error or timeout:', profileError)
              // Still set user even if profile fetch fails
              clearTimeout(signInTimeout)
              set({ user, profile: null, loading: false, initialized: true })
            }

            // Update integration store with new user ID after successful login
            setTimeout(async () => {
              try {
                const { useIntegrationStore } = await import("./integrationStore")
                useIntegrationStore.getState().setCurrentUserId(data.user.id)
              } catch (error) {
                console.error("Error updating integration store user ID after login:", error)
              }
            }, 100)

            return { user, profile: null }
          }
          
          // If no user returned but also no error, still reset loading
          set({ loading: false })
          throw new Error("Login failed - no user data returned")
        } catch (error: any) {
          clearTimeout(signInTimeout) // Clear timeout on any error
          console.error("Sign in error:", error)
          // Ensure loading is always reset on any error
          set({ error: error.message, loading: false })
          throw error
        } finally {
          clearTimeout(signInTimeout) // Ensure timeout is always cleared
        }
      },

      signUp: async (email: string, password: string, metadata?: Record<string, any>) => {
        try {
          set({ loading: true, error: null })

          // Set up email confirmation URL with explicit type parameter
          // In development, use localhost; in production, use the actual domain
          let baseUrl: string
          if (typeof window !== 'undefined') {
            baseUrl = window.location.origin
          } else if (process.env.NODE_ENV === 'development') {
            baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
          } else {
            baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://chainreact.app'
          }
          
          console.log('Signing up with email redirect to:', `${baseUrl}/api/auth/callback?type=email-confirmation`)
          
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: metadata || {},
              emailRedirectTo: `${baseUrl}/api/auth/callback?type=email-confirmation`
            },
          })

          if (error) throw error

          // Store signup data temporarily for the waiting page
          if (data.user) {
            // Create the user profile immediately with username and email
            const profileData = {
              id: data.user.id,
              username: metadata?.username,
              first_name: metadata?.first_name,
              last_name: metadata?.last_name,
              full_name: metadata?.full_name,
              email: email,  // Store the primary email
              provider: 'email',
              role: 'free',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }

            // Try to create the profile
            const { error: profileError } = await supabase
              .from('user_profiles')
              .insert(profileData)

            if (profileError) {
              console.error('Error creating profile during signup:', profileError)
              // Don't throw - profile can be created later if needed
            }

            localStorage.setItem('pendingSignup', JSON.stringify({
              userId: data.user.id,
              email: data.user.email,
              metadata: metadata,
              timestamp: Date.now()
            }))
          }

          set({ loading: false })
        } catch (error: any) {
          console.error("Sign up error:", error)
          set({ error: error.message, loading: false })
          throw error
        }
      },

      signInWithGoogle: async () => {
        try {
          set({ loading: true, error: null })

          // Use Supabase's built-in Google OAuth
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${window.location.origin}/api/auth/callback`,
            },
          })

          if (error) {
            throw error
          }

          // Supabase handles the redirect automatically
          // No need for manual redirect
        } catch (error: any) {
          console.error("Google sign in error:", error)
          set({ error: error.message, loading: false })
          throw error
        }
      },

      getCurrentUserId: () => {
        return get().user?.id ?? null
      },

      checkUsernameAndRedirect: () => {
        const state = get()
        // Check if Google user needs username setup
        if (state.profile && 
            state.profile.provider === 'google' && 
            (!state.profile.username || state.profile.username.trim() === '')) {
          // Redirect to username setup page for Google users
          if (typeof window !== 'undefined' && !window.location.pathname.includes('/auth/setup-username')) {
            window.location.href = '/auth/setup-username'
          }
        }
      },

      refreshSession: async () => {
        try {
          const { data: { session }, error } = await supabase.auth.refreshSession()
          if (error) {
            console.error("Session refresh error:", error)
            return false
          }
          
          if (session) {
            // Update the user state with the refreshed session
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              set({ user: {
                id: user.id,
                email: user.email || '',
                name: user.user_metadata?.name,
                first_name: user.user_metadata?.first_name,
                last_name: user.user_metadata?.last_name,
                full_name: user.user_metadata?.full_name,
                avatar: user.user_metadata?.avatar_url,
              }})
              return true
            }
          }
          return false
        } catch (error) {
          console.error("Session refresh failed:", error)
          return false
        }
      },

      isAuthenticated: () => {
        const state = get()
        return !!(state.user && state.user.id)
      },
    }),
    {
      name: "chainreact-auth",
      storage: {
        getItem: (name) => {
          try {
            // Check if we're on the client side
            if (typeof window === 'undefined') {
              return null
            }
            
            const str = localStorage.getItem(name)
            if (!str) return null
            
            // Validate the stored data before parsing
            if (str.startsWith('base64-') || str.includes('eyJ')) {
              console.warn('Detected corrupted auth data, clearing...')
              localStorage.removeItem(name)
              return null
            }
            
            // Try to parse the JSON
            const data = JSON.parse(str)
            
            // Validate the structure
            if (data && typeof data === 'object' && data.state) {
              return str
            }
            
            // If invalid structure, clear it
            console.warn('Invalid auth data structure, clearing...')
            localStorage.removeItem(name)
            return null
          } catch (error) {
            console.error('Error reading auth storage:', error)
            // Clear corrupted data only if we're on the client
            if (typeof window !== 'undefined') {
              localStorage.removeItem(name)
            }
            return null
          }
        },
        setItem: (name, value) => {
          try {
            // Check if we're on the client side
            if (typeof window === 'undefined') {
              return
            }
            
            // Ensure value is a string
            let stringValue = value
            if (typeof value !== 'string') {
              stringValue = JSON.stringify(value)
            }
            
            // Validate it's valid JSON
            JSON.parse(stringValue)
            localStorage.setItem(name, stringValue)
          } catch (error) {
            console.error('Error setting auth storage:', error)
          }
        },
        removeItem: (name) => {
          // Check if we're on the client side
          if (typeof window === 'undefined') {
            return
          }
          localStorage.removeItem(name)
        },
      },
      partialize: (state) => ({
        user: state.user,
        profile: state.profile,
        initialized: state.initialized,
      }),
      onRehydrateStorage: () => (state) => {
        try {
          // Mark as hydrated immediately
          state?.setHydrated()

          // Only initialize if not already initialized and we're on the client
          if (state && !state.initialized && typeof window !== 'undefined') {
            // Use requestIdleCallback if available, otherwise setTimeout
            const scheduleInit = () => {
              if ('requestIdleCallback' in window) {
                (window as any).requestIdleCallback(() => state.initialize(), { timeout: 100 })
              } else {
                setTimeout(() => state.initialize(), 50)
              }
            }
            scheduleInit()
          }
        } catch (error) {
          console.error('Error during rehydration:', error)
          // Clear any corrupted state only if we're on the client
          if (typeof window !== 'undefined') {
            try {
              localStorage.removeItem('chainreact-auth')
            } catch (e) {
              console.error('Failed to clear localStorage:', e)
            }
          }
          // Still mark as hydrated to prevent blocking
          state?.setHydrated()
        }
      },
    },
  ),
)
