import dotenv from 'dotenv'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

// Load environment variables
dotenv.config({ path: '.env.local' })

console.log('🔧 Webhook Testing Setup')
console.log('=' * 50)
console.log('')

// Check current environment
const currentEnv = process.env.NODE_ENV || 'development'
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const webhookBaseUrl = process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL

console.log(`📋 Current Environment: ${currentEnv}`)
console.log(`🌐 App URL: ${appUrl}`)
console.log(`🔗 Webhook Base URL: ${webhookBaseUrl || 'not set'}`)
console.log('')

// Check if ngrok is installed
function checkNgrok() {
  try {
    execSync('ngrok version', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

// Check if .env.local exists
function checkEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local')
  return fs.existsSync(envPath)
}

// Generate ngrok URL
function getNgrokUrl() {
  try {
    const output = execSync('ngrok http 3000 --log=stdout', { 
      stdio: 'pipe',
      timeout: 5000 
    })
    const lines = output.toString().split('\n')
    const urlLine = lines.find(line => line.includes('https://') && line.includes('ngrok'))
    if (urlLine) {
      const match = urlLine.match(/https:\/\/[a-zA-Z0-9-]+\.ngrok\.(io|free\.app)/)
      return match ? match[0] : null
    }
  } catch (error) {
    // ngrok might not be running or might be starting up
  }
  return null
}

console.log('🔍 Environment Check:')
console.log('')

const ngrokInstalled = checkNgrok()
const envFileExists = checkEnvFile()

console.log(`✅ ngrok installed: ${ngrokInstalled ? 'Yes' : 'No'}`)
console.log(`✅ .env.local exists: ${envFileExists ? 'Yes' : 'No'}`)
console.log('')

if (!ngrokInstalled) {
  console.log('📦 Installing ngrok...')
  console.log('Run: npm install -g ngrok')
  console.log('Or visit: https://ngrok.com/download')
  console.log('')
}

if (!envFileExists) {
  console.log('📝 Creating .env.local file...')
  const envContent = `# Environment Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Webhook Testing (uncomment and set when using ngrok)
# NEXT_PUBLIC_WEBHOOK_BASE_URL=https://your-ngrok-url.ngrok.io

# Other environment variables...
`
  fs.writeFileSync('.env.local', envContent)
  console.log('✅ Created .env.local file')
  console.log('')
}

console.log('🚀 Setup Instructions:')
console.log('')

console.log('1. For Local Development:')
console.log('   • Start your development server: npm run dev')
console.log('   • Use localhost URLs for testing')
console.log('')

console.log('2. For ngrok Testing:')
console.log('   • Install ngrok: npm install -g ngrok')
console.log('   • Start ngrok: ngrok http 3000')
console.log('   • Copy the ngrok URL (e.g., https://abc123.ngrok.io)')
console.log('   • Add to .env.local: NEXT_PUBLIC_WEBHOOK_BASE_URL=https://abc123.ngrok.io')
console.log('   • Restart your development server')
console.log('')

console.log('3. For Production:')
console.log('   • Set NEXT_PUBLIC_APP_URL=https://chainreact.app in Vercel')
console.log('   • Webhook URLs will automatically use production domain')
console.log('')

console.log('4. Environment Variable Priority:')
console.log('   1. NEXT_PUBLIC_WEBHOOK_BASE_URL (highest)')
console.log('   2. NEXT_PUBLIC_BASE_URL')
console.log('   3. NEXT_PUBLIC_APP_URL')
console.log('   4. Environment detection (localhost/ngrok)')
console.log('   5. Production fallback (https://chainreact.app)')
console.log('')

// Show current webhook URLs
console.log('🔗 Current Webhook URLs:')
console.log('')

const integrations = [
  'gmail', 'slack', 'discord', 'github', 'notion', 'hubspot'
]

integrations.forEach(integration => {
  const baseUrl = webhookBaseUrl || appUrl
  const webhookUrl = `${baseUrl}/api/workflow/${integration}`
  console.log(`  • ${integration}: ${webhookUrl}`)
})

console.log('')
console.log('💡 Tips:')
console.log('• Use the WebhookConfigurationPanel component in your app for easy URL copying')
console.log('• Test webhooks with Postman or webhook.site')
console.log('• Monitor webhook logs in your application console')
console.log('• Use environment variables to switch between local and production URLs')
console.log('')

if (currentEnv === 'development' && !webhookBaseUrl) {
  console.log('🎯 Quick Start for ngrok:')
  console.log('1. ngrok http 3000')
  console.log('2. Copy the https URL')
  console.log('3. Add to .env.local: NEXT_PUBLIC_WEBHOOK_BASE_URL=<ngrok-url>')
  console.log('4. Restart dev server')
  console.log('')
}
