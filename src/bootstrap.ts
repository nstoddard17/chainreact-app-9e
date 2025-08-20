/**
 * Application bootstrap - initializes the new architecture
 * Call this at application startup (e.g., in layout.tsx or middleware)
 */

import { bootstrapProviders } from './infrastructure/bootstrap/provider-bootstrap'

let isBootstrapped = false

export function initializeApplication(): void {
  if (isBootstrapped) {
    return // Already initialized
  }

  console.log('🚀 Initializing ChainReact application...')

  try {
    // Initialize providers and actions
    bootstrapProviders()

    // TODO: Add other initialization here:
    // - Event bus setup
    // - Database migrations
    // - Cache initialization
    // - Background job setup

    isBootstrapped = true
    console.log('✅ Application initialized successfully')
  } catch (error) {
    console.error('❌ Application initialization failed:', error)
    throw error
  }
}

export function getInitializationStatus(): boolean {
  return isBootstrapped
}

// Auto-initialize in development
if (process.env.NODE_ENV === 'development') {
  initializeApplication()
}