import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getAddActionCenterX,
  getParentCenterX,
  __INTERNAL_CONSTANTS__
} from '../lib/workflows/addActionLayout.js'

test('add action center stays aligned with default width nodes', () => {
  const leafNode = {
    position: { x: 100 },
    data: { type: 'custom_action' }
  }

  const parentCenter = getParentCenterX(leafNode)
  const addActionCenter = getAddActionCenterX(leafNode)

  assert.equal(addActionCenter, parentCenter)
})

test('add action alignment honors explicit nodeWidth overrides', () => {
  const parentWidth = 520
  const leafNode = {
    position: { x: 40 },
    data: { nodeWidth: parentWidth }
  }

  const parentCenter = getParentCenterX(leafNode)
  const addActionCenter = getAddActionCenterX(leafNode)

  assert.equal(addActionCenter, parentCenter)
  assert.equal(addActionCenter - leafNode.position.x, parentWidth / 2)
})

test('add action alignment respects dimension metadata and ai agent width', () => {
  const dimensionNode = {
    position: { x: 10 },
    data: { dimensions: { width: 360 } }
  }

  assert.equal(getAddActionCenterX(dimensionNode), getParentCenterX(dimensionNode))

  const aiAgentNode = {
    position: { x: -30 },
    data: { type: 'ai_agent' }
  }

  assert.equal(getAddActionCenterX(aiAgentNode), getParentCenterX(aiAgentNode))
})

test('add action helper falls back to a shared center when parent position missing', () => {
  const noPositionNode = {
    data: { type: 'custom_action' }
  }

  const addActionCenter = getAddActionCenterX(noPositionNode)
  const parentCenter = getParentCenterX(noPositionNode)

  assert.equal(addActionCenter, parentCenter)
  assert.equal(addActionCenter, __INTERNAL_CONSTANTS__.DEFAULT_PARENT_NODE_WIDTH / 2)
})
