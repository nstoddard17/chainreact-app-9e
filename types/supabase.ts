export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          full_name: string | null
          first_name: string | null
          last_name: string | null
          username: string | null
          company: string | null
          job_title: string | null
          secondary_email: string | null
          phone_number: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          first_name?: string | null
          last_name?: string | null
          username?: string | null
          company?: string | null
          job_title?: string | null
          secondary_email?: string | null
          phone_number?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          first_name?: string | null
          last_name?: string | null
          username?: string | null
          company?: string | null
          job_title?: string | null
          secondary_email?: string | null
          phone_number?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      workflows: {
        Row: {
          id: string
          name: string
          description: string | null
          user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          user_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          user_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      integrations: {
        Row: {
          id: string
          name: string
          type: string
          user_id: string
          config: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          type: string
          user_id: string
          config?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: string
          user_id?: string
          config?: Json
          created_at?: string
          updated_at?: string
        }
      }
      usage_logs: {
        Row: {
          id: string
          user_id: string
          resource_type: string
          action: string
          quantity: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          resource_type: string
          action: string
          quantity?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          resource_type?: string
          action?: string
          quantity?: number
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_monthly_usage: {
        Args: {
          p_user_id: string
          p_year: number
          p_month: number
          p_field: string
          p_increment: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
