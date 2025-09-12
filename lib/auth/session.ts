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

    // First try to get the session (this is faster and more reliable)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    // If we have a valid session with access token, get the user
    if (session?.access_token && session?.user) {
      return { 
        user: session.user, 
        session 
      }
    }
    
    // If no session or it's incomplete, try to refresh
    console.log("No valid session found, attempting refresh...")
    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession()
    
    if (refreshError || !refreshedSession?.access_token || !refreshedSession?.user) {
      // Only log, don't console.error to avoid scary messages
      console.log("Session refresh not possible, user needs to log in")
      throw new Error("No authenticated user found. Please log in.")
    }
    
    return { 
      user: refreshedSession.user, 
      session: refreshedSession 
    }
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