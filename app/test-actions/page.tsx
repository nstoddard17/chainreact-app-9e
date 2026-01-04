import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { ActionTester } from '@/components/testing/ActionTester'
import { TriggerTester } from '@/components/testing/TriggerTester'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const metadata = {
  title: 'Testing Tool - ChainReact',
  description: 'Test workflow actions and triggers'
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
        <div className="p-6 pb-0">
          <h1 className="text-3xl font-bold mb-2">Testing Tool</h1>
          <p className="text-muted-foreground mb-4">
            Test workflow actions and triggers. Select a provider to get started.
          </p>

          {/* Tabs Navigation */}
          <Tabs defaultValue="actions" className="w-full">
            <TabsList>
              <TabsTrigger value="actions">Actions</TabsTrigger>
              <TabsTrigger value="triggers">Triggers</TabsTrigger>
            </TabsList>

            {/* Main Content */}
            <div className="border-t -mx-6 mt-4">
              <TabsContent value="actions" className="mt-0 h-[calc(100vh-180px)]">
                <ActionTester userId={user.id} />
              </TabsContent>
              <TabsContent value="triggers" className="mt-0 h-[calc(100vh-180px)]">
                <TriggerTester userId={user.id} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
