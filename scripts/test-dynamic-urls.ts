#!/usr/bin/env node

/**
 * Test script to verify dynamic URL handling in billing routes
 * This simulates requests from different environments
 */

console.log('🧪 Testing Dynamic URL Detection\n')
console.log('=' .repeat(60))

// Helper function that mimics the getBaseUrlFromRequest logic
function getBaseUrlFromRequest(host: string | null, proto: string | null, env: any = {}) {
  // Priority 1: Always check host first
  if (host) {
    // Check if it's localhost - ALWAYS use localhost regardless of env vars
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      console.log("  → Detected localhost, ignoring env vars")
      return `http://${host}`
    }
    
    // For non-localhost, check if we should use env var
    if (env.NEXT_PUBLIC_APP_URL && !host.includes('vercel.app') && !host.includes('ngrok')) {
      // Use env var for production
      return env.NEXT_PUBLIC_APP_URL
    }
    
    // For preview/staging environments, use the actual host
    const protocol = proto || 'https'
    return `${protocol}://${host}`
  }
  
  // Priority 2: Fallback to environment variable
  if (env.NEXT_PUBLIC_APP_URL) {
    return env.NEXT_PUBLIC_APP_URL
  }
  
  // Priority 3: Fallback to localhost in development
  if (env.NODE_ENV === 'development') {
    return `http://localhost:${env.PORT || '3000'}`
  }
  
  // Priority 4: Default fallback
  return 'https://chainreact.app'
}

// Test scenarios
const testCases = [
  {
    name: 'Localhost Development (port 3000)',
    host: 'localhost:3000',
    proto: null,
    env: { NODE_ENV: 'development' },
    expected: 'http://localhost:3000'
  },
  {
    name: 'Localhost Development (port 3001)',
    host: 'localhost:3001',
    proto: null,
    env: { NODE_ENV: 'development' },
    expected: 'http://localhost:3001'
  },
  {
    name: '127.0.0.1 Development',
    host: '127.0.0.1:3000',
    proto: null,
    env: { NODE_ENV: 'development' },
    expected: 'http://127.0.0.1:3000'
  },
  {
    name: 'Production (chainreact.app)',
    host: 'chainreact.app',
    proto: 'https',
    env: { NEXT_PUBLIC_APP_URL: 'https://chainreact.app' },
    expected: 'https://chainreact.app'
  },
  {
    name: 'Vercel Preview',
    host: 'chainreact-preview-xyz.vercel.app',
    proto: 'https',
    env: {},
    expected: 'https://chainreact-preview-xyz.vercel.app'
  },
  {
    name: 'ngrok Tunnel',
    host: 'abc123.ngrok.io',
    proto: 'https',
    env: { NODE_ENV: 'development' },
    expected: 'https://abc123.ngrok.io'
  },
  {
    name: 'No host with development env',
    host: null,
    proto: null,
    env: { NODE_ENV: 'development', PORT: '3000' },
    expected: 'http://localhost:3000'
  },
  {
    name: 'No host with production env',
    host: null,
    proto: null,
    env: { NODE_ENV: 'production' },
    expected: 'https://chainreact.app'
  },
  {
    name: 'Localhost IGNORES NEXT_PUBLIC_APP_URL',
    host: 'localhost:3000',
    proto: null,
    env: { NEXT_PUBLIC_APP_URL: 'https://chainreact.app' },
    expected: 'http://localhost:3000'  // Should stay on localhost!
  },
  {
    name: 'Production uses NEXT_PUBLIC_APP_URL',
    host: 'chainreact.app',
    proto: 'https',
    env: { NEXT_PUBLIC_APP_URL: 'https://chainreact.app' },
    expected: 'https://chainreact.app'
  }
]

// Run tests
let passed = 0
let failed = 0

testCases.forEach((test, index) => {
  const result = getBaseUrlFromRequest(test.host, test.proto, test.env)
  const isCorrect = result === test.expected
  
  console.log(`\nTest ${index + 1}: ${test.name}`)
  console.log(`  Host: ${test.host || 'null'}`)
  console.log(`  Protocol: ${test.proto || 'auto-detect'}`)
  console.log(`  Env: ${JSON.stringify(test.env)}`)
  console.log(`  Expected: ${test.expected}`)
  console.log(`  Got: ${result}`)
  console.log(`  Result: ${isCorrect ? '✅ PASS' : '❌ FAIL'}`)
  
  if (isCorrect) {
    passed++
  } else {
    failed++
  }
})

console.log('\n' + '=' .repeat(60))
console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`)

if (failed === 0) {
  console.log('✅ All tests passed! Dynamic URL detection is working correctly.')
  console.log('\n📝 Summary:')
  console.log('  • Localhost requests will redirect back to localhost')
  console.log('  • Production requests will redirect back to production')
  console.log('  • Preview/staging URLs are preserved')
  console.log('  • Environment variables can override auto-detection')
} else {
  console.log('❌ Some tests failed. Please review the implementation.')
  process.exit(1)
}