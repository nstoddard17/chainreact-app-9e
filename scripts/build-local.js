#!/usr/bin/env node

/**
 * Local Production Build Script
 *
 * Builds and serves a production version locally for testing
 * Much faster than deploying to Vercel for each test!
 *
 * Features:
 * - Production build with optimizations
 * - Instant local serving
 * - Same behavior as Vercel deployment
 * - Hot reload on file changes (optional)
 */

import { spawn, execSync } from 'child_process'

const args = process.argv.slice(2)
const WATCH_MODE = args.includes('--watch')
const PORT = process.env.PORT || 3001

console.log('🏗️  Building ChainReact for LOCAL PRODUCTION...\n')
console.log('⚡ This is MUCH faster than deploying to Vercel!\n')

// Step 1: Build
console.log('📦 Step 1: Building production bundle...')
try {
  execSync('npm run build', {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
    }
  })
  console.log('\n✅ Build complete!\n')
} catch (error) {
  console.error('❌ Build failed:', error.message)
  process.exit(1)
}

// Step 2: Start production server
console.log(`🚀 Step 2: Starting production server on port ${PORT}...`)
console.log(`📡 Server will be available at: http://localhost:${PORT}\n`)

const serverProcess = spawn('npx', ['next', 'start', '-p', PORT], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: 'production',
  }
})

serverProcess.on('error', (error) => {
  console.error('❌ Failed to start server:', error)
  process.exit(1)
})

// Optional: Watch mode for rebuilding on changes
if (WATCH_MODE) {
  console.log('👀 Watch mode enabled - will rebuild on file changes...\n')

  // Dynamically import chokidar only when needed
  import('chokidar').then(({ default: chokidar }) => {
    let isBuilding = false

    const watcher = chokidar.watch([
      'app/**/*',
      'components/**/*',
      'lib/**/*',
      'stores/**/*',
    ], {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
    })

    watcher.on('change', async (filePath) => {
      if (isBuilding) return

      console.log(`\n📝 File changed: ${filePath}`)
      console.log('🔄 Rebuilding...\n')

      isBuilding = true

      try {
        // Kill server
        serverProcess.kill('SIGTERM')

        // Rebuild
        execSync('npm run build', {
          stdio: 'inherit',
          env: {
            ...process.env,
            NODE_ENV: 'production',
          }
        })

        // Restart server
        spawn('npx', ['next', 'start', '-p', PORT], {
          stdio: 'inherit',
          shell: true,
        })

        console.log('\n✅ Rebuild complete!\n')
      } catch (error) {
        console.error('❌ Rebuild failed:', error.message)
      }

      isBuilding = false
    })
  }).catch((error) => {
    console.error('❌ Failed to load chokidar for watch mode:', error.message)
    console.log('⚠️  Watch mode disabled. Install chokidar: npm install --save-dev chokidar')
  })
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down local production server...')
  serverProcess.kill('SIGTERM')
  process.exit(0)
})

process.on('SIGTERM', () => {
  serverProcess.kill('SIGTERM')
  process.exit(0)
})

console.log('\n📚 Usage:')
console.log('  - Test production build locally without deploying to Vercel')
console.log('  - Same performance as production')
console.log('  - Instant compared to waiting for Vercel deployment')
console.log('  - Press Ctrl+C to stop\n')

if (WATCH_MODE) {
  console.log('  - Watch mode: Auto-rebuilds on file changes\n')
}
