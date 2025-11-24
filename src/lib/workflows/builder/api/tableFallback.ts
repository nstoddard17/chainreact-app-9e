import type { PostgrestError, PostgrestResponse, PostgrestSingleResponse } from "@supabase/supabase-js"

const TABLE_NOT_FOUND_CODE = "42P01"

type SupabaseQueryResult<T> = PostgrestSingleResponse<T> | PostgrestResponse<T>
type QueryBuilder<T> = () => Promise<SupabaseQueryResult<T>>

function isMissingTable(error: PostgrestError | null) {
  return Boolean(error?.code && error.code === TABLE_NOT_FOUND_CODE)
}

function hasResultData<T>(result: SupabaseQueryResult<T>) {
  const data = result.data as any
  if (Array.isArray(data)) {
    return data.length > 0
  }
  return data !== null && data !== undefined
}

/**
 * Executes a series of Supabase queries, falling back to the next builder when the
 * current one fails due to a missing table (e.g., during migrations where tables
 * may be renamed). Returns the first successful response or the final error.
 */
export async function queryWithTableFallback<T>(builders: QueryBuilder<T>[]): Promise<SupabaseQueryResult<T>> {
  if (builders.length === 0) {
    throw new Error("queryWithTableFallback requires at least one query builder")
  }

  let lastResult: SupabaseQueryResult<T> | null = null

  for (let i = 0; i < builders.length; i++) {
    const result = await builders[i]()
    const error = (result as SupabaseQueryResult<T>).error ?? null

    if (error && isMissingTable(error as PostgrestError)) {
      lastResult = result
      continue
    }

    if (hasResultData(result) || i === builders.length - 1) {
      return result
    }

    lastResult = result
  }

  return lastResult ?? (await builders[builders.length - 1]())
}
