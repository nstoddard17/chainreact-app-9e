/**
 * Payload Size Telemetry
 *
 * Stateless probabilistic sampling of JSONB payload sizes on hot write paths.
 * Used to establish baselines before deciding on compression/storage changes.
 *
 * 5% sample rate — low enough to avoid noise, high enough to get signal.
 * No in-memory counters (unreliable in serverless/multi-instance).
 */

import { logger } from '@/lib/utils/logger'

const SAMPLE_RATE = 0.05

/**
 * Sample and log the size of a JSONB payload about to be written to the database.
 * Call this right before inserting/updating a large JSONB column.
 *
 * @param table - The table name (e.g., 'workflow_execution_sessions')
 * @param column - The column name (e.g., 'execution_context')
 * @param data - The object that will be stored as JSONB
 */
export function trackPayloadSize(table: string, column: string, data: unknown): void {
  if (Math.random() > SAMPLE_RATE) return

  try {
    const json = JSON.stringify(data)
    const sizeBytes = json.length

    logger.debug('[PayloadTelemetry]', {
      table,
      column,
      sizeBytes,
      sizeKB: Number((sizeBytes / 1024).toFixed(1)),
    })
  } catch {
    // Don't let telemetry errors affect the write path
  }
}
