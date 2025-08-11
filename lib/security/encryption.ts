import crypto from 'crypto';

// Load encryption key from environment variable
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef";
const ENCRYPTION_IV_LENGTH = 16;

/**
 * Encrypts sensitive data like OAuth tokens or API keys
 * 
 * @param text - The plain text to encrypt
 * @param key - Optional custom encryption key
 * @returns Encrypted text as a string
 */
export function encrypt(text: string, key: string = ENCRYPTION_KEY): string {
  try {
    // Create a random initialization vector
    const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
    
    // Create cipher using AES-256-CBC
    const cipher = crypto.createCipheriv(
      "aes-256-cbc", 
      Buffer.from(key.slice(0, 32)), 
      iv
    );
    
    // Encrypt the text
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    // Return IV + encrypted text
    return iv.toString("hex") + ":" + encrypted;
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypts previously encrypted data
 * 
 * @param encryptedText - The encrypted text to decrypt
 * @param key - Optional custom encryption key
 * @returns Decrypted text as a string
 */
export function decrypt(encryptedText: string, key: string = ENCRYPTION_KEY): string {
  try {
    // Safety check for null or undefined
    if (!encryptedText) {
      throw new Error("Empty encrypted text");
    }
    
    // Split IV and encrypted text
    const textParts = encryptedText.split(":");
    if (textParts.length !== 2) {
      // If the text doesn't contain a colon, it might be unencrypted
      // Return it as-is instead of throwing an error
      if (!encryptedText.includes(":")) {
        console.log("Text appears to be unencrypted, returning as-is");
        return encryptedText;
      }
      throw new Error("Invalid encrypted text format");
    }
    
    const iv = Buffer.from(textParts[0], "hex");
    const encryptedData = textParts[1];
    
    // Create decipher
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc", 
      Buffer.from(key.slice(0, 32)), 
      iv
    );
    
    // Decrypt the text
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    // Include original error message for better debugging
    throw new Error(`Failed to decrypt data: ${error.message}`);
  }
}

/**
 * Safely decrypts a token, returning the original value if decryption fails
 * This is a helper function to handle potentially invalid encrypted tokens
 * 
 * @param possiblyEncryptedText - Text that may or may not be encrypted
 * @param key - Optional custom encryption key
 * @returns Decrypted text if successful, or original text if decryption fails
 */
export function safeDecrypt(possiblyEncryptedText: string, key: string = ENCRYPTION_KEY): string {
  // If the text doesn't look like it's encrypted, return it as-is
  if (!possiblyEncryptedText || !possiblyEncryptedText.includes(":")) {
    return possiblyEncryptedText;
  }
  
  try {
    return decrypt(possiblyEncryptedText, key);
  } catch (error) {
    console.warn("Decryption failed, returning original text:", error.message);
    return possiblyEncryptedText;
  }
}
