import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Execute loop action - iterate through an array of items or repeat N times
 *
 * This action supports two modes:
 * 1. Items mode: processes arrays item-by-item or in batches
 * 2. Count mode: repeats N times with a counter
 *
 * Progress is tracked in real-time via the execution engine's
 * loop_executions table.
 */
export async function executeLoop(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const loopMode = config.loopMode || 'items'

    logger.debug('[Loop] Starting loop execution', {
      loopMode,
      config
    })

    // Handle count mode
    if (loopMode === 'count') {
      return await executeCountLoop(config, context)
    }

    // Handle items mode (default)
    return await executeItemsLoop(config, context)
  } catch (error: any) {
    logger.error('[Loop] Error executing loop:', error)
    return {
      success: false,
      output: {
        currentItem: null,
        index: 0,
        iteration: 0,
        totalItems: 0,
        isFirst: true,
        isLast: true,
        batch: []
      },
      message: error.message || 'Failed to execute loop'
    }
  }
}

/**
 * Execute count loop mode - repeat N times
 */
async function executeCountLoop(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const countRaw = context.dataFlowManager.resolveVariable(config.count)
    const count = parseInt(countRaw)
    const initialValue = parseInt(config.initialValue) || 1
    const stepIncrement = parseInt(config.stepIncrement) || 1

    if (isNaN(count) || count <= 0) {
      throw new Error('Count must be a positive number')
    }

    if (count > 500) {
      throw new Error('Count cannot exceed 500 iterations')
    }

    logger.debug('[Loop:Count] Starting count loop', {
      count,
      initialValue,
      stepIncrement
    })

    const currentCounter = initialValue
    const output = {
      counter: currentCounter,
      index: 0,
      iteration: 1,
      totalItems: count,
      isFirst: true,
      isLast: count === 1,
      progressPercentage: Math.round((1 / count) * 100),
      remainingItems: count - 1,
      // Store config for subsequent iterations
      _loopConfig: {
        count,
        initialValue,
        stepIncrement
      }
    }

    logger.debug('[Loop:Count] First iteration prepared', {
      counter: output.counter,
      totalItems: output.totalItems,
      progressPercentage: output.progressPercentage
    })

    return {
      success: true,
      output,
      message: `Loop iteration 1 of ${count} (counter: ${currentCounter})`
    }
  } catch (error: any) {
    logger.error('[Loop:Count] Error executing count loop:', error)
    return {
      success: false,
      output: {
        counter: 0,
        index: 0,
        iteration: 0,
        totalItems: 0,
        isFirst: true,
        isLast: true
      },
      message: error.message || 'Failed to execute count loop'
    }
  }
}

/**
 * Execute items loop mode - iterate through an array
 */
