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

export const linkedinCompanySchema = z.object({
  id: z.string(),
  name: z.object({
    localized: z.record(z.string()),
    preferredLocale: z.object({
      country: z.string(),
      language: z.string(),
    }),
  }),
  description: z
    .object({
      localized: z.record(z.string()),
      preferredLocale: z.object({
        country: z.string(),
        language: z.string(),
      }),
    })
    .optional(),
  website: z.string().url().optional(),
  industry: z.string().optional(),
  companySize: z.string().optional(),
})

export type LinkedInCompany = z.infer<typeof linkedinCompanySchema>

export const linkedinPostSchema = z.object({
  author: z.string(),
  lifecycleState: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  specificContent: z.object({
    "com.linkedin.ugc.ShareContent": z.object({
      shareCommentary: z.object({
        text: z.string(),
      }),
      shareMediaCategory: z.enum(["NONE", "ARTICLE", "IMAGE"]),
    }),
  }),
  visibility: z.object({
    "com.linkedin.ugc.MemberNetworkVisibility": z.enum(["PUBLIC", "CONNECTIONS"]),
  }),
})

export type LinkedInPost = z.infer<typeof linkedinPostSchema>
