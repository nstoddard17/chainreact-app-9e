import { createBrowserClient } from '@supabase/ssr'

import { type Database } from '@/types/supabase'

export const createClient = () =>
  createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieEncoding: 'raw' // Use raw encoding to avoid base64- prefix that causes JSON parsing errors
    }
  )
