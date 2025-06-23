import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { createClient } from "@/utils/supabase/client"
import { EmailFrequencyCache } from "@/db/schema"
import { cookies } from "next/headers"

export interface EmailCacheEntry {
  email: string
  name?: string
  frequency: number
  lastUsed: string
  source: string
  metadata?: Record<string, any>
}

export interface EmailSuggestion {
  value: string
  label: string
  email: string
  name?: string
  type?: string
  frequency: number
  source: string
  photo?: string
  aliases?: string[]
}

export class EmailCacheService {
  private supabase: any

  constructor(isServerSide = false) {
    if (isServerSide) {
      cookies() // Ensure cookies are available
      this.supabase = createSupabaseRouteHandlerClient()
    } else {
      this.supabase = createClient()
    }
  }

  /**
   * Track email usage - increment frequency and update last used time
   */
  async trackEmailUsage(
    email: string, 
    source: string, 
    options: {
      name?: string
      integrationId?: string
      metadata?: Record<string, any>
    } = {}
  ): Promise<void> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession()
      if (!session?.user?.id) return

      const { name, integrationId, metadata } = options
      const userId = session.user.id

      // Check if email already exists in cache
      const { data: existing } = await this.supabase
        .from("email_frequency_cache")
        .select("*")
        .eq("user_id", userId)
        .eq("email", email.toLowerCase())
        .eq("source", source)
        .single()

      if (existing) {
        // Update existing entry
        const { error } = await this.supabase
          .from("email_frequency_cache")
          .update({
            frequency: existing.frequency + 1,
            last_used: new Date().toISOString(),
            name: name || existing.name, // Keep existing name if no new name provided
            metadata: metadata ? { ...existing.metadata, ...metadata } : existing.metadata,
            updated_at: new Date().toISOString()
          })
          .eq("id", existing.id)

        if (error) {
          console.error("Failed to update email frequency:", error)
        }
      } else {
        // Create new entry
        const { error } = await this.supabase
          .from("email_frequency_cache")
          .insert({
            user_id: userId,
            email: email.toLowerCase(),
            name: name,
            frequency: 1,
            last_used: new Date().toISOString(),
            source: source,
            integration_id: integrationId,
            metadata: metadata,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        if (error) {
          console.error("Failed to create email frequency entry:", error)
        }
      }
    } catch (error) {
      console.error("Failed to track email usage:", error)
    }
  }

  /**
   * Track multiple emails at once (for bulk operations)
   */
  async trackMultipleEmails(
    emails: Array<{
      email: string
      name?: string
      source: string
      integrationId?: string
      metadata?: Record<string, any>
    }>
  ): Promise<void> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession()
      if (!session?.user?.id) return

