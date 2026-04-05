import type { StoreApi } from 'zustand'

/**
 * Reset a Zustand store to its initial state between tests.
 * Call this in beforeEach() or afterEach().
 *
 * Usage:
 *   const initialState = useMyStore.getState()
 *   afterEach(() => resetStore(useMyStore, initialState))
 */
export function resetStore<T extends object>(
  store: StoreApi<T>,
  initialState: T
) {
  store.setState(initialState, true)
}
