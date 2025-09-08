#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'

const API = process.env.VALIDATE_API_URL || 'http://localhost:3000/api/dev/validate-workflow'

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: node scripts/validate-workflow.mjs <workflow.json> [--discord]')
    process.exit(1)
  }
  const prefersDiscord = process.argv.includes('--discord')
  const filePath = path.resolve(process.cwd(), file)
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath)
    process.exit(1)
  }
  const workflow = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflow, prefersDiscord })
  })
  const data = await res.json()
  if (res.ok && data.success) {
    console.log('✅ Workflow is valid')
    process.exit(0)
  }
  console.error('❌ Workflow invalid')
  if (data.errors) {
    data.errors.forEach((e, i) => console.error(`${i + 1}. ${e}`))
  } else {
    console.error(data)
  }
  process.exit(2)
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})

