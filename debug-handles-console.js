/**
 * Debug Handle Connections - Browser Console Script
 *
 * INSTRUCTIONS:
 * 1. Open http://localhost:3000/workflows in your browser (while logged in)
 * 2. Enter the prompt "when I get an email send it to slack" and click Build
 * 3. Wait for skeleton nodes to appear
 * 4. Open browser DevTools (F12 or Cmd+Option+I)
 * 5. Go to Console tab
 * 6. Copy/paste this entire script and press Enter
 * 7. Review the detailed diagnostic output
 */

(function debugHandles() {
  console.log('🔍 ===== HANDLE CONNECTION DIAGNOSTIC =====\n')

  // Find all nodes
  const nodes = document.querySelectorAll('[data-testid^="node-"]')
  console.log(`📦 Found ${nodes.length} nodes\n`)

  nodes.forEach((node, i) => {
    const nodeId = node.getAttribute('data-testid')
    console.log(`\n━━━ NODE ${i + 1}: ${nodeId} ━━━`)

    // Get node dimensions and position
    const nodeRect = node.getBoundingClientRect()
    const nodeStyles = window.getComputedStyle(node)

    console.log('📐 Node Container:')
    console.log(`   Position: ${nodeRect.x.toFixed(1)}, ${nodeRect.y.toFixed(1)}`)
    console.log(`   Size: ${nodeRect.width.toFixed(1)} × ${nodeRect.height.toFixed(1)}`)
    console.log(`   Overflow: ${nodeStyles.overflow}`)
    console.log(`   Transform: ${nodeStyles.transform}`)

    // Find handles
    const handles = node.querySelectorAll('.react-flow__handle')
    console.log(`\n🎯 Handles: ${handles.length} found`)

    handles.forEach((handle, j) => {
      const handleId = handle.getAttribute('data-handleid') || handle.getAttribute('id')
      const handlePos = handle.getAttribute('data-handlepos')
      const handleType = handle.classList.contains('react-flow__handle-source') ? 'source' : 'target'

      const handleRect = handle.getBoundingClientRect()
      const handleStyles = window.getComputedStyle(handle)

      console.log(`\n   Handle ${j + 1} [${handleType}]:`)
      console.log(`     ID: ${handleId}`)
      console.log(`     Position attr: ${handlePos}`)
      console.log(`     Bounding box:`)
      console.log(`       x: ${handleRect.x.toFixed(1)}, y: ${handleRect.y.toFixed(1)}`)
      console.log(`       width: ${handleRect.width.toFixed(1)}, height: ${handleRect.height.toFixed(1)}`)
      console.log(`     Is visible: ${handleRect.width > 0 && handleRect.height > 0}`)

      console.log(`     Computed styles:`)
      console.log(`       position: ${handleStyles.position}`)
      console.log(`       left: ${handleStyles.left}`)
      console.log(`       right: ${handleStyles.right}`)
      console.log(`       top: ${handleStyles.top}`)
      console.log(`       z-index: ${handleStyles.zIndex}`)
      console.log(`       width: ${handleStyles.width}`)
      console.log(`       height: ${handleStyles.height}`)
      console.log(`       transform: ${handleStyles.transform}`)
      console.log(`       visibility: ${handleStyles.visibility}`)
      console.log(`       display: ${handleStyles.display}`)
      console.log(`       background: ${handleStyles.background || handleStyles.backgroundColor}`)

      // Check if handle is clipped
      const nodeClip = node.getBoundingClientRect()
      const isClipped = {
        left: handleRect.left < nodeClip.left,
        right: handleRect.right > nodeClip.right,
        top: handleRect.top < nodeClip.top,
        bottom: handleRect.bottom > nodeClip.bottom
      }
      const hasClipping = Object.values(isClipped).some(v => v)

      if (hasClipping) {
        console.log(`       ⚠️ CLIPPING DETECTED:`, isClipped)
      }
    })
  })

  // Check edges
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const edges = document.querySelectorAll('.react-flow__edge')
  console.log(`\n🔗 Found ${edges.length} edges\n`)

  edges.forEach((edge, i) => {
    const edgeId = edge.getAttribute('data-id') || edge.getAttribute('id')
    const path = edge.querySelector('path')

    if (path) {
      const d = path.getAttribute('d')
      console.log(`\nEdge ${i + 1}: ${edgeId}`)
      console.log(`   Path: ${d}`)

      // Parse M and L coordinates
      const mMatch = d.match(/M\s*([\d.]+)[,\s]+([\d.]+)/)
      const lMatch = d.match(/L\s*([\d.]+)[,\s]+([\d.]+)/)

      if (mMatch && lMatch) {
        console.log(`   Start (M): (${mMatch[1]}, ${mMatch[2]})`)
        console.log(`   End (L): (${lMatch[1]}, ${lMatch[2]})`)

        // Calculate if edge is going "up" (which would indicate connection to top of handle)
        const startY = parseFloat(mMatch[2])
        const endY = parseFloat(lMatch[2])
        const deltaY = endY - startY

        if (Math.abs(deltaY) > 5) {
          console.log(`   ⚠️ Vertical offset: ${deltaY.toFixed(1)}px (should be ~0 for center-to-center)`)
        }
      }
    }
  })

  // Check ReactFlow wrapper
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const reactFlow = document.querySelector('.react-flow')
  if (reactFlow) {
    const rfRect = reactFlow.getBoundingClientRect()
    const rfStyles = window.getComputedStyle(reactFlow)
    console.log('\n📊 ReactFlow Container:')
    console.log(`   Size: ${rfRect.width} × ${rfRect.height}`)
    console.log(`   Position: ${rfStyles.position}`)
  }

  console.log('\n✅ Diagnostic complete!\n')
  console.log('Look for:')
  console.log('  • ⚠️ CLIPPING DETECTED - handles being cut off by overflow-hidden')
  console.log('  • Bounding box width/height = 0 - handle not rendering')
  console.log('  • Large vertical offset in edges - misaligned connections')
  console.log('  • z-index values - stacking order issues')
})()
