#!/usr/bin/env node

// Load environment variables from .env.local
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local file
config({ path: resolve(process.cwd(), '.env.local') })

// Test different environment scenarios
const scenarios = [
  { name: 'Local Development', env: { NEXT_PUBLIC_APP_URL: 'http://localhost:3000' } },
  { name: 'Production', env: { NEXT_PUBLIC_APP_URL: 'https://chainreact.app' } },
  { name: 'Vercel Preview', env: { NEXT_PUBLIC_APP_URL: 'https://chainreact-app-9e.vercel.app' } }
]

console.log('🔗 Webhook URL Test Scenarios')
console.log('=' * 50)
console.log('')

scenarios.forEach(scenario => {
  console.log(`📋 ${scenario.name}:`)
  console.log(`Base URL: ${scenario.env.NEXT_PUBLIC_APP_URL}`)
  console.log('')
  
  const integrations = [
    'gmail', 'slack', 'discord', 'github', 'notion', 'hubspot'
  ]
  
  integrations.forEach(integration => {
    const webhookUrl = `${scenario.env.NEXT_PUBLIC_APP_URL}/api/workflow/${integration}`
    console.log(`  • ${integration}: ${webhookUrl}`)
  })
  
  console.log('')
  console.log('─' * 30)
  console.log('')
})

console.log('✅ Current Environment:')
console.log(`NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL || 'Not set'}`)
console.log('')
console.log('📝 Note: In production, the script will automatically use the NEXT_PUBLIC_APP_URL environment variable set in Vercel.')
