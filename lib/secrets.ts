import "server-only"

export const getSecret = async (secretName: string): Promise<string | undefined> => {
  if (secretName === "encryption_key") {
    // For local development, you can set this in your .env.local file
    // e.g., ENCRYPTION_KEY=your-super-secret-key-that-is-32-bytes-long
    return process.env.ENCRYPTION_KEY
  }

  // In a real app, you might fetch secrets from a service like AWS Secrets Manager,
  // Google Secret Manager, or HashiCorp Vault.
  // For this example, we'll just use environment variables for simplicity.

  const secretValue = process.env[secretName.toUpperCase()]

  return secretValue
} 