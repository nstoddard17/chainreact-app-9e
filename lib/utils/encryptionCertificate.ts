import crypto from 'crypto'

/**
 * Encryption Certificate Management for Microsoft Graph Change Notifications
 *
 * Microsoft Graph requires RSA encryption when includeResourceData is true.
 * This utility generates RSA key pairs and manages certificate lifecycle.
 *
 * API Reference: https://learn.microsoft.com/en-us/graph/change-notifications-with-resource-data
 */

export interface EncryptionCertificate {
  publicKey: string        // PEM format public key
  privateKey: string       // PEM format private key (store securely!)
  certificateId: string    // Unique identifier for this certificate
  publicKeyBase64: string  // Base64-encoded public key for Microsoft Graph
  expiresAt: Date         // When this certificate should be rotated
}

/**
 * Generate a new RSA key pair for encrypting Microsoft Graph notifications
 *
 * Requirements:
 * - RSA algorithm
 * - Key size: 2048-4096 bits (we use 2048 for performance)
 * - X.509 format
 * - Base64-encoded for transmission
 */
export function generateEncryptionCertificate(): EncryptionCertificate {
  // Generate RSA key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048, // Microsoft requires 2048-4096 bits
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  })

  // Generate a unique certificate ID
  const certificateId = `cert_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`

  // Extract the base64-encoded portion of the public key (without PEM headers)
  const publicKeyBase64 = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\n/g, '')
    .trim()

  // Certificates should be rotated every 6 months for security
  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + 6)

  return {
    publicKey,
    privateKey,
    certificateId,
    publicKeyBase64,
    expiresAt
  }
}

/**
 * Decrypt resource data from a Microsoft Graph notification
 *
 * The notification contains:
 * - encryptedContent: The encrypted resource data
 * - dataSignature: HMAC signature to verify authenticity
 * - dataKey: The symmetric key used to encrypt the data (encrypted with our public key)
 *
 * Decryption Process:
 * 1. Decrypt the symmetric key using our private RSA key
 * 2. Verify the data signature using the decrypted symmetric key
 * 3. Decrypt the actual resource data using the symmetric key
 */
export function decryptResourceData(
  encryptedContent: string,
  dataSignature: string,
  dataKey: string,
  privateKey: string
): any {
  try {
    // Step 1: Decrypt the symmetric key using our private RSA key
    const symmetricKey = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
      },
      Buffer.from(dataKey, 'base64')
    )

    // Step 2: Verify the data signature
    const expectedSignature = crypto
      .createHmac('sha256', symmetricKey)
      .update(Buffer.from(encryptedContent, 'base64'))
      .digest('base64')

    if (expectedSignature !== dataSignature) {
      throw new Error('Data signature verification failed - data may have been tampered with')
    }

    // Step 3: Decrypt the resource data using AES
    const encryptedBuffer = Buffer.from(encryptedContent, 'base64')

    // Extract IV (first 16 bytes) and encrypted data
    const iv = encryptedBuffer.slice(0, 16)
    const encryptedData = encryptedBuffer.slice(16)

    // Decrypt using AES-256-CBC
    const decipher = crypto.createDecipheriv('aes-256-cbc', symmetricKey.slice(0, 32), iv)
    let decrypted = decipher.update(encryptedData)
    decrypted = Buffer.concat([decrypted, decipher.final()])

    // Parse JSON
    return JSON.parse(decrypted.toString('utf8'))
  } catch (error: any) {
    throw new Error(`Failed to decrypt resource data: ${error.message}`)
  }
}

/**
 * Check if a certificate is expired or about to expire
 */
export function isCertificateExpired(expiresAt: Date, bufferDays: number = 30): boolean {
  const now = new Date()
  const expirationDate = new Date(expiresAt)
  const daysUntilExpiration = (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)

  return daysUntilExpiration <= bufferDays
}

/**
 * Rotate certificate if it's expired or about to expire
 * Returns the current certificate if still valid, or a new one if expired
 */
export function rotateCertificateIfNeeded(
  currentCertificate: EncryptionCertificate | null
): { certificate: EncryptionCertificate; rotated: boolean } {
  if (!currentCertificate || isCertificateExpired(currentCertificate.expiresAt)) {
    return {
      certificate: generateEncryptionCertificate(),
      rotated: true
    }
  }

  return {
    certificate: currentCertificate,
    rotated: false
  }
}
