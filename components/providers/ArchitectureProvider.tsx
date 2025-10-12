import { logger } from '@/lib/utils/logger'

/**
 * Architecture initialization provider
 * Server-side initialization to avoid client-side issues with server-only modules
 */
export default function ArchitectureProvider({ children }: { children: React.ReactNode }) {
  // Server-side initialization
  if (typeof window === 'undefined') {
    try {
      // Only initialize on server-side to avoid client-side issues
      // The actual initialization will happen via the API route
      logger.debug("🏗️ Architecture provider loaded (server-side)")
    } catch (error) {
      logger.error("❌ Server-side architecture setup failed:", error)
    }
  }

  // Always render children immediately
  return <>{children}</>
}

/**
 * Hook to check if architecture is initialized
 */
export function useArchitecture() {
  const [status, setStatus] = useState<{
    initialized: boolean
    providers: number
    actions: number
  }>({
    initialized: false,
    providers: 0,
    actions: 0
  })

  useEffect(() => {
    async function checkStatus() {
      try {
        const { getInitializationStatus } = await import("@/src/bootstrap")
        const { providerRegistry } = await import("@/src/domains/integrations/use-cases/provider-registry")
        const { actionRegistry } = await import("@/src/domains/workflows/use-cases/action-registry")
        
        setStatus({
          initialized: getInitializationStatus(),
          providers: providerRegistry.listProviders().length,
          actions: actionRegistry.listActions().length
        })
      } catch (error) {
        logger.error("Failed to check architecture status:", error)
      }
    }

    checkStatus()
  }, [])

  return status
}