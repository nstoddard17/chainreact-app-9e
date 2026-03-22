import {
  fetchWithTimeout,
  queryWithTimeout,
  retryWithBackoff,
} from "@/lib/utils/fetch-with-timeout"

describe("fetchWithTimeout", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("returns response when fetch completes in time", async () => {
    const mockResponse = new Response("ok", { status: 200 })
    globalThis.fetch = jest.fn().mockResolvedValue(mockResponse)

    const result = await fetchWithTimeout("/api/test", {}, 5000)
    expect(result).toBe(mockResponse)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it("passes options through to fetch", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(new Response("ok"))

    await fetchWithTimeout(
      "/api/test",
      { method: "POST", headers: { "X-Test": "1" } },
      5000
    )

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "POST",
        headers: { "X-Test": "1" },
      })
    )
  })

  it("throws timeout error when fetch takes too long", async () => {
    globalThis.fetch = jest.fn().mockImplementation(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => {
            const error = new Error("The operation was aborted")
            error.name = "AbortError"
            reject(error)
          })
        })
    )

    await expect(fetchWithTimeout("/api/slow", {}, 50)).rejects.toThrow(
      "Request timed out after 50ms"
    )
  })

  it("propagates non-abort errors", async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new Error("Network failure"))

    await expect(fetchWithTimeout("/api/fail", {}, 5000)).rejects.toThrow(
      "Network failure"
    )
  })
})

describe("queryWithTimeout", () => {
  it("resolves when query completes in time", async () => {
    const result = await queryWithTimeout(Promise.resolve({ data: "ok" }), 5000)
    expect(result).toEqual({ data: "ok" })
  })

  it("throws timeout error when query takes too long", async () => {
    const slowQuery = new Promise((resolve) => setTimeout(resolve, 10000))
    await expect(queryWithTimeout(slowQuery, 50)).rejects.toThrow(
      "Query timed out after 50ms"
    )
  })

  it("propagates query errors", async () => {
    await expect(
      queryWithTimeout(Promise.reject(new Error("DB error")), 5000)
    ).rejects.toThrow("DB error")
  })
})

describe("retryWithBackoff", () => {
  it("returns result on first success", async () => {
    const fn = jest.fn().mockResolvedValue("success")
    const result = await retryWithBackoff(fn, 3, 10)
    expect(result).toBe("success")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries on failure and succeeds", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("success")

    const result = await retryWithBackoff(fn, 3, 10)
    expect(result).toBe("success")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("throws after exhausting retries", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("always fails"))

    await expect(retryWithBackoff(fn, 2, 10)).rejects.toThrow("always fails")
    // Initial call + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("throws immediately with 0 retries", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("fail"))

    await expect(retryWithBackoff(fn, 0, 10)).rejects.toThrow("fail")
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
