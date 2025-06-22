import crypto from 'crypto';

/**
 * Encrypts a string using AES-256-CBC
 * 
 * @param text The text to encrypt
 * @param key The encryption key (must be 32 bytes/256 bits)
 * @returns The encrypted text as a base64 string
 */
export function encrypt(text: string, key: string): string {
  try {
    // Create a buffer from the key (must be 32 bytes for AES-256)
    const keyBuffer = Buffer.from(key, 'hex');
    
    // Generate a random initialization vector
    const iv = crypto.randomBytes(16);
    
    // Create cipher
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
    
    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Combine IV and encrypted data (IV needs to be stored with the encrypted data for decryption)
    // Format: iv:encrypted
    return `${iv.toString('base64')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts a string that was encrypted using AES-256-CBC
 * 
 * @param encryptedText The encrypted text (format: iv:encrypted)
 * @param key The encryption key (must be 32 bytes/256 bits)
 * @returns The decrypted text
 */
export function decrypt(encryptedText: string, key: string): string {
  try {
    // Split the IV and encrypted data
    const [ivBase64, encrypted] = encryptedText.split(':');
    
    if (!ivBase64 || !encrypted) {
      throw new Error('Invalid encrypted text format');
    }
    
    // Create buffers from the key and IV
    const keyBuffer = Buffer.from(key, 'hex');
    const iv = Buffer.from(ivBase64, 'base64');
    
    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
    
    // Decrypt the text
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}
