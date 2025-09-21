/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Enable image optimization for better LCP
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31536000, // 1 year
  },
  // Enable experimental features for better performance
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@supabase/supabase-js',
      '@supabase/auth-helpers-nextjs',
      'recharts',
      '@radix-ui/react-select',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-tooltip',
    ],
  },
  // Optimize production builds
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // Fix Cross-Origin-Opener-Policy for OAuth popups
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          // Prefetch DNS for external resources
          {
            key: 'Link',
            value: '<https://fonts.googleapis.com>; rel=dns-prefetch',
          },
          // Prevent aggressive caching for HTML pages
          {
            key: 'Cache-Control',
            value: isDev
              ? 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
              : 'no-store, must-revalidate',
          },
          // Additional headers to prevent caching in dev
          ...(isDev ? [
            {
              key: 'Pragma',
              value: 'no-cache',
            },
            {
              key: 'Expires',
              value: '0',
            },
            {
              key: 'Surrogate-Control',
              value: 'no-store',
            },
          ] : []),
        ],
      },
      // Specific caching for images
      {
        source: '/_next/image(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Specific caching for static assets
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer, dev }) => {
    // Suppress the webpack cache warning about large strings
    config.infrastructureLogging = {
      level: 'error',
    }

    // Alternative: disable the specific warning
    if (!config.ignoreWarnings) {
      config.ignoreWarnings = []
    }
    config.ignoreWarnings.push(/Serializing big strings/)
    
    // Handle Supabase Realtime critical dependency warnings
    config.ignoreWarnings.push(/Critical dependency: the request of a dependency is an expression/)
    
    // Configure webpack to handle dynamic imports in Supabase Realtime
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    
    return config
  },
}

export default nextConfig
