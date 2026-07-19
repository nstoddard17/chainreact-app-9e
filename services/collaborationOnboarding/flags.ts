/**
 * Feature flag for the role-specific collaboration onboarding checklist
 * (5.ONBOARD-4). Default OFF.
 *
 * Gated because it is a new user-facing surface on live shared accounts that
 * depends on newly-applied tables. With the flag off, `getCollaborationChecklist`
 * returns null, no collaboration card mounts, no learning events are recorded, and
 * the existing first-workflow checklist behaves exactly as before — so the slice
 * is inert in production until deliberately enabled.
 */
export function isCollaborationOnboardingEnabled(): boolean {
  return process.env.ENABLE_COLLABORATION_ONBOARDING === "true";
}
