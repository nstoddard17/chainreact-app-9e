import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { SSRIntegrationsExample } from "./SSRIntegrationsExample"
import { redirect } from "next/navigation"

/**
 * Server component that demonstrates server-side rendering
 * with client-side cache hydration
 */
export default async function SSRIntegrationsPage() {
  // Create a Supabase server client
  const supabase = createServerComponentClient({ cookies })
  
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect("/auth/login")
  }
  
  // Initialize with empty array as default
  let serverIntegrations = []
  
  // If user is authenticated, fetch their integrations
  if (user?.id) {
    try {
      // Fetch integrations from Supabase
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
      
      if (!error && data) {
        serverIntegrations = data
      }
    } catch (error) {
      console.error("Error fetching integrations on server:", error)
    }
  }
  
  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-8">SSR Integration Cache Example</h1>
      <p className="text-gray-600 mb-8">
        This page demonstrates server-side rendering with hydration of the client-side cache.
        Integrations are fetched on the server and then used to hydrate the client-side store.
      </p>
      <div className="p-4 bg-green-50 text-green-800 rounded-md mb-8">
        <h3 className="font-bold mb-2">SSR + Client Cache Features</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Initial data is fetched on the server for faster page loads</li>
          <li>Data is hydrated into client-side cache on page load</li>
          <li>Subsequent navigations use the cache without additional API calls</li>
          <li>Still benefits from automatic cache clearing on logout</li>
        </ul>
      </div>
      
      {/* Pass the server-fetched integrations to the client component */}
      <SSRIntegrationsExample serverIntegrations={serverIntegrations} />
    </div>
  )
} 