import { test, expect } from '@playwright/test'
import fs from 'fs'

test.setTimeout(120000) // 2 minutes

test('Debug AI Agent handle connections', async ({ page }) => {
  // Read test credentials
  const credentials = JSON.parse(fs.readFileSync('./.test-credentials.json', 'utf-8'))
  console.log('📧 Loaded test credentials for:', credentials.email)

  // Capture console logs
  const consoleLogs: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    consoleLogs.push(`[${msg.type()}] ${text}`)
  })

  // Capture errors
  page.on('pageerror', (error) => {
    console.error('Browser error:', error)
    consoleLogs.push(`[ERROR] ${error.message}`)
  })

  // Step 1: Login first
  console.log('\n🔐 Step 1: Logging in...')
  await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'debug-0-login-page.png', fullPage: true })

  // Fill in login form
  const emailInput = page.locator('input[type="email"]').first()
  const passwordInput = page.locator('input[type="password"]').first()

  await emailInput.fill(credentials.email)
  await passwordInput.fill(credentials.password)
  await page.screenshot({ path: 'debug-0-login-filled.png', fullPage: true })

  // Submit login
  await page.keyboard.press('Enter')

  // Wait for redirect after login
  console.log('   Waiting for redirect after login...')
  await page.waitForTimeout(3000)
  console.log(`   Redirected to: ${page.url()}`)

  // Navigate directly to AI agent page
  console.log('\n🚀 Step 2: Navigating to AI agent page...')
  await page.goto('http://localhost:3000/workflows/ai-agent', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'debug-1-ai-agent-page.png', fullPage: true })

  // Find the AI prompt input
  console.log('\n📝 Step 3: Looking for AI prompt input...')
  const promptInput = page.locator('textarea, input[type="text"]').first()

  try {
    await promptInput.waitFor({ state: 'visible', timeout: 10000 })
    console.log('   ✅ Found prompt input!')
  } catch (e) {
    console.log('\n❌ Could not find AI prompt input. Aborting.')
    await page.screenshot({ path: 'debug-error-no-input.png', fullPage: true })
    return
  }

  // Enter prompt
  console.log('\n✍️  Step 4: Entering prompt...')
  await promptInput.click() // Click first to ensure it's focused
  await page.waitForTimeout(500)
  await promptInput.fill('when I get an email send it to slack')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'debug-3-prompt-entered.png', fullPage: true })

  // Submit prompt
  console.log('\n🚀 Step 5: Submitting prompt (pressing Enter)...')
  await promptInput.press('Enter')

  // Wait for workflow builder to load
  console.log('   Waiting for workflow builder to load...')
  await page.waitForTimeout(5000)
  await page.screenshot({ path: 'debug-4-after-prompt-submit.png', fullPage: true })

  // Look for Build button in the agent chat menu
  console.log('\n🔨 Step 6: Looking for Build button in agent chat...')
  const buildButton = page.locator('button:has-text("Build")').first()

  try {
    await buildButton.waitFor({ timeout: 10000 })
    console.log('   ✅ Found Build button!')
    await page.screenshot({ path: 'debug-5-build-button-found.png', fullPage: true })

    console.log('   Clicking Build button...')
    await buildButton.click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'debug-6-build-button-clicked.png', fullPage: true })
  } catch (e) {
    console.log('   ⚠️  Could not find Build button, continuing anyway...')
  }

  // Wait for skeleton nodes to appear after clicking Build
  console.log('\n⏳ Step 7: Waiting for skeleton nodes to populate...')
  console.log('   Waiting 15 seconds for AI to generate nodes...')
  await page.waitForTimeout(15000) // Give AI more time to create nodes
  await page.screenshot({ path: 'debug-7-after-build-wait.png', fullPage: true })

  try {
    await page.waitForSelector('[data-testid^="node-"]', { timeout: 20000 })
    const nodeCount = await page.locator('[data-testid^="node-"]').count()
    console.log(`   ✅ Nodes appeared! Found ${nodeCount} nodes`)
  } catch (e) {
    console.log('   ⚠️  Nodes did not appear after 35 seconds total')
    console.log('   Checking what\'s on the page...')

    // Debug what's actually on the page
    const hasReactFlow = await page.locator('.react-flow').count()
    const hasNodes = await page.locator('[data-testid^="node-"]').count()
    const buildButtonCount = await page.locator('button:has-text("Build")').count()

    console.log(`   ReactFlow present: ${hasReactFlow > 0}`)
    console.log(`   Nodes found: ${hasNodes}`)
    console.log(`   Build buttons: ${buildButtonCount}`)
  }

  await page.waitForTimeout(2000)

  // Click on the canvas to close the guided setup panel
  console.log('   Clicking on canvas to close panels...')
  const canvas = page.locator('.react-flow')
  if (await canvas.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Click on the right side of the screen (canvas area, not panel)
    await canvas.click({ position: { x: 1000, y: 300 }, force: true })
    await page.waitForTimeout(500)
  }

  await page.screenshot({ path: 'debug-8-nodes-rendered.png', fullPage: true })

  // Take a screenshot of just the canvas area
  const reactFlowViewport = page.locator('.react-flow__viewport').first()
  if (await reactFlowViewport.isVisible({ timeout: 2000 }).catch(() => false)) {
    await reactFlowViewport.screenshot({ path: 'debug-9-canvas-only.png' })
    console.log('   Canvas screenshot saved!')
  }

  // Also try zooming out to see all nodes
  await page.keyboard.press('Control+Minus')
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'debug-10-zoomed-out.png', fullPage: true })

  // Run the diagnostic script
  console.log('\n🔍 Step 8: Running diagnostic script...')

  const diagnosticResults = await page.evaluate(() => {
    const results: any = {
      nodes: [],
      edges: [],
      reactFlow: null
    }

    // Find all nodes
    const nodes = document.querySelectorAll('[data-testid^="node-"]')

    nodes.forEach((node, i) => {
      const nodeData: any = {
        id: node.getAttribute('data-testid'),
        rect: node.getBoundingClientRect(),
        styles: {
          overflow: window.getComputedStyle(node).overflow,
          position: window.getComputedStyle(node).position,
          transform: window.getComputedStyle(node).transform
        },
        handles: []
      }

      // Find handles
      const handles = node.querySelectorAll('.react-flow__handle')
      handles.forEach((handle, j) => {
        const rect = handle.getBoundingClientRect()
        const styles = window.getComputedStyle(handle)

        const handleData: any = {
          id: handle.getAttribute('data-handleid') || handle.getAttribute('id'),
          position: handle.getAttribute('data-handlepos'),
          type: handle.classList.contains('react-flow__handle-source') ? 'source' : 'target',
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          },
          styles: {
            position: styles.position,
            left: styles.left,
            right: styles.right,
            top: styles.top,
            zIndex: styles.zIndex,
            width: styles.width,
            height: styles.height,
            transform: styles.transform,
            visibility: styles.visibility,
            display: styles.display,
            background: styles.background || styles.backgroundColor
          },
          isVisible: rect.width > 0 && rect.height > 0
        }

        // Check if clipped
        const nodeRect = node.getBoundingClientRect()
        handleData.isClipped = {
          left: rect.left < nodeRect.left,
          right: rect.right > nodeRect.right,
          top: rect.top < nodeRect.top,
          bottom: rect.bottom > nodeRect.bottom
        }
        handleData.hasClipping = Object.values(handleData.isClipped).some((v: any) => v)

        nodeData.handles.push(handleData)
      })

      results.nodes.push(nodeData)
    })

    // Find edges
    const edges = document.querySelectorAll('.react-flow__edge')
    edges.forEach((edge, i) => {
      const path = edge.querySelector('path')
      if (path) {
        const d = path.getAttribute('d')
        const edgeData: any = {
          id: edge.getAttribute('data-id') || edge.getAttribute('id'),
          path: d
        }

        // Parse coordinates
        const mMatch = d?.match(/M\s*([\d.]+)[,\s]+([\d.]+)/)
        const lMatch = d?.match(/L\s*([\d.]+)[,\s]+([\d.]+)/)

        if (mMatch && lMatch) {
          edgeData.start = { x: parseFloat(mMatch[1]), y: parseFloat(mMatch[2]) }
          edgeData.end = { x: parseFloat(lMatch[1]), y: parseFloat(lMatch[2]) }
          edgeData.verticalOffset = edgeData.end.y - edgeData.start.y
        }

        results.edges.push(edgeData)
      }
    })

    // ReactFlow info
    const reactFlow = document.querySelector('.react-flow')
    if (reactFlow) {
      const rect = reactFlow.getBoundingClientRect()
      const viewport = reactFlow.querySelector('.react-flow__viewport')
      const viewportTransform = viewport ? window.getComputedStyle(viewport).transform : 'none'

      results.reactFlow = {
        width: rect.width,
        height: rect.height,
        position: window.getComputedStyle(reactFlow).position,
        viewportTransform: viewportTransform
      }
    }

    // Log actual node positions from ReactFlow store
    const rfInstance = (window as any).__RF__;
    if (rfInstance) {
      results.reactFlowNodes = rfInstance.getNodes?.().map((n: any) => ({
        id: n.id,
        position: n.position,
        type: n.type,
        data: { type: n.data?.type, providerId: n.data?.providerId }
      }))
    }

    return results
  })

  // Print detailed results
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 DIAGNOSTIC RESULTS')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  console.log(`📦 Total Nodes: ${diagnosticResults.nodes.length}\n`)

  diagnosticResults.nodes.forEach((node: any, i: number) => {
    console.log(`\n━━━ NODE ${i + 1}: ${node.id} ━━━`)
    console.log(`📐 Container:`)
    console.log(`   Position: (${node.rect.x.toFixed(1)}, ${node.rect.y.toFixed(1)})`)
    console.log(`   Size: ${node.rect.width.toFixed(1)} × ${node.rect.height.toFixed(1)}`)
    console.log(`   Overflow: ${node.styles.overflow}`)

    if (node.styles.overflow === 'hidden') {
      console.log(`   ⚠️  OVERFLOW HIDDEN - May clip handles!`)
    }

    console.log(`\n🎯 Handles: ${node.handles.length}`)

    node.handles.forEach((handle: any, j: number) => {
      console.log(`\n   Handle ${j + 1} [${handle.type}]:`)
      console.log(`     Position: ${handle.position}`)
      console.log(`     Visible: ${handle.isVisible ? '✅ YES' : '❌ NO'}`)
      console.log(`     Bounding box: (${handle.rect.x.toFixed(1)}, ${handle.rect.y.toFixed(1)}) ${handle.rect.width.toFixed(1)}×${handle.rect.height.toFixed(1)}`)

      if (handle.hasClipping) {
        console.log(`     ⚠️  CLIPPED:`, handle.isClipped)
      }

      console.log(`     Styles:`)
      console.log(`       position: ${handle.styles.position}`)
      console.log(`       left: ${handle.styles.left}, right: ${handle.styles.right}`)
      console.log(`       top: ${handle.styles.top}`)
      console.log(`       z-index: ${handle.styles.zIndex}`)
      console.log(`       size: ${handle.styles.width} × ${handle.styles.height}`)
    })
  })

  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`🔗 Total Edges: ${diagnosticResults.edges.length}\n`)

  diagnosticResults.edges.forEach((edge: any, i: number) => {
    console.log(`\nEdge ${i + 1}: ${edge.id}`)
    if (edge.start && edge.end) {
      console.log(`   Start: (${edge.start.x.toFixed(1)}, ${edge.start.y.toFixed(1)})`)
      console.log(`   End: (${edge.end.x.toFixed(1)}, ${edge.end.y.toFixed(1)})`)
      console.log(`   Vertical offset: ${edge.verticalOffset.toFixed(1)}px`)

      if (Math.abs(edge.verticalOffset) > 5) {
        console.log(`   ⚠️  Large vertical offset - not center-to-center!`)
      }
    }
  })

  if (diagnosticResults.reactFlow) {
    console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log('📊 ReactFlow Container:')
    console.log(`   Size: ${diagnosticResults.reactFlow.width} × ${diagnosticResults.reactFlow.height}`)
  }

  // Save results to file
  fs.writeFileSync('debug-results.json', JSON.stringify(diagnosticResults, null, 2))
  console.log('\n💾 Full results saved to: debug-results.json')

  console.log('\n✅ Diagnostic complete! Check:')
  console.log('   - debug-*.png (screenshots at each step)')
  console.log('   - debug-results.json (full diagnostic data)')
  console.log('   - Console output above')

  console.log('\n🔍 Key Issues to Look For:')
  console.log('   - ⚠️  OVERFLOW HIDDEN on node containers')
  console.log('   - ❌ NO visible handles')
  console.log('   - ⚠️  CLIPPED handles')
  console.log('   - ⚠️  Large vertical offset in edges')
})
