declare module 'aes256' {
  export interface Cipher {
    encrypt(plaintext: string): string;
    decrypt(encrypted: string): string;
  }

  export function createCipher(key: string): Cipher;
  export function encrypt(key: string, plaintext: string): string;
  export function decrypt(key: string, encrypted: string): string;
} 