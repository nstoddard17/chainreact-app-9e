import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { BatchTestRunner } from '@/components/testing/BatchTestRunner'

export const metadata = {
  title: 'Batch Action Tester - ChainReact',
  description: 'Test multiple actions at once with real API calls'
}

export default async function BatchTestPage() {
  const supabase = await createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  return <BatchTestRunner />
}
