import { IntegrationsWithCache } from "@/components/integrations/IntegrationsWithCache"
import { Suspense } from "react"

/**
 * Example page that demonstrates the integrations cache
 * Notice that we don't need to fetch any data on the server - the client component
 * takes care of loading data from cache or API as needed
 */
export default function IntegrationsCachePage() {
  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-8">Integration Cache Example</h1>
      <p className="text-gray-600 mb-8">
        This page demonstrates using the cached integrations store. If you navigate away and come back,
        your integrations data will be loaded from the cache rather than making a new request.
      </p>
      <div className="p-4 bg-blue-50 text-blue-800 rounded-md mb-8">
        <h3 className="font-bold mb-2">Cache Features</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Integrations load once, then are cached for future page visits</li>
          <li>Data is automatically cleared when the user logs out</li>
          <li>You can manually refresh data with the Refresh button</li>
          <li>Cache expiration is set to 5 minutes for staleness checks</li>
        </ul>
      </div>
      
      <Suspense fallback={<div className="text-center py-12">Loading integrations component...</div>}>
        <IntegrationsWithCache />
      </Suspense>
    </div>
  )
} 