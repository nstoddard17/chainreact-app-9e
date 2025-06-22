declare module '@supabase/supabase-js' {
  export interface SupabaseClient {
    auth: {
      getUser: (token: string) => Promise<{ data: { user: { id: string } | null } }>
    }
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: any) => {
          maybeSingle: () => Promise<{ data: { id: string } | null }>
        }
      }
      update: (data: any) => {
        eq: (column: string, value: any) => Promise<{ error: any }>
      }
      insert: (data: any) => Promise<{ error: any }>
    }
  }

  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: {
      auth?: {
        persistSession?: boolean
        autoRefreshToken?: boolean
      }
    }
  ): SupabaseClient
}
