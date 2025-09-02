/**
 * Request Manager
 * Handles request deduplication, abort controllers, and request tracking
 */

export class RequestManager {
  private abortControllers: Map<string, AbortController>;
  private activeRequests: Map<string, Promise<void>>;
  private requestCounter: number;
  private activeRequestIds: Map<string, number>;

  constructor() {
    this.abortControllers = new Map();
    this.activeRequests = new Map();
    this.requestCounter = 0;
    this.activeRequestIds = new Map();
  }

  /**
   * Generate a unique request ID
   */
  generateRequestId(): number {
    return ++this.requestCounter;
  }

  /**
   * Cancel an existing request if one exists for the given key
   */
  cancelExistingRequest(cacheKey: string): void {
    const existingController = this.abortControllers.get(cacheKey);
    if (existingController) {
      console.log('🚫 [RequestManager] Cancelling existing request for:', {
        cacheKey,
        oldRequestId: this.activeRequestIds.get(cacheKey)
      });
      existingController.abort();
      this.abortControllers.delete(cacheKey);
    }
  }

  /**
   * Create a new abort controller for a request
   */
  createAbortController(cacheKey: string, requestId: number): AbortController {
    // Cancel any existing request first
    this.cancelExistingRequest(cacheKey);

    // Create new controller
    const abortController = new AbortController();
    this.abortControllers.set(cacheKey, abortController);
    this.activeRequestIds.set(cacheKey, requestId);

    return abortController;
  }

  /**
   * Check if this is still the current request for a given key
   */
  isCurrentRequest(cacheKey: string, requestId: number): boolean {
    return this.activeRequestIds.get(cacheKey) === requestId;
  }

  /**
   * Check if there's an active request for the given key
   */
  hasActiveRequest(cacheKey: string): boolean {
    return this.activeRequests.has(cacheKey);
  }

  /**
   * Get the active request promise for the given key
   */
  getActiveRequest(cacheKey: string): Promise<void> | undefined {
    return this.activeRequests.get(cacheKey);
  }

  /**
   * Store an active request promise
   */
  setActiveRequest(cacheKey: string, promise: Promise<void>): void {
    this.activeRequests.set(cacheKey, promise);
  }

  /**
   * Clean up after a request completes
   */
  cleanupRequest(cacheKey: string, requestId?: number): void {
    // Only cleanup if this is still the current request
    if (!requestId || this.isCurrentRequest(cacheKey, requestId)) {
      this.abortControllers.delete(cacheKey);
      this.activeRequestIds.delete(cacheKey);
    }
    this.activeRequests.delete(cacheKey);
  }

  /**
   * Cancel all active requests (useful for cleanup)
   */
  cancelAllRequests(): void {
    console.log('🚫 [RequestManager] Cancelling all active requests');
    
    // Abort all fetch requests
    this.abortControllers.forEach((controller, key) => {
      console.log('🚫 [RequestManager] Aborting request:', key);
      controller.abort();
    });

    // Clear all maps
    this.abortControllers.clear();
    this.activeRequestIds.clear();
    this.activeRequests.clear();
  }

  /**
   * Get statistics about active requests
   */
  getStats(): {
    activeRequests: number;
    pendingAborts: number;
    totalRequestsCreated: number;
  } {
    return {
      activeRequests: this.activeRequests.size,
      pendingAborts: this.abortControllers.size,
      totalRequestsCreated: this.requestCounter
    };
  }

  /**
   * Check if a request was aborted
   */
  isAbortError(error: any): boolean {
    return error?.name === 'AbortError';
  }

  /**
   * Wait for an existing request or create a new one
   */
  async deduplicateRequest<T>(
    cacheKey: string,
    forceRefresh: boolean,
    requestFn: () => Promise<T>
  ): Promise<T | undefined> {
    // Check if there's already an active request for this key
    if (!forceRefresh && this.hasActiveRequest(cacheKey)) {
      console.log('🔄 [RequestManager] Waiting for existing request:', cacheKey);
      try {
        await this.getActiveRequest(cacheKey);
        // Request completed, data should be available
        return undefined; // Caller should check cache
      } catch (error) {
        console.error('🔄 [RequestManager] Existing request failed:', error);
        // Continue with new request
      }
    }

    // Execute the request function
    return requestFn();
  }

  /**
   * Reset the manager (clear all state)
   */
  reset(): void {
    this.cancelAllRequests();
    this.requestCounter = 0;
  }
}