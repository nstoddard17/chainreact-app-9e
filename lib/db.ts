import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./db/schema"

// Create database connection with error handling
const createDatabaseConnection = () => {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL

  if (!databaseUrl) {
    if (process.env.NODE_ENV === "development") {
      console.warn("DATABASE_URL not found, database operations will be disabled")
    }
    return null
  }

  try {
    const client = postgres(databaseUrl, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    })

    return drizzle(client, { schema })
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Failed to create database connection:", error)
    }
    return null
  }
}

export const db = createDatabaseConnection()
