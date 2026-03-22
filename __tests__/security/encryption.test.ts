jest.mock("@/lib/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}))

import { encrypt, decrypt, safeDecrypt } from "@/lib/security/encryption"

const TEST_KEY = "a]5Kx$mP9vR#nE2jL@wQ8bY6cF3hT0uZ" // 34 chars

describe("encrypt / decrypt", () => {
  it("roundtrips correctly", () => {
    const plaintext = "my-secret-oauth-token-12345"
    const encrypted = encrypt(plaintext, TEST_KEY)
    const decrypted = decrypt(encrypted, TEST_KEY)
    expect(decrypted).toBe(plaintext)
  })

  it("produces iv:ciphertext format", () => {
    const encrypted = encrypt("test", TEST_KEY)
    const parts = encrypted.split(":")
    expect(parts).toHaveLength(2)
    // IV should be 32 hex chars (16 bytes)
    expect(parts[0]).toMatch(/^[0-9a-f]{32}$/)
    // Ciphertext should be hex
    expect(parts[1]).toMatch(/^[0-9a-f]+$/)
  })

  it("produces different ciphertext each time (random IV)", () => {
    const a = encrypt("same-text", TEST_KEY)
    const b = encrypt("same-text", TEST_KEY)
    expect(a).not.toBe(b)
    // But both decrypt to the same value
    expect(decrypt(a, TEST_KEY)).toBe("same-text")
    expect(decrypt(b, TEST_KEY)).toBe("same-text")
  })

  it("fails to decrypt with wrong key", () => {
    const encrypted = encrypt("secret", TEST_KEY)
    const wrongKey = "zZ9yY8xX7wW6vV5uU4tT3sS2rR1qQ0p" // different key
    expect(() => decrypt(encrypted, wrongKey)).toThrow()
  })

  it("handles empty string", () => {
    const encrypted = encrypt("", TEST_KEY)
    const decrypted = decrypt(encrypted, TEST_KEY)
    expect(decrypted).toBe("")
  })

  it("handles unicode characters", () => {
    const text = "Hello! Héllo 世界 🔑"
    const encrypted = encrypt(text, TEST_KEY)
    expect(decrypt(encrypted, TEST_KEY)).toBe(text)
  })

  it("handles long tokens", () => {
    const longToken = "a".repeat(2048)
    const encrypted = encrypt(longToken, TEST_KEY)
    expect(decrypt(encrypted, TEST_KEY)).toBe(longToken)
  })
})

describe("decrypt edge cases", () => {
  it("returns unencrypted text as-is (no colon)", () => {
    const result = decrypt("plaintext-no-colon", TEST_KEY)
    expect(result).toBe("plaintext-no-colon")
  })

  it("throws on empty input", () => {
    expect(() => decrypt("", TEST_KEY)).toThrow()
  })
})

describe("safeDecrypt", () => {
  it("returns original text if not encrypted", () => {
    expect(safeDecrypt("plain-text", TEST_KEY)).toBe("plain-text")
  })

  it("decrypts valid encrypted text", () => {
    const encrypted = encrypt("secret", TEST_KEY)
    expect(safeDecrypt(encrypted, TEST_KEY)).toBe("secret")
  })

  it("returns original on decryption failure", () => {
    const badEncrypted = "not-valid-hex:also-not-valid"
    const result = safeDecrypt(badEncrypted, TEST_KEY)
    expect(result).toBe(badEncrypted)
  })

  it("handles null/undefined/empty", () => {
    expect(safeDecrypt("", TEST_KEY)).toBe("")
    expect(safeDecrypt(null as unknown as string, TEST_KEY)).toBeNull()
  })
})
