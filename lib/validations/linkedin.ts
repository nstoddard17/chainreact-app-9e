import { z } from "zod"

export const linkedinProfileSchema = z.object({
  id: z.string(),
  firstName: z.object({
    localized: z.record(z.string()),
    preferredLocale: z.object({
      country: z.string(),
      language: z.string(),
    }),
  }),
  lastName: z.object({
    localized: z.record(z.string()),
    preferredLocale: z.object({
      country: z.string(),
      language: z.string(),
    }),
  }),
  profilePicture: z
    .object({
      displayImage: z.string(),
    })
    .optional(),
  emailAddress: z.string().email().optional(),
})

export type LinkedInProfile = z.infer<typeof linkedinProfileSchema>
