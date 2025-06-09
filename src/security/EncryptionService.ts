import crypto from "crypto"

export class EncryptionService {
  private algorithm = "aes-256-gcm"
  private keyLength = 32 // 256 bits

  constructor(private masterKey: string) {
    if (!masterKey || masterKey.length < 32) {
      throw new Error("Encryption master key must be at least 32 characters long")
    }
  }

  /**
   * Encrypt sensitive data
   */
  async encrypt(data: string): Promise<{ encrypted: string; iv: string; tag: string }> {
    try {
      const iv = crypto.randomBytes(16)
      const key = this.deriveKey(this.masterKey)

      const cipher = crypto.createCipheriv(this.algorithm, key, iv)

      let encrypted = cipher.update(data, "utf8", "hex")
      encrypted += cipher.final("hex")

      const tag = cipher.getAuthTag().toString("hex")

      return {
        encrypted,
        iv: iv.toString("hex"),
        tag,
      }
    } catch (error) {
      console.error("Encryption error:", error)
      throw new Error("Failed to encrypt data")
    }
  }

  /**
   * Decrypt sensitive data
   */
  async decrypt(encryptedData: string, iv: string, tag: string): Promise<string> {
    try {
      const key = this.deriveKey(this.masterKey)
      const decipher = crypto.createDecipheriv(this.algorithm, key, Buffer.from(iv, "hex"))

      decipher.setAuthTag(Buffer.from(tag, "hex"))

      let decrypted = decipher.update(encryptedData, "hex", "utf8")
      decrypted += decipher.final("utf8")

      return decrypted
    } catch (error) {
      console.error("Decryption error:", error)
      throw new Error("Failed to decrypt data")
    }
  }

  /**
   * Derive a key from the master key
   */
  private deriveKey(masterKey: string): Buffer {
    return crypto.scryptSync(masterKey, "salt", this.keyLength)
  }

  /**
   * Generate a new encryption key
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString("hex")
  }
}
