import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/auth/callback',
          '/auth/confirm',
          '/_next/',
          '/private/',
        ],
      },
    ],
    sitemap: 'https://chainreact.app/sitemap.xml',
  }
}
