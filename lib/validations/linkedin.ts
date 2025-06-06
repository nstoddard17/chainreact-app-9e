import { z } from "zod"

export const linkedinProfileSchema = z.object({
  id: z.string(),
  localizedFirstName: z.string().optional(),
  localizedLastName: z.string().optional(),
  profilePicture: z
    .object({
      displayImage: z.string().optional(),
    })
    .optional(),
  emailAddress: z.string().email().optional(),
})

export const linkedinCompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  website: z.string().url().optional(),
  industry: z.string().optional(),
  employeeCount: z.number().optional(),
})

export const linkedinPostSchema = z.object({
  text: z.string().max(3000),
  visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC"),
  media: z
    .array(
      z.object({
        url: z.string().url(),
        type: z.enum(["IMAGE", "VIDEO"]),
      }),
    )
    .optional(),
})

export type LinkedInProfile = z.infer<typeof linkedinProfileSchema>
export type LinkedInCompany = z.infer<typeof linkedinCompanySchema>
export type LinkedInPost = z.infer<typeof linkedinPostSchema>
