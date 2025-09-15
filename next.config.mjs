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
    optimizePackageImports: ['lucide-react'],
    instrumentationHook: true, // Enable instrumentation for server-side initialization
  },
  // Fix Cross-Origin-Opener-Policy for OAuth popups
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
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
