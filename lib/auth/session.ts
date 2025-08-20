import { getSupabaseClient } from "@/lib/supabase"

export interface UserSession {
  user: {
    id: string
    email?: string
    [key: string]: any
  }
  session: {
    access_token: string
    refresh_token?: string
    [key: string]: any
  }
}

/**
 * SessionManager handles user authentication and session management
 * Extracted from integrationStore.ts for better separation of concerns
 */
export class SessionManager {
  /**
   * Securely get user and session data with automatic refresh
   * @returns Promise<UserSession> - User and session data
   * @throws Error if authentication fails
   */
  static async getSecureUserAndSession(): Promise<UserSession> {
    const supabase = getSupabaseClient()
    if (!supabase) {
      throw new Error("Supabase client not available")
    }

    // First, validate the user securely
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user?.id) {
      // Try to refresh the session
      const { data: { session }, error: refreshError } = await supabase.auth.refreshSession()
      
      if (refreshError || !session) {
        console.error("❌ Session refresh failed:", refreshError)
        throw new Error("No authenticated user found. Please log in again.")
      }
      
      // Try to get user again after refresh
      const { data: { user: refreshedUser }, error: refreshedUserError } = await supabase.auth.getUser()
      if (refreshedUserError || !refreshedUser?.id) {
        throw new Error("Session refresh failed. Please log in again.")
      }
      
      return { user: refreshedUser, session }
    }

    // Then get the session for the access token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      // Try to refresh the session if no access token
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession()
      
      if (refreshError || !refreshedSession?.access_token) {
        throw new Error("Session expired. Please log in again.")
      }
      
      return { user, session: refreshedSession }
    }

    return { user, session }
  }

  /**
   * Refresh the current session
   * @returns Promise<UserSession> - Refreshed user and session data
   * @throws Error if refresh fails
   */
  static async refreshSession(): Promise<UserSession> {
    const supabase = getSupabaseClient()
    if (!supabase) {
      throw new Error("Supabase client not available")
    }

    const { data: { session }, error: refreshError } = await supabase.auth.refreshSession()
    
    if (refreshError || !session) {
      console.error("❌ Session refresh failed:", refreshError)
      throw new Error("Session refresh failed. Please log in again.")
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user?.id) {
      throw new Error("User validation failed after session refresh.")
    }

    return { user, session }
  }

  /**
   * Validate user data
   * @param user - User object to validate
   * @returns boolean - Whether user is valid
   */
  static validateUser(user: any): boolean {
    return user && user.id && typeof user.id === 'string'
  }

  /**
   * Validate session data
   * @param session - Session object to validate
   * @returns boolean - Whether session is valid
   */
  static validateSession(session: any): boolean {
    return session && session.access_token && typeof session.access_token === 'string'
  }

  /**
   * Get current user without session refresh
   * @returns Promise<User | null> - Current user or null if not authenticated
   */
  static async getCurrentUser() {
    const supabase = getSupabaseClient()
    if (!supabase) {
      return null
    }

    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return null
    }

    return user
  }

  /**
   * Get current session without refresh
   * @returns Promise<Session | null> - Current session or null if not available
   */
  static async getCurrentSession() {
    const supabase = getSupabaseClient()
    if (!supabase) {
      return null
    }

    const { data: { session }, error } = await supabase.auth.getSession()
    if (error || !session) {
      return null
    }

    return session
  }
}