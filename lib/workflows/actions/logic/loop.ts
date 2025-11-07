import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Execute loop action - iterate through an array of items
 *
 * This action processes arrays item-by-item or in batches, providing
 * rich iteration metadata for use in subsequent workflow nodes.
 *
 * Progress is tracked in real-time via the execution engine's
 * loop_executions table.
 */
export async function executeLoop(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    // Resolve dynamic values
    const itemsRaw = context.dataFlowManager.resolveVariable(config.items)
    const batchSize = parseInt(context.dataFlowManager.resolveVariable(config.batchSize)) || 1

    logger.debug('[Loop] Starting loop execution', {
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
      logger.warn('[Loop] Empty array provided, no iterations will run')
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

    logger.debug('[Loop] Processing array', {
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

    logger.debug('[Loop] First iteration prepared', {
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
