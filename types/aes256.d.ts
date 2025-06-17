declare module "aes256" {
  function createCipher(secret: string): {
    encrypt: (text: string) => string
    decrypt: (encryptedText: string) => string
  }
} 