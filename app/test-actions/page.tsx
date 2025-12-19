import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { ActionTester } from '@/components/testing/ActionTester'

export const metadata = {
  title: 'Action Testing Tool - ChainReact',
  description: 'Test workflow actions and debug API calls'
}

export default async function TestActionsPage() {
  const supabase = await createSupabaseServerClient()

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-background">
        <div className="p-6">
          <h1 className="text-3xl font-bold mb-2">Action Testing Tool</h1>
          <p className="text-muted-foreground">
            Test workflow actions and debug API calls. Select a provider and action to get started.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ActionTester userId={user.id} />
      </div>
    </div>
  )
}
