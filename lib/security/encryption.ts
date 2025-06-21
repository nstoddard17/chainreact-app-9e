import aes256 from "aes256"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const SALT_LENGTH = 64
const TAG_LENGTH = 16
const KEY_LENGTH = 32

const getKey = (salt: Buffer, secret: string): Buffer => {
  return crypto.pbkdf2Sync(secret, salt, 100000, KEY_LENGTH, "sha512")
}

export const encrypt = (text: string, secret: string): string => {
  const cipher = aes256.createCipher(secret)
  return cipher.encrypt(text)
}

export const decrypt = (encryptedText: string, secret: string): string => {
  try {
    // Validate inputs
    if (!encryptedText || typeof encryptedText !== 'string') {
      throw new Error('Invalid encrypted text provided');
    }
    
    if (!secret || typeof secret !== 'string') {
      throw new Error('Invalid secret key provided');
    }

    const cipher = aes256.createCipher(secret);
    
    try {
      const decrypted = cipher.decrypt(encryptedText);
      
      // Validate the decrypted result
      if (!decrypted || decrypted.length === 0) {
        throw new Error('Decryption resulted in empty string');
      }
      
      return decrypted;
    } catch (innerError: any) {
      // Handle specific aes256 errors
      console.error('Decryption error:', innerError.message);
      throw new Error(`Decryption failed: ${innerError.message}`);
    }
  } catch (error: any) {
    // Log the error with specific details but without exposing the encrypted text
    console.error(`Decryption error: ${error.message}, text length: ${encryptedText?.length || 0}`);
    throw new Error(`Failed to decrypt data: ${error.message}`);
  }
}

export class EncryptionService {
  private algorithm = "aes-256-gcm"
  private keyLength = 32 // 256 bits

  async generateKey(): Promise<string> {
    return crypto.randomBytes(this.keyLength).toString("hex")
  }

  async encrypt(data: string, key: string): Promise<{ encrypted: string; iv: string; tag: string }> {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipher(this.algorithm, Buffer.from(key, "hex"))

    let encrypted = cipher.update(data, "utf8", "hex")
    encrypted += cipher.final("hex")

    const tag = (cipher as any).getAuthTag()

    return {
      encrypted,
      iv: iv.toString("hex"),
      tag: tag.toString("hex"),
    }
  }

  async decrypt(encryptedData: string, key: string, iv: string, tag: string): Promise<string> {
    const decipher = crypto.createDecipher(this.algorithm, Buffer.from(key, "hex"))
    ;(decipher as any).setAuthTag(Buffer.from(tag, "hex"))

    let decrypted = decipher.update(encryptedData, "hex", "utf8")
    decrypted += decipher.final("utf8")

    return decrypted
  }

  async hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
    const actualSalt = salt || crypto.randomBytes(16).toString("hex")
    const hash = crypto.pbkdf2Sync(password, actualSalt, 10000, 64, "sha512").toString("hex")

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
    return crypto
      .createHash("sha256")
      .update(organizationId + process.env.ENCRYPTION_MASTER_KEY!)
      .digest("hex")
  }
}