async function executeItemsLoop(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    // Resolve dynamic values
    const itemsRaw = context.dataFlowManager.resolveVariable(config.items)
    const batchSize = parseInt(context.dataFlowManager.resolveVariable(config.batchSize)) || 1

    logger.debug('[Loop:Items] Starting items loop', {
      itemsRaw: typeof itemsRaw,
      batchSize,
      configItems: config.items
    })

    // Parse items if it's a string (could be JSON or variable reference)
    let items: any[]

    if (!itemsRaw) {
      throw new Error('Items array is required for loop execution')
    }

    if (typeof itemsRaw === 'string') {
      try {
        items = JSON.parse(itemsRaw)
      } catch (e) {
        // If parse fails, treat as single item
        items = [itemsRaw]
      }
    } else if (Array.isArray(itemsRaw)) {
      items = itemsRaw
    } else if (typeof itemsRaw === 'object' && itemsRaw !== null) {
      // If it's an object, check if it has an array property
      const possibleArray = Object.values(itemsRaw).find(v => Array.isArray(v))
      if (possibleArray) {
        items = possibleArray
      } else {
        // Convert object to array of entries
        items = Object.entries(itemsRaw).map(([key, value]) => ({ key, value }))
      }
    } else {
      items = [itemsRaw]
    }

    if (!Array.isArray(items)) {
      throw new Error(`Expected array for loop items, got ${typeof items}`)
    }

    if (items.length === 0) {
      logger.warn('[Loop:Items] Empty array provided, no iterations will run')
      return {
        success: true,
        output: {
          currentItem: null,
          index: 0,
          iteration: 0,
          totalItems: 0,
          isFirst: true,
          isLast: true,
          batch: [],
          allResults: []
        },
        message: 'Loop completed with 0 items'
      }
    }

    const totalItems = items.length
    const actualBatchSize = Math.min(Math.max(1, batchSize), totalItems)

    logger.debug('[Loop:Items] Processing array', {
      totalItems,
      batchSize: actualBatchSize,
      firstItem: items[0]
    })

    // For now, return the first item/batch
    // The actual loop iteration will be handled by the execution engine
    // This provides the data structure for the first iteration
    const currentIndex = 0
    const currentBatch = items.slice(currentIndex, currentIndex + actualBatchSize)
    const currentItem = currentBatch[0]

    const output = {
      currentItem,
      index: currentIndex,
      iteration: 1,
      totalItems,
      isFirst: true,
      isLast: currentIndex + actualBatchSize >= totalItems,
      batch: currentBatch,
      batchSize: actualBatchSize,
      // Include all items for downstream processing
      allItems: items,
      // Progress indicators
      progressPercentage: Math.round(((currentIndex + actualBatchSize) / totalItems) * 100),
      remainingItems: totalItems - (currentIndex + actualBatchSize)
    }

    logger.debug('[Loop:Items] First iteration prepared', {
      index: output.index,
      totalItems: output.totalItems,
      batchSize: output.batchSize,
      progressPercentage: output.progressPercentage
    })

    return {
      success: true,
      output,
      message: `Loop iteration 1 of ${Math.ceil(totalItems / actualBatchSize)} (processing ${actualBatchSize} item${actualBatchSize > 1 ? 's' : ''})`
    }
  } catch (error: any) {
    logger.error('[Loop:Items] Error executing items loop:', error)
    return {
      success: false,
      output: {
        currentItem: null,
        index: 0,
        iteration: 0,
        totalItems: 0,
        isFirst: true,
        isLast: true,
        batch: []
      },
      message: error.message || 'Failed to execute items loop'
    }
  }
}

/**
 * Get the next iteration of a loop
 * This is called by the execution engine to advance the loop
 */
export async function getNextLoopIteration(
  items: any[],
  currentIndex: number,
  batchSize: number
): Promise<{
  currentItem: any
  index: number
  iteration: number
  totalItems: number
  isFirst: boolean
  isLast: boolean
  batch: any[]
  hasMore: boolean
  progressPercentage: number
  remainingItems: number
} | null> {
  const totalItems = items.length
  const nextIndex = currentIndex + batchSize

  if (nextIndex >= totalItems) {
    // No more iterations
    return null
  }

  const iteration = Math.floor(nextIndex / batchSize) + 1
  const currentBatch = items.slice(nextIndex, nextIndex + batchSize)
  const currentItem = currentBatch[0]

  return {
    currentItem,
    index: nextIndex,
    iteration,
    totalItems,
    isFirst: false,
    isLast: nextIndex + batchSize >= totalItems,
    batch: currentBatch,
    hasMore: nextIndex + batchSize < totalItems,
    progressPercentage: Math.round(((nextIndex + batchSize) / totalItems) * 100),
    remainingItems: totalItems - (nextIndex + batchSize)
  }
}

/**
 * Get the next iteration of a count loop
 * This is called by the execution engine to advance the count loop
 */
export async function getNextCountIteration(
  loopConfig: { count: number; initialValue: number; stepIncrement: number },
  currentIteration: number
): Promise<{
  counter: number
  index: number
  iteration: number
  totalItems: number
  isFirst: boolean
  isLast: boolean
  progressPercentage: number
  remainingItems: number
} | null> {
  const { count, initialValue, stepIncrement } = loopConfig
  const nextIteration = currentIteration + 1

  if (nextIteration > count) {
    // No more iterations
    return null
  }

  const counter = initialValue + ((nextIteration - 1) * stepIncrement)

  return {
    counter,
    index: nextIteration - 1,
    iteration: nextIteration,
    totalItems: count,
    isFirst: false,
    isLast: nextIteration === count,
    progressPercentage: Math.round((nextIteration / count) * 100),
    remainingItems: count - nextIteration
  }
}