      // Process in batches to avoid overwhelming the database
      const batchSize = 10
      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize)
        await Promise.all(
          batch.map(emailData => 
            this.trackEmailUsage(emailData.email, emailData.source, {
              name: emailData.name,
              integrationId: emailData.integrationId,
              metadata: emailData.metadata
            })
          )
        )
      }
    } catch (error) {
      console.error("Failed to track multiple emails:", error)
    }
  }

  /**
   * Get frequently used emails for autocomplete
   */
  async getFrequentEmails(
    source?: string,
    limit: number = 50
  ): Promise<EmailSuggestion[]> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession()
      if (!session?.user?.id) return []

      let query = this.supabase
        .from("email_frequency_cache")
        .select("*")
        .eq("user_id", session.user.id)
        .order("frequency", { ascending: false })
        .order("last_used", { ascending: false })
        .limit(limit)

      if (source) {
        query = query.eq("source", source)
      }

      const { data, error } = await query

      if (error) {
        console.error("Failed to get frequent emails:", error)
        return []
      }

      return (data || []).map((entry: EmailFrequencyCache) => ({
        value: entry.email,
        label: entry.name ? `${entry.name} <${entry.email}>` : entry.email,
        email: entry.email,
        name: entry.name,
        type: 'cached_email',
        frequency: entry.frequency,
        source: entry.source,
        photo: entry.metadata?.photo,
        aliases: entry.metadata?.aliases || []
      }))
    } catch (error) {
      console.error("Failed to get frequent emails:", error)
      return []
    }
  }

  /**
   * Merge cached emails with fresh API data
   */
  async getMergedEmailSuggestions(
    freshEmails: EmailSuggestion[],
    source: string,
    limit: number = 50
  ): Promise<EmailSuggestion[]> {
    try {
      const cachedEmails = await this.getFrequentEmails(source, limit * 2)
      
      // Create a map for quick lookups
      const emailMap = new Map<string, EmailSuggestion>()
      
      // Add cached emails first (they have frequency data)
      cachedEmails.forEach(email => {
        emailMap.set(email.email.toLowerCase(), email)
      })
      
      // Merge with fresh emails, updating frequency data
      freshEmails.forEach(freshEmail => {
        const key = freshEmail.email.toLowerCase()
        const existing = emailMap.get(key)
        
        if (existing) {
          // Update existing with fresh data but keep frequency
          emailMap.set(key, {
            ...freshEmail,
            frequency: existing.frequency,
            type: 'merged_email'
          })
        } else {
          // Add new email with frequency 0
          emailMap.set(key, {
            ...freshEmail,
            frequency: 0,
            type: 'fresh_email'
          })
        }
      })
      
      // Convert back to array and sort by frequency, then by type preference
      const mergedEmails = Array.from(emailMap.values())
        .sort((a, b) => {
          // Sort by frequency first
          if (b.frequency !== a.frequency) {
            return b.frequency - a.frequency
          }
          
          // Then by type preference (cached > fresh)
          const typeOrder = { 'cached_email': 0, 'merged_email': 1, 'fresh_email': 2 }
          const aTypeOrder = typeOrder[a.type as keyof typeof typeOrder] ?? 3
          const bTypeOrder = typeOrder[b.type as keyof typeof typeOrder] ?? 3
          
          if (aTypeOrder !== bTypeOrder) {
            return aTypeOrder - bTypeOrder
          }
          
          // Finally by label alphabetically
          return a.label.localeCompare(b.label)
        })
        .slice(0, limit)
      
      return mergedEmails
    } catch (error) {
      console.error("Failed to merge email suggestions:", error)
      return freshEmails.slice(0, limit)
    }
  }

  /**
   * Clean up old entries (run periodically)
   */
  async cleanupOldEntries(daysOld: number = 90): Promise<void> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession()
      if (!session?.user?.id) return

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysOld)

      const { error } = await this.supabase
        .from("email_frequency_cache")
        .delete()
        .eq("user_id", session.user.id)
        .lt("last_used", cutoffDate.toISOString())
        .lt("frequency", 2) // Only delete infrequently used emails

      if (error) {
        console.error("Failed to cleanup old entries:", error)
      }
    } catch (error) {
      console.error("Failed to cleanup old entries:", error)
    }
  }

  /**
   * Get email statistics for a user
   */
  async getEmailStats(): Promise<{
    totalEmails: number
    totalUsage: number
    topEmails: EmailSuggestion[]
    sourceBreakdown: Record<string, number>
  }> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession()
      if (!session?.user?.id) {
        return { totalEmails: 0, totalUsage: 0, topEmails: [], sourceBreakdown: {} }
      }

      const { data, error } = await this.supabase
        .from("email_frequency_cache")
        .select("*")
        .eq("user_id", session.user.id)

      if (error) {
        console.error("Failed to get email stats:", error)
        return { totalEmails: 0, totalUsage: 0, topEmails: [], sourceBreakdown: {} }
      }

      const emails = data || []
      const totalEmails = emails.length
      const totalUsage = emails.reduce((sum: number, email: EmailFrequencyCache) => sum + email.frequency, 0)
      
      const topEmails = emails
        .sort((a: EmailFrequencyCache, b: EmailFrequencyCache) => b.frequency - a.frequency)
        .slice(0, 10)
        .map((entry: EmailFrequencyCache) => ({
          value: entry.email,
          label: entry.name ? `${entry.name} <${entry.email}>` : entry.email,
          email: entry.email,
          name: entry.name,
          type: 'cached_email',
          frequency: entry.frequency,
          source: entry.source,
          photo: entry.metadata?.photo,
          aliases: entry.metadata?.aliases || []
        }))

      const sourceBreakdown = emails.reduce((acc: Record<string, number>, email: EmailFrequencyCache) => {
        acc[email.source] = (acc[email.source] || 0) + email.frequency
        return acc
      }, {})

      return {
        totalEmails,
        totalUsage,
        topEmails,
        sourceBreakdown
      }
    } catch (error) {
      console.error("Failed to get email stats:", error)
      return { totalEmails: 0, totalUsage: 0, topEmails: [], sourceBreakdown: {} }
    }
  }
} 