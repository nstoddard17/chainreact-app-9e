/**
 * Re-export execution types from their canonical location.
 * This module exists because OneNote action handlers import ExecutionContext from this path.
 */
export type { ExecutionContext } from '@/lib/services/workflowExecutionService'
