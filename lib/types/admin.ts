/**
 * Scoped admin capabilities — replaces the single `admin` boolean with
 * fine-grained permissions. Capabilities are stored as a JSONB object
 * on `user_profiles.admin_capabilities`.
 *
 * `super_admin` implicitly grants all other capabilities.
 */

export const ADMIN_CAPABILITIES = [
  'super_admin',
  'user_admin',
  'support_admin',
  'billing_admin',
] as const

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number]

export type AdminCapabilities = Partial<Record<AdminCapability, boolean>>

/** Step-up auth methods, ordered from strongest to weakest */
export const STEP_UP_METHODS = ['mfa', 'reauthenticate', 'password', 'email_otp'] as const
export type StepUpMethod = (typeof STEP_UP_METHODS)[number]

/**
 * Check if the given capabilities include the required capability.
 * `super_admin` grants all capabilities implicitly.
 */
export function hasCapability(
  capabilities: AdminCapabilities | null | undefined,
  required: AdminCapability
): boolean {
  if (!capabilities) return false
  if (capabilities.super_admin === true) return true
  return capabilities[required] === true
}

/**
 * Check if the given capabilities include at least one of the required capabilities.
 */
export function hasAnyCapability(
  capabilities: AdminCapabilities | null | undefined,
  required: AdminCapability[]
): boolean {
  return required.some((cap) => hasCapability(capabilities, cap))
}

/**
 * Validate that a capabilities object only contains known capability keys.
 * Rejects unknown keys at assignment time to prevent JSONB drift.
 */
/**
 * Check if a profile object represents an admin user.
 * Source of truth is `admin_capabilities` — the `admin` boolean is legacy.
 */
export function isProfileAdmin(profile: {
  admin_capabilities?: AdminCapabilities | null
} | null | undefined): boolean {
  if (!profile) return false
  const caps = profile.admin_capabilities
  if (!caps) return false
  return caps.super_admin === true || Object.values(caps).some(v => v === true)
}

export function validateCapabilities(caps: Record<string, unknown>): AdminCapabilities {
  const validated: AdminCapabilities = {}
  for (const [key, value] of Object.entries(caps)) {
    if (!ADMIN_CAPABILITIES.includes(key as AdminCapability)) {
      throw new Error(`Unknown admin capability: ${key}`)
    }
    if (typeof value !== 'boolean') {
      throw new Error(`Capability "${key}" must be a boolean, got ${typeof value}`)
    }
    validated[key as AdminCapability] = value
  }
  return validated
}
