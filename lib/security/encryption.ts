export class EncryptionService {
  private algorithm = "aes-256-gcm"
  private keyLength = 32 // 256 bits

  async generateKey(): Promise<string> {
    const randomBytes = new Uint8Array(this.keyLength)
    globalThis.crypto.getRandomValues(randomBytes)
    return Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  }

  async encrypt(data: string, key: string): Promise<{ encrypted: string; iv: string; tag: string }> {
    const keyBuffer = new Uint8Array(key.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)))
    const iv = new Uint8Array(16)
    globalThis.crypto.getRandomValues(iv)

    const cryptoKey = await globalThis.crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, [
      "encrypt",
    ])

    const encodedData = new TextEncoder().encode(data)
    const encrypted = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encodedData)

    return {
      encrypted: Array.from(new Uint8Array(encrypted), (byte) => byte.toString(16).padStart(2, "0")).join(""),
      iv: Array.from(iv, (byte) => byte.toString(16).padStart(2, "0")).join(""),
      tag: "", // GCM mode includes authentication tag in the encrypted data
    }
  }

  async decrypt(encryptedData: string, key: string, iv: string, tag: string): Promise<string> {
    const keyBuffer = new Uint8Array(key.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)))
    const ivBuffer = new Uint8Array(iv.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)))
    const encryptedBuffer = new Uint8Array(encryptedData.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)))

    const cryptoKey = await globalThis.crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, [
      "decrypt",
    ])

    const decrypted = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBuffer },
      cryptoKey,
      encryptedBuffer,
    )

    return new TextDecoder().decode(decrypted)
  }

  async hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
    const actualSalt =
      salt ||
      Array.from(new Uint8Array(16), () =>
        Math.floor(Math.random() * 256)
          .toString(16)
          .padStart(2, "0"),
      ).join("")

    const encoder = new TextEncoder()
    const data = encoder.encode(password + actualSalt)

    // Use PBKDF2 with Web Crypto API
    const keyMaterial = await globalThis.crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
      "deriveBits",
    ])

    const hashBuffer = await globalThis.crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: encoder.encode(actualSalt),
        iterations: 10000,
        hash: "SHA-512",
      },
      keyMaterial,
      512, // 64 bytes * 8 bits
    )

    const hash = Array.from(new Uint8Array(hashBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("")

    return { hash, salt: actualSalt }
  }

  async verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
    const { hash: computedHash } = await this.hashPassword(password, salt)
    return computedHash === hash
  }

  async encryptAtRest(data: any, organizationId: string): Promise<string> {
    // In production, retrieve organization-specific encryption key
    const key = await this.getOrganizationKey(organizationId)
    const serialized = JSON.stringify(data)
    const { encrypted, iv, tag } = await this.encrypt(serialized, key)

    return JSON.stringify({ encrypted, iv, tag })
  }

  async decryptAtRest(encryptedData: string, organizationId: string): Promise<any> {
    const key = await this.getOrganizationKey(organizationId)
    const { encrypted, iv, tag } = JSON.parse(encryptedData)
    const decrypted = await this.decrypt(encrypted, key, iv, tag)

    return JSON.parse(decrypted)
  }

  private async getOrganizationKey(organizationId: string): Promise<string> {
    // In production, this would retrieve from secure key management service
    // For now, generate a deterministic key based on org ID
    const encoder = new TextEncoder()
    const data = encoder.encode(organizationId + process.env.ENCRYPTION_MASTER_KEY!)
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data)

    return Array.from(new Uint8Array(hashBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("")
  }
}
