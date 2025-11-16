#!/usr/bin/env node

/**
 * Super-Fast Development Server Script
 *
 * This script starts Next.js with optimal settings for local development speed
 * Features:
 * - Turbopack for 10x faster builds
 * - Disabled type checking (run manually)
 * - Optimized memory settings
 * - Fast refresh enabled
 * - Minimal logging
 */

import { spawn } from 'child_process'
import path from 'path'

console.log('🚀 Starting ChainReact in FAST MODE...\n')

const env = {
  ...process.env,
  // Disable telemetry
  NEXT_TELEMETRY_DISABLED: '1',
  // Increase memory
  NODE_OPTIONS: '--max-old-space-size=4096',
  // Skip checks for speed
  SKIP_TYPE_CHECK: 'true',
  // Development mode
  NODE_ENV: 'development',
}

// Start Next.js with Turbopack
const nextProcess = spawn('npx', ['next', 'dev', '--turbo', '--port', '3000'], {
  env,
  stdio: 'inherit',
  shell: true,
})

nextProcess.on('error', (error) => {
  console.error('❌ Failed to start dev server:', error)
  process.exit(1)
})

nextProcess.on('exit', (code) => {
  if (code !== 0) {
    console.error(`❌ Dev server exited with code ${code}`)
    process.exit(code)
  }
})

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down dev server...')
  nextProcess.kill('SIGINT')
  process.exit(0)
})

process.on('SIGTERM', () => {
  nextProcess.kill('SIGTERM')
  process.exit(0)
})
